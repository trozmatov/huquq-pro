import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { AiTutorSession } from '@shared/types';
import { api } from '@/lib/api';

interface AiLogsTabProps {
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function AiLogsTab({ onToast }: AiLogsTabProps) {
  const [sessions, setSessions] = useState<AiTutorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.listAiSessions();
      setSessions(res.sessions);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Suhbat loglarini yuklashda xatolik.');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleEvaluateNow = async (sessionId: string) => {
    try {
      setEvaluatingId(sessionId);
      const res = await api.evaluateAiSession(sessionId);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? res.session : s)));
      if (res.session.status === 'completed') {
        onToast('success', `Suhbat baholandi: ${res.session.evaluation?.score} ball!`);
      } else {
        onToast('info', res.session.errorMessage || "Baholash amalga oshmadi.");
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Baholashda xatolik.');
    } finally {
      setEvaluatingId(null);
    }
  };

  return (
    <section className="glass-card rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-emerald-400" />
          Barcha AI Ustoz og&apos;zaki suhbat loglari ({sessions.length})
        </h3>
        <button
          type="button"
          onClick={loadLogs}
          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Yangilash
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-6">Yuklanmoqda...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          Hozircha AI Ustoz bilan o&apos;tkazilgan suhbatlar mavjud emas.
        </p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const expanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {s.userName} • <span className="text-indigo-300">{s.topicTitle}</span>
                    </p>
                    <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(s.startedAt).toLocaleString('uz-UZ')} •{' '}
                      {s.mode === 'voice' ? 'Ovozli Live' : 'Matnli'} • {s.transcript.length} xabar
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {s.status === 'completed' && s.evaluation ? (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 border border-emerald-500/35 px-3 py-1.5 text-xs font-extrabold text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {s.evaluation.score} ball
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={evaluatingId === s.id}
                        onClick={() => handleEvaluateNow(s.id)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${evaluatingId === s.id ? 'animate-spin' : ''}`}
                        />
                        Hozir baholash
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Transkript
                      {expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    {s.evaluation ? (
                      <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/25 p-3.5 text-xs space-y-1.5">
                        <p className="text-slate-100">{s.evaluation.summary}</p>
                        {s.evaluation.strengths.length > 0 && (
                          <p className="text-emerald-300">
                            Kuchli tomonlar: {s.evaluation.strengths.join('; ')}
                          </p>
                        )}
                        {s.evaluation.legalGaps.length > 0 && (
                          <p className="text-amber-300">
                            Bo&apos;shliqlar: {s.evaluation.legalGaps.join('; ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      s.errorMessage && (
                        <p className="text-xs text-amber-300 bg-amber-500/10 rounded-xl px-3 py-2">
                          {s.errorMessage}
                        </p>
                      )
                    )}

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {s.transcript.map((t, i) => (
                        <div
                          key={i}
                          className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            t.role === 'student'
                              ? 'bg-indigo-600/25 text-indigo-100 ml-8'
                              : 'bg-slate-800/80 text-slate-200 mr-8'
                          }`}
                        >
                          <strong className="block text-[10px] uppercase opacity-75 mb-0.5">
                            {t.role === 'student' ? s.userName : 'AI Huquqshunos Ustoz'}
                          </strong>
                          {t.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
