export type UserRole = 'student' | 'teacher' | 'admin';

export interface TelegramAuthPayload {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export type StudentIdentity =
  | 'school_student'
  | 'applicant'
  | 'university_student'
  | 'teacher_specialist';

export type GradeLevel =
  | '8-sinf'
  | '9-sinf'
  | '10-sinf'
  | '11-sinf'
  | 'Abituriyent'
  | 'Talaba'
  | 'Mutaxassis';

export type ExamTrack = 'main_law' | 'mandatory_or_certificate';

export type TargetGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C';

export interface StudyProfile {
  identity: StudentIdentity;
  gradeLevel: GradeLevel;
  examType: ExamTrack;
  examDateId: string | null;
  targetGrade: TargetGrade;
  completedAt: string;
}

export interface UserProfile {
  id: string;
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  role: UserRole;
  consentAcceptedAt?: string;
  studyProfile?: StudyProfile;
  groupIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExamDateItem {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD or full ISO
  description?: string;
  examType: 'certificate' | 'admission' | 'olympiad';
  createdBy: string;
  createdAt: string;
}

export type FlashcardCategory = 'articles' | 'terms' | 'organs' | 'subjects';

export interface ArticleDeadlineItem {
  id: string;
  codeOrLaw: string;
  articleOrPeriod: string;
  summary: string;
}

export interface LegalTermItem {
  id: string;
  term: string;
  definition: string;
}

export interface KnowledgePack {
  summary: string;
  keyPoints: string[];
  articlesAndDeadlines: ArticleDeadlineItem[];
  glossary: LegalTermItem[];
}

export interface FlashcardItem {
  id: string;
  category: FlashcardCategory;
  front: string;
  back: string;
  articleRef?: string;
}

export interface QuizQuestion {
  id: string;
  type: 'mcq' | 'cloze';
  question: string;
  options?: string[];
  correctIndex?: number;
  acceptedAnswers?: string[];
  explanation: string;
}

export interface ProcessSequenceTask {
  id: string;
  title: string;
  instruction: string;
  steps: string[]; // stored in correct chronological/procedural order
  causeEffectQuestion: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export interface FullTestQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  articleRef?: string;
}

export interface WrittenCaseQuestion {
  id: string;
  kind: 'factual' | 'case';
  prompt: string;
  expectedAnswer: string;
  synonyms: string[];
  keyPoints?: string[];
}

export interface Topic {
  id: string;
  textbookId: string;
  order: number;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  knowledgePack: KnowledgePack;
  flashcards: FlashcardItem[];
  quizQuestions: QuizQuestion[];
  processTask: ProcessSequenceTask;
  fullTestQuestions: FullTestQuestion[];
  writtenQuestions: WrittenCaseQuestion[];
  aiQuestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InterimExam {
  id: string;
  textbookId: string;
  title: string;
  afterTopicOrder: number;
  sourceTopicIds: string[];
  passingScore: number; // e.g. 60
  questionCount: number;
  durationMinutes: number;
  createdAt: string;
}

export interface Textbook {
  id: string;
  title: string;
  branch: string;
  gradeTag: string;
  description: string;
  isPublic: boolean;
  ownerId: string;
  accentColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  ownerId: string;
  textbookIds: string[];
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeitnerCardState {
  cardId: string;
  topicId: string;
  box: number; // 1..5
  intervalDays: number; // 1, 3, 7, 14, 30
  nextReviewAt: string;
  lastReviewedAt: string;
  lapses: number;
  known: boolean;
}

export interface WrittenAnswerResult {
  questionId: string;
  prompt: string;
  studentAnswer: string;
  expectedAnswer: string;
  isCorrect: boolean;
  score: number; // 0..100
  feedback: string;
  gradedBy: 'local' | 'ai';
}

export interface WeakItems {
  cards: string[];
  written: string[];
  timeline: string[];
}

export interface TopicProgress {
  topicId: string;
  userId: string;
  konspektRead: boolean;
  cardsMastered: number;
  cardsTotal: number;
  cardsScore: number;
  quizScore: number | null;
  processScore: number | null;
  fullTestScore: number | null;
  writtenScore: number | null;
  writtenResults: WrittenAnswerResult[];
  aiTutorScore: number | null;
  weak: WeakItems;
  updatedAt: string;
}

export interface InterimExamAttempt {
  id: string;
  userId: string;
  examId: string;
  textbookId: string;
  score: number;
  passed: boolean;
  totalQuestions: number;
  correctCount: number;
  createdAt: string;
}

export interface TranscriptTurn {
  role: 'student' | 'tutor';
  text: string;
  timestamp: string;
}

export interface AiTutorEvaluation {
  score: number;
  strengths: string[];
  legalGaps: string[];
  summary: string;
  evaluatedAt: string;
}

export interface AiTutorSession {
  id: string;
  userId: string;
  userName: string;
  topicId: string;
  topicTitle: string;
  mode: 'voice' | 'text';
  status: 'active' | 'completed' | 'pending_evaluation';
  startedAt: string;
  endedAt?: string;
  durationSec: number;
  transcript: TranscriptTurn[];
  evaluation?: AiTutorEvaluation;
  errorMessage?: string;
}

export interface AiQuotaStatus {
  sessionsUsedToday: number;
  maxSessionsPerDay: number;
  maxDurationSec: number;
  remainingToday: number;
}

export interface AuthConfigInfo {
  telegramBotUsername: string;
  devAuthEnabled: boolean;
  geminiConfigured: boolean;
}

export interface StudentAnalyticsRow {
  user: UserProfile;
  groupNames: string[];
  examDateTitle?: string | null;
  topicsCompleted: number;
  totalTopics: number;
  averages: {
    konspektReadCount: number;
    cardsScore: number | null;
    quizScore: number | null;
    fullTestScore: number | null;
    writtenScore: number | null;
    aiTutorScore: number | null;
  };
  progressByTopic: Record<string, TopicProgress>;
}
