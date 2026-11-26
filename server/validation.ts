import { z } from 'zod';

export const telegramAuthSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  first_name: z.string().min(1).max(128),
  last_name: z.string().max(128).optional(),
  username: z.string().max(128).optional(),
  photo_url: z.string().url().max(1024).optional().or(z.literal('')),
  auth_date: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  hash: z.string().min(32).max(128),
});

export const devLoginSchema = z.object({
  telegramId: z.string().regex(/^\d+$/).default('200001'),
  firstName: z.string().min(1).max(100).default("Azizbek"),
  lastName: z.string().max(100).optional(),
  username: z.string().max(100).optional(),
});

export const studyProfileSchema = z.object({
  identity: z.enum([
    'school_student',
    'applicant',
    'university_student',
    'teacher_specialist',
  ]),
  gradeLevel: z.enum([
    '8-sinf',
    '9-sinf',
    '10-sinf',
    '11-sinf',
    'Abituriyent',
    'Talaba',
    'Mutaxassis',
  ]),
  examType: z.enum(['main_law', 'mandatory_or_certificate']),
  examDateId: z.string().min(1).nullable(),
  targetGrade: z.enum(['A+', 'A', 'B+', 'B', 'C+', 'C']),
});

export const examDateSchema = z.object({
  title: z.string().min(3, "Imtihon nomi kamida 3 belgidan iborat bo'lsin").max(180),
  date: z.string().min(8, "Sana noto'g'ri kiritilgan"),
  description: z.string().max(500).optional().default(''),
  examType: z.enum(['certificate', 'admission', 'olympiad']).default('certificate'),
});

export const textbookCreateSchema = z.object({
  title: z.string().min(2).max(180),
  branch: z.string().min(2).max(120),
  gradeTag: z.string().min(1).max(80).default('8–11-sinf • Abituriyent'),
  description: z.string().max(1000).default(''),
  isPublic: z.boolean().default(false),
  accentColor: z.string().max(30).optional().default('indigo'),
});

export const textbookUpdateSchema = textbookCreateSchema.partial();

const articleDeadlineSchema = z.object({
  id: z.string().min(1),
  codeOrLaw: z.string().min(1).max(160),
  articleOrPeriod: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
});

const glossarySchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1).max(160),
  definition: z.string().min(1).max(800),
});

const flashcardSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['articles', 'terms', 'organs', 'subjects']),
  front: z.string().min(1).max(600),
  back: z.string().min(1).max(800),
  articleRef: z.string().max(120).optional(),
});

const quizQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['mcq', 'cloze']),
  question: z.string().min(3).max(800),
  options: z.array(z.string().min(1).max(400)).optional(),
  correctIndex: z.number().int().min(0).max(10).optional(),
  acceptedAnswers: z.array(z.string().min(1).max(200)).optional(),
  explanation: z.string().max(800).default(''),
});

const processTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2).max(200),
  instruction: z.string().max(500).default(''),
  steps: z.array(z.string().min(1).max(400)).min(2).max(8),
  causeEffectQuestion: z.object({
    question: z.string().min(3).max(600),
    options: z.array(z.string().min(1).max(400)).min(2).max(6),
    correctIndex: z.number().int().min(0).max(5),
    explanation: z.string().max(800).default(''),
  }),
});

const fullTestQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(3).max(800),
  options: z.array(z.string().min(1).max(400)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  explanation: z.string().max(800).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  articleRef: z.string().max(120).optional(),
});

const writtenQuestionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['factual', 'case']),
  prompt: z.string().min(3).max(1200),
  expectedAnswer: z.string().min(1).max(1200),
  synonyms: z.array(z.string().max(300)).default([]),
  keyPoints: z.array(z.string().max(120)).optional(),
});

export const topicCreateSchema = z.object({
  textbookId: z.string().min(1),
  order: z.number().int().min(1).optional(),
  title: z.string().min(2).max(220),
  subtitle: z.string().max(400).default(''),
  estimatedMinutes: z.number().int().min(5).max(240).default(30),
  knowledgePack: z
    .object({
      summary: z.string().default(''),
      keyPoints: z.array(z.string()).default([]),
      articlesAndDeadlines: z.array(articleDeadlineSchema).default([]),
      glossary: z.array(glossarySchema).default([]),
    })
    .default({ summary: '', keyPoints: [], articlesAndDeadlines: [], glossary: [] }),
  flashcards: z.array(flashcardSchema).default([]),
  quizQuestions: z.array(quizQuestionSchema).default([]),
  processTask: processTaskSchema.optional(),
  fullTestQuestions: z.array(fullTestQuestionSchema).default([]),
  writtenQuestions: z.array(writtenQuestionSchema).default([]),
  aiQuestions: z.array(z.string().min(2).max(500)).default([]),
});

export const topicUpdateSchema = topicCreateSchema.partial();

export const reorderTopicSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export const interimExamSchema = z.object({
  textbookId: z.string().min(1),
  title: z.string().min(2).max(200),
  afterTopicOrder: z.number().int().min(1),
  sourceTopicIds: z.array(z.string().min(1)).min(1),
  passingScore: z.number().int().min(30).max(100).default(60),
  questionCount: z.number().int().min(3).max(50).default(10),
  durationMinutes: z.number().int().min(5).max(120).default(15),
});

export const interimExamSubmitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedIndex: z.number().int().min(-1).max(10),
    })
  ),
});

export const groupCreateSchema = z.object({
  name: z.string().min(2).max(140),
  description: z.string().max(500).optional().default(''),
  textbookIds: z.array(z.string()).default([]),
});

export const groupUpdateSchema = groupCreateSchema.partial();

export const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(6).max(16),
});

export const progressUpdateSchema = z.object({
  konspektRead: z.boolean().optional(),
  cardsMastered: z.number().int().min(0).optional(),
  cardsTotal: z.number().int().min(0).optional(),
  cardsScore: z.number().min(0).max(100).optional(),
  quizScore: z.number().min(0).max(100).nullable().optional(),
  processScore: z.number().min(0).max(100).nullable().optional(),
  fullTestScore: z.number().min(0).max(100).nullable().optional(),
  writtenScore: z.number().min(0).max(100).nullable().optional(),
  aiTutorScore: z.number().min(0).max(100).nullable().optional(),
  weak: z
    .object({
      cards: z.array(z.string()).optional(),
      written: z.array(z.string()).optional(),
      timeline: z.array(z.string()).optional(),
    })
    .optional(),
});

export const leitnerReviewSchema = z.object({
  topicId: z.string().min(1),
  cardId: z.string().min(1),
  known: z.boolean(),
  cardFront: z.string().max(500).optional(),
});

export const writtenGradeSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      answer: z.string().max(4000),
    })
  ),
});

export const aiGenerateTopicSchema = z.object({
  textbookId: z.string().min(1),
  title: z.string().min(2).max(200),
  sourceText: z.string().min(40, "Kamida 40 belgilik matn kiriting yoki fayl yuklang").max(120000),
});

export const aiTextTurnSchema = z.object({
  sessionId: z.string().min(1).optional(),
  topicId: z.string().min(1),
  message: z.string().min(1).max(3000),
});

export const aiSessionFinishSchema = z.object({
  durationSec: z.number().int().min(0).max(3600).default(0),
  transcript: z
    .array(
      z.object({
        role: z.enum(['student', 'tutor']),
        text: z.string().min(1).max(4000),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
});

export const teacherAllowlistParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Telegram ID faqat raqamlardan iborat bo'lishi kerak"),
});
