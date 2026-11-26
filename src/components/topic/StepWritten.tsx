import { useEffect, useState } from 'react';
import { PenTool, CheckCircle2, XCircle, Sparkles, Scale, RotateCcw } from 'lucide-react';
import type { Topic, TopicProgress, WrittenAnswerResult } from '@shared/types';
import { api } from '@/lib/api';

interface StepWrittenProps {
  topic: Topic;
  progress: TopicProgress | null;
  onGraded: (progress: TopicProgress) => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

/**
 * Step 4 — Yozma va Kazuslar:
 * - Clean vertical top-to-bottom list (zero horizontal scroll, no clutter hint blocks)
 * - Fast local + parallel Gemini AI semantic grading (accepts synonyms & Latin/Cyrillic)
 * - Never auto-jumps to Step 5 after grading so student reads all feedback carefully
 */
export function StepWritten({ topic, progress, onGraded, onToast }: StepWrittenProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<WrittenAnswerResult[]>(progress?.writtenResults || []);
  const [score, setScore] = useState<number | null>(progress?.writtenScore ?? null);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    if (progress?.writtenResults?.length) {
      for (const r of progress.writtenResults) {
        initial[r.questionId] = r.studentAnswer;
      }
      setResults(progress.writtenResults);
      setScore(progress.writtenScore);
    } else {
      setResults([]);
      setScore(null);
    }
    setAnswers(initial);
  }, [topic.id, progress]);

  const resultById = new Map(results.map((r) => [r.questionId, r]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGrading(true);
      const payload = topic.writtenQuestions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] || '',
      }));
      const res = await api.gradeWrittenAnswers(topic.id, payload);
      setResults(res.results);
      setScore(res.writtenScore);
      onGraded(res.progress);
      onToast(
        'success',
        `Yozma va kazuslar tekshirildi: ${res.writtenScore}%. Barcha izohlarni diqqat bilan o'qib chiqing.`
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Tekshirishda xatolik yuz berdi.');
    } finally {
      setGrading(false);
    }
  };

  const handleReset = () => {
    setResults([]);
    setScore(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header summary */}
      <div className="glass-panel rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30">
            <PenTool className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">Yozma savollar va yuridik kazuslar</h2>
            <p className="text-xs text-slate-400">
              Lotin yoki Kirill alifbosida o&apos;z so&apos;zingiz bilan yozing — AI ma&apos;no va
              sinonimlarni inobatga oladi
            </p>
          </div>
        </div>

        {score !== null && (
          <div className="rounded-2xl bg-indigo-500/20 border border-indigo-400/35 px-4 py-2 text-right">
            <p className="text-[11px] font-semibold text-indigo-200">Jami natija</p>
            <p className="text-xl font-extrabold text-white">{score}%</p>
          </div>
        )}
      </div>

      {/* Vertical top-to-bottom question list */}
      <div className="space-y-4">
        {topic.writtenQuestions.map((q, idx) => {
          const res = resultById.get(q.id);
          return (
            <div
              key={q.id}
              className={`glass-card rounded-2xl p-4 sm:p-5 space-y-3 border ${
                res
                  ? res.isCorrect
                    ? 'border-emerald-500/40'
                    : 'border-rose-500/40'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-extrabold text-indigo-300">
                    {idx + 1}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      q.kind === 'case'
                        ? 'bg-amber-500/15 text-amber-200 border border-amber-400/25'
                        : 'bg-indigo-500/15 text-indigo-200 border border-indigo-400/25'
                    }`}
                  >
                    {q.kind === 'case' ? (
                      <>
                        <Scale className="h-3 w-3" /> Yuridik kazus
                      </>
                    ) : (
                      'Faktik savol'
                    )}
                  </span>
                </div>

                {res && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-extrabold ${
                      res.isCorrect ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {res.isCorrect ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {res.score}% {res.gradedBy === 'ai' ? '• AI bahosi' : ''}
                  </span>
                )}
              </div>

              <p className="text-sm sm:text-base font-bold text-white leading-relaxed">{q.prompt}</p>

              <textarea
                rows={q.kind === 'case' ? 4 : 2}
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Javobingizni shu yerga yozing..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900/85 px-4 py-3 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none resize-y"
              />

              {res && (
                <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-2 text-xs sm:text-sm">
                  <p className={res.isCorrect ? 'text-emerald-200' : 'text-rose-200'}>
                    <strong>Baholash izohi: </strong>
                    {res.feedback}
                  </p>
                  <p className="text-slate-300">
                    <strong className="text-amber-300">Kalit huquqiy javob: </strong>
                    {res.expectedAnswer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {results.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[46px] inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Qayta tahrirlash
          </button>
        )}

        <button
          type="submit"
          disabled={grading}
          className="min-h-[48px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 disabled:opacity-60 transition"
        >
          <Sparkles className="h-4 w-4" />
          {grading ? 'AI semantik tekshirmoqda...' : 'AI bilan tekshirish'}
        </button>
      </div>
    </form>
  );
}
