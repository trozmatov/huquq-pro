import { describe, expect, it } from 'vitest';
import {
  buildOralEvaluationPrompt,
  buildWrittenGradingPrompt,
  calculateNextLeitner,
  isUzbekAnswerMatch,
  LEITNER_INTERVALS_DAYS,
  matchWrittenAnswerLocally,
  mergeWeakItems,
  normalizeUzbekLoose,
  normalizeUzbekText,
  parseOralEvaluationResponse,
  parseWrittenGradingResponse,
  transliterateCyrillicToLatin,
} from '../shared/utils.js';
import type { WrittenCaseQuestion } from '../shared/types.js';

describe("O'zbekcha matn, apostrof va Kirill-Lotin normallashtirish", () => {
  it("turli o'/g' apostrof variantlarini bir xil ko'rinishga keltiradi", () => {
    const a = normalizeUzbekText("O'zbekiston g'oyasi to‘g‘ri");
    const b = normalizeUzbekText("O’zbekiston g‘oyasi to'g'ri");
    const c = normalizeUzbekText("Oʻzbekiston gʼoyasi to`g`ri");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("Kirill yozuvini Lotin yozuviga to'g'ri o'giradi", () => {
    expect(transliterateCyrillicToLatin('Ўзбекистон Конституцияси')).toBe(
      "o'zbekiston konstitutsiyasi"
    );
    expect(normalizeUzbekLoose('Қонунчилик палатаси')).toBe(
      normalizeUzbekLoose('Qonunchilik palatasi')
    );
  });

  it("Cloze javoblarini apostrofsiz va Kirill yozuvda ham qabul qiladi", () => {
    expect(isUzbekAnswerMatch("O'zbekiston xalqi", ["o‘zbekiston xalqi"])).toBe(true);
    expect(isUzbekAnswerMatch('ozbekiston xalqi', ["o'zbekiston xalqi"])).toBe(true);
    expect(isUzbekAnswerMatch('Ўзбекистон халқи', ["o'zbekiston xalqi"])).toBe(true);
    expect(isUzbekAnswerMatch('Boshqa javob', ["o'zbekiston xalqi"])).toBe(false);
  });
});

describe('Leitner intervallari (1, 3, 7, 14, 30 kun)', () => {
  it("to'g'ri javobda 1 -> 3 -> 7 -> 14 -> 30 kunlik qutilarga ko'tariladi", () => {
    expect(Array.from(LEITNER_INTERVALS_DAYS)).toEqual([1, 3, 7, 14, 30]);
    const base = new Date('2026-11-25T00:00:00.000Z');

    const step2 = calculateNextLeitner(1, true, base);
    expect(step2.box).toBe(2);
    expect(step2.intervalDays).toBe(3);

    const step3 = calculateNextLeitner(2, true, base);
    expect(step3.box).toBe(3);
    expect(step3.intervalDays).toBe(7);

    const step4 = calculateNextLeitner(3, true, base);
    expect(step4.box).toBe(4);
    expect(step4.intervalDays).toBe(14);

    const step5 = calculateNextLeitner(4, true, base);
    expect(step5.box).toBe(5);
    expect(step5.intervalDays).toBe(30);

    // Max box stays 5
    const stepCap = calculateNextLeitner(5, true, base);
    expect(stepCap.box).toBe(5);
    expect(stepCap.intervalDays).toBe(30);
  });

  it("xato javobda 1-qutiga (1 kun) qaytaradi", () => {
    const base = new Date('2026-11-25T00:00:00.000Z');
    const lapsed = calculateNextLeitner(4, false, base);
    expect(lapsed.box).toBe(1);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.nextReviewAt).toBe('2026-11-26T00:00:00.000Z');
  });
});

describe('Lokal tezkor yozma tekshiruv va weak merge', () => {
  const sampleQ: WrittenCaseQuestion = {
    id: 'wr-1',
    kind: 'factual',
    prompt: "Sud qarorisiz ushlab turish muddati qancha?",
    expectedAnswer: '48 soat',
    synonyms: ['qirq sakkiz soat', '48 soatdan ortiq emas'],
    keyPoints: ['48', 'soat'],
  };

  it("bo'sh javobni 0 ball, aniq va sinonim javoblarni 100 ball deb baholaydi", () => {
    expect(matchWrittenAnswerLocally(sampleQ, '   ')?.score).toBe(0);
    expect(matchWrittenAnswerLocally(sampleQ, '48 soat')?.isCorrect).toBe(true);
    expect(matchWrittenAnswerLocally(sampleQ, 'Қирқ саккиз соат')?.isCorrect).toBe(true);
    expect(matchWrittenAnswerLocally(sampleQ, 'Sud ruxsati bilan chozish mumkin')).toBeNull();
  });

  it("weak obyektlarini dublikatlarsiz birlashtiradi", () => {
    const merged = mergeWeakItems(
      { cards: ['27-modda'], written: ['Kazus 1'], timeline: [] },
      { cards: ['27-modda', '28-modda'], timeline: ['Qonun qabul qilish'] }
    );
    expect(merged.cards).toEqual(['27-modda', '28-modda']);
    expect(merged.written).toEqual(['Kazus 1']);
    expect(merged.timeline).toEqual(['Qonun qabul qilish']);
  });
});

describe("Yozma/kazus AI prompti va baholash parseri", () => {
  it("o'zbek tilida sinonim va Lotin/Kirill qoidalari bilan prompt yaratadi", () => {
    const prompt = buildWrittenGradingPrompt('Konstitutsiya 28-modda', [
      {
        questionId: 'q1',
        prompt: 'Aybsizlik prezumpsiyasi nima?',
        expectedAnswer: 'Sud hukmisiz shaxs aybsiz hisoblanadi',
        synonyms: ['aybi isbotlanmaguncha aybsiz'],
        studentAnswer: 'Sud hukmi chiqmaguncha odam aybsiz sanaladi',
      },
    ]);
    expect(prompt).toContain('Konstitutsiya 28-modda');
    expect(prompt).toContain('Lotin yoki Kirill');
    expect(prompt).toContain('XATO HISOBLANMAYDI');
  });

  it("markdown kod bloki ichidagi JSON javobni to'g'ri parse qiladi", () => {
    const raw = `\`\`\`json
[
  {"questionId": "q1", "isCorrect": true, "score": 92, "feedback": "Ajoyib yuridik izoh!"},
  {"questionId": "q2", "isCorrect": false, "score": 30, "feedback": "28-modda talabini qayta o'qing."}
]
\`\`\``;
    const parsed = parseWrittenGradingResponse(raw, ['q1', 'q2']);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ questionId: 'q1', isCorrect: true, score: 92 });
    expect(parsed[1]).toMatchObject({ questionId: 'q2', isCorrect: false, score: 30 });
  });

  it("og'zaki AI baholash parseri noto'g'ri JSONda soxta ball qaytarmaydi (null qaytaradi)", () => {
    const prompt = buildOralEvaluationPrompt('Fuqarolik huquqi', 'Emansipatsiya...', [
      { role: 'tutor', text: 'Emansipatsiya necha yoshdan?' },
      { role: 'student', text: '16 yoshdan boshlab.' },
    ]);
    expect(prompt).toContain('Fuqarolik huquqi');

    const valid = parseOralEvaluationResponse(
      JSON.stringify({
        score: 88,
        strengths: ['16 yosh mezonini aniq aytdi'],
        legalGaps: ['Vasiylik organi rolini qo‘shish kerak'],
        summary: 'Yaxshi tayyorgarlik.',
      })
    );
    expect(valid?.score).toBe(88);
    expect(valid?.strengths).toHaveLength(1);

    // Malformed / missing fields must return null (no fake score!)
    expect(parseOralEvaluationResponse('not json at all')).toBeNull();
    expect(parseOralEvaluationResponse(JSON.stringify({ score: 'bad' }))).toBeNull();
  });
});
