import type {
  AiTutorEvaluation,
  TargetGrade,
  WeakItems,
  WrittenCaseQuestion,
} from './types.js';

export const LEITNER_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

export const TARGET_GRADE_THRESHOLDS: Record<TargetGrade, number> = {
  'A+': 90,
  A: 80,
  'B+': 70,
  B: 65,
  'C+': 60,
  C: 50,
};

export const FLASHCARD_CATEGORY_LABELS = {
  articles: 'Moddalar va muddatlar',
  terms: 'Yuridik atamalar',
  organs: 'Davlat va huquq organlari',
  subjects: 'Huquqiy subyektlar va javobgarlik',
} as const;

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: "'",
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ў: "o'",
  қ: 'q',
  ғ: "g'",
  ҳ: 'h',
};

/**
 * Transliterates Uzbek Cyrillic text to normalized Uzbek Latin.
 */
export function transliterateCyrillicToLatin(input: string): string {
  const lower = input.toLowerCase();
  let result = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (ch === 'е') {
      const prev = i === 0 ? ' ' : lower[i - 1];
      const isAfterVowelOrStart =
        i === 0 || /[\s.,!?;:()\-аеёиоуўыэюяaeiou]/.test(prev);
      result += isAfterVowelOrStart ? 'ye' : 'e';
    } else if (CYRILLIC_TO_LATIN_MAP[ch] !== undefined) {
      result += CYRILLIC_TO_LATIN_MAP[ch];
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Normalizes Uzbek text for reliable comparisons across Latin/Cyrillic
 * and all apostrophe variants (', ’, ‘, `, ʼ, ʻ, o', g', o‘, g‘, etc.).
 */
export function normalizeUzbekText(input: string): string {
  if (!input) return '';
  let text = transliterateCyrillicToLatin(input.trim().toLowerCase());

  // Normalize all apostrophe-like unicode chars into standard ASCII '
  text = text.replace(/[\u2018\u2019\u201B\u02BB\u02BC\u0060\u00B4\u2032]/g, "'");

  // Unify o' and g' variants (e.g., o ', o‘ -> o')
  text = text.replace(/([og])\s*'/g, "$1'");
  // Replace remaining standalone/tutuq apostrophes cleanly
  text = text.replace(/([a-z])'([a-z])/g, (match, a: string, b: string) => {
    if (a === 'o' || a === 'g') return `${a}'${b}`;
    return `${a}${b}`;
  });

  // Remove punctuation except apostrophe inside o'/g' and hyphen/digits
  text = text.replace(/[^\p{L}\p{N}'\s-]/gu, ' ');
  // Normalize hyphens & whitespace
  text = text.replace(/[-–—]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Strips o'/g' apostrophes completely for tolerant Cloze/short-answer matching
 * when a student writes "ozbekiston" instead of "o'zbekiston".
 */
export function normalizeUzbekLoose(input: string): string {
  return normalizeUzbekText(input).replace(/'/g, '');
}

/**
 * Compares a student's cloze / short text answer against accepted answers.
 */
export function isUzbekAnswerMatch(studentAnswer: string, acceptedAnswers: string[]): boolean {
  const normStudent = normalizeUzbekLoose(studentAnswer);
  if (!normStudent) return false;
  return acceptedAnswers.some((accepted) => {
    const normAccepted = normalizeUzbekLoose(accepted);
    return normAccepted.length > 0 && normStudent === normAccepted;
  });
}

/**
 * Calculates next Leitner box and review schedule using [1, 3, 7, 14, 30] day intervals.
 */
export function calculateNextLeitner(
  currentBox: number,
  known: boolean,
  now: Date = new Date()
): { box: number; intervalDays: number; nextReviewAt: string } {
  const clampedCurrent = Math.max(1, Math.min(5, Math.floor(currentBox || 1)));
  const nextBox = known ? Math.min(5, clampedCurrent + 1) : 1;
  const intervalDays = LEITNER_INTERVALS_DAYS[nextBox - 1];
  const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return {
    box: nextBox,
    intervalDays,
    nextReviewAt: nextDate.toISOString(),
  };
}

/**
 * Fast local matching before invoking Gemini AI for written/case grading.
 * Returns a match result if unambiguously correct or blank, otherwise null (needs AI).
 */
export function matchWrittenAnswerLocally(
  question: WrittenCaseQuestion,
  studentAnswer: string
): { isCorrect: boolean; score: number; feedback: string } | null {
  const trimmed = studentAnswer.trim();
  if (!trimmed) {
    return {
      isCorrect: false,
      score: 0,
      feedback: "Javob kiritilmagan. Kalit javobni ko'rib chiqib qayta mashq qiling.",
    };
  }

  const normStudent = normalizeUzbekLoose(trimmed);
  const candidates = [question.expectedAnswer, ...(question.synonyms || [])]
    .map((c) => normalizeUzbekLoose(c))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (normStudent === candidate) {
      return {
        isCorrect: true,
        score: 100,
        feedback: "To'g'ri! Yuridik norma va tushuncha aniq ko'rsatilgan.",
      };
    }
    // If candidate is a concise factual key (>= 4 chars) contained cleanly in student's sentence
    if (
      question.kind === 'factual' &&
      candidate.length >= 5 &&
      normStudent.includes(candidate) &&
      normStudent.length <= candidate.length * 3.2
    ) {
      return {
        isCorrect: true,
        score: 95,
        feedback: "To'g'ri! Asosiy yuridik fakt aniq ifodalangan.",
      };
    }
  }

  // If keyPoints are provided and student hits all of them locally
  if (question.keyPoints && question.keyPoints.length >= 2) {
    const matchedPoints = question.keyPoints.filter((kp) =>
      normStudent.includes(normalizeUzbekLoose(kp))
    );
    if (matchedPoints.length === question.keyPoints.length) {
      return {
        isCorrect: true,
        score: 95,
        feedback: "Ajoyib! Kazusning barcha asosiy yuridik mezonlari to'g'ri ko'rsatilgan.",
      };
    }
  }

  return null;
}

/**
 * Merges weak item arrays safely without duplicates, preserving existing items
 * unless explicitly cleared.
 */
export function mergeWeakItems(
  existing: WeakItems | undefined,
  incoming: Partial<WeakItems> | undefined
): WeakItems {
  const base: WeakItems = {
    cards: existing?.cards ?? [],
    written: existing?.written ?? [],
    timeline: existing?.timeline ?? [],
  };
  if (!incoming) return base;

  const dedupe = (arr: string[]) =>
    Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean))).slice(0, 40);

  return {
    cards: incoming.cards !== undefined ? dedupe([...base.cards, ...incoming.cards]) : base.cards,
    written:
      incoming.written !== undefined ? dedupe([...base.written, ...incoming.written]) : base.written,
    timeline:
      incoming.timeline !== undefined
        ? dedupe([...base.timeline, ...incoming.timeline])
        : base.timeline,
  };
}

export interface WrittenGradingPromptItem {
  questionId: string;
  prompt: string;
  expectedAnswer: string;
  synonyms: string[];
  studentAnswer: string;
}

export interface ParsedWrittenGrade {
  questionId: string;
  isCorrect: boolean;
  score: number;
  feedback: string;
}

/**
 * Builds the Uzbek legal semantic grading prompt for Gemini.
 */
export function buildWrittenGradingPrompt(
  topicTitle: string,
  items: WrittenGradingPromptItem[]
): string {
  const serializedItems = items
    .map(
      (item, idx) =>
        `${idx + 1}. ID: "${item.questionId}"\nSavol/Kazus: ${item.prompt}\nKalit javob: ${item.expectedAnswer}\nQabul qilinadigan sinonimlar: ${
          item.synonyms.length ? item.synonyms.join(', ') : "yo'q"
        }\nO'quvchi javobi: ${item.studentAnswer}`
    )
    .join('\n\n');

  return `Sen O'zbekiston huquqshunoslik fani bo'yicha tajribali ekspert-baholovchisan.
Mavzu: "${topicTitle}"

Vazifa: Quyidagi o'quvchi javoblarini kalit javob bilan semantik solishtir va adolatli bahola.
MUHIM QOIDALAR:
- Sinonimlar, yuridik jihatdan teng ma'noli ifodalar, so'z tartibidagi farqlar, Lotin yoki Kirill alifbosida yozilgani hamda o'/g' apostrof imlo farqlari XATO HISOBLANMAYDI.
- Agar o'quvchi huquqiy mohiyatni to'g'ri tushuntirgan bo'lsa (score >= 65), isCorrect = true bo'lsin.
- Izoh (feedback) qisqa, aniq, do'stona va to'liq o'zbek tilida (1–2 jumla) bo'lsin. Xato bo'lsa, to'g'ri huquqiy asosni ko'rsat.
- Faqat sof JSON massiv qaytar: [{"questionId":"...","isCorrect":true,"score":90,"feedback":"..."}]

TEKSHIRILADIGAN JAVOBLAR:
${serializedItems}`;
}

/**
 * Safely extracts JSON array or object from raw model text (handles markdown fences).
 */
export function extractJsonFromModelText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBracket = trimmed.search(/[\[{]/);
  if (firstBracket === -1) return trimmed;
  const openChar = trimmed[firstBracket];
  const closeChar = openChar === '[' ? ']' : '}';
  const lastBracket = trimmed.lastIndexOf(closeChar);
  if (lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }
  return trimmed;
}

/**
 * Parses Gemini's JSON response for written/case grading.
 */
export function parseWrittenGradingResponse(
  rawText: string,
  expectedQuestionIds: string[]
): ParsedWrittenGrade[] {
  const cleaned = extractJsonFromModelText(rawText);
  const parsed: unknown = JSON.parse(cleaned);
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: unknown[] }).results
      : null;

  if (!arr) {
    throw new Error("AI javobi kutilgan JSON massiv formatida emas.");
  }

  const byId = new Map<string, ParsedWrittenGrade>();
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const qid = typeof obj.questionId === 'string' ? obj.questionId : '';
    if (!qid) continue;
    const rawScore = Number(obj.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
    const isCorrect =
      typeof obj.isCorrect === 'boolean' ? obj.isCorrect : score >= 65;
    const feedback =
      typeof obj.feedback === 'string' && obj.feedback.trim().length > 0
        ? obj.feedback.trim()
        : isCorrect
          ? "To'g'ri javob."
          : "Javob to'liq emas, qonun normasini qayta ko'rib chiqing.";
    byId.set(qid, { questionId: qid, isCorrect, score, feedback });
  }

  return expectedQuestionIds
    .map((id) => byId.get(id))
    .filter((item): item is ParsedWrittenGrade => Boolean(item));
}

/**
 * Builds the oral AI Tutor transcript evaluation prompt.
 */
export function buildOralEvaluationPrompt(
  topicTitle: string,
  knowledgeSummary: string,
  transcriptLines: Array<{ role: 'student' | 'tutor'; text: string }>
): string {
  const dialog = transcriptLines
    .map((t) => `${t.role === 'student' ? "O'quvchi" : 'AI Ustoz'}: ${t.text}`)
    .join('\n');

  return `Sen O'zbekiston huquqshunoslik fani bo'yicha og'zaki imtihon komissiyasi raisisan.
Mavzu: "${topicTitle}"
Mavzu qisqacha konspekti: ${knowledgeSummary}

Quyidagi og'zaki suhbat transkriptini xolis bahola va faqat JSON obyekt qaytar:
{
  "score": 0-100 oralig'ida butun son,
  "strengths": ["kuchli tomon 1", "kuchli tomon 2"],
  "legalGaps": ["huquqiy bo'shliq 1"],
  "summary": "2-3 jumlalik umumiy tavsiya va xulosa (o'zbek tilida)"
}

SUHBAT TRANSKRIPTI:
${dialog}`;
}

/**
 * Parses oral AI Tutor evaluation JSON. Returns null if malformed so the system
 * never fabricates a fake score (keeps session in pending_evaluation).
 */
export function parseOralEvaluationResponse(rawText: string): AiTutorEvaluation | null {
  try {
    const cleaned = extractJsonFromModelText(rawText);
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const rawScore = Number(obj.score);
    if (!Number.isFinite(rawScore)) return null;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const strengths = Array.isArray(obj.strengths)
      ? obj.strengths.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const legalGaps = Array.isArray(obj.legalGaps)
      ? obj.legalGaps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const summary =
      typeof obj.summary === 'string' && obj.summary.trim().length > 0 ? obj.summary.trim() : '';
    if (!summary) return null;

    return {
      score,
      strengths,
      legalGaps,
      summary,
      evaluatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getCountdownParts(targetIsoDate: string, now: Date = new Date()): {
  days: number;
  hours: number;
  minutes: number;
  isPast: boolean;
  totalDaysCeil: number;
} {
  const target = new Date(targetIsoDate);
  const diffMs = target.getTime() - now.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, isPast: true, totalDaysCeil: 0 };
  }
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const totalDaysCeil = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return { days, hours, minutes, isPast: false, totalDaysCeil };
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
