import type {
  AiTutorSession,
  ExamDateItem,
  Group,
  InterimExam,
  InterimExamAttempt,
  LeitnerCardState,
  Textbook,
  Topic,
  TopicProgress,
  UserProfile,
} from '../../shared/types.js';

export interface DataStore {
  // Users
  getUserById(id: string): Promise<UserProfile | null>;
  getUserByTelegramId(telegramId: string): Promise<UserProfile | null>;
  listUsers(): Promise<UserProfile[]>;
  upsertUser(user: UserProfile): Promise<UserProfile>;
  deleteUserData(userId: string): Promise<void>;

  // Teacher allowlist
  getTeacherAllowlist(): Promise<string[]>;
  addTeacherToAllowlist(telegramId: string): Promise<string[]>;
  removeTeacherFromAllowlist(telegramId: string): Promise<string[]>;

  // Exam dates
  listExamDates(): Promise<ExamDateItem[]>;
  getExamDateById(id: string): Promise<ExamDateItem | null>;
  upsertExamDate(item: ExamDateItem): Promise<ExamDateItem>;
  deleteExamDate(id: string): Promise<boolean>;

  // Textbooks
  listTextbooks(): Promise<Textbook[]>;
  getTextbookById(id: string): Promise<Textbook | null>;
  upsertTextbook(item: Textbook): Promise<Textbook>;
  deleteTextbook(id: string): Promise<boolean>;

  // Topics
  listTopics(textbookId?: string): Promise<Topic[]>;
  getTopicById(id: string): Promise<Topic | null>;
  upsertTopic(item: Topic): Promise<Topic>;
  deleteTopic(id: string): Promise<boolean>;

  // Interim exams
  listInterimExams(textbookId?: string): Promise<InterimExam[]>;
  getInterimExamById(id: string): Promise<InterimExam | null>;
  upsertInterimExam(item: InterimExam): Promise<InterimExam>;
  deleteInterimExam(id: string): Promise<boolean>;

  // Interim exam attempts
  listInterimExamAttempts(userId: string): Promise<InterimExamAttempt[]>;
  addInterimExamAttempt(attempt: InterimExamAttempt): Promise<InterimExamAttempt>;

  // Groups
  listGroups(): Promise<Group[]>;
  getGroupById(id: string): Promise<Group | null>;
  getGroupByInviteCode(code: string): Promise<Group | null>;
  upsertGroup(group: Group): Promise<Group>;
  deleteGroup(id: string): Promise<boolean>;

  // Student progress
  getTopicProgress(userId: string, topicId: string): Promise<TopicProgress | null>;
  listUserProgress(userId: string): Promise<TopicProgress[]>;
  listAllProgress(): Promise<TopicProgress[]>;
  upsertTopicProgress(progress: TopicProgress): Promise<TopicProgress>;

  // Leitner SRS cards
  listUserLeitnerCards(userId: string): Promise<LeitnerCardState[]>;
  getLeitnerCard(userId: string, cardId: string): Promise<LeitnerCardState | null>;
  upsertLeitnerCard(userId: string, state: LeitnerCardState): Promise<LeitnerCardState>;

  // AI Tutor sessions
  listAiSessions(filter?: { userId?: string; topicId?: string }): Promise<AiTutorSession[]>;
  getAiSessionById(id: string): Promise<AiTutorSession | null>;
  upsertAiSession(session: AiTutorSession): Promise<AiTutorSession>;
  countUserAiSessionsToday(userId: string, now?: Date): Promise<number>;
}
