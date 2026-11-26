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
import {
  SEED_EXAM_DATES,
  SEED_GROUPS,
  SEED_INTERIM_EXAMS,
  SEED_TEXTBOOKS,
  SEED_TOPICS,
} from '../../shared/seed.js';
import type { DataStore } from './types.js';

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export class MemoryStore implements DataStore {
  private users = new Map<string, UserProfile>();
  private teacherAllowlist = new Set<string>();
  private examDates = new Map<string, ExamDateItem>();
  private textbooks = new Map<string, Textbook>();
  private topics = new Map<string, Topic>();
  private interimExams = new Map<string, InterimExam>();
  private interimAttempts = new Map<string, InterimExamAttempt[]>();
  private groups = new Map<string, Group>();
  private progress = new Map<string, TopicProgress>(); // `${userId}::${topicId}`
  private leitner = new Map<string, LeitnerCardState>(); // `${userId}::${cardId}`
  private aiSessions = new Map<string, AiTutorSession>();

  constructor(seed: boolean = true) {
    if (seed) {
      this.seedDefaults();
    }
  }

  seedDefaults(): void {
    for (const d of SEED_EXAM_DATES) this.examDates.set(d.id, clone(d));
    for (const tb of SEED_TEXTBOOKS) this.textbooks.set(tb.id, clone(tb));
    for (const t of SEED_TOPICS) this.topics.set(t.id, clone(t));
    for (const ex of SEED_INTERIM_EXAMS) this.interimExams.set(ex.id, clone(ex));
    for (const g of SEED_GROUPS) this.groups.set(g.id, clone(g));
  }

  // Users
  async getUserById(id: string): Promise<UserProfile | null> {
    const u = this.users.get(id);
    return u ? clone(u) : null;
  }

  async getUserByTelegramId(telegramId: string): Promise<UserProfile | null> {
    for (const u of this.users.values()) {
      if (u.telegramId === telegramId) return clone(u);
    }
    return null;
  }

  async listUsers(): Promise<UserProfile[]> {
    return Array.from(this.users.values()).map(clone);
  }

  async upsertUser(user: UserProfile): Promise<UserProfile> {
    this.users.set(user.id, clone(user));
    return clone(user);
  }

  async deleteUserData(userId: string): Promise<void> {
    // Clear progress, leitner, attempts, AI sessions, studyProfile & group memberships
    for (const key of Array.from(this.progress.keys())) {
      if (key.startsWith(`${userId}::`)) this.progress.delete(key);
    }
    for (const key of Array.from(this.leitner.keys())) {
      if (key.startsWith(`${userId}::`)) this.leitner.delete(key);
    }
    this.interimAttempts.delete(userId);
    for (const [sid, session] of Array.from(this.aiSessions.entries())) {
      if (session.userId === userId) this.aiSessions.delete(sid);
    }
    for (const group of this.groups.values()) {
      group.memberIds = group.memberIds.filter((m) => m !== userId);
    }
    const existing = this.users.get(userId);
    if (existing) {
      existing.studyProfile = undefined;
      existing.groupIds = [];
      existing.updatedAt = new Date().toISOString();
      this.users.set(userId, existing);
    }
  }

  // Teacher allowlist
  async getTeacherAllowlist(): Promise<string[]> {
    return Array.from(this.teacherAllowlist.values());
  }

  async addTeacherToAllowlist(telegramId: string): Promise<string[]> {
    this.teacherAllowlist.add(telegramId.trim());
    return this.getTeacherAllowlist();
  }

  async removeTeacherFromAllowlist(telegramId: string): Promise<string[]> {
    this.teacherAllowlist.delete(telegramId.trim());
    return this.getTeacherAllowlist();
  }

  // Exam dates
  async listExamDates(): Promise<ExamDateItem[]> {
    return Array.from(this.examDates.values())
      .map(clone)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getExamDateById(id: string): Promise<ExamDateItem | null> {
    const item = this.examDates.get(id);
    return item ? clone(item) : null;
  }

  async upsertExamDate(item: ExamDateItem): Promise<ExamDateItem> {
    this.examDates.set(item.id, clone(item));
    return clone(item);
  }

  async deleteExamDate(id: string): Promise<boolean> {
    return this.examDates.delete(id);
  }

  // Textbooks
  async listTextbooks(): Promise<Textbook[]> {
    return Array.from(this.textbooks.values()).map(clone);
  }

  async getTextbookById(id: string): Promise<Textbook | null> {
    const item = this.textbooks.get(id);
    return item ? clone(item) : null;
  }

  async upsertTextbook(item: Textbook): Promise<Textbook> {
    this.textbooks.set(item.id, clone(item));
    return clone(item);
  }

  async deleteTextbook(id: string): Promise<boolean> {
    const existed = this.textbooks.delete(id);
    if (existed) {
      for (const [tid, topic] of Array.from(this.topics.entries())) {
        if (topic.textbookId === id) this.topics.delete(tid);
      }
      for (const [eid, exam] of Array.from(this.interimExams.entries())) {
        if (exam.textbookId === id) this.interimExams.delete(eid);
      }
      for (const g of this.groups.values()) {
        g.textbookIds = g.textbookIds.filter((tbId) => tbId !== id);
      }
    }
    return existed;
  }

  // Topics
  async listTopics(textbookId?: string): Promise<Topic[]> {
    return Array.from(this.topics.values())
      .filter((t) => (!textbookId ? true : t.textbookId === textbookId))
      .map(clone)
      .sort((a, b) => a.order - b.order);
  }

  async getTopicById(id: string): Promise<Topic | null> {
    const item = this.topics.get(id);
    return item ? clone(item) : null;
  }

  async upsertTopic(item: Topic): Promise<Topic> {
    this.topics.set(item.id, clone(item));
    return clone(item);
  }

  async deleteTopic(id: string): Promise<boolean> {
    return this.topics.delete(id);
  }

  // Interim exams
  async listInterimExams(textbookId?: string): Promise<InterimExam[]> {
    return Array.from(this.interimExams.values())
      .filter((e) => (!textbookId ? true : e.textbookId === textbookId))
      .map(clone)
      .sort((a, b) => a.afterTopicOrder - b.afterTopicOrder);
  }

  async getInterimExamById(id: string): Promise<InterimExam | null> {
    const item = this.interimExams.get(id);
    return item ? clone(item) : null;
  }

  async upsertInterimExam(item: InterimExam): Promise<InterimExam> {
    this.interimExams.set(item.id, clone(item));
    return clone(item);
  }

  async deleteInterimExam(id: string): Promise<boolean> {
    return this.interimExams.delete(id);
  }

  // Interim exam attempts
  async listInterimExamAttempts(userId: string): Promise<InterimExamAttempt[]> {
    return clone(this.interimAttempts.get(userId) || []);
  }

  async addInterimExamAttempt(attempt: InterimExamAttempt): Promise<InterimExamAttempt> {
    const list = this.interimAttempts.get(attempt.userId) || [];
    list.push(clone(attempt));
    this.interimAttempts.set(attempt.userId, list);
    return clone(attempt);
  }

  // Groups
  async listGroups(): Promise<Group[]> {
    return Array.from(this.groups.values()).map(clone);
  }

  async getGroupById(id: string): Promise<Group | null> {
    const g = this.groups.get(id);
    return g ? clone(g) : null;
  }

  async getGroupByInviteCode(code: string): Promise<Group | null> {
    const normalized = code.trim().toUpperCase();
    for (const g of this.groups.values()) {
      if (g.inviteCode.toUpperCase() === normalized) return clone(g);
    }
    return null;
  }

  async upsertGroup(group: Group): Promise<Group> {
    this.groups.set(group.id, clone(group));
    return clone(group);
  }

  async deleteGroup(id: string): Promise<boolean> {
    const existed = this.groups.delete(id);
    if (existed) {
      for (const u of this.users.values()) {
        u.groupIds = u.groupIds.filter((gid) => gid !== id);
      }
    }
    return existed;
  }

  // Progress
  async getTopicProgress(userId: string, topicId: string): Promise<TopicProgress | null> {
    const p = this.progress.get(`${userId}::${topicId}`);
    return p ? clone(p) : null;
  }

  async listUserProgress(userId: string): Promise<TopicProgress[]> {
    const out: TopicProgress[] = [];
    for (const [k, v] of this.progress.entries()) {
      if (k.startsWith(`${userId}::`)) out.push(clone(v));
    }
    return out;
  }

  async listAllProgress(): Promise<TopicProgress[]> {
    return Array.from(this.progress.values()).map(clone);
  }

  async upsertTopicProgress(progress: TopicProgress): Promise<TopicProgress> {
    this.progress.set(`${progress.userId}::${progress.topicId}`, clone(progress));
    return clone(progress);
  }

  // Leitner
  async listUserLeitnerCards(userId: string): Promise<LeitnerCardState[]> {
    const out: LeitnerCardState[] = [];
    for (const [k, v] of this.leitner.entries()) {
      if (k.startsWith(`${userId}::`)) out.push(clone(v));
    }
    return out;
  }

  async getLeitnerCard(userId: string, cardId: string): Promise<LeitnerCardState | null> {
    const c = this.leitner.get(`${userId}::${cardId}`);
    return c ? clone(c) : null;
  }

  async upsertLeitnerCard(userId: string, state: LeitnerCardState): Promise<LeitnerCardState> {
    this.leitner.set(`${userId}::${state.cardId}`, clone(state));
    return clone(state);
  }

  // AI sessions
  async listAiSessions(filter?: { userId?: string; topicId?: string }): Promise<AiTutorSession[]> {
    return Array.from(this.aiSessions.values())
      .filter((s) => {
        if (filter?.userId && s.userId !== filter.userId) return false;
        if (filter?.topicId && s.topicId !== filter.topicId) return false;
        return true;
      })
      .map(clone)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  async getAiSessionById(id: string): Promise<AiTutorSession | null> {
    const s = this.aiSessions.get(id);
    return s ? clone(s) : null;
  }

  async upsertAiSession(session: AiTutorSession): Promise<AiTutorSession> {
    this.aiSessions.set(session.id, clone(session));
    return clone(session);
  }

  async countUserAiSessionsToday(userId: string, now: Date = new Date()): Promise<number> {
    const dayPrefix = now.toISOString().slice(0, 10);
    let count = 0;
    for (const s of this.aiSessions.values()) {
      if (s.userId === userId && s.startedAt.startsWith(dayPrefix)) {
        count++;
      }
    }
    return count;
  }
}
