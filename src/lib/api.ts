import type {
  AiQuotaStatus,
  AiTutorSession,
  AuthConfigInfo,
  ExamDateItem,
  FullTestQuestion,
  Group,
  InterimExam,
  InterimExamAttempt,
  LeitnerCardState,
  StudentAnalyticsRow,
  StudyProfile,
  TelegramAuthPayload,
  Textbook,
  Topic,
  TopicProgress,
  UserProfile,
  WrittenAnswerResult,
} from '@shared/types';

export interface EnrichedTopicSummary {
  id: string;
  textbookId: string;
  order: number;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  flashcardCount: number;
  quizCount: number;
  fullTestCount: number;
  writtenCount: number;
  locked: boolean;
  blockingExamId: string | null;
}

export interface EnrichedInterimExam extends InterimExam {
  passed: boolean;
  bestScore: number;
}

export interface EnrichedTextbook extends Textbook {
  topics: EnrichedTopicSummary[];
  interimExams: EnrichedInterimExam[];
}

export interface ReviewTodayResponse {
  dueCards: Array<{
    card: Topic['flashcards'][number];
    topicId: string;
    topicTitle: string;
    state: LeitnerCardState | null;
  }>;
  allLeitnerStats: {
    totalTracked: number;
    mastered: number;
    dueToday: number;
  };
  weakBank: Array<{
    topicId: string;
    topicTitle: string;
    weak: TopicProgress['weak'];
    writtenMistakes: WrittenAnswerResult[];
  }>;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      (data && typeof data.error === 'string' && data.error) ||
      `So'rovda xatolik (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

export const api = {
  getConfig: () => request<AuthConfigInfo>('/api/config'),

  getPublicCatalog: () =>
    request<{
      textbooks: Array<Textbook & { topicCount: number }>;
      examDates: ExamDateItem[];
    }>('/api/public/catalog'),

  // Auth
  loginWithTelegram: (payload: TelegramAuthPayload) =>
    request<{ user: UserProfile }>('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  devLogin: (payload: { telegramId: string; firstName: string; lastName?: string; username?: string }) =>
    request<{ user: UserProfile }>('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getMe: () =>
    request<{ user: UserProfile | null; quota?: AiQuotaStatus; groups?: Group[] }>('/api/auth/me'),

  acceptConsent: () => request<{ user: UserProfile }>('/api/me/consent', { method: 'POST' }),

  saveStudyProfile: (profile: Omit<StudyProfile, 'completedAt'>) =>
    request<{ user: UserProfile }>('/api/me/study-profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    }),

  joinGroup: (inviteCode: string) =>
    request<{ group: Group; user: UserProfile }>('/api/me/groups/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    }),

  leaveGroup: (groupId: string) =>
    request<{ ok: boolean; user: UserProfile }>(`/api/me/groups/${encodeURIComponent(groupId)}`, {
      method: 'DELETE',
    }),

  clearMyData: () =>
    request<{ ok: boolean; user: UserProfile | null }>('/api/me/data', {
      method: 'DELETE',
    }),

  // Exam dates
  listExamDates: () => request<{ examDates: ExamDateItem[] }>('/api/exam-dates'),
  createExamDate: (body: Omit<ExamDateItem, 'id' | 'createdBy' | 'createdAt'>) =>
    request<{ examDate: ExamDateItem }>('/api/exam-dates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateExamDate: (id: string, body: Omit<ExamDateItem, 'id' | 'createdBy' | 'createdAt'>) =>
    request<{ examDate: ExamDateItem }>(`/api/exam-dates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteExamDate: (id: string) =>
    request<{ ok: boolean }>(`/api/exam-dates/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Textbooks & Topics
  listTextbooks: () => request<{ textbooks: EnrichedTextbook[] }>('/api/textbooks'),
  createTextbook: (body: {
    title: string;
    branch: string;
    gradeTag: string;
    description: string;
    isPublic: boolean;
    accentColor?: string;
  }) =>
    request<{ textbook: Textbook }>('/api/textbooks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTextbook: (id: string, body: Partial<Textbook>) =>
    request<{ textbook: Textbook }>(`/api/textbooks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteTextbook: (id: string) =>
    request<{ ok: boolean }>(`/api/textbooks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getTopic: (id: string) =>
    request<{ topic: Topic; progress: TopicProgress | null; leitnerCards: LeitnerCardState[] }>(
      `/api/topics/${encodeURIComponent(id)}`
    ),
  createTopic: (body: Partial<Topic> & { textbookId: string; title: string }) =>
    request<{ topic: Topic }>('/api/topics', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTopic: (id: string, body: Partial<Topic>) =>
    request<{ topic: Topic }>(`/api/topics/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  reorderTopic: (id: string, direction: 'up' | 'down') =>
    request<{ topics: Topic[] }>(`/api/topics/${encodeURIComponent(id)}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  deleteTopic: (id: string) =>
    request<{ ok: boolean }>(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Interim Exams & Simulator
  createInterimExam: (body: Omit<InterimExam, 'id' | 'createdAt'>) =>
    request<{ interimExam: InterimExam }>('/api/interim-exams', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteInterimExam: (id: string) =>
    request<{ ok: boolean }>(`/api/interim-exams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getInterimExamQuestions: (id: string) =>
    request<{ exam: InterimExam; questions: Array<FullTestQuestion & { topicTitle: string }> }>(
      `/api/interim-exams/${encodeURIComponent(id)}/questions`
    ),
  submitInterimExam: (
    id: string,
    answers: Array<{ questionId: string; selectedIndex: number }>
  ) =>
    request<{
      attempt: InterimExamAttempt;
      details: Array<{
        questionId: string;
        selectedIndex: number;
        correctIndex: number;
        isCorrect: boolean;
        explanation: string;
      }>;
      passingScore: number;
    }>(`/api/interim-exams/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  getSimulatorExam: (count = 25) =>
    request<{
      title: string;
      durationMinutes: number;
      questions: Array<
        FullTestQuestion & { topicId: string; topicTitle: string; branch: string }
      >;
    }>(`/api/simulator/exam?count=${count}`),

  // Progress, Leitner & Written Grading
  getProgress: () =>
    request<{
      progress: TopicProgress[];
      leitnerCards: LeitnerCardState[];
      interimAttempts: InterimExamAttempt[];
    }>('/api/progress'),

  updateTopicProgress: (
    topicId: string,
    patch: Partial<{
      konspektRead: boolean;
      cardsMastered: number;
      cardsTotal: number;
      cardsScore: number;
      quizScore: number | null;
      processScore: number | null;
      fullTestScore: number | null;
      writtenScore: number | null;
      aiTutorScore: number | null;
      weak: Partial<TopicProgress['weak']>;
    }>
  ) =>
    request<{ progress: TopicProgress }>(`/api/progress/${encodeURIComponent(topicId)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  reviewLeitnerCard: (body: {
    topicId: string;
    cardId: string;
    known: boolean;
    cardFront?: string;
  }) =>
    request<{ cardState: LeitnerCardState; progress: TopicProgress }>('/api/leitner/review', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getReviewToday: () => request<ReviewTodayResponse>('/api/review/today'),

  gradeWrittenAnswers: (
    topicId: string,
    answers: Array<{ questionId: string; answer: string }>
  ) =>
    request<{
      writtenScore: number;
      results: WrittenAnswerResult[];
      progress: TopicProgress;
    }>(`/api/topics/${encodeURIComponent(topicId)}/written/grade`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // AI Tutor
  getAiQuota: () => request<{ quota: AiQuotaStatus }>('/api/ai/quota'),
  startAiSession: (topicId: string, mode: 'voice' | 'text') =>
    request<{ session: AiTutorSession }>('/api/ai/sessions', {
      method: 'POST',
      body: JSON.stringify({ topicId, mode }),
    }),
  sendAiMessage: (sessionId: string, topicId: string, message: string) =>
    request<{ session: AiTutorSession; reply: string }>(
      `/api/ai/sessions/${encodeURIComponent(sessionId)}/message`,
      {
        method: 'POST',
        body: JSON.stringify({ topicId, message }),
      }
    ),
  finishAiSession: (sessionId: string, durationSec: number) =>
    request<{ session: AiTutorSession }>(
      `/api/ai/sessions/${encodeURIComponent(sessionId)}/finish`,
      {
        method: 'POST',
        body: JSON.stringify({ durationSec }),
      }
    ),
  evaluateAiSession: (sessionId: string) =>
    request<{ session: AiTutorSession }>(
      `/api/ai/sessions/${encodeURIComponent(sessionId)}/evaluate`,
      {
        method: 'POST',
      }
    ),
  listAiSessions: (params?: { userId?: string; topicId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.topicId) qs.set('topicId', params.topicId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ sessions: AiTutorSession[] }>(`/api/ai/sessions${suffix}`);
  },

  // Teacher / Admin
  extractFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ text: string; fileName: string; charCount: number }>(
      '/api/teacher/extract-file',
      { method: 'POST', body: fd }
    );
  },

  generateTopicDraft: (body: { textbookId: string; title: string; sourceText: string }) =>
    request<{ draft: Omit<Topic, 'id' | 'textbookId' | 'order' | 'createdAt' | 'updatedAt'>; usedGemini: boolean }>(
      '/api/teacher/generate-topic',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  listGroups: () => request<{ groups: Group[] }>('/api/groups'),
  createGroup: (body: { name: string; description?: string; textbookIds: string[] }) =>
    request<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify(body) }),
  updateGroup: (id: string, body: Partial<{ name: string; description: string; textbookIds: string[] }>) =>
    request<{ group: Group }>(`/api/groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteGroup: (id: string) =>
    request<{ ok: boolean }>(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getTeacherAnalytics: (params?: { groupId?: string; topicId?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.groupId) qs.set('groupId', params.groupId);
    if (params?.topicId) qs.set('topicId', params.topicId);
    if (params?.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{
      rows: StudentAnalyticsRow[];
      topics: Array<{ id: string; title: string; textbookId: string }>;
    }>(`/api/teacher/analytics${suffix}`);
  },

  getAdminTeachers: () =>
    request<{ envAdminIds: string[]; envTeacherIds: string[]; allowlistIds: string[] }>(
      '/api/admin/teachers'
    ),
  addTeacherId: (telegramId: string) =>
    request<{ allowlistIds: string[] }>(`/api/admin/teachers/${encodeURIComponent(telegramId)}`, {
      method: 'PUT',
    }),
  removeTeacherId: (telegramId: string) =>
    request<{ allowlistIds: string[] }>(`/api/admin/teachers/${encodeURIComponent(telegramId)}`, {
      method: 'DELETE',
    }),
};
