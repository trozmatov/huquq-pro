import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import express, { type Express, type Response } from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import type {
  AiQuotaStatus,
  AiTutorSession,
  ExamDateItem,
  FullTestQuestion,
  Group,
  InterimExam,
  InterimExamAttempt,
  LeitnerCardState,
  StudentAnalyticsRow,
  Textbook,
  Topic,
  TopicProgress,
  UserProfile,
} from '../shared/types.js';
import {
  calculateNextLeitner,
  generateInviteCode,
  mergeWeakItems,
} from '../shared/utils.js';
import type { DataStore } from './store/types.js';
import { createStore } from './store/index.js';
import { getConfig } from './config.js';
import {
  type AuthenticatedRequest,
  clearSessionCookie,
  createAuthMiddleware,
  createSessionToken,
  isLoopbackIp,
  requireAuth,
  requireRole,
  resolveServerRole,
  setSessionCookie,
  verifyTelegramLoginWidget,
} from './auth.js';
import {
  aiGenerateTopicSchema,
  aiSessionFinishSchema,
  aiTextTurnSchema,
  devLoginSchema,
  examDateSchema,
  groupCreateSchema,
  groupUpdateSchema,
  interimExamSchema,
  interimExamSubmitSchema,
  joinGroupSchema,
  leitnerReviewSchema,
  progressUpdateSchema,
  reorderTopicSchema,
  studyProfileSchema,
  teacherAllowlistParamSchema,
  telegramAuthSchema,
  textbookCreateSchema,
  textbookUpdateSchema,
  topicCreateSchema,
  topicUpdateSchema,
  writtenGradeSchema,
} from './validation.js';
import { extractTextFromFile } from './fileExtract.js';
import {
  evaluateOralTranscript,
  generateAiTutorTextReply,
  generateTopicPackageFromSource,
  gradeWrittenAnswers,
} from './aiService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
});

function genId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Ma'lumotlar formati noto'g'ri.",
      details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  const message = err instanceof Error ? err.message : 'Ichki server xatoligi.';
  res.status(500).json({ error: message });
}

function isOwnerOrAdmin(user: UserProfile, ownerId: string): boolean {
  return user.role === 'admin' || user.telegramId === ownerId || user.id === ownerId;
}

async function getAccessibleTextbooksForUser(
  user: UserProfile,
  store: DataStore
): Promise<Textbook[]> {
  const all = await store.listTextbooks();
  if (user.role === 'admin') return all;
  if (user.role === 'teacher') {
    return all.filter(
      (tb) => tb.isPublic || tb.ownerId === user.telegramId || tb.ownerId === user.id
    );
  }
  const groups = await store.listGroups();
  const memberTextbookIds = new Set<string>();
  for (const g of groups) {
    if (g.memberIds.includes(user.id)) {
      g.textbookIds.forEach((id) => memberTextbookIds.add(id));
    }
  }
  return all.filter((tb) => tb.isPublic || memberTextbookIds.has(tb.id));
}

async function isTopicLockedForStudent(
  user: UserProfile,
  topic: Topic,
  store: DataStore
): Promise<{ locked: boolean; blockingExam?: InterimExam }> {
  if (user.role === 'admin' || user.role === 'teacher') {
    return { locked: false };
  }
  const exams = await store.listInterimExams(topic.textbookId);
  if (exams.length === 0) return { locked: false };

  const attempts = await store.listInterimExamAttempts(user.id);
  const passedExamIds = new Set(attempts.filter((a) => a.passed).map((a) => a.examId));

  for (const exam of exams) {
    if (topic.order > exam.afterTopicOrder && !passedExamIds.has(exam.id)) {
      return { locked: true, blockingExam: exam };
    }
  }
  return { locked: false };
}

export function createApp(providedStore?: DataStore): { app: Express; store: DataStore } {
  const store = providedStore || createStore();
  const app = express();
  app.set('trust proxy', 1);

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  // Rate limiters (relaxed in test environment)
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 500 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." },
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isTest ? 500 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI so'rovlari limiti oshdi. 1 daqiqadan so'ng qayta urinib ko'ring." },
  });

  app.use(createAuthMiddleware(store));

  // ==================== PUBLIC CONFIG & CATALOG ====================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'huquqpro-api', time: new Date().toISOString() });
  });

  app.get('/api/config', (_req, res) => {
    const cfg = getConfig();
    res.json({
      telegramBotUsername: cfg.telegramBotUsername,
      devAuthEnabled: !cfg.isProduction,
      geminiConfigured: Boolean(cfg.geminiApiKey),
    });
  });

  app.get('/api/public/catalog', async (_req, res) => {
    try {
      const [textbooks, topics, examDates] = await Promise.all([
        store.listTextbooks(),
        store.listTopics(),
        store.listExamDates(),
      ]);
      const publicTextbooks = textbooks
        .filter((tb) => tb.isPublic)
        .map((tb) => ({
          ...tb,
          topicCount: topics.filter((t) => t.textbookId === tb.id).length,
        }));
      res.json({ textbooks: publicTextbooks, examDates });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ==================== AUTH (TELEGRAM LOGIN WIDGET) ====================
  app.post('/api/auth/telegram', authLimiter, async (req, res) => {
    try {
      const parsed = telegramAuthSchema.parse(req.body);
      const cfg = getConfig();
      const verification = verifyTelegramLoginWidget(parsed, cfg.telegramBotToken);
      if (!verification.valid) {
        res.status(401).json({ error: verification.reason || 'Telegram autentifikatsiyasi rad etildi.' });
        return;
      }

      const telegramId = String(parsed.id);
      const role = await resolveServerRole(telegramId, store);
      const existing = await store.getUserByTelegramId(telegramId);
      const now = new Date().toISOString();

      const user: UserProfile = existing
        ? {
            ...existing,
            firstName: parsed.first_name,
            lastName: parsed.last_name || existing.lastName,
            username: parsed.username || existing.username,
            photoUrl: parsed.photo_url || existing.photoUrl,
            role,
            updatedAt: now,
          }
        : {
            id: `tg_${telegramId}`,
            telegramId,
            firstName: parsed.first_name,
            lastName: parsed.last_name,
            username: parsed.username,
            photoUrl: parsed.photo_url || undefined,
            role,
            groupIds: [],
            createdAt: now,
            updatedAt: now,
          };

      await store.upsertUser(user);
      const token = createSessionToken(user.id, user.telegramId, cfg.sessionSecret);
      setSessionCookie(res, token);
      res.json({ user });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Strictly local development quick login (ONLY non-production + loopback)
  app.post('/api/auth/dev-login', async (req, res) => {
    try {
      const cfg = getConfig();
      const remoteAddr = req.socket?.remoteAddress || req.ip;
      if (cfg.isProduction || !isLoopbackIp(remoteAddr)) {
        res.status(403).json({ error: 'Dev-login faqat lokal muhitda ishlaydi.' });
        return;
      }
      const parsed = devLoginSchema.parse(req.body || {});
      const telegramId = parsed.telegramId;
      const role = await resolveServerRole(telegramId, store);
      const existing = await store.getUserByTelegramId(telegramId);
      const now = new Date().toISOString();

      const user: UserProfile = existing
        ? { ...existing, role, updatedAt: now }
        : {
            id: `tg_${telegramId}`,
            telegramId,
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            username: parsed.username || `user_${telegramId}`,
            role,
            groupIds: [],
            createdAt: now,
            updatedAt: now,
          };

      await store.upsertUser(user);
      const token = createSessionToken(user.id, user.telegramId, cfg.sessionSecret);
      setSessionCookie(res, token);
      res.json({ user });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        res.json({ user: null });
        return;
      }
      const cfg = getConfig();
      const usedToday = await store.countUserAiSessionsToday(req.user.id);
      const quota: AiQuotaStatus = {
        sessionsUsedToday: usedToday,
        maxSessionsPerDay: cfg.aiMaxSessionsPerDay,
        maxDurationSec: cfg.aiMaxDurationSec,
        remainingToday: Math.max(0, cfg.aiMaxSessionsPerDay - usedToday),
      };
      const allGroups = await store.listGroups();
      const myGroups = allGroups.filter((g) => g.memberIds.includes(req.user!.id));
      res.json({ user: req.user, quota, groups: myGroups });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ==================== STUDENT CONSENT, PROFILE & OWN DATA ====================
  app.post('/api/me/consent', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const now = new Date().toISOString();
      const updated: UserProfile = {
        ...user,
        consentAcceptedAt: user.consentAcceptedAt || now,
        updatedAt: now,
      };
      await store.upsertUser(updated);
      res.json({ user: updated });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.put('/api/me/study-profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = studyProfileSchema.parse(req.body);
      if (parsed.examDateId) {
        const examDate = await store.getExamDateById(parsed.examDateId);
        if (!examDate) {
          res.status(400).json({ error: 'Tanlangan imtihon sanasi topilmadi.' });
          return;
        }
      }
      const user = req.user!;
      const now = new Date().toISOString();
      const updated: UserProfile = {
        ...user,
        consentAcceptedAt: user.consentAcceptedAt || now,
        studyProfile: {
          ...parsed,
          completedAt: now,
        },
        updatedAt: now,
      };
      await store.upsertUser(updated);
      res.json({ user: updated });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/me/groups/join', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { inviteCode } = joinGroupSchema.parse(req.body);
      const group = await store.getGroupByInviteCode(inviteCode);
      if (!group) {
        res.status(404).json({ error: "Bunday taklif kodli guruh topilmadi. Kodni qayta tekshiring." });
        return;
      }
      const user = req.user!;
      if (!group.memberIds.includes(user.id)) {
        group.memberIds.push(user.id);
        group.updatedAt = new Date().toISOString();
        await store.upsertGroup(group);
      }
      if (!user.groupIds.includes(group.id)) {
        user.groupIds.push(group.id);
        user.updatedAt = new Date().toISOString();
        await store.upsertUser(user);
      }
      res.json({ group, user });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/me/groups/:groupId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const groupId = String(req.params.groupId);
      const group = await store.getGroupById(groupId);
      const user = req.user!;
      if (group) {
        group.memberIds = group.memberIds.filter((id) => id !== user.id);
        group.updatedAt = new Date().toISOString();
        await store.upsertGroup(group);
      }
      user.groupIds = user.groupIds.filter((id) => id !== groupId);
      user.updatedAt = new Date().toISOString();
      await store.upsertUser(user);
      res.json({ ok: true, user });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/me/data', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await store.deleteUserData(req.user!.id);
      const refreshed = await store.getUserById(req.user!.id);
      res.json({ ok: true, user: refreshed });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ==================== EXAM DATES CRUD ====================
  app.get('/api/exam-dates', async (_req, res) => {
    try {
      const dates = await store.listExamDates();
      res.json({ examDates: dates });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post(
    '/api/exam-dates',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = examDateSchema.parse(req.body);
        const item: ExamDateItem = {
          id: genId('exam-date'),
          title: parsed.title,
          date: parsed.date,
          description: parsed.description,
          examType: parsed.examType,
          createdBy: req.user!.telegramId,
          createdAt: new Date().toISOString(),
        };
        await store.upsertExamDate(item);
        res.status(201).json({ examDate: item });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.put(
    '/api/exam-dates/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getExamDateById(id);
        if (!existing) {
          res.status(404).json({ error: 'Imtihon sanasi topilmadi.' });
          return;
        }
        if (existing.createdBy !== 'system' && !isOwnerOrAdmin(req.user!, existing.createdBy)) {
          res.status(403).json({ error: "Faqat o'zingiz yaratgan imtihon sanasini tahrirlay olasiz." });
          return;
        }
        const parsed = examDateSchema.parse(req.body);
        const updated: ExamDateItem = { ...existing, ...parsed };
        await store.upsertExamDate(updated);
        res.json({ examDate: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/exam-dates/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getExamDateById(id);
        if (!existing) {
          res.status(404).json({ error: 'Imtihon sanasi topilmadi.' });
          return;
        }
        if (existing.createdBy !== 'system' && !isOwnerOrAdmin(req.user!, existing.createdBy)) {
          res.status(403).json({ error: "Faqat o'zingiz yaratgan imtihon sanasini o'chira olasiz." });
          return;
        }
        await store.deleteExamDate(id);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ==================== TEXTBOOKS CRUD ====================
  app.get('/api/textbooks', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const textbooks = await getAccessibleTextbooksForUser(req.user!, store);
      const [allTopics, allExams, attempts] = await Promise.all([
        store.listTopics(),
        store.listInterimExams(),
        store.listInterimExamAttempts(req.user!.id),
      ]);
      const passedExamIds = new Set(attempts.filter((a) => a.passed).map((a) => a.examId));

      const enriched = textbooks.map((tb) => {
        const tbTopics = allTopics.filter((t) => t.textbookId === tb.id);
        const tbExams = allExams.filter((e) => e.textbookId === tb.id);
        return {
          ...tb,
          topics: tbTopics.map((t) => {
            let locked = false;
            let blockingExamId: string | null = null;
            if (req.user!.role === 'student') {
              for (const ex of tbExams) {
                if (t.order > ex.afterTopicOrder && !passedExamIds.has(ex.id)) {
                  locked = true;
                  blockingExamId = ex.id;
                  break;
                }
              }
            }
            return {
              id: t.id,
              textbookId: t.textbookId,
              order: t.order,
              title: t.title,
              subtitle: t.subtitle,
              estimatedMinutes: t.estimatedMinutes,
              flashcardCount: t.flashcards.length,
              quizCount: t.quizQuestions.length,
              fullTestCount: t.fullTestQuestions.length,
              writtenCount: t.writtenQuestions.length,
              locked,
              blockingExamId,
            };
          }),
          interimExams: tbExams.map((ex) => ({
            ...ex,
            passed: passedExamIds.has(ex.id),
            bestScore: attempts
              .filter((a) => a.examId === ex.id)
              .reduce((max, a) => Math.max(max, a.score), -1),
          })),
        };
      });

      res.json({ textbooks: enriched });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post(
    '/api/textbooks',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = textbookCreateSchema.parse(req.body);
        const now = new Date().toISOString();
        const tb: Textbook = {
          id: genId('tb'),
          ...parsed,
          ownerId: req.user!.telegramId,
          createdAt: now,
          updatedAt: now,
        };
        await store.upsertTextbook(tb);
        res.status(201).json({ textbook: tb });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.put(
    '/api/textbooks/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getTextbookById(id);
        if (!existing) {
          res.status(404).json({ error: 'Darslik topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, existing.ownerId)) {
          res.status(403).json({ error: "Faqat o'zingiz yaratgan darslikni tahrirlay olasiz." });
          return;
        }
        const parsed = textbookUpdateSchema.parse(req.body);
        const updated: Textbook = {
          ...existing,
          ...parsed,
          updatedAt: new Date().toISOString(),
        };
        await store.upsertTextbook(updated);
        res.json({ textbook: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/textbooks/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getTextbookById(id);
        if (!existing) {
          res.status(404).json({ error: 'Darslik topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, existing.ownerId)) {
          res.status(403).json({ error: "Faqat o'zingiz yaratgan darslikni o'chira olasiz." });
          return;
        }
        await store.deleteTextbook(id);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ==================== TOPICS CRUD ====================
  app.get('/api/topics/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const topic = await store.getTopicById(id);
      if (!topic) {
        res.status(404).json({ error: 'Mavzu topilmadi.' });
        return;
      }
      const accessible = await getAccessibleTextbooksForUser(req.user!, store);
      if (!accessible.some((tb) => tb.id === topic.textbookId)) {
        res.status(403).json({ error: "Ushbu yopiq darslikka ruxsatingiz yo'q." });
        return;
      }
      const lockCheck = await isTopicLockedForStudent(req.user!, topic, store);
      if (lockCheck.locked) {
        res.status(403).json({
          error: `Ushbu dars qulflangan. Avval «${lockCheck.blockingExam?.title}» oraliq imtihonidan kamida ${lockCheck.blockingExam?.passingScore}% to'plang.`,
          locked: true,
          blockingExam: lockCheck.blockingExam,
        });
        return;
      }
      const progress = await store.getTopicProgress(req.user!.id, topic.id);
      const leitnerCards = (await store.listUserLeitnerCards(req.user!.id)).filter(
        (c) => c.topicId === topic.id
      );
      res.json({ topic, progress, leitnerCards });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post(
    '/api/topics',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = topicCreateSchema.parse(req.body);
        const tb = await store.getTextbookById(parsed.textbookId);
        if (!tb) {
          res.status(404).json({ error: 'Darslik topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Ushbu darslikka mavzu qo'shish huquqingiz yo'q." });
          return;
        }
        const existingTopics = await store.listTopics(parsed.textbookId);
        const nextOrder =
          parsed.order ??
          (existingTopics.length > 0
            ? Math.max(...existingTopics.map((t) => t.order)) + 1
            : 1);

        const now = new Date().toISOString();
        const topic: Topic = {
          id: genId('topic'),
          textbookId: parsed.textbookId,
          order: nextOrder,
          title: parsed.title,
          subtitle: parsed.subtitle,
          estimatedMinutes: parsed.estimatedMinutes,
          knowledgePack: parsed.knowledgePack,
          flashcards: parsed.flashcards,
          quizQuestions: parsed.quizQuestions,
          processTask: parsed.processTask || {
            id: genId('pt'),
            title: `${parsed.title} — protsessual tartib`,
            instruction: "Bosqichlarni to'g'ri tartibda joylashtiring.",
            steps: ['1-bosqich', '2-bosqich', '3-bosqich'],
            causeEffectQuestion: {
              question: 'Huquqiy oqibat qanday?',
              options: ["Qonunga muvofiq javobgarlik kelib chiqadi", "Oqibat yo'q"],
              correctIndex: 0,
              explanation: "Huquqiy norma buzilganda qonunda belgilangan oqibat qo'llaniladi.",
            },
          },
          fullTestQuestions: parsed.fullTestQuestions,
          writtenQuestions: parsed.writtenQuestions,
          aiQuestions: parsed.aiQuestions,
          createdAt: now,
          updatedAt: now,
        };
        await store.upsertTopic(topic);
        res.status(201).json({ topic });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.put(
    '/api/topics/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getTopicById(id);
        if (!existing) {
          res.status(404).json({ error: 'Mavzu topilmadi.' });
          return;
        }
        const tb = await store.getTextbookById(existing.textbookId);
        if (!tb || !isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Ushbu mavzuni tahrirlash huquqingiz yo'q." });
          return;
        }
        const parsed = topicUpdateSchema.parse(req.body);
        const updated: Topic = {
          ...existing,
          ...parsed,
          id: existing.id,
          textbookId: existing.textbookId,
          updatedAt: new Date().toISOString(),
        };
        await store.upsertTopic(updated);
        res.json({ topic: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/topics/:id/reorder',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { direction } = reorderTopicSchema.parse(req.body);
        const topic = await store.getTopicById(id);
        if (!topic) {
          res.status(404).json({ error: 'Mavzu topilmadi.' });
          return;
        }
        const tb = await store.getTextbookById(topic.textbookId);
        if (!tb || !isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Mavzular tartibini o'zgartirish huquqingiz yo'q." });
          return;
        }

        const list = await store.listTopics(topic.textbookId);
        const idx = list.findIndex((t) => t.id === topic.id);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) {
          res.json({ topics: list });
          return;
        }

        const a = list[idx];
        const b = list[swapIdx];
        const tempOrder = a.order;
        a.order = b.order;
        b.order = tempOrder;
        await store.upsertTopic(a);
        await store.upsertTopic(b);
        const updatedList = await store.listTopics(topic.textbookId);
        res.json({ topics: updatedList });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/topics/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getTopicById(id);
        if (!existing) {
          res.status(404).json({ error: 'Mavzu topilmadi.' });
          return;
        }
        const tb = await store.getTextbookById(existing.textbookId);
        if (!tb || !isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Ushbu mavzuni o'chirish huquqingiz yo'q." });
          return;
        }
        await store.deleteTopic(id);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ==================== INTERIM EXAMS & SIMULATOR ====================
  app.post(
    '/api/interim-exams',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = interimExamSchema.parse(req.body);
        const tb = await store.getTextbookById(parsed.textbookId);
        if (!tb) {
          res.status(404).json({ error: 'Darslik topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Oraliq imtihon yaratish huquqingiz yo'q." });
          return;
        }
        const exam: InterimExam = {
          id: genId('interim'),
          ...parsed,
          createdAt: new Date().toISOString(),
        };
        await store.upsertInterimExam(exam);
        res.status(201).json({ interimExam: exam });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.put(
    '/api/interim-exams/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getInterimExamById(id);
        if (!existing) {
          res.status(404).json({ error: 'Oraliq imtihon topilmadi.' });
          return;
        }
        const tb = await store.getTextbookById(existing.textbookId);
        if (!tb || !isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Oraliq imtihonni tahrirlash huquqingiz yo'q." });
          return;
        }
        const parsed = interimExamSchema.parse(req.body);
        const updated: InterimExam = { ...existing, ...parsed };
        await store.upsertInterimExam(updated);
        res.json({ interimExam: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/interim-exams/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getInterimExamById(id);
        if (!existing) {
          res.status(404).json({ error: 'Oraliq imtihon topilmadi.' });
          return;
        }
        const tb = await store.getTextbookById(existing.textbookId);
        if (!tb || !isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Oraliq imtihonni o'chirish huquqingiz yo'q." });
          return;
        }
        await store.deleteInterimExam(id);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.get('/api/interim-exams/:id/questions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const exam = await store.getInterimExamById(id);
      if (!exam) {
        res.status(404).json({ error: 'Oraliq imtihon topilmadi.' });
        return;
      }
      const accessible = await getAccessibleTextbooksForUser(req.user!, store);
      if (!accessible.some((tb) => tb.id === exam.textbookId)) {
        res.status(403).json({ error: "Ushbu imtihonga ruxsatingiz yo'q." });
        return;
      }
      const pool: Array<FullTestQuestion & { topicTitle: string }> = [];
      for (const tid of exam.sourceTopicIds) {
        const topic = await store.getTopicById(tid);
        if (!topic) continue;
        for (const q of topic.fullTestQuestions) {
          pool.push({ ...q, topicTitle: topic.title });
        }
        for (const q of topic.quizQuestions) {
          if (q.type === 'mcq' && q.options && q.correctIndex !== undefined) {
            pool.push({
              id: q.id,
              question: q.question,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              topicTitle: topic.title,
            });
          }
        }
      }
      const questions = pool.slice(0, exam.questionCount);
      res.json({ exam, questions });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/interim-exams/:id/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const exam = await store.getInterimExamById(id);
      if (!exam) {
        res.status(404).json({ error: 'Oraliq imtihon topilmadi.' });
        return;
      }
      const { answers } = interimExamSubmitSchema.parse(req.body);
      const answerKey = new Map<string, { correctIndex: number; explanation: string }>();
      for (const tid of exam.sourceTopicIds) {
        const topic = await store.getTopicById(tid);
        if (!topic) continue;
        for (const q of topic.fullTestQuestions) {
          answerKey.set(q.id, { correctIndex: q.correctIndex, explanation: q.explanation });
        }
        for (const q of topic.quizQuestions) {
          if (q.type === 'mcq' && q.correctIndex !== undefined) {
            answerKey.set(q.id, { correctIndex: q.correctIndex, explanation: q.explanation });
          }
        }
      }

      let correctCount = 0;
      const details = answers.map((a) => {
        const key = answerKey.get(a.questionId);
        const isCorrect = key ? key.correctIndex === a.selectedIndex : false;
        if (isCorrect) correctCount++;
        return {
          questionId: a.questionId,
          selectedIndex: a.selectedIndex,
          correctIndex: key?.correctIndex ?? -1,
          isCorrect,
          explanation: key?.explanation ?? '',
        };
      });

      const totalQuestions = Math.max(1, answers.length);
      const score = Math.round((correctCount / totalQuestions) * 100);
      const passed = score >= exam.passingScore;

      const attempt: InterimExamAttempt = {
        id: genId('att'),
        userId: req.user!.id,
        examId: exam.id,
        textbookId: exam.textbookId,
        score,
        passed,
        totalQuestions,
        correctCount,
        createdAt: new Date().toISOString(),
      };
      await store.addInterimExamAttempt(attempt);
      res.json({ attempt, details, passingScore: exam.passingScore });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/simulator/exam', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const requestedCount = Math.min(30, Math.max(20, Number(req.query.count || 25)));
      const accessible = await getAccessibleTextbooksForUser(req.user!, store);
      const tbMap = new Map(accessible.map((tb) => [tb.id, tb]));
      const allTopics = await store.listTopics();

      const pool: Array<FullTestQuestion & { topicId: string; topicTitle: string; branch: string }> =
        [];
      for (const topic of allTopics) {
        const tb = tbMap.get(topic.textbookId);
        if (!tb) continue;
        for (const q of topic.fullTestQuestions) {
          pool.push({
            ...q,
            topicId: topic.id,
            topicTitle: topic.title,
            branch: tb.branch,
          });
        }
      }

      // Deterministic-free shuffle for realistic exam variety
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      const selected = pool.slice(0, Math.min(requestedCount, pool.length));
      res.json({
        title: 'Milliy Sertifikat / OTM Aralash Simulyatori',
        durationMinutes: Math.max(25, Math.round(selected.length * 1.5)),
        questions: selected,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ==================== STUDENT PROGRESS, LEITNER & WRITTEN GRADING ====================
  app.get('/api/progress', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const [progressList, leitnerCards, interimAttempts] = await Promise.all([
        store.listUserProgress(req.user!.id),
        store.listUserLeitnerCards(req.user!.id),
        store.listInterimExamAttempts(req.user!.id),
      ]);
      res.json({ progress: progressList, leitnerCards, interimAttempts });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.put('/api/progress/:topicId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const topicId = String(req.params.topicId);
      const topic = await store.getTopicById(topicId);
      if (!topic) {
        res.status(404).json({ error: 'Mavzu topilmadi.' });
        return;
      }
      const accessible = await getAccessibleTextbooksForUser(req.user!, store);
      if (!accessible.some((tb) => tb.id === topic.textbookId)) {
        res.status(403).json({ error: "Ushbu mavzuga ruxsatingiz yo'q." });
        return;
      }
      const parsed = progressUpdateSchema.parse(req.body);
      const prev = await store.getTopicProgress(req.user!.id, topicId);

      const merged: TopicProgress = {
        topicId,
        userId: req.user!.id,
        konspektRead: parsed.konspektRead ?? prev?.konspektRead ?? false,
        cardsMastered: parsed.cardsMastered ?? prev?.cardsMastered ?? 0,
        cardsTotal: parsed.cardsTotal ?? prev?.cardsTotal ?? topic.flashcards.length,
        cardsScore: parsed.cardsScore ?? prev?.cardsScore ?? 0,
        quizScore: parsed.quizScore !== undefined ? parsed.quizScore : (prev?.quizScore ?? null),
        processScore:
          parsed.processScore !== undefined ? parsed.processScore : (prev?.processScore ?? null),
        fullTestScore:
          parsed.fullTestScore !== undefined ? parsed.fullTestScore : (prev?.fullTestScore ?? null),
        writtenScore:
          parsed.writtenScore !== undefined ? parsed.writtenScore : (prev?.writtenScore ?? null),
        writtenResults: prev?.writtenResults ?? [],
        aiTutorScore:
          parsed.aiTutorScore !== undefined ? parsed.aiTutorScore : (prev?.aiTutorScore ?? null),
        weak: mergeWeakItems(prev?.weak, parsed.weak),
        updatedAt: new Date().toISOString(),
      };

      await store.upsertTopicProgress(merged);
      res.json({ progress: merged });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/leitner/review', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = leitnerReviewSchema.parse(req.body);
      const topic = await store.getTopicById(parsed.topicId);
      if (!topic) {
        res.status(404).json({ error: 'Mavzu topilmadi.' });
        return;
      }

      const existingCard = await store.getLeitnerCard(req.user!.id, parsed.cardId);
      const now = new Date();
      const next = calculateNextLeitner(existingCard?.box ?? 1, parsed.known, now);

      const newState: LeitnerCardState = {
        cardId: parsed.cardId,
        topicId: parsed.topicId,
        box: next.box,
        intervalDays: next.intervalDays,
        nextReviewAt: next.nextReviewAt,
        lastReviewedAt: now.toISOString(),
        lapses: (existingCard?.lapses ?? 0) + (parsed.known ? 0 : 1),
        known: parsed.known,
      };
      await store.upsertLeitnerCard(req.user!.id, newState);

      // Update topic progress cards score & weak cards
      const userCards = (await store.listUserLeitnerCards(req.user!.id)).filter(
        (c) => c.topicId === topic.id
      );
      const masteredCount = userCards.filter((c) => c.known && c.box >= 2).length;
      const totalCards = Math.max(1, topic.flashcards.length);
      const cardsScore = Math.min(100, Math.round((masteredCount / totalCards) * 100));
      const cardObj = topic.flashcards.find((f) => f.id === parsed.cardId);
      const cardLabel = parsed.cardFront || cardObj?.front || parsed.cardId;

      const prev = await store.getTopicProgress(req.user!.id, topic.id);
      let nextWeakCards = [...(prev?.weak.cards ?? [])];
      if (!parsed.known) {
        if (!nextWeakCards.includes(cardLabel)) nextWeakCards.push(cardLabel);
      } else {
        nextWeakCards = nextWeakCards.filter((item) => item !== cardLabel);
      }

      const updatedProgress: TopicProgress = {
        topicId: topic.id,
        userId: req.user!.id,
        konspektRead: prev?.konspektRead ?? false,
        cardsMastered: masteredCount,
        cardsTotal: topic.flashcards.length,
        cardsScore,
        quizScore: prev?.quizScore ?? null,
        processScore: prev?.processScore ?? null,
        fullTestScore: prev?.fullTestScore ?? null,
        writtenScore: prev?.writtenScore ?? null,
        writtenResults: prev?.writtenResults ?? [],
        aiTutorScore: prev?.aiTutorScore ?? null,
        weak: {
          cards: nextWeakCards,
          written: prev?.weak.written ?? [],
          timeline: prev?.weak.timeline ?? [],
        },
        updatedAt: now.toISOString(),
      };
      await store.upsertTopicProgress(updatedProgress);

      res.json({ cardState: newState, progress: updatedProgress });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/review/today', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const accessible = await getAccessibleTextbooksForUser(req.user!, store);
      const accessibleIds = new Set(accessible.map((tb) => tb.id));
      const [allTopics, leitnerCards, progressList] = await Promise.all([
        store.listTopics(),
        store.listUserLeitnerCards(req.user!.id),
        store.listUserProgress(req.user!.id),
      ]);

      const topicMap = new Map(
        allTopics.filter((t) => accessibleIds.has(t.textbookId)).map((t) => [t.id, t])
      );
      const nowMs = Date.now();
      const leitnerByCard = new Map(leitnerCards.map((c) => [c.cardId, c]));

      const dueCards: Array<{
        card: Topic['flashcards'][number];
        topicId: string;
        topicTitle: string;
        state: LeitnerCardState | null;
      }> = [];

      for (const topic of topicMap.values()) {
        for (const card of topic.flashcards) {
          const state = leitnerByCard.get(card.id) || null;
          // Due if previously reviewed and nextReviewAt <= now, OR lapsed/not known
          if (state && (new Date(state.nextReviewAt).getTime() <= nowMs || !state.known)) {
            dueCards.push({ card, topicId: topic.id, topicTitle: topic.title, state });
          }
        }
      }

      // If student hasn't reviewed cards yet, suggest starter cards from their first accessible topic
      if (dueCards.length === 0 && leitnerCards.length === 0) {
        const firstTopic = Array.from(topicMap.values())[0];
        if (firstTopic) {
          for (const card of firstTopic.flashcards.slice(0, 6)) {
            dueCards.push({
              card,
              topicId: firstTopic.id,
              topicTitle: firstTopic.title,
              state: null,
            });
          }
        }
      }

      const weakBank = progressList
        .map((p) => {
          const topic = topicMap.get(p.topicId);
          if (!topic) return null;
          const totalWeak =
            p.weak.cards.length + p.weak.written.length + p.weak.timeline.length;
          if (totalWeak === 0) return null;
          return {
            topicId: topic.id,
            topicTitle: topic.title,
            weak: p.weak,
            writtenMistakes: p.writtenResults.filter((r) => !r.isCorrect),
          };
        })
        .filter(Boolean);

      res.json({
        dueCards,
        allLeitnerStats: {
          totalTracked: leitnerCards.length,
          mastered: leitnerCards.filter((c) => c.box >= 4).length,
          dueToday: dueCards.length,
        },
        weakBank,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post(
    '/api/topics/:topicId/written/grade',
    requireAuth,
    aiLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const topicId = String(req.params.topicId);
        const topic = await store.getTopicById(topicId);
        if (!topic) {
          res.status(404).json({ error: 'Mavzu topilmadi.' });
          return;
        }
        const accessible = await getAccessibleTextbooksForUser(req.user!, store);
        if (!accessible.some((tb) => tb.id === topic.textbookId)) {
          res.status(403).json({ error: "Ushbu mavzuga ruxsatingiz yo'q." });
          return;
        }

        const { answers } = writtenGradeSchema.parse(req.body);
        const { score, results } = await gradeWrittenAnswers(topic, answers);

        const prev = await store.getTopicProgress(req.user!.id, topic.id);
        const wrongPrompts = results
          .filter((r) => !r.isCorrect)
          .map((r) => r.prompt.slice(0, 140));

        const updated: TopicProgress = {
          topicId: topic.id,
          userId: req.user!.id,
          konspektRead: prev?.konspektRead ?? false,
          cardsMastered: prev?.cardsMastered ?? 0,
          cardsTotal: prev?.cardsTotal ?? topic.flashcards.length,
          cardsScore: prev?.cardsScore ?? 0,
          quizScore: prev?.quizScore ?? null,
          processScore: prev?.processScore ?? null,
          fullTestScore: prev?.fullTestScore ?? null,
          writtenScore: score,
          writtenResults: results,
          aiTutorScore: prev?.aiTutorScore ?? null,
          weak: {
            cards: prev?.weak.cards ?? [],
            written: wrongPrompts,
            timeline: prev?.weak.timeline ?? [],
          },
          updatedAt: new Date().toISOString(),
        };
        await store.upsertTopicProgress(updated);

        res.json({ writtenScore: score, results, progress: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ==================== AI HUQUQSHUNOS USTOZ (TEXT + SESSION LIFECYCLE) ====================
  app.get('/api/ai/quota', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const cfg = getConfig();
      const usedToday = await store.countUserAiSessionsToday(req.user!.id);
      const quota: AiQuotaStatus = {
        sessionsUsedToday: usedToday,
        maxSessionsPerDay: cfg.aiMaxSessionsPerDay,
        maxDurationSec: cfg.aiMaxDurationSec,
        remainingToday: Math.max(0, cfg.aiMaxSessionsPerDay - usedToday),
      };
      res.json({ quota });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/ai/sessions', requireAuth, aiLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const topicId = String(req.body?.topicId || '');
      const mode = req.body?.mode === 'voice' ? 'voice' : 'text';
      const topic = await store.getTopicById(topicId);
      if (!topic) {
        res.status(404).json({ error: 'Mavzu topilmadi.' });
        return;
      }
      const accessible = await getAccessibleTextbooksForUser(req.user!, store);
      if (!accessible.some((tb) => tb.id === topic.textbookId)) {
        res.status(403).json({ error: "Ushbu mavzuga ruxsatingiz yo'q." });
        return;
      }
      const cfg = getConfig();
      const usedToday = await store.countUserAiSessionsToday(req.user!.id);
      if (usedToday >= cfg.aiMaxSessionsPerDay) {
        res.status(429).json({
          error: `Bugungi AI Ustoz suhbat limiti tugadi (${usedToday}/${cfg.aiMaxSessionsPerDay}).`,
        });
        return;
      }

      const progress = await store.getTopicProgress(req.user!.id, topic.id);
      const weakNote =
        progress?.weak.written?.[0] || progress?.weak.cards?.[0] || '';
      const firstQuestion =
        topic.aiQuestions[0] ||
        `«${topic.title}» mavzusidagi eng muhim qonun normasini tushuntirib bering.`;

      const greeting = `Assalomu alaykum, ${req.user!.firstName}! Men AI Huquqshunos Ustozman. Bugun «${topic.title}» mavzusidan og'zaki suhbat o'tkazamiz.${
        weakNote ? ` Avvalgi bosqichlarda «${weakNote}» bo'yicha xatolar bo'lgan, shunga ham alohida e'tibor beramiz.` : ''
      } Birinchi savol: ${firstQuestion}`;

      const now = new Date().toISOString();
      const session: AiTutorSession = {
        id: genId('ai'),
        userId: req.user!.id,
        userName: [req.user!.firstName, req.user!.lastName].filter(Boolean).join(' '),
        topicId: topic.id,
        topicTitle: topic.title,
        mode,
        status: 'active',
        startedAt: now,
        durationSec: 0,
        transcript: [{ role: 'tutor', text: greeting, timestamp: now }],
      };
      await store.upsertAiSession(session);
      res.status(201).json({ session });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post(
    '/api/ai/sessions/:id/message',
    requireAuth,
    aiLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const parsed = aiTextTurnSchema.parse({ ...req.body, sessionId: id });
        const session = await store.getAiSessionById(id);
        if (!session) {
          res.status(404).json({ error: 'Suhbat sessiyasi topilmadi.' });
          return;
        }
        if (session.userId !== req.user!.id) {
          res.status(403).json({ error: "Faqat o'zingizning suhbatingizda yozishingiz mumkin." });
          return;
        }
        const topic = await store.getTopicById(session.topicId);
        if (!topic) {
          res.status(404).json({ error: 'Mavzu topilmadi.' });
          return;
        }

        const progress = await store.getTopicProgress(req.user!.id, topic.id);
        const now = new Date().toISOString();
        session.transcript.push({ role: 'student', text: parsed.message, timestamp: now });
        const reply = await generateAiTutorTextReply(
          topic,
          progress,
          session.transcript,
          parsed.message
        );
        session.transcript.push({
          role: 'tutor',
          text: reply,
          timestamp: new Date().toISOString(),
        });
        await store.upsertAiSession(session);
        res.json({ session, reply });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/ai/sessions/:id/finish',
    requireAuth,
    aiLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const parsed = aiSessionFinishSchema.parse(req.body || {});
        const session = await store.getAiSessionById(id);
        if (!session) {
          res.status(404).json({ error: 'Suhbat sessiyasi topilmadi.' });
          return;
        }
        if (session.userId !== req.user!.id && req.user!.role === 'student') {
          res.status(403).json({ error: 'Ruxsat rad etildi.' });
          return;
        }
        if (parsed.transcript && parsed.transcript.length > 0) {
          session.transcript = parsed.transcript.map((t) => ({
            role: t.role,
            text: t.text,
            timestamp: t.timestamp || new Date().toISOString(),
          }));
        }
        session.durationSec = parsed.durationSec || session.durationSec;
        session.endedAt = new Date().toISOString();

        const topic = await store.getTopicById(session.topicId);
        if (topic) {
          const { evaluation, errorMessage } = await evaluateOralTranscript(
            topic,
            session.transcript
          );
          if (evaluation) {
            session.status = 'completed';
            session.evaluation = evaluation;
            session.errorMessage = undefined;

            const prev = await store.getTopicProgress(session.userId, topic.id);
            await store.upsertTopicProgress({
              topicId: topic.id,
              userId: session.userId,
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
            session.status = 'pending_evaluation';
            session.errorMessage = errorMessage;
          }
        } else {
          session.status = 'pending_evaluation';
          session.errorMessage = 'Mavzu topilmadi.';
        }

        await store.upsertAiSession(session);
        res.json({ session });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/ai/sessions/:id/evaluate',
    requireAuth,
    aiLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const session = await store.getAiSessionById(id);
        if (!session) {
          res.status(404).json({ error: 'Suhbat sessiyasi topilmadi.' });
          return;
        }
        if (req.user!.role === 'student' && session.userId !== req.user!.id) {
          res.status(403).json({ error: "Faqat o'zingizning suhbatingizni qayta tekshira olasiz." });
          return;
        }
        const topic = await store.getTopicById(session.topicId);
        if (!topic) {
          res.status(404).json({ error: 'Mavzu topilmadi.' });
          return;
        }

        const { evaluation, errorMessage } = await evaluateOralTranscript(
          topic,
          session.transcript
        );
        if (evaluation) {
          session.status = 'completed';
          session.evaluation = evaluation;
          session.errorMessage = undefined;
          const prev = await store.getTopicProgress(session.userId, topic.id);
          await store.upsertTopicProgress({
            topicId: topic.id,
            userId: session.userId,
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
          session.status = 'pending_evaluation';
          session.errorMessage = errorMessage;
        }

        await store.upsertAiSession(session);
        res.json({ session });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.get('/api/ai/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user!.role === 'student') {
        const sessions = await store.listAiSessions({ userId: req.user!.id });
        res.json({ sessions });
        return;
      }
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const topicId = typeof req.query.topicId === 'string' ? req.query.topicId : undefined;
      const sessions = await store.listAiSessions({ userId, topicId });
      res.json({ sessions });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ==================== TEACHER FILE EXTRACT & AI GENERATION ====================
  app.post(
    '/api/teacher/extract-file',
    requireRole('teacher', 'admin'),
    upload.single('file'),
    async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Fayl yuklanmadi.' });
          return;
        }
        const text = await extractTextFromFile({
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          buffer: req.file.buffer,
        });
        if (!text || text.length < 10) {
          res.status(400).json({ error: "Fayldan o'qiladigan matn ajratib bo'lmadi." });
          return;
        }
        res.json({ text, fileName: req.file.originalname, charCount: text.length });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/teacher/generate-topic',
    requireRole('teacher', 'admin'),
    aiLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = aiGenerateTopicSchema.parse(req.body);
        const tb = await store.getTextbookById(parsed.textbookId);
        if (!tb) {
          res.status(404).json({ error: 'Darslik topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, tb.ownerId)) {
          res.status(403).json({ error: "Ushbu darslikka mavzu generatsiya qilish huquqingiz yo'q." });
          return;
        }
        const { draft, usedGemini } = await generateTopicPackageFromSource(
          parsed.title,
          parsed.sourceText
        );
        res.json({ draft, usedGemini });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ==================== GROUPS CRUD ====================
  app.get('/api/groups', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const allGroups = await store.listGroups();
      if (req.user!.role === 'admin') {
        res.json({ groups: allGroups });
        return;
      }
      if (req.user!.role === 'teacher') {
        res.json({
          groups: allGroups.filter(
            (g) => g.ownerId === req.user!.telegramId || g.ownerId === req.user!.id
          ),
        });
        return;
      }
      res.json({ groups: allGroups.filter((g) => g.memberIds.includes(req.user!.id)) });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post(
    '/api/groups',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = groupCreateSchema.parse(req.body);
        const now = new Date().toISOString();
        const group: Group = {
          id: genId('grp'),
          name: parsed.name,
          description: parsed.description,
          inviteCode: generateInviteCode(),
          ownerId: req.user!.telegramId,
          textbookIds: parsed.textbookIds,
          memberIds: [],
          createdAt: now,
          updatedAt: now,
        };
        await store.upsertGroup(group);
        res.status(201).json({ group });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.put(
    '/api/groups/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getGroupById(id);
        if (!existing) {
          res.status(404).json({ error: 'Guruh topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, existing.ownerId)) {
          res.status(403).json({ error: "Faqat o'zingiz yaratgan guruhni tahrirlay olasiz." });
          return;
        }
        const parsed = groupUpdateSchema.parse(req.body);
        const updated: Group = {
          ...existing,
          ...parsed,
          updatedAt: new Date().toISOString(),
        };
        await store.upsertGroup(updated);
        res.json({ group: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/groups/:id',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const existing = await store.getGroupById(id);
        if (!existing) {
          res.status(404).json({ error: 'Guruh topilmadi.' });
          return;
        }
        if (!isOwnerOrAdmin(req.user!, existing.ownerId)) {
          res.status(403).json({ error: "Faqat o'zingiz yaratgan guruhni o'chira olasiz." });
          return;
        }
        await store.deleteGroup(id);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ==================== TEACHER ANALYTICS & ADMIN ALLOWLIST ====================
  app.get(
    '/api/teacher/analytics',
    requireRole('teacher', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : '';
        const topicId = typeof req.query.topicId === 'string' ? req.query.topicId : '';
        const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

        const [users, groups, allTopics, allProgress, examDates] = await Promise.all([
          store.listUsers(),
          store.listGroups(),
          store.listTopics(),
          store.listAllProgress(),
          store.listExamDates(),
        ]);

        const examDateMap = new Map(examDates.map((d) => [d.id, d.title]));
        const visibleGroups =
          req.user!.role === 'admin'
            ? groups
            : groups.filter(
                (g) => g.ownerId === req.user!.telegramId || g.ownerId === req.user!.id
              );

        let students = users.filter((u) => u.role === 'student');
        if (groupId) {
          const targetGroup = visibleGroups.find((g) => g.id === groupId);
          const memberSet = new Set(targetGroup?.memberIds || []);
          students = students.filter((s) => memberSet.has(s.id));
        }
        if (search) {
          students = students.filter((s) => {
            const hay = `${s.firstName} ${s.lastName || ''} ${s.username || ''} ${s.telegramId}`.toLowerCase();
            return hay.includes(search);
          });
        }

        const avg = (nums: Array<number | null | undefined>): number | null => {
          const valid = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
          if (valid.length === 0) return null;
          return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
        };

        const rows: StudentAnalyticsRow[] = students.map((student) => {
          const userProg = allProgress.filter(
            (p) => p.userId === student.id && (!topicId || p.topicId === topicId)
          );
          const progressByTopic: Record<string, TopicProgress> = {};
          for (const p of userProg) progressByTopic[p.topicId] = p;

          const studentGroups = groups
            .filter((g) => g.memberIds.includes(student.id))
            .map((g) => g.name);

          return {
            user: student,
            groupNames: studentGroups,
            examDateTitle: student.studyProfile?.examDateId
              ? examDateMap.get(student.studyProfile.examDateId) || null
              : null,
            topicsCompleted: userProg.filter(
              (p) =>
                p.konspektRead &&
                (p.quizScore !== null || p.fullTestScore !== null || p.writtenScore !== null)
            ).length,
            totalTopics: topicId ? 1 : allTopics.length,
            averages: {
              konspektReadCount: userProg.filter((p) => p.konspektRead).length,
              cardsScore: avg(userProg.map((p) => (p.cardsScore > 0 ? p.cardsScore : null))),
              quizScore: avg(userProg.map((p) => p.quizScore)),
              fullTestScore: avg(userProg.map((p) => p.fullTestScore)),
              writtenScore: avg(userProg.map((p) => p.writtenScore)),
              aiTutorScore: avg(userProg.map((p) => p.aiTutorScore)),
            },
            progressByTopic,
          };
        });

        res.json({ rows, topics: allTopics.map((t) => ({ id: t.id, title: t.title, textbookId: t.textbookId })) });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.get('/api/admin/teachers', requireRole('admin'), async (_req, res) => {
    try {
      const cfg = getConfig();
      const dynamicIds = await store.getTeacherAllowlist();
      res.json({
        envAdminIds: cfg.adminTelegramIds,
        envTeacherIds: cfg.teacherTelegramIds,
        allowlistIds: dynamicIds,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.put('/api/admin/teachers/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = teacherAllowlistParamSchema.parse(req.params);
      const allowlistIds = await store.addTeacherToAllowlist(id);
      // Sync existing user role immediately if present
      const existingUser = await store.getUserByTelegramId(id);
      if (existingUser && existingUser.role === 'student') {
        existingUser.role = 'teacher';
        await store.upsertUser(existingUser);
      }
      res.json({ allowlistIds });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/admin/teachers/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = teacherAllowlistParamSchema.parse(req.params);
      const allowlistIds = await store.removeTeacherFromAllowlist(id);
      const existingUser = await store.getUserByTelegramId(id);
      if (existingUser && existingUser.role === 'teacher') {
        existingUser.role = await resolveServerRole(id, store);
        await store.upsertUser(existingUser);
      }
      res.json({ allowlistIds });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ==================== STATIC PRODUCTION BUILD ====================
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return { app, store };
}
