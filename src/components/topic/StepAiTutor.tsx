import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  MessageSquare,
  Send,
  StopCircle,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { AiQuotaStatus, AiTutorSession, Topic, TopicProgress } from '@shared/types';
import { api } from '@/lib/api';
import { AudioVisualizer } from '@/components/ui/AudioVisualizer';

interface StepAiTutorProps {
  topic: Topic;
  progress: TopicProgress | null;
  geminiConfigured: boolean;
  onSessionEvaluated: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return input;
  const ratio = sourceRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const result = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    result[i] = input[Math.floor(i * ratio)];
  }
  return result;
}

export function StepAiTutor({
  topic,
  progress,
  geminiConfigured,
  onSessionEvaluated,
  onToast,
}: StepAiTutorProps) {
  const [mode, setMode] = useState<'voice' | 'text'>(geminiConfigured ? 'voice' : 'text');
  const [quota, setQuota] = useState<AiQuotaStatus | null>(null);
  const [activeSession, setActiveSession] = useState<AiTutorSession | null>(null);
  const [finishedSession, setFinishedSession] = useState<AiTutorSession | null>(null);
  const [textInput, setTextInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Voice Live API state
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [voiceTranscript, setVoiceTranscript] = useState<
    Array<{ role: 'student' | 'tutor'; text: string }>
  >([]);
  const audioLevelRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const loadQuota = useCallback(async () => {
    try {
      const res = await api.getAiQuota();
      setQuota(res.quota);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  useEffect(() => {
    if (!activeSession && !voiceActive) return;
    const id = setInterval(() => {
      setElapsedSec((s) => {
        const next = s + 1;
        if (quota && next >= quota.maxDurationSec) {
          if (voiceActive) stopVoiceSession();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, voiceActive, quota]);

  const cleanupAudio = useCallback(() => {
    audioLevelRef.current = 0;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
    if (playCtxRef.current) {
      void playCtxRef.current.close().catch(() => {});
      playCtxRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudio();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [cleanupAudio]);

  const playPcm24kBase64 = (base64: string) => {
    try {
      if (!playCtxRef.current) {
        playCtxRef.current = new AudioContext({ sampleRate: 24000 });
        nextPlayTimeRef.current = playCtxRef.current.currentTime;
      }
      const ctx = playCtxRef.current;
      const bin = atob(base64);
      const sampleCount = bin.length / 2;
      const floatData = new Float32Array(sampleCount);
      let peak = 0;
      for (let i = 0; i < sampleCount; i++) {
        const lo = bin.charCodeAt(i * 2);
        const hi = bin.charCodeAt(i * 2 + 1);
        let val = (hi << 8) | lo;
        if (val >= 0x8000) val -= 0x10000;
        const f = val / 32768;
        floatData[i] = f;
        if (Math.abs(f) > peak) peak = Math.abs(f);
      }
      audioLevelRef.current = Math.max(audioLevelRef.current * 0.5, Math.min(1, peak * 1.8));

      const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
      audioBuffer.copyToChannel(floatData, 0);
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      src.start(startAt);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;
    } catch {
      // ignore playback glitch
    }
  };

  const stopVoiceSession = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    cleanupAudio();
    setVoiceActive(false);
    setVoiceStatus('Suhbat yakunlanmoqda va baholanmoqda...');
  };

  const startVoiceSession = async () => {
    if (quota && quota.remainingToday <= 0) {
      onToast('error', `Kunlik kvota tugadi (${quota.sessionsUsedToday}/${quota.maxSessionsPerDay}).`);
      return;
    }
    setFinishedSession(null);
    setVoiceTranscript([]);
    setElapsedSec(0);
    setVoiceStatus('AI Huquqshunos Ustozga ulanilmoqda...');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/ai-tutor`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', topicId: topic.id }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type: string;
          data?: string;
          role?: 'student' | 'tutor';
          text?: string;
          message?: string;
          session?: AiTutorSession;
          code?: string;
        };

        if (msg.type === 'ready') {
          setVoiceActive(true);
          setVoiceStatus("Jonli ovozli suhbat faol — gapiring!");
          void loadQuota();
          // Start microphone capture
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const ctx = new AudioContext();
            captureCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (ev) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const input = ev.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
              const rms = Math.sqrt(sum / input.length);
              audioLevelRef.current = Math.min(1, rms * 6);
              const downsampled = downsampleTo16k(input, ctx.sampleRate);
              const b64 = floatTo16BitPcmBase64(downsampled);
              ws.send(JSON.stringify({ type: 'audio', data: b64 }));
            };
            source.connect(processor);
            processor.connect(ctx.destination);
          } catch {
            setVoiceStatus("Mikrofonga ruxsat berilmadi — quyidan matn yuborishingiz mumkin.");
          }
        } else if (msg.type === 'audio' && msg.data) {
          playPcm24kBase64(msg.data);
        } else if (msg.type === 'interrupted') {
          if (playCtxRef.current) {
            void playCtxRef.current.close().catch(() => {});
            playCtxRef.current = null;
            nextPlayTimeRef.current = 0;
          }
        } else if (msg.type === 'transcript' && msg.role && msg.text) {
          setVoiceTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === msg.role) {
              return [...prev.slice(0, -1), { role: msg.role!, text: last.text + msg.text! }];
            }
            return [...prev, { role: msg.role!, text: msg.text! }];
          });
        } else if (msg.type === 'session_ended' && msg.session) {
          cleanupAudio();
          setVoiceActive(false);
          setFinishedSession(msg.session);
          setVoiceStatus('');
          void loadQuota();
          onSessionEvaluated();
        } else if (msg.type === 'error') {
          cleanupAudio();
          setVoiceActive(false);
          setVoiceStatus('');
          onToast('info', msg.message || 'Ovozli ulanishda xatolik.');
          if (msg.code === 'NO_GEMINI_KEY') {
            setMode('text');
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      cleanupAudio();
      setVoiceActive(false);
      setVoiceStatus('');
      onToast('error', "WebSocket ulanishida xatolik yuz berdi.");
    };
  };

  // ==================== TEXT MODE ====================
  const startTextSession = async () => {
    try {
      setBusy(true);
      setFinishedSession(null);
      setElapsedSec(0);
      const { session } = await api.startAiSession(topic.id, 'text');
      setActiveSession(session);
      void loadQuota();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Suhbatni boshlashda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTextTurn = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || busy) return;

    if (voiceActive && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
      setTextInput('');
      return;
    }

    if (!activeSession) return;
    try {
      setBusy(true);
      setTextInput('');
      const { session } = await api.sendAiMessage(activeSession.id, topic.id, trimmed);
      setActiveSession(session);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Javob olishda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  const handleFinishTextSession = async () => {
    if (!activeSession || busy) return;
    try {
      setBusy(true);
      const { session } = await api.finishAiSession(activeSession.id, elapsedSec);
      setActiveSession(null);
      setFinishedSession(session);
      onSessionEvaluated();
      if (session.status === 'completed') {
        onToast('success', `Og'zaki imtihon baholandi: ${session.evaluation?.score} ball!`);
      } else {
        onToast(
          'info',
          "Suhbat saqlandi (baholash kutilmoqda). Istalgan paytda qayta baholashingiz mumkin."
        );
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Yakunlashda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  const handleRetryEvaluation = async () => {
    if (!finishedSession || busy) return;
    try {
      setBusy(true);
      const { session } = await api.evaluateAiSession(finishedSession.id);
      setFinishedSession(session);
      onSessionEvaluated();
      if (session.status === 'completed') {
        onToast('success', `Baholash muvaffaqiyatli yakunlandi: ${session.evaluation?.score} ball!`);
      } else {
        onToast('info', session.errorMessage || "Baholash amalga oshmadi.");
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Qayta baholashda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  const weakCount =
    (progress?.weak.cards.length || 0) +
    (progress?.weak.written.length || 0) +
    (progress?.weak.timeline.length || 0);

  return (
    <div className="space-y-5">
      {/* Header & Quota */}
      <div className="glass-panel rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              AI Huquqshunos Ustoz — Og&apos;zaki imtihon
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Faqat «{topic.title}» bilim paketi va 2–4-bosqich xatolaringiz asosida savol-javob
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {quota && (
              <span className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-bold text-indigo-200">
                Bugungi kvota: {quota.sessionsUsedToday} / {quota.maxSessionsPerDay}
              </span>
            )}
            {(voiceActive || activeSession) && (
              <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-200 tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:
                {String(elapsedSec % 60).padStart(2, '0')}
              </span>
            )}
          </div>
        </div>

        {/* Mode selector (when idle) */}
        {!voiceActive && !activeSession && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-2xl border border-slate-800 bg-slate-900/80 p-1">
              <button
                type="button"
                onClick={() => setMode('voice')}
                className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
                  mode === 'voice'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mic className="h-4 w-4" />
                Ovozli (Gemini Live)
              </button>
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
                  mode === 'text'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                Matnli og&apos;zaki suhbat
              </button>
            </div>

            {weakCount > 0 && (
              <span className="text-xs text-amber-300 font-medium">
                {weakCount} ta zaif nuqtangiz AI Ustozga uzatilgan
              </span>
            )}
          </div>
        )}
      </div>

      {/* VOICE MODE */}
      {mode === 'voice' && !activeSession && (
        <div className="glass-card rounded-3xl p-5 sm:p-7 space-y-5 text-center">
          <AudioVisualizer active={voiceActive} levelRef={audioLevelRef} />

          <p className="text-sm text-slate-300">
            {voiceStatus ||
              "Jonli ovozli imtihonni boshlang — AI Ustoz sizga o'zbek tilida kazus va qonun moddalaridan savol beradi."}
          </p>

          <div className="flex justify-center gap-3">
            {!voiceActive ? (
              <button
                type="button"
                onClick={startVoiceSession}
                className="min-h-[50px] inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-7 py-3 text-sm font-bold text-white shadow-xl shadow-indigo-600/30 transition"
              >
                <Mic className="h-5 w-5" />
                Ovozli suhbatni boshlash
              </button>
            ) : (
              <button
                type="button"
                onClick={stopVoiceSession}
                className="min-h-[50px] inline-flex items-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-500 px-6 py-3 text-sm font-bold text-white shadow-lg"
              >
                <MicOff className="h-5 w-5" />
                Yakunlash va baholash
              </button>
            )}
          </div>

          {voiceTranscript.length > 0 && (
            <div className="text-left space-y-2.5 max-h-64 overflow-y-auto pt-3 border-t border-slate-800">
              {voiceTranscript.map((t, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    t.role === 'student'
                      ? 'bg-indigo-600/25 text-indigo-100 ml-8'
                      : 'bg-slate-900/90 text-slate-200 mr-8 border border-slate-800'
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">
                    {t.role === 'student' ? "Siz" : 'AI Huquqshunos Ustoz'}
                  </span>
                  {t.text}
                </div>
              ))}
            </div>
          )}

          {voiceActive && (
            <form onSubmit={handleSendTextTurn} className="flex gap-2 pt-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Yoki matn shaklida javob yuboring..."
                className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-base sm:text-sm text-white"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-white hover:bg-indigo-500"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* TEXT MODE */}
      {mode === 'text' && (
        <div className="glass-card rounded-3xl p-4 sm:p-6 space-y-4">
          {!activeSession ? (
            <div className="text-center py-6 space-y-4">
              <MessageSquare className="h-10 w-10 text-violet-400 mx-auto" />
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-white">Matnli og&apos;zaki imtihon rejimi</h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Mikrofonsiz muhitda ham AI Huquqshunos Ustoz bilan real kazus muhokamasini olib
                  boring va suhbat yakunida to&apos;liq baho oling.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={startTextSession}
                className="min-h-[48px] inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-lg"
              >
                <Sparkles className="h-4 w-4" />
                {busy ? 'Tayyorlanmoqda...' : 'Suhbatni boshlash'}
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {activeSession.transcript.map((turn, idx) => (
                  <div
                    key={idx}
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      turn.role === 'student'
                        ? 'bg-indigo-600/25 border border-indigo-500/30 text-indigo-50 ml-6 sm:ml-14'
                        : 'bg-slate-900/90 border border-slate-800 text-slate-100 mr-6 sm:mr-14'
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1">
                      {turn.role === 'student' ? "Siz" : 'AI Huquqshunos Ustoz'}
                    </p>
                    <p>{turn.text}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendTextTurn} className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <input
                  type="text"
                  value={textInput}
                  disabled={busy}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Javobingizni yozing (qonun moddasi va dalil bilan)..."
                  className="flex-1 min-h-[46px] rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-base sm:text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy || !textInput.trim()}
                    className="min-h-[46px] flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Yuborish
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleFinishTextSession}
                    className="min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950"
                  >
                    <StopCircle className="h-4 w-4" />
                    Yakunlash
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* Finished Evaluation Report OR Pending Re-Evaluation */}
      {finishedSession && (
        <section
          className={`rounded-3xl border p-5 sm:p-6 space-y-4 ${
            finishedSession.status === 'completed'
              ? 'border-emerald-500/35 bg-emerald-950/30'
              : 'border-amber-500/35 bg-amber-950/25'
          }`}
        >
          {finishedSession.status === 'completed' && finishedSession.evaluation ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      Og&apos;zaki imtihon hisoboti
                    </h3>
                    <p className="text-xs text-slate-400">AI komissiyasi yakuniy bahosi</p>
                  </div>
                </div>
                <span className="rounded-2xl bg-emerald-500/20 border border-emerald-400/35 px-4 py-2 text-2xl font-extrabold text-emerald-200">
                  {finishedSession.evaluation.score} / 100
                </span>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">
                {finishedSession.evaluation.summary}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-950/60 border border-emerald-500/20 p-4 space-y-1.5">
                  <p className="text-xs font-bold uppercase text-emerald-300">Kuchli tomonlar</p>
                  <ul className="list-disc list-inside text-xs sm:text-sm text-slate-200 space-y-1">
                    {finishedSession.evaluation.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-slate-950/60 border border-amber-500/20 p-4 space-y-1.5">
                  <p className="text-xs font-bold uppercase text-amber-300">Huquqiy bo&apos;shliqlar</p>
                  <ul className="list-disc list-inside text-xs sm:text-sm text-slate-200 space-y-1">
                    {finishedSession.evaluation.legalGaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Suhbat saqlandi — baholash kutilmoqda (pending_evaluation)
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1">
                    {finishedSession.errorMessage ||
                      "AI baholashda texnik uzilish yuz berdi. Soxta ball qo'yilmaydi — quyidagi tugma orqali qayta baholashingiz mumkin."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleRetryEvaluation}
                className="min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                Hozir baholash
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
