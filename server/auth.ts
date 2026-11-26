import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { TelegramAuthPayload, UserProfile, UserRole } from '../shared/types.js';
import type { DataStore } from './store/types.js';
import { getConfig } from './config.js';

export const SESSION_COOKIE_NAME = 'huquqpro_session';
export const TELEGRAM_AUTH_MAX_AGE_SEC = 24 * 60 * 60; // 24 soat
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun

export interface SessionTokenPayload {
  uid: string;
  tid: string;
  iat: number;
  exp: number;
}

export interface TelegramVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Official Telegram Login Widget HMAC-SHA256 verification:
 *   secret_key = SHA256(bot_token)
 *   data_check_string = sorted "key=value" lines (excluding hash)
 *   HMAC_SHA256(data_check_string, secret_key) === hash (timing-safe)
 *   auth_date must not be older than 24 hours.
 */
export function verifyTelegramLoginWidget(
  payload: TelegramAuthPayload,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  maxAgeSec: number = TELEGRAM_AUTH_MAX_AGE_SEC
): TelegramVerificationResult {
  if (!botToken) {
    return { valid: false, reason: 'Telegram bot token sozlanmagan.' };
  }
  if (!payload || !payload.hash || !payload.id || !payload.auth_date) {
    return { valid: false, reason: "Telegram autentifikatsiya ma'lumotlari to'liq emas." };
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { valid: false, reason: "Noto'g'ri auth_date qiymati." };
  }

  if (nowSec - authDate > maxAgeSec) {
    return {
      valid: false,
      reason: "Telegram kirish so'rovining muddati o'tgan (24 soatdan eski). Qaytadan kiring.",
    };
  }
  // Allow up to 5 minutes clock skew into the future
  if (authDate - nowSec > 300) {
    return { valid: false, reason: "Noto'g'ri auth_date vaqti." };
  }

  const fields: Array<[string, string]> = [];
  const allowedKeys: Array<keyof TelegramAuthPayload> = [
    'auth_date',
    'first_name',
    'id',
    'last_name',
    'photo_url',
    'username',
  ];

  for (const key of allowedKeys) {
    const val = payload[key];
    if (val !== undefined && val !== null && String(val) !== '') {
      fields.push([key, String(val)]);
    }
  }
  fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = fields.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expectedHashHex = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const receivedHashHex = String(payload.hash).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHashHex)) {
    return { valid: false, reason: "Telegram imzo formati noto'g'ri." };
  }

  const expectedBuf = Buffer.from(expectedHashHex, 'hex');
  const receivedBuf = Buffer.from(receivedHashHex, 'hex');
  if (expectedBuf.length !== receivedBuf.length) {
    return { valid: false, reason: 'Telegram imzosi tasdiqlanmadi.' };
  }

  const isMatch = crypto.timingSafeEqual(expectedBuf, receivedBuf);
  if (!isMatch) {
    return { valid: false, reason: "Telegram imzosi noto'g'ri yoki o'zgartirilgan." };
  }

  return { valid: true };
}

/**
 * Helper to sign a Telegram Login Widget payload (useful in automated tests).
 */
export function signTelegramPayloadForTest(
  payload: Omit<TelegramAuthPayload, 'hash'>,
  botToken: string
): TelegramAuthPayload {
  const entries = Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return { ...payload, hash };
}

function base64UrlEncode(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function createSessionToken(
  userId: string,
  telegramId: string,
  secret: string,
  ttlMs: number = SESSION_MAX_AGE_MS
): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    uid: userId,
    tid: telegramId,
    iat: now,
    exp: now + ttlMs,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const bodyB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${bodyB64}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowMs: number = Date.now()
): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  const signingInput = `${headerB64}.${bodyB64}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  let receivedSig: Buffer;
  try {
    receivedSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }
  if (expectedSig.length !== receivedSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, receivedSig)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(bodyB64).toString('utf8')) as SessionTokenPayload;
    if (!parsed.uid || !parsed.tid || !parsed.exp) return null;
    if (nowMs > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

export async function resolveServerRole(
  telegramId: string,
  store: DataStore
): Promise<UserRole> {
  const cfg = getConfig();
  if (cfg.adminTelegramIds.includes(telegramId)) return 'admin';
  if (cfg.teacherTelegramIds.includes(telegramId)) return 'teacher';
  const allowlist = await store.getTeacherAllowlist();
  if (allowlist.includes(telegramId)) return 'teacher';
  return 'student';
}

export function setSessionCookie(res: Response, token: string): void {
  const cfg = getConfig();
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.isProduction,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  const cfg = getConfig();
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.isProduction,
    path: '/',
  });
}

export function parseCookiesFromHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = val;
  }
  return out;
}

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

export function createAuthMiddleware(store: DataStore) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const cfg = getConfig();
      const cookieToken =
        (req.cookies && req.cookies[SESSION_COOKIE_NAME]) ||
        parseCookiesFromHeader(req.headers.cookie)[SESSION_COOKIE_NAME];

      if (cookieToken) {
        const verified = verifySessionToken(cookieToken, cfg.sessionSecret);
        if (verified) {
          const user = await store.getUserById(verified.uid);
          if (user) {
            const role = await resolveServerRole(user.telegramId, store);
            if (user.role !== role) {
              user.role = role;
              await store.upsertUser(user);
            }
            req.user = user;
            return next();
          }
        }
      }

      // Strictly restricted dev bypass: ONLY non-production AND 127.0.0.1 loopback
      const remoteAddr = req.socket?.remoteAddress || req.ip;
      if (!cfg.isProduction && cfg.devAuthUserId && isLoopbackIp(remoteAddr)) {
        const devTid = String(cfg.devAuthUserId);
        let user = await store.getUserByTelegramId(devTid);
        const role = await resolveServerRole(devTid, store);
        if (!user) {
          const now = new Date().toISOString();
          user = {
            id: `tg_${devTid}`,
            telegramId: devTid,
            firstName:
              role === 'admin'
                ? 'Admin (Dev)'
                : role === 'teacher'
                  ? 'Ustoz (Dev)'
                  : "O'quvchi (Dev)",
            username: `dev_${devTid}`,
            role,
            groupIds: [],
            createdAt: now,
            updatedAt: now,
          };
          await store.upsertUser(user);
        } else if (user.role !== role) {
          user.role = role;
          await store.upsertUser(user);
        }
        req.user = user;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Tizimga kirmagansiz. Iltimos, Telegram orqali kiring." });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Tizimga kirmagansiz." });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: "Sizda ushbu amalni bajarish uchun yetarli huquq yo'q.",
      });
      return;
    }
    next();
  };
}
