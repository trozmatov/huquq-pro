import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store/memoryStore.js';
import {
  SESSION_COOKIE_NAME,
  signTelegramPayloadForTest,
  verifyTelegramLoginWidget,
} from '../server/auth.js';

const TEST_BOT_TOKEN = '999888777:AAH-test-bot-token-for-huquqpro-unit-tests';

function setupEnv() {
  process.env.NODE_ENV = 'test';
  process.env.STORE = 'memory';
  process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
  process.env.TELEGRAM_BOT_USERNAME = 'huquqpro_test_bot';
  process.env.SESSION_SECRET = 'test-session-secret-key-at-least-32-characters-long';
  process.env.ADMIN_TELEGRAM_IDS = '100001';
  process.env.TEACHER_TELEGRAM_IDS = '100002';
  process.env.GEMINI_API_KEY = '';
  process.env.DEV_AUTH_USER_ID = '';
}

async function loginAs(
  app: ReturnType<typeof createApp>['app'],
  telegramId: number,
  firstName: string
): Promise<string[]> {
  const payload = signTelegramPayloadForTest(
    {
      id: telegramId,
      first_name: firstName,
      username: firstName.toLowerCase(),
      auth_date: Math.floor(Date.now() / 1000),
    },
    TEST_BOT_TOKEN
  );
  const res = await request(app).post('/api/auth/telegram').send(payload).expect(200);
  const cookies = res.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
}

describe('Telegram Login Widget HMAC-SHA256, Sessiya Cookie va RBAC', () => {
  beforeEach(setupEnv);

  it("to'g'ri imzo, soxtalashtirilgan payload va muddati o'tgan auth_date tekshiruvi", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const valid = signTelegramPayloadForTest(
      { id: 555001, first_name: 'Olim', auth_date: nowSec },
      TEST_BOT_TOKEN
    );
    expect(verifyTelegramLoginWidget(valid, TEST_BOT_TOKEN, nowSec).valid).toBe(true);

    // Tampered first_name
    const tampered = { ...valid, first_name: 'Hacker' };
    expect(verifyTelegramLoginWidget(tampered, TEST_BOT_TOKEN, nowSec).valid).toBe(false);

    // Expired auth_date (> 24 hours old)
    const expired = signTelegramPayloadForTest(
      { id: 555001, first_name: 'Olim', auth_date: nowSec - 90000 },
      TEST_BOT_TOKEN
    );
    const expRes = verifyTelegramLoginWidget(expired, TEST_BOT_TOKEN, nowSec);
    expect(expRes.valid).toBe(false);
    expect(expRes.reason).toContain('muddati');
  });

  it("POST /api/auth/telegram HttpOnly SameSite=Lax cookie o'rnatadi va logout tozalaydi", async () => {
    const { app } = createApp(new MemoryStore(true));
    const nowSec = Math.floor(Date.now() / 1000);

    // Bad signature rejected
    await request(app)
      .post('/api/auth/telegram')
      .send({ id: 5001, first_name: 'Bad', auth_date: nowSec, hash: 'a'.repeat(64) })
      .expect(401);

    // Valid student login
    const payload = signTelegramPayloadForTest(
      { id: 500001, first_name: 'Aziza', auth_date: nowSec },
      TEST_BOT_TOKEN
    );
    const res = await request(app).post('/api/auth/telegram').send(payload).expect(200);
    expect(res.body.user.role).toBe('student');

    const setCookieHeader = String(res.headers['set-cookie']?.[0] || '');
    expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookieHeader.toLowerCase()).toContain('httponly');
    expect(setCookieHeader.toLowerCase()).toContain('samesite=lax');

    // /api/auth/me recognizes cookie
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', res.headers['set-cookie'])
      .expect(200);
    expect(me.body.user.telegramId).toBe('500001');

    // Logout clears cookie
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', res.headers['set-cookie'])
      .expect(200);
    expect(logoutRes.body.ok).toBe(true);
  });

  it("Server-side rollar, Admin teacher allowlist va egalik (ownerId) nazorati", async () => {
    const store = new MemoryStore(true);
    const { app } = createApp(store);

    const adminCookie = await loginAs(app, 100001, 'Admin');
    const teacher1Cookie = await loginAs(app, 100002, 'Ustoz1');
    const studentCookie = await loginAs(app, 300001, 'Talaba');

    // Student cannot access admin endpoints or create textbooks
    await request(app).put('/api/admin/teachers/100003').set('Cookie', studentCookie).expect(403);
    await request(app)
      .post('/api/textbooks')
      .set('Cookie', studentCookie)
      .send({ title: 'NoAccess', branch: 'Huquq', gradeTag: '9-sinf', isPublic: true })
      .expect(403);

    // Admin grants teacher role to 100003
    const addRes = await request(app)
      .put('/api/admin/teachers/100003')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(addRes.body.allowlistIds).toContain('100003');

    // Now 100003 logs in and receives server-resolved 'teacher' role
    const teacher2Cookie = await loginAs(app, 100003, 'Ustoz2');
    const me2 = await request(app).get('/api/auth/me').set('Cookie', teacher2Cookie).expect(200);
    expect(me2.body.user.role).toBe('teacher');

    // Teacher 1 creates a private textbook
    const createdTb = await request(app)
      .post('/api/textbooks')
      .set('Cookie', teacher1Cookie)
      .send({
        title: 'Ustoz1 Maxsus Darsligi',
        branch: 'Soliq huquqi',
        gradeTag: '11-sinf',
        description: 'Maxsus kurs',
        isPublic: false,
      })
      .expect(201);

    const tbId = createdTb.body.textbook.id;

    // Teacher 2 CANNOT edit or delete Teacher 1's textbook (ownerId check!)
    await request(app)
      .put(`/api/textbooks/${tbId}`)
      .set('Cookie', teacher2Cookie)
      .send({ title: 'Buzilgan nom' })
      .expect(403);
    await request(app)
      .delete(`/api/textbooks/${tbId}`)
      .set('Cookie', teacher2Cookie)
      .expect(403);

    // Admin CAN delete Teacher 1's textbook
    await request(app)
      .delete(`/api/textbooks/${tbId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    // Admin revokes teacher role from 100003
    await request(app)
      .delete('/api/admin/teachers/100003')
      .set('Cookie', adminCookie)
      .expect(200);
    const afterRevoke = await request(app)
      .get('/api/auth/me')
      .set('Cookie', teacher2Cookie)
      .expect(200);
    expect(afterRevoke.body.user.role).toBe('student');
  });
});

describe("Darsliklar, Guruhlar, Oraliq Imtihon qulfi va Imtihon sanalari CRUD", () => {
  beforeEach(setupEnv);

  it("O'quvchi yopiq darslikni faqat guruhga qo'shilgach ko'radi; Oraliq Imtihon keyingi darsni ochadi", async () => {
    const store = new MemoryStore(true);
    const { app } = createApp(store);
    const studentCookie = await loginAs(app, 300010, 'Jasur');

    // Before joining group: private tb-oila-mamuriy is hidden
    const beforeTbs = await request(app)
      .get('/api/textbooks')
      .set('Cookie', studentCookie)
      .expect(200);
    expect(beforeTbs.body.textbooks.some((t: { id: string }) => t.id === 'tb-oila-mamuriy')).toBe(
      false
    );
    await request(app).get('/api/topics/topic-oila-1').set('Cookie', studentCookie).expect(403);

    // Join seeded group using 8-char invite code HUQUQ202
    await request(app)
      .post('/api/me/groups/join')
      .set('Cookie', studentCookie)
      .send({ inviteCode: 'HUQUQ202' })
      .expect(200);

    const afterTbs = await request(app)
      .get('/api/textbooks')
      .set('Cookie', studentCookie)
      .expect(200);
    expect(afterTbs.body.textbooks.some((t: { id: string }) => t.id === 'tb-oila-mamuriy')).toBe(
      true
    );
    await request(app).get('/api/topics/topic-oila-1').set('Cookie', studentCookie).expect(200);

    // Topic 2 of Konstitutsiya is LOCKED before passing interim-konst-1
    const lockedRes = await request(app)
      .get('/api/topics/topic-konst-2')
      .set('Cookie', studentCookie)
      .expect(403);
    expect(lockedRes.body.locked).toBe(true);

    // Fetch questions and pass interim-konst-1 with 100%
    const qRes = await request(app)
      .get('/api/interim-exams/interim-konst-1/questions')
      .set('Cookie', studentCookie)
      .expect(200);
    const answers = qRes.body.questions.map((q: { id: string; correctIndex: number }) => ({
      questionId: q.id,
      selectedIndex: q.correctIndex,
    }));
    const submitRes = await request(app)
      .post('/api/interim-exams/interim-konst-1/submit')
      .set('Cookie', studentCookie)
      .send({ answers })
      .expect(200);
    expect(submitRes.body.attempt.passed).toBe(true);
    expect(submitRes.body.attempt.score).toBe(100);

    // Topic 2 is now UNLOCKED!
    await request(app).get('/api/topics/topic-konst-2').set('Cookie', studentCookie).expect(200);
  });

  it("Imtihon sanalari va guruhlar CRUD to'liq ishlaydi", async () => {
    const { app } = createApp(new MemoryStore(true));
    const teacherCookie = await loginAs(app, 100002, 'Ustoz');

    // Exam date create -> update -> delete
    const createdDate = await request(app)
      .post('/api/exam-dates')
      .set('Cookie', teacherCookie)
      .send({
        title: 'Yozgi Milliy Sertifikat',
        date: '2027-06-15T09:00:00+05:00',
        examType: 'certificate',
      })
      .expect(201);
    const edId = createdDate.body.examDate.id;

    await request(app)
      .put(`/api/exam-dates/${edId}`)
      .set('Cookie', teacherCookie)
      .send({
        title: 'Yozgi Milliy Sertifikat (Yangilangan)',
        date: '2027-06-20T09:00:00+05:00',
        examType: 'certificate',
      })
      .expect(200);

    await request(app).delete(`/api/exam-dates/${edId}`).set('Cookie', teacherCookie).expect(200);

    // Group create -> update -> delete
    const createdGroup = await request(app)
      .post('/api/groups')
      .set('Cookie', teacherCookie)
      .send({ name: '10-B Huquq', textbookIds: ['tb-konstitutsiya'] })
      .expect(201);
    const gId = createdGroup.body.group.id;
    expect(createdGroup.body.group.inviteCode).toHaveLength(8);

    await request(app)
      .put(`/api/groups/${gId}`)
      .set('Cookie', teacherCookie)
      .send({ name: '10-B Intensiv' })
      .expect(200);

    await request(app).delete(`/api/groups/${gId}`).set('Cookie', teacherCookie).expect(200);
  });
});

describe("So'rovnoma (study-profile), 5 bosqichli progress, yozma tekshiruv va AI session", () => {
  beforeEach(setupEnv);

  it("study-profile, konspektRead, writtenScore, weak merge va DELETE /api/me/data ishlaydi", async () => {
    const { app } = createApp(new MemoryStore(true));
    const studentCookie = await loginAs(app, 300055, 'Madina');

    // Save 4-step study profile
    const profRes = await request(app)
      .put('/api/me/study-profile')
      .set('Cookie', studentCookie)
      .send({
        identity: 'applicant',
        gradeLevel: 'Abituriyent',
        examType: 'main_law',
        examDateId: 'exam-date-ms-spring',
        targetGrade: 'A+',
      })
      .expect(200);
    expect(profRes.body.user.studyProfile.targetGrade).toBe('A+');

    // Step 1: konspektRead + weak cards merge
    const p1 = await request(app)
      .put('/api/progress/topic-konst-1')
      .set('Cookie', studentCookie)
      .send({
        konspektRead: true,
        quizScore: 90,
        weak: { cards: ['27-modda muddati'] },
      })
      .expect(200);
    expect(p1.body.progress.konspektRead).toBe(true);
    expect(p1.body.progress.weak.cards).toEqual(['27-modda muddati']);

    // Second update preserves earlier weak.cards and merges timeline
    const p2 = await request(app)
      .put('/api/progress/topic-konst-1')
      .set('Cookie', studentCookie)
      .send({
        processScore: 70,
        weak: { timeline: ['Ushlash tartibi'] },
      })
      .expect(200);
    expect(p2.body.progress.konspektRead).toBe(true);
    expect(p2.body.progress.weak.cards).toEqual(['27-modda muddati']);
    expect(p2.body.progress.weak.timeline).toEqual(['Ushlash tartibi']);

    // Step 4: Written & Kazus semantic grading (local + synonyms + Cyrillic)
    const wrRes = await request(app)
      .post('/api/topics/topic-konst-1/written/grade')
      .set('Cookie', studentCookie)
      .send({
        answers: [
          { questionId: 'wr-k1-1', answer: 'Sud hukmi kuchga kirmaguncha shaxs aybsiz hisoblanadi' },
          { questionId: 'wr-k1-2', answer: 'Қирқ саккиз соат' },
          { questionId: 'wr-k1-3', answer: 'Mumkin emas chunki yagona dalil bola olmaydi' },
          { questionId: 'wr-k1-4', answer: '' },
        ],
      })
      .expect(200);
    expect(wrRes.body.writtenScore).toBeGreaterThanOrEqual(70);
    expect(wrRes.body.results).toHaveLength(4);
    expect(wrRes.body.results[1].isCorrect).toBe(true);
    expect(wrRes.body.results[3].isCorrect).toBe(false);

    // Step 5: AI Tutor without GEMINI_API_KEY finishes into pending_evaluation (NO fake score!)
    const startAi = await request(app)
      .post('/api/ai/sessions')
      .set('Cookie', studentCookie)
      .send({ topicId: 'topic-konst-1', mode: 'text' })
      .expect(201);
    const sid = startAi.body.session.id;

    await request(app)
      .post(`/api/ai/sessions/${sid}/message`)
      .set('Cookie', studentCookie)
      .send({ topicId: 'topic-konst-1', message: '27-moddada 48 soat belgilangan.' })
      .expect(200);

    const finished = await request(app)
      .post(`/api/ai/sessions/${sid}/finish`)
      .set('Cookie', studentCookie)
      .send({ durationSec: 45 })
      .expect(200);
    expect(finished.body.session.status).toBe('pending_evaluation');
    expect(finished.body.session.evaluation).toBeUndefined();

    // Clear student's own data
    await request(app).delete('/api/me/data').set('Cookie', studentCookie).expect(200);
    const afterClear = await request(app)
      .get('/api/progress')
      .set('Cookie', studentCookie)
      .expect(200);
    expect(afterClear.body.progress).toHaveLength(0);
  });
});
