import type { IncomingMessage, Server as HttpServer } from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import type { DataStore } from './store/types.js';
import type { AiTutorSession, TranscriptTurn, UserProfile } from '../shared/types.js';
import { getConfig } from './config.js';
import {
  isLoopbackIp,
  parseCookiesFromHeader,
  resolveServerRole,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from './auth.js';
import { buildAiTutorSystemInstruction, evaluateOralTranscript } from './aiService.js';

interface ClientMessage {
  type: 'start' | 'audio' | 'audio_end' | 'text' | 'stop';
  topicId?: string;
  data?: string; // base64 PCM 16kHz
  text?: string;
}

async function authenticateWsUpgrade(
  req: IncomingMessage,
  store: DataStore
): Promise<UserProfile | null> {
  const cfg = getConfig();
  const cookies = parseCookiesFromHeader(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];

  if (token) {
    const verified = verifySessionToken(token, cfg.sessionSecret);
    if (verified) {
      const user = await store.getUserById(verified.uid);
      if (user) {
        const role = await resolveServerRole(user.telegramId, store);
        user.role = role;
        return user;
      }
    }
  }

  // Strictly restricted dev loopback bypass
  const remoteAddr = req.socket?.remoteAddress;
  if (!cfg.isProduction && cfg.devAuthUserId && isLoopbackIp(remoteAddr)) {
    const user = await store.getUserByTelegramId(String(cfg.devAuthUserId));
    if (user) return user;
  }

  return null;
}

async function canAccessTopic(
  user: UserProfile,
  topicTextbookId: string,
  store: DataStore
): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'teacher') return true;
  const tb = await store.getTextbookById(topicTextbookId);
  if (!tb) return false;
  if (tb.isPublic) return true;
  const groups = await store.listGroups();
  return groups.some(
    (g) => g.memberIds.includes(user.id) && g.textbookIds.includes(topicTextbookId)
  );
}

/**
 * Attaches the authenticated WebSocket proxy for Gemini Live API oral exam sessions.
 * API key stays strictly on the backend — never sent to browsers.
 */
export function attachLiveTutorProxy(httpServer: HttpServer, store: DataStore): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/ws/ai-tutor') {
      return;
    }

    try {
      const user = await authenticateWsUpgrade(req, store);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, user);
      });
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, user: UserProfile) => {
    const cfg = getConfig();
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let activeSessionRecord: AiTutorSession | null = null;
    let activeTopicId: string | null = null;
    let durationTimer: NodeJS.Timeout | null = null;
    let startedAtMs = 0;
    let pendingUserText = '';
    let pendingTutorText = '';
    let finalized = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    const flushPendingTurns = () => {
      if (!activeSessionRecord) return;
      if (pendingUserText.trim()) {
        activeSessionRecord.transcript.push({
          role: 'student',
          text: pendingUserText.trim(),
          timestamp: new Date().toISOString(),
        });
        pendingUserText = '';
      }
      if (pendingTutorText.trim()) {
        activeSessionRecord.transcript.push({
          role: 'tutor',
          text: pendingTutorText.trim(),
          timestamp: new Date().toISOString(),
        });
        pendingTutorText = '';
      }
    };

    const finalizeSession = async () => {
      if (finalized) return;
      finalized = true;
      if (durationTimer) {
        clearTimeout(durationTimer);
        durationTimer = null;
      }
      flushPendingTurns();
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore
        }
        liveSession = null;
      }
      if (!activeSessionRecord || !activeTopicId) return;

      const durationSec = startedAtMs
        ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000))
        : 0;
      activeSessionRecord.durationSec = durationSec;
      activeSessionRecord.endedAt = new Date().toISOString();

      const topic = await store.getTopicById(activeTopicId);
      if (topic && activeSessionRecord.transcript.length > 0) {
        const { evaluation, errorMessage } = await evaluateOralTranscript(
          topic,
          activeSessionRecord.transcript
        );
        if (evaluation) {
          activeSessionRecord.status = 'completed';
          activeSessionRecord.evaluation = evaluation;
          activeSessionRecord.errorMessage = undefined;

          // Persist best AI tutor score on topic progress
          const prev = await store.getTopicProgress(user.id, topic.id);
          await store.upsertTopicProgress({
            topicId: topic.id,
            userId: user.id,
            konspektRead: prev?.konspektRead ?? false,
            cardsMastered: prev?.cardsMastered ?? 0,
            cardsTotal: prev?.cardsTotal ?? topic.flashcards.length,
            cardsScore: prev?.cardsScore ?? 0,
            quizScore: prev?.quizScore ?? null,
            processScore: prev?.processScore ?? null,
            fullTestScore: prev?.fullTestScore ?? null,
            writtenScore: prev?.writtenScore ?? null,
            writtenResults: prev?.writtenResults ?? [],
            aiTutorScore: Math.max(prev?.aiTutorScore ?? 0, evaluation.score),
            weak: prev?.weak ?? { cards: [], written: [], timeline: [] },
            updatedAt: new Date().toISOString(),
          });
        } else {
          activeSessionRecord.status = 'pending_evaluation';
          activeSessionRecord.errorMessage = errorMessage;
        }
      } else {
        activeSessionRecord.status = 'pending_evaluation';
        activeSessionRecord.errorMessage = "Suhbatda yetarli savol-javob to'planmadi.";
      }

      await store.upsertAiSession(activeSessionRecord);
      sendJson({
        type: 'session_ended',
        session: activeSessionRecord,
      });
    };

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        sendJson({ type: 'error', message: "Noto'g'ri xabar formati." });
        return;
      }

      if (msg.type === 'start') {
        if (!msg.topicId) {
          sendJson({ type: 'error', message: "Mavzu ID ko'rsatilmagan." });
          return;
        }
        const topic = await store.getTopicById(msg.topicId);
        if (!topic) {
          sendJson({ type: 'error', message: 'Mavzu topilmadi.' });
          return;
        }
        const allowed = await canAccessTopic(user, topic.textbookId, store);
        if (!allowed) {
          sendJson({ type: 'error', message: "Ushbu mavzuga ruxsat yo'q." });
          return;
        }

        const usedToday = await store.countUserAiSessionsToday(user.id);
        if (usedToday >= cfg.aiMaxSessionsPerDay) {
          sendJson({
            type: 'error',
            message: `Kunlik AI Ustoz kvotasi tugadi (${usedToday}/${cfg.aiMaxSessionsPerDay}). Ertaga qayta urinib ko'ring.`,
          });
          return;
        }

        if (!cfg.geminiApiKey) {
          sendJson({
            type: 'error',
            code: 'NO_GEMINI_KEY',
            message:
              "Ovozli Gemini Live API uchun serverda GEMINI_API_KEY sozlanmagan. Matnli og'zaki suhbat rejimidan foydalanishingiz mumkin.",
          });
          return;
        }

        const progress = await store.getTopicProgress(user.id, topic.id);
        const systemInstruction = buildAiTutorSystemInstruction(topic, progress);
        activeTopicId = topic.id;
        startedAtMs = Date.now();
        finalized = false;

        activeSessionRecord = {
          id: `ai-${crypto.randomBytes(6).toString('hex')}`,
          userId: user.id,
          userName: [user.firstName, user.lastName].filter(Boolean).join(' '),
          topicId: topic.id,
          topicTitle: topic.title,
          mode: 'voice',
          status: 'active',
          startedAt: new Date(startedAtMs).toISOString(),
          durationSec: 0,
          transcript: [],
        };
        await store.upsertAiSession(activeSessionRecord);

        // Enforce maximum duration limit
        durationTimer = setTimeout(() => {
          sendJson({
            type: 'status',
            status: 'timeout',
            message: 'Maksimal suhbat vaqti tugadi. Suhbat yakunlanmoqda va baholanmoqda...',
          });
          void finalizeSession();
        }, cfg.aiMaxDurationSec * 1000);

        try {
          const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey, apiVersion: 'v1beta' });
          liveSession = await ai.live.connect({
            model: cfg.geminiLiveModel,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: { parts: [{ text: systemInstruction }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
            callbacks: {
              onopen: () => {
                sendJson({
                  type: 'ready',
                  sessionId: activeSessionRecord?.id,
                  maxDurationSec: cfg.aiMaxDurationSec,
                });
              },
              onmessage: (response: LiveServerMessage) => {
                const sc = response.serverContent;
                if (!sc) return;

                if (sc.interrupted) {
                  sendJson({ type: 'interrupted' });
                }

                if (sc.inputTranscription?.text) {
                  pendingUserText += sc.inputTranscription.text;
                  sendJson({
                    type: 'transcript',
                    role: 'student',
                    text: sc.inputTranscription.text,
                  });
                }

                if (sc.outputTranscription?.text) {
                  pendingTutorText += sc.outputTranscription.text;
                  sendJson({
                    type: 'transcript',
                    role: 'tutor',
                    text: sc.outputTranscription.text,
                  });
                }

                if (sc.modelTurn?.parts) {
                  for (const part of sc.modelTurn.parts) {
                    if (part.inlineData?.data) {
                      sendJson({
                        type: 'audio',
                        data: part.inlineData.data,
                        mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                      });
                    }
                  }
                }

                if (sc.turnComplete) {
                  flushPendingTurns();
                  sendJson({ type: 'turn_complete' });
                }
              },
              onerror: (err) => {
                sendJson({
                  type: 'error',
                  message: `Gemini Live ulanish xatoligi: ${err.message || "Noma'lum xato"}`,
                });
              },
              onclose: () => {
                if (!finalized) {
                  void finalizeSession();
                }
              },
            },
          });

          // Kick off opening greeting in Uzbek
          liveSession.sendRealtimeInput({
            text: `Assalomu alaykum Ustoz, men «${topic.title}» mavzusi bo'yicha og'zaki suhbatga tayyorman. Birinchi savolni bering.`,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Live API ulanishida xatolik.";
          sendJson({ type: 'error', message: errMsg });
          await finalizeSession();
        }
        return;
      }

      if (msg.type === 'audio' && msg.data && liveSession) {
        try {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch {
          // ignore transient write errors
        }
        return;
      }

      if (msg.type === 'audio_end' && liveSession) {
        try {
          liveSession.sendRealtimeInput({ audioStreamEnd: true });
        } catch {
          // ignore
        }
        return;
      }

      if (msg.type === 'text' && msg.text && liveSession) {
        const turn: TranscriptTurn = {
          role: 'student',
          text: msg.text.trim(),
          timestamp: new Date().toISOString(),
        };
        activeSessionRecord?.transcript.push(turn);
        sendJson({ type: 'transcript', role: 'student', text: turn.text });
        try {
          liveSession.sendRealtimeInput({ text: turn.text });
        } catch {
          // ignore
        }
        return;
      }

      if (msg.type === 'stop') {
        await finalizeSession();
      }
    });

    ws.on('close', () => {
      void finalizeSession();
    });
  });

  return wss;
}
