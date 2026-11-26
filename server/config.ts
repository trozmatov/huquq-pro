import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  appOrigin: string;
  storeType: 'memory' | 'firestore';
  telegramBotToken: string;
  telegramBotUsername: string;
  sessionSecret: string;
  adminTelegramIds: string[];
  teacherTelegramIds: string[];
  geminiApiKey: string;
  geminiTextModel: string;
  geminiLiveModel: string;
  aiMaxSessionsPerDay: number;
  aiMaxDurationSec: number;
  devAuthUserId: string;
  devAuthRole: 'student' | 'teacher' | 'admin';
}

function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const storeRaw = (process.env.STORE || 'memory').toLowerCase();
  const storeType = storeRaw === 'firestore' ? 'firestore' : 'memory';

  const rawRole = (process.env.DEV_AUTH_ROLE || 'student').toLowerCase();
  const devAuthRole: 'student' | 'teacher' | 'admin' =
    rawRole === 'admin' || rawRole === 'teacher' ? rawRole : 'student';

  return {
    port: Number(process.env.PORT || 3001),
    nodeEnv,
    isProduction,
    appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
    storeType,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || 'huquqpro_bot',
    sessionSecret:
      process.env.SESSION_SECRET ||
      'dev-only-huquqpro-session-secret-change-in-production-32chars',
    adminTelegramIds: parseIdList(process.env.ADMIN_TELEGRAM_IDS || '100001'),
    teacherTelegramIds: parseIdList(process.env.TEACHER_TELEGRAM_IDS || '100002'),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-4-hydrogen',
    geminiLiveModel: process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
    aiMaxSessionsPerDay: Math.max(1, Number(process.env.AI_TUTOR_MAX_SESSIONS_PER_DAY || 5)),
    aiMaxDurationSec: Math.max(60, Number(process.env.AI_TUTOR_MAX_DURATION_SEC || 600)),
    devAuthUserId: process.env.DEV_AUTH_USER_ID || '',
    devAuthRole,
  };
}
