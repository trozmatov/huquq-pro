import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import type {
  AiTutorEvaluation,
  FlashcardItem,
  FullTestQuestion,
  KnowledgePack,
  ProcessSequenceTask,
  QuizQuestion,
  Topic,
  TopicProgress,
  TranscriptTurn,
  WrittenAnswerResult,
  WrittenCaseQuestion,
} from '../shared/types.js';
import {
  buildOralEvaluationPrompt,
  buildWrittenGradingPrompt,
  extractJsonFromModelText,
  matchWrittenAnswerLocally,
  normalizeUzbekLoose,
  parseOralEvaluationResponse,
  parseWrittenGradingResponse,
  type WrittenGradingPromptItem,
} from '../shared/utils.js';
import { getConfig } from './config.js';

let cachedClient: GoogleGenAI | null = null;
let cachedKey = '';

export function getGeminiClient(): GoogleGenAI | null {
  const cfg = getConfig();
  if (!cfg.geminiApiKey) return null;
  if (!cachedClient || cachedKey !== cfg.geminiApiKey) {
    cachedClient = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    cachedKey = cfg.geminiApiKey;
  }
  return cachedClient;
}

async function generateTextWithGemini(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY sozlanmagan.');
  }
  const cfg = getConfig();
  const interaction = await client.interactions.create({
    model: cfg.geminiTextModel,
    input: prompt,
    ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
  });
  const text = interaction.output_text;
  if (!text) {
    throw new Error("Gemini modeli bo'sh javob qaytardi.");
  }
  return text;
}

/**
 * Fallback heuristic grader ONLY when GEMINI_API_KEY is not configured in local dev.
 */
function fallbackLocalSemanticGrade(
  q: WrittenCaseQuestion,
  studentAnswer: string
): WrittenAnswerResult {
  const normStudent = normalizeUzbekLoose(studentAnswer);
  const expectedWords = normalizeUzbekLoose(q.expectedAnswer)
    .split(' ')
    .filter((w) => w.length >= 4);
  const uniqueExpected = Array.from(new Set(expectedWords));
  const hitCount = uniqueExpected.filter((w) => normStudent.includes(w)).length;
  const ratio = uniqueExpected.length > 0 ? hitCount / uniqueExpected.length : 0;
  const score = Math.min(100, Math.round(ratio * 115));
  const isCorrect = score >= 60;

  return {
    questionId: q.id,
    prompt: q.prompt,
    studentAnswer,
    expectedAnswer: q.expectedAnswer,
    isCorrect,
    score,
    feedback: isCorrect
      ? "Asosiy yuridik fikr to'g'ri ifodalangan. (Lokal rejim — GEMINI_API_KEY kiritilsa chuqur semantik AI tahlil ishlaydi.)"
      : "Javob kalit normadan farq qiladi yoki to'liq emas. Kalit javobdagi qonun moddasi va yuridik asosni solishtirib ko'ring.",
    gradedBy: 'local',
  };
}

/**
 * Grades written & legal case answers:
 * 1) Fast local match (exact / synonyms / Latin-Cyrillic normalization / keyPoints)
 * 2) Parallel Gemini AI semantic chunks for remaining open answers
 */
export async function gradeWrittenAnswers(
  topic: Topic,
  submissions: Array<{ questionId: string; answer: string }>
): Promise<{ score: number; results: WrittenAnswerResult[] }> {
  const qMap = new Map(topic.writtenQuestions.map((q) => [q.id, q]));
  const resultMap = new Map<string, WrittenAnswerResult>();
  const needsAi: Array<{ question: WrittenCaseQuestion; answer: string }> = [];

  for (const sub of submissions) {
    const q = qMap.get(sub.questionId);
    if (!q) continue;
    const localHit = matchWrittenAnswerLocally(q, sub.answer);
    if (localHit) {
      resultMap.set(q.id, {
        questionId: q.id,
        prompt: q.prompt,
        studentAnswer: sub.answer,
        expectedAnswer: q.expectedAnswer,
        isCorrect: localHit.isCorrect,
        score: localHit.score,
        feedback: localHit.feedback,
        gradedBy: 'local',
      });
    } else {
      needsAi.push({ question: q, answer: sub.answer });
    }
  }

  if (needsAi.length > 0) {
    const client = getGeminiClient();
    if (!client) {
      for (const item of needsAi) {
        resultMap.set(item.question.id, fallbackLocalSemanticGrade(item.question, item.answer));
      }
    } else {
      // Split into parallel chunks of 4 for fast low-latency evaluation
      const chunkSize = 4;
      const chunks: Array<Array<{ question: WrittenCaseQuestion; answer: string }>> = [];
      for (let i = 0; i < needsAi.length; i += chunkSize) {
        chunks.push(needsAi.slice(i, i + chunkSize));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const promptItems: WrittenGradingPromptItem[] = chunk.map((c) => ({
            questionId: c.question.id,
            prompt: c.question.prompt,
            expectedAnswer: c.question.expectedAnswer,
            synonyms: c.question.synonyms,
            studentAnswer: c.answer,
          }));
          try {
            const prompt = buildWrittenGradingPrompt(topic.title, promptItems);
            const raw = await generateTextWithGemini(prompt);
            const parsed = parseWrittenGradingResponse(
              raw,
              chunk.map((c) => c.question.id)
            );
            const parsedMap = new Map(parsed.map((p) => [p.questionId, p]));
            for (const c of chunk) {
              const hit = parsedMap.get(c.question.id);
              if (hit) {
                resultMap.set(c.question.id, {
                  questionId: c.question.id,
                  prompt: c.question.prompt,
                  studentAnswer: c.answer,
                  expectedAnswer: c.question.expectedAnswer,
                  isCorrect: hit.isCorrect,
                  score: hit.score,
                  feedback: hit.feedback,
                  gradedBy: 'ai',
                });
              } else {
                resultMap.set(c.question.id, fallbackLocalSemanticGrade(c.question, c.answer));
              }
            }
          } catch {
            for (const c of chunk) {
              resultMap.set(c.question.id, fallbackLocalSemanticGrade(c.question, c.answer));
            }
          }
        })
      );
    }
  }

  const orderedResults = topic.writtenQuestions
    .map((q) => resultMap.get(q.id))
    .filter((r): r is WrittenAnswerResult => Boolean(r));

  const avgScore =
    orderedResults.length > 0
      ? Math.round(orderedResults.reduce((sum, r) => sum + r.score, 0) / orderedResults.length)
      : 0;

  return { score: avgScore, results: orderedResults };
}

/**
 * Builds the strict Uzbek system prompt for the AI Huquqshunos Ustoz
 * grounded ONLY in the topic's knowledge pack and the student's weak spots.
 */
export function buildAiTutorSystemInstruction(
  topic: Topic,
  progress: TopicProgress | null
): string {
  const articlesText = topic.knowledgePack.articlesAndDeadlines
    .map((a) => `- ${a.codeOrLaw} (${a.articleOrPeriod}): ${a.summary}`)
    .join('\n');

  const glossaryText = topic.knowledgePack.glossary
    .map((g) => `- ${g.term}: ${g.definition}`)
    .join('\n');

  const weakCards = progress?.weak.cards?.length
    ? progress.weak.cards.join('; ')
    : "Hozircha qayd etilmagan";
  const weakWritten = progress?.weak.written?.length
    ? progress.weak.written.join('; ')
    : "Hozircha qayd etilmagan";
  const weakTimeline = progress?.weak.timeline?.length
    ? progress.weak.timeline.join('; ')
    : "Hozircha qayd etilmagan";

  const suggestedQuestions = topic.aiQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  return `Sen «HuquqPro» platformasining «AI Huquqshunos Ustoz»isan — O'zbekiston huquqshunoslik fani bo'yicha talabchan, ammo samimiy og'zaki imtihon oluvchi ustozsan.

MUTLAQ QOIDALAR:
1. Faqat toza, ravon O'ZBEK TILIDA gapir.
2. Faqat quyidagi MAVZU BILIM PAKETI va qonun normalari doirasida savol ber va muhokama qil. Mavzudan tashqari mavzularga chalg'ima.
3. Har bir javobing qisqa va aniq bo'lsin (2–4 jumla): avval o'quvchining javobini qisqa tahlil qil (to'g'ri bo'lsa maqta, xato bo'lsa qonun moddasini eslatib tuzat), so'ng bitta aniq keyingi savol yoki qisqa kazus ber.
4. Avvalo o'quvchi 2–4-bosqichlarda xato qilgan zaif nuqtalarni mustahkamlashga e'tibor qarat.

MAVZU: ${topic.title}
QISQA MAZMUN:
${topic.knowledgePack.summary}

ASOSIY NUQTALAR:
${topic.knowledgePack.keyPoints.map((k) => `- ${k}`).join('\n')}

MODDALAR VA MUDDATLAR:
${articlesText}

ATAMALAR:
${glossaryText}

O'QUVCHINING ZAIF NUQTALARI (2–4-bosqichlardan):
- Kartochkalardagi qiyin savollar: ${weakCards}
- Yozma/kazusdagi xatolar: ${weakWritten}
- Protsessual tartib xatolari: ${weakTimeline}

TAVSIYA ETILGAN OG'ZAKI SAVOLLAR:
${suggestedQuestions}`;
}

export async function generateAiTutorTextReply(
  topic: Topic,
  progress: TopicProgress | null,
  transcript: TranscriptTurn[],
  studentMessage: string
): Promise<string> {
  const systemInstruction = buildAiTutorSystemInstruction(topic, progress);
  const client = getGeminiClient();

  if (!client) {
    // Graceful local offline tutor simulation when GEMINI_API_KEY is not provided
    const turnCount = transcript.filter((t) => t.role === 'student').length;
    const nextQ =
      topic.aiQuestions[turnCount % Math.max(1, topic.aiQuestions.length)] ||
      "Ushbu mavzudagi asosiy qonun moddalaridan birini misol bilan tushuntirib bering.";
    const weakHint =
      progress?.weak.written?.[0] || progress?.weak.cards?.[0] || '';
    if (turnCount === 0) {
      return `Assalomu alaykum! «${topic.title}» mavzusi bo'yicha og'zaki suhbatni boshladik. Javobingiz qabul qilindi.${
        weakHint ? ` Ayniqsa «${weakHint}» nuqtasiga diqqat qilamiz.` : ''
      } Keyingi savol: ${nextQ}`;
    }
    return `Yaxshi harakat! Qonun normalariga tayangan holda fikringizni yanada aniqroq dalillashga intiling. Endi quyidagi savolga javob bering: ${nextQ}`;
  }

  const historyText = transcript
    .slice(-12)
    .map((t) => `${t.role === 'student' ? "O'quvchi" : 'AI Ustoz'}: ${t.text}`)
    .join('\n');

  const prompt = `${
    historyText ? `OLDINGI SUHBAT:\n${historyText}\n\n` : ''
  }O'quvchining yangi javobi: ${studentMessage}\n\nAI Huquqshunos Ustoz sifatida o'zbek tilida javob ber:`;

  return generateTextWithGemini(prompt, systemInstruction);
}

/**
 * Evaluates an oral AI Tutor transcript.
 * NEVER fabricates a fake score on error: returns null + errorMessage so the session
 * stays in `pending_evaluation` and can be re-evaluated later.
 */
export async function evaluateOralTranscript(
  topic: Topic,
  transcript: TranscriptTurn[]
): Promise<{ evaluation: AiTutorEvaluation | null; errorMessage?: string }> {
  const studentTurns = transcript.filter((t) => t.role === 'student' && t.text.trim().length > 0);
  if (studentTurns.length === 0) {
    return {
      evaluation: null,
      errorMessage: "Suhbatda o'quvchining javoblari qayd etilmagan. Baholash uchun kamida bitta javob bo'lishi kerak.",
    };
  }

  const client = getGeminiClient();
  if (!client) {
    return {
      evaluation: null,
      errorMessage:
        "GEMINI_API_KEY sozlanmaganligi sababli AI baholash vaqtincha amalga oshmadi. Kalit sozlangach «Hozir baholash» tugmasini bosing.",
    };
  }

  try {
    const prompt = buildOralEvaluationPrompt(
      topic.title,
      topic.knowledgePack.summary,
      transcript.map((t) => ({ role: t.role, text: t.text }))
    );
    const raw = await generateTextWithGemini(prompt);
    const evaluation = parseOralEvaluationResponse(raw);
    if (!evaluation) {
      return {
        evaluation: null,
        errorMessage: "AI baholash natijasi noto'g'ri formatda keldi. Qayta tekshirishni bosing.",
      };
    }
    return { evaluation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI bilan bog'lanishda xatolik yuz berdi.";
    return {
      evaluation: null,
      errorMessage: `Baholashda xatolik: ${msg}`,
    };
  }
}

export interface GeneratedTopicDraft {
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
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function buildOfflineDraftFromText(title: string, sourceText: string): GeneratedTopicDraft {
  const sentences = sourceText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18);

  const summary = sentences.slice(0, 4).join(' ') || sourceText.slice(0, 500);
  const keyPoints =
    sentences.slice(0, 5).length > 0
      ? sentences.slice(0, 5)
      : ["Asosiy qonun normalari va protsessual qoidalar tahlili."];

  const articleMatches = Array.from(
    sourceText.matchAll(/(\d{1,3}\s*[-–]?\s*modda[^.!?]{0,120})/gi)
  ).slice(0, 4);

  const articlesAndDeadlines =
    articleMatches.length > 0
      ? articleMatches.map((m, idx) => ({
          id: makeId(`ad${idx}`),
          codeOrLaw: title,
          articleOrPeriod: m[1].slice(0, 28).trim(),
          summary: m[1].trim(),
        }))
      : [
          {
            id: makeId('ad1'),
            codeOrLaw: title,
            articleOrPeriod: 'Asosiy norma',
            summary: keyPoints[0].slice(0, 180),
          },
        ];

  return {
    title,
    subtitle: `${title} — yuklangan matn asosida yaratilgan o'quv paketi`,
    estimatedMinutes: 30,
    knowledgePack: {
      summary,
      keyPoints,
      articlesAndDeadlines,
      glossary: [
        {
          id: makeId('gl1'),
          term: title.split(':')[0].trim(),
          definition: summary.slice(0, 220),
        },
      ],
    },
    flashcards: [
      {
        id: makeId('fc1'),
        category: 'articles',
        front: `«${title}» mavzusidagi asosiy norma nimani belgilaydi?`,
        back: articlesAndDeadlines[0].summary,
        articleRef: articlesAndDeadlines[0].articleOrPeriod,
      },
      {
        id: makeId('fc2'),
        category: 'terms',
        front: `«${title}» tushunchasining qisqacha yuridik mazmuni nima?`,
        back: summary.slice(0, 220),
      },
      {
        id: makeId('fc3'),
        category: 'organs',
        front: "Mazkur sohada qonun ijrosini nazorat qiluvchi asosiy davlat organlari qaysilar?",
        back: "Sud, prokuratura hamda tegishli ijro etuvchi vakolatli davlat organlari.",
      },
      {
        id: makeId('fc4'),
        category: 'subjects',
        front: "Ushbu huquqiy munosabatlarning asosiy subyektlari kimlar?",
        back: "Fuqarolar (jismoniy shaxslar), yuridik shaxslar va vakolatli davlat organlari.",
      },
    ],
    quizQuestions: [
      {
        id: makeId('qz1'),
        type: 'mcq',
        question: `«${title}» bo'yicha quyidagi qaysi fikr yuklangan manbaga mos keladi?`,
        options: [
          keyPoints[0].slice(0, 140),
          "Qonunchilikda bunday huquqiy tartibga solish nazarda tutilmagan",
          "Ushbu qoidalar faqat xorijiy fuqarolarga tatbiq etiladi",
          "Norma faqat og'zaki kelishuv bilan bekor qilinadi",
        ],
        correctIndex: 0,
        explanation: keyPoints[0],
      },
    ],
    processTask: {
      id: makeId('pt1'),
      title: `${title} — huquqiy jarayon bosqichlari`,
      instruction: "Bosqichlarni mantiqiy huquqiy ketma-ketlikda tartiblang.",
      steps: [
        "Huquqiy asos va faktik holatlarni aniqlash.",
        "Tegishli qonun moddasini tanlash va hujjatlarni rasmiylashtirish.",
        "Vakolatli organga murojaat qilish va ko'rib chiqish.",
        "Qabul qilingan qarorning ijrosini ta'minlash.",
      ],
      causeEffectQuestion: {
        question: "Huquqiy protsedura talablariga rioya qilinmasa qanday oqibat kelib chiqadi?",
        options: [
          "Qabul qilingan hujjat yoki harakat qonunga xilof deb topilishi mumkin",
          "Hech qanday huquqiy oqibat bo'lmaydi",
          "Muddat avtomatik ikki baravar uzayadi",
          "Jarima bekor qilinadi",
        ],
        correctIndex: 0,
        explanation: "Protsessual qoidalarning buzilishi qarorni haqiqiy emas deb topishga asos bo'ladi.",
      },
    },
    fullTestQuestions: [
      {
        id: makeId('ft1'),
        question: `«${title}» mavzusining asosiy mazmunini to'g'ri aks ettiruvchi javobni toping.`,
        options: [
          keyPoints[0].slice(0, 150),
          "Mazkur norma Konstitutsiyadan ustun turadi",
          "Mazkur qoidalar sud tomonidan qo'llanilmaydi",
          "Huquqiy oqibat faqat 25 yoshdan boshlanadi",
        ],
        correctIndex: 0,
        explanation: keyPoints[0],
        difficulty: 'medium',
      },
    ],
    writtenQuestions: [
      {
        id: makeId('wr1'),
        kind: 'factual',
        prompt: `«${title}» mavzusining eng muhim yuridik qoidasini o'z so'zingiz bilan izohlang.`,
        expectedAnswer: keyPoints[0],
        synonyms: [summary.slice(0, 160)],
      },
    ],
    aiQuestions: [
      `«${title}» mavzusidagi eng muhim qonun normasini hayotiy misol bilan tushuntiring.`,
      `Ushbu mavzudagi huquqiy qoida buzilganda qanday javobgarlik yoki himoya chorasi qo'llaniladi?`,
    ],
  };
}

/**
 * 2-Stage AI Generator for Teachers:
 * Stage 1: Knowledge Pack + 4-category Flashcards
 * Stage 2: Testology-compliant Quizzes, Process Task, Full Tests, Written/Cases + Synonyms, AI Oral Questions
 */
export async function generateTopicPackageFromSource(
  title: string,
  sourceText: string
): Promise<{ draft: GeneratedTopicDraft; usedGemini: boolean }> {
  const client = getGeminiClient();
  const trimmedSource = sourceText.slice(0, 28000);

  if (!client) {
    return { draft: buildOfflineDraftFromText(title, trimmedSource), usedGemini: false };
  }

  try {
    // STAGE 1: Knowledge pack + 4-category flashcards
    const stage1Prompt = `Sen O'zbekiston huquqshunoslik fani bo'yicha metodist va yurist-pedagogsan.
Quyidagi darslik/qonun matni asosida 1-BOSQICH o'quv paketini (konspekt, moddalar/muddatlar, lug'at va 4 toifali flashcardlar) faqat toza JSON obyekt sifatida tuz.
Hamma matn O'ZBEK TILIDA bo'lsin.

Mavzu nomi: "${title}"
JSON sxema:
{
  "subtitle": "qisqa tavsif",
  "estimatedMinutes": 35,
  "knowledgePack": {
    "summary": "4-6 jumlalik aniq yuridik konspekt",
    "keyPoints": ["muhim fakt 1", "muhim fakt 2", "muhim fakt 3", "muhim fakt 4", "muhim fakt 5"],
    "articlesAndDeadlines": [
      {"codeOrLaw": "Konstitutsiya/Kodeks", "articleOrPeriod": "28-modda / 3 yil", "summary": "qisqa mazmun"}
    ],
    "glossary": [
      {"term": "Atama", "definition": "Aniq yuridik ta'rif"}
    ]
  },
  "flashcards": [
    {"category": "articles|terms|organs|subjects", "front": "Savol", "back": "Javob", "articleRef": "Modda"}
  ]
}
Har bir toifadan (articles, terms, organs, subjects) kamida 2 tadan, jami 8–10 ta flashcard tuz.

MANBA MATN:
${trimmedSource}`;

    const stage1Raw = await generateTextWithGemini(stage1Prompt);
    const s1 = JSON.parse(extractJsonFromModelText(stage1Raw)) as {
      subtitle?: string;
      estimatedMinutes?: number;
      knowledgePack?: {
        summary?: string;
        keyPoints?: string[];
        articlesAndDeadlines?: Array<{ codeOrLaw: string; articleOrPeriod: string; summary: string }>;
        glossary?: Array<{ term: string; definition: string }>;
      };
      flashcards?: Array<{
        category: 'articles' | 'terms' | 'organs' | 'subjects';
        front: string;
        back: string;
        articleRef?: string;
      }>;
    };

    // STAGE 2: Quizzes, Process Task, Full Tests, Written/Case questions + Synonyms, AI Oral Questions
    const stage2Prompt = `Sen BMBA / Milliy sertifikat testologiya ekspertisan.
Quyidagi mavzu va 1-bosqich konspekti asosida 2-BOSQICH baholash topshiriqlarini faqat toza JSON obyekt sifatida tuz.
QOIDALAR:
- Testologiya qoidalariga rioya qil: distraktorlar (noto'g'ri variantlar) bir xil uzunlikda va ishonarli bo'lsin, bitta aniq to'g'ri javob bo'lsin.
- Yozma savollarda ham faktik, ham hayotiy yuridik kazuslar bo'lsin hamda synonyms massivi to'ldirilsin.
- Barcha kontent O'ZBEK TILIDA bo'lsin.

Mavzu: "${title}"
Konspekt: ${s1.knowledgePack?.summary || trimmedSource.slice(0, 2000)}

JSON sxema:
{
  "quizQuestions": [
    {"type": "mcq", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..."},
    {"type": "cloze", "question": "... _____ ...", "acceptedAnswers": ["javob1", "sinonim"], "explanation": "..."}
  ],
  "processTask": {
    "title": "Jarayon nomi",
    "instruction": "Ko'rsatma",
    "steps": ["1-bosqich", "2-bosqich", "3-bosqich", "4-bosqich"],
    "causeEffectQuestion": {
      "question": "Sabab-oqibat/kvalifikatsiya savoli",
      "options": ["A","B","C","D"],
      "correctIndex": 0,
      "explanation": "..."
    }
  },
  "fullTestQuestions": [
    {"question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "difficulty": "easy|medium|hard", "articleRef": "..."}
  ],
  "writtenQuestions": [
    {"kind": "factual|case", "prompt": "...", "expectedAnswer": "...", "synonyms": ["sinonim 1", "sinonim 2"], "keyPoints": ["kalit1", "kalit2"]}
  ],
  "aiQuestions": ["Og'zaki savol 1", "Og'zaki savol 2", "Og'zaki savol 3", "Og'zaki savol 4"]
}
Kamida 6 ta quiz (4 mcq + 2 cloze), 8 ta fullTestQuestions, 4 ta writtenQuestions (2 factual + 2 case) va 4 ta aiQuestions tuz.

MANBA MATN:
${trimmedSource.slice(0, 12000)}`;

    const stage2Raw = await generateTextWithGemini(stage2Prompt);
    const s2 = JSON.parse(extractJsonFromModelText(stage2Raw)) as {
      quizQuestions?: Array<Omit<QuizQuestion, 'id'>>;
      processTask?: Omit<ProcessSequenceTask, 'id'>;
      fullTestQuestions?: Array<Omit<FullTestQuestion, 'id'>>;
      writtenQuestions?: Array<Omit<WrittenCaseQuestion, 'id'>>;
      aiQuestions?: string[];
    };

    const offline = buildOfflineDraftFromText(title, trimmedSource);

    const draft: GeneratedTopicDraft = {
      title,
      subtitle: s1.subtitle || offline.subtitle,
      estimatedMinutes: Number(s1.estimatedMinutes) || 35,
      knowledgePack: {
        summary: s1.knowledgePack?.summary || offline.knowledgePack.summary,
        keyPoints: s1.knowledgePack?.keyPoints?.length
          ? s1.knowledgePack.keyPoints
          : offline.knowledgePack.keyPoints,
        articlesAndDeadlines: s1.knowledgePack?.articlesAndDeadlines?.length
          ? s1.knowledgePack.articlesAndDeadlines.map((a) => ({ ...a, id: makeId('ad') }))
          : offline.knowledgePack.articlesAndDeadlines,
        glossary: s1.knowledgePack?.glossary?.length
          ? s1.knowledgePack.glossary.map((g) => ({ ...g, id: makeId('gl') }))
          : offline.knowledgePack.glossary,
      },
      flashcards: s1.flashcards?.length
        ? s1.flashcards.map((f) => ({
            ...f,
            id: makeId('fc'),
            category: ['articles', 'terms', 'organs', 'subjects'].includes(f.category)
              ? f.category
              : 'terms',
          }))
        : offline.flashcards,
      quizQuestions: s2.quizQuestions?.length
        ? s2.quizQuestions.map((q) => ({ ...q, id: makeId('qz') }))
        : offline.quizQuestions,
      processTask: s2.processTask?.steps?.length
        ? { ...s2.processTask, id: makeId('pt') }
        : offline.processTask,
      fullTestQuestions: s2.fullTestQuestions?.length
        ? s2.fullTestQuestions.map((q) => ({ ...q, id: makeId('ft') }))
        : offline.fullTestQuestions,
      writtenQuestions: s2.writtenQuestions?.length
        ? s2.writtenQuestions.map((w) => ({
            ...w,
            id: makeId('wr'),
            synonyms: Array.isArray(w.synonyms) ? w.synonyms : [],
          }))
        : offline.writtenQuestions,
      aiQuestions: s2.aiQuestions?.length ? s2.aiQuestions : offline.aiQuestions,
    };

    return { draft, usedGemini: true };
  } catch {
    return { draft: buildOfflineDraftFromText(title, trimmedSource), usedGemini: false };
  }
}
