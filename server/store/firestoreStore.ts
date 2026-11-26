import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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

export class FirestoreStore implements DataStore {
  private db: Firestore;
  private seeded = false;

  constructor() {
    if (getApps().length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });
      } else {
        initializeApp();
      }
    }
    this.db = getFirestore();
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;
    const tbSnap = await this.db.collection('textbooks').limit(1).get();
    if (!tbSnap.empty) return;

    const batch = this.db.batch();
    for (const d of SEED_EXAM_DATES) batch.set(this.db.collection('examDates').doc(d.id), d);
    for (const tb of SEED_TEXTBOOKS) batch.set(this.db.collection('textbooks').doc(tb.id), tb);
    for (const t of SEED_TOPICS) batch.set(this.db.collection('topics').doc(t.id), t);
    for (const ex of SEED_INTERIM_EXAMS)
      batch.set(this.db.collection('interimExams').doc(ex.id), ex);
    for (const g of SEED_GROUPS) batch.set(this.db.collection('groups').doc(g.id), g);
    await batch.commit();
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    const doc = await this.db.collection('users').doc(id).get();
    return doc.exists ? (doc.data() as UserProfile) : null;
  }

  async getUserByTelegramId(telegramId: string): Promise<UserProfile | null> {
    const snap = await this.db
      .collection('users')
      .where('telegramId', '==', telegramId)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as UserProfile);
  }

  async listUsers(): Promise<UserProfile[]> {
    const snap = await this.db.collection('users').get();
    return snap.docs.map((d) => d.data() as UserProfile);
  }

  async upsertUser(user: UserProfile): Promise<UserProfile> {
    await this.db.collection('users').doc(user.id).set(user, { merge: true });
    return user;
  }

  async deleteUserData(userId: string): Promise<void> {
    const progressSnap = await this.db
      .collection('progress')
      .where('userId', '==', userId)
      .get();
    const leitnerSnap = await this.db
      .collection('leitner')
      .where('userId', '==', userId)
      .get();
    const attemptSnap = await this.db
      .collection('interimAttempts')
      .where('userId', '==', userId)
      .get();
    const aiSnap = await this.db
      .collection('aiSessions')
      .where('userId', '==', userId)
      .get();

    const batch = this.db.batch();
    progressSnap.docs.forEach((d) => batch.delete(d.ref));
    leitnerSnap.docs.forEach((d) => batch.delete(d.ref));
    attemptSnap.docs.forEach((d) => batch.delete(d.ref));
    aiSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    const user = await this.getUserById(userId);
    if (user) {
      user.studyProfile = undefined;
      user.groupIds = [];
      user.updatedAt = new Date().toISOString();
      await this.db.collection('users').doc(userId).set(user);
    }
  }

  async getTeacherAllowlist(): Promise<string[]> {
    const doc = await this.db.collection('config').doc('teacherAllowlist').get();
    if (!doc.exists) return [];
    const data = doc.data() as { ids?: string[] };
    return Array.isArray(data.ids) ? data.ids : [];
  }

  async addTeacherToAllowlist(telegramId: string): Promise<string[]> {
    const current = new Set(await this.getTeacherAllowlist());
    current.add(telegramId.trim());
    const ids = Array.from(current);
    await this.db.collection('config').doc('teacherAllowlist').set({ ids });
    return ids;
  }

  async removeTeacherFromAllowlist(telegramId: string): Promise<string[]> {
    const current = new Set(await this.getTeacherAllowlist());
    current.delete(telegramId.trim());
    const ids = Array.from(current);
    await this.db.collection('config').doc('teacherAllowlist').set({ ids });
    return ids;
  }

  async listExamDates(): Promise<ExamDateItem[]> {
    await this.ensureSeeded();
    const snap = await this.db.collection('examDates').get();
    return snap.docs
      .map((d) => d.data() as ExamDateItem)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getExamDateById(id: string): Promise<ExamDateItem | null> {
    const doc = await this.db.collection('examDates').doc(id).get();
    return doc.exists ? (doc.data() as ExamDateItem) : null;
  }

  async upsertExamDate(item: ExamDateItem): Promise<ExamDateItem> {
    await this.db.collection('examDates').doc(item.id).set(item);
    return item;
  }

  async deleteExamDate(id: string): Promise<boolean> {
    const ref = this.db.collection('examDates').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async listTextbooks(): Promise<Textbook[]> {
    await this.ensureSeeded();
    const snap = await this.db.collection('textbooks').get();
    return snap.docs.map((d) => d.data() as Textbook);
  }

  async getTextbookById(id: string): Promise<Textbook | null> {
    const doc = await this.db.collection('textbooks').doc(id).get();
    return doc.exists ? (doc.data() as Textbook) : null;
  }

  async upsertTextbook(item: Textbook): Promise<Textbook> {
    await this.db.collection('textbooks').doc(item.id).set(item);
    return item;
  }

  async deleteTextbook(id: string): Promise<boolean> {
    const ref = this.db.collection('textbooks').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async listTopics(textbookId?: string): Promise<Topic[]> {
    await this.ensureSeeded();
    const query = textbookId
      ? this.db.collection('topics').where('textbookId', '==', textbookId)
      : this.db.collection('topics');
    const snap = await query.get();
    return snap.docs
      .map((d) => d.data() as Topic)
      .sort((a, b) => a.order - b.order);
  }

  async getTopicById(id: string): Promise<Topic | null> {
    const doc = await this.db.collection('topics').doc(id).get();
    return doc.exists ? (doc.data() as Topic) : null;
  }

  async upsertTopic(item: Topic): Promise<Topic> {
    await this.db.collection('topics').doc(item.id).set(item);
    return item;
  }

  async deleteTopic(id: string): Promise<boolean> {
    const ref = this.db.collection('topics').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async listInterimExams(textbookId?: string): Promise<InterimExam[]> {
    await this.ensureSeeded();
    const query = textbookId
      ? this.db.collection('interimExams').where('textbookId', '==', textbookId)
      : this.db.collection('interimExams');
    const snap = await query.get();
    return snap.docs
      .map((d) => d.data() as InterimExam)
      .sort((a, b) => a.afterTopicOrder - b.afterTopicOrder);
  }

  async getInterimExamById(id: string): Promise<InterimExam | null> {
    const doc = await this.db.collection('interimExams').doc(id).get();
    return doc.exists ? (doc.data() as InterimExam) : null;
  }

  async upsertInterimExam(item: InterimExam): Promise<InterimExam> {
    await this.db.collection('interimExams').doc(item.id).set(item);
    return item;
  }

  async deleteInterimExam(id: string): Promise<boolean> {
    const ref = this.db.collection('interimExams').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async listInterimExamAttempts(userId: string): Promise<InterimExamAttempt[]> {
    const snap = await this.db
      .collection('interimAttempts')
      .where('userId', '==', userId)
      .get();
    return snap.docs.map((d) => d.data() as InterimExamAttempt);
  }

  async addInterimExamAttempt(attempt: InterimExamAttempt): Promise<InterimExamAttempt> {
    await this.db.collection('interimAttempts').doc(attempt.id).set(attempt);
    return attempt;
  }

  async listGroups(): Promise<Group[]> {
    await this.ensureSeeded();
    const snap = await this.db.collection('groups').get();
    return snap.docs.map((d) => d.data() as Group);
  }

  async getGroupById(id: string): Promise<Group | null> {
    const doc = await this.db.collection('groups').doc(id).get();
    return doc.exists ? (doc.data() as Group) : null;
  }

  async getGroupByInviteCode(code: string): Promise<Group | null> {
    const snap = await this.db
      .collection('groups')
      .where('inviteCode', '==', code.trim().toUpperCase())
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as Group);
  }

  async upsertGroup(group: Group): Promise<Group> {
    await this.db.collection('groups').doc(group.id).set(group);
    return group;
  }

  async deleteGroup(id: string): Promise<boolean> {
    const ref = this.db.collection('groups').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async getTopicProgress(userId: string, topicId: string): Promise<TopicProgress | null> {
    const doc = await this.db.collection('progress').doc(`${userId}__${topicId}`).get();
    return doc.exists ? (doc.data() as TopicProgress) : null;
  }

  async listUserProgress(userId: string): Promise<TopicProgress[]> {
    const snap = await this.db.collection('progress').where('userId', '==', userId).get();
    return snap.docs.map((d) => d.data() as TopicProgress);
  }

  async listAllProgress(): Promise<TopicProgress[]> {
    const snap = await this.db.collection('progress').get();
    return snap.docs.map((d) => d.data() as TopicProgress);
  }

  async upsertTopicProgress(progress: TopicProgress): Promise<TopicProgress> {
    await this.db
      .collection('progress')
      .doc(`${progress.userId}__${progress.topicId}`)
      .set(progress);
    return progress;
  }

  async listUserLeitnerCards(userId: string): Promise<LeitnerCardState[]> {
    const snap = await this.db.collection('leitner').where('userId', '==', userId).get();
    return snap.docs.map((d) => d.data() as LeitnerCardState);
  }

  async getLeitnerCard(userId: string, cardId: string): Promise<LeitnerCardState | null> {
    const doc = await this.db.collection('leitner').doc(`${userId}__${cardId}`).get();
    return doc.exists ? (doc.data() as LeitnerCardState) : null;
  }

  async upsertLeitnerCard(userId: string, state: LeitnerCardState): Promise<LeitnerCardState> {
    await this.db
      .collection('leitner')
      .doc(`${userId}__${state.cardId}`)
      .set({ ...state, userId });
    return state;
  }

  async listAiSessions(filter?: { userId?: string; topicId?: string }): Promise<AiTutorSession[]> {
    const snap = await this.db.collection('aiSessions').get();
    return snap.docs
      .map((d) => d.data() as AiTutorSession)
      .filter((s) => {
        if (filter?.userId && s.userId !== filter.userId) return false;
        if (filter?.topicId && s.topicId !== filter.topicId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  async getAiSessionById(id: string): Promise<AiTutorSession | null> {
    const doc = await this.db.collection('aiSessions').doc(id).get();
    return doc.exists ? (doc.data() as AiTutorSession) : null;
  }

  async upsertAiSession(session: AiTutorSession): Promise<AiTutorSession> {
    await this.db.collection('aiSessions').doc(session.id).set(session);
    return session;
  }

  async countUserAiSessionsToday(userId: string, now: Date = new Date()): Promise<number> {
    const dayPrefix = now.toISOString().slice(0, 10);
    const sessions = await this.listAiSessions({ userId });
    return sessions.filter((s) => s.startedAt.startsWith(dayPrefix)).length;
  }
}
