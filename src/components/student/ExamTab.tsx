import { useEffect, useState } from 'react';
import {
  Award,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  ShieldCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { FullTestQuestion, TargetGrade } from '@shared/types';
import { TARGET_GRADE_THRESHOLDS } from '@shared/utils';
import { api, type EnrichedInterimExam, type EnrichedTextbook } from '@/lib/api';

interface ExamTabProps {
  textbooks: EnrichedTextbook[];
  activeInterimExam: EnrichedInterimExam | null;
  onClearActiveInterimExam: () => void;
  onInterimExamPassed: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

type SimulatorQuestion = FullTestQuestion & {
  topicTitle: string;
  branch?: string;
};

function computeGradeBadge(score: number): TargetGrade | 'Qoniqarsiz' {
  if (score >= TARGET_GRADE_THRESHOLDS['A+']) return 'A+';
  if (score >= TARGET_GRADE_THRESHOLDS.A) return 'A';
  if (score >= TARGET_GRADE_THRESHOLDS['B+']) return 'B+';
  if (score >= TARGET_GRADE_THRESHOLDS.B) return 'B';
  if (score >= TARGET_GRADE_THRESHOLDS['C+']) return 'C+';
  if (score >= TARGET_GRADE_THRESHOLDS.C) return 'C';
  return 'Qoniqarsiz';
}

export function ExamTab({
  textbooks,
  activeInterimExam,
  onClearActiveInterimExam,
  onInterimExamPassed,
  onToast,
}: ExamTabProps) {
  const [questionCount, setQuestionCount] = useState<20 | 25 | 30>(25);
  const [mode, setMode] = useState<'hub' | 'simulator' | 'interim'>('hub');
  const [loading, setLoading] = useState(false);

  const [examTitle, setExamTitle] = useState('');
  const [passingScore, setPassingScore] = useState<number>(60);
  const [currentInterimId, setCurrentInterimId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SimulatorQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submittedResult, setSubmittedResult] = useState<{
    score: number;
    correctCount: number;
    total: number;
    passed?: boolean;
    details: Record<string, { correctIndex: number; isCorrect: boolean; explanation: string }>;
  } | null>(null);

  const startInterim = async (exam: EnrichedInterimExam) => {
    try {
      setLoading(true);
      const res = await api.getInterimExamQuestions(exam.id);
      if (res.questions.length === 0) {
        onToast('error', "Ushbu oraliq imtihonda hozircha savollar yo'q.");
        return;
      }
      setExamTitle(exam.title);
      setPassingScore(exam.passingScore);
      setCurrentInterimId(exam.id);
      setQuestions(res.questions);
      setAnswers({});
      setCurrentIdx(0);
      setSecondsLeft(exam.durationMinutes * 60);
      setSubmittedResult(null);
      setMode('interim');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Oraliq imtihonni yuklashda xatolik.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeInterimExam) {
      void startInterim(activeInterimExam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInterimExam]);

  useEffect(() => {
    if (mode === 'hub' || submittedResult || secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [mode, submittedResult, secondsLeft]);

  const startSimulator = async () => {
    try {
      setLoading(true);
      const res = await api.getSimulatorExam(questionCount);
      if (res.questions.length === 0) {
        onToast('error', "Simulyator uchun savollar topilmadi.");
        return;
      }
      setExamTitle(res.title);
      setPassingScore(60);
      setCurrentInterimId(null);
      setQuestions(res.questions);
      setAnswers({});
      setCurrentIdx(0);
      setSecondsLeft(res.durationMinutes * 60);
      setSubmittedResult(null);
      setMode('simulator');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Simulyatorni boshlashda xatolik.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitExam = async () => {
    if (mode === 'interim' && currentInterimId) {
      try {
        setLoading(true);
        const payload = questions.map((q) => ({
          questionId: q.id,
          selectedIndex: answers[q.id] ?? -1,
        }));
        const res = await api.submitInterimExam(currentInterimId, payload);
        const detailMap: Record<
          string,
          { correctIndex: number; isCorrect: boolean; explanation: string }
        > = {};
        for (const d of res.details) {
          detailMap[d.questionId] = {
            correctIndex: d.correctIndex,
            isCorrect: d.isCorrect,
            explanation: d.explanation,
          };
        }
        setSubmittedResult({
          score: res.attempt.score,
          correctCount: res.attempt.correctCount,
          total: res.attempt.totalQuestions,
          passed: res.attempt.passed,
          details: detailMap,
        });
        if (res.attempt.passed) {
          onToast('success', "Tabriklaymiz! Oraliq imtihondan o'tdingiz va keyingi darslar ochildi!");
          onInterimExamPassed();
        } else {
          onToast(
            'info',
            `Natija: ${res.attempt.score}%. O'tish uchun kamida ${res.passingScore}% kerak.`
          );
        }
      } catch (err) {
        onToast('error', err instanceof Error ? err.message : 'Imtihonni yakunlashda xatolik.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Simulator local grading
    let correctCount = 0;
    const detailMap: Record<
      string,
      { correctIndex: number; isCorrect: boolean; explanation: string }
    > = {};
    for (const q of questions) {
      const sel = answers[q.id] ?? -1;
      const ok = sel === q.correctIndex;
      if (ok) correctCount++;
      detailMap[q.id] = {
        correctIndex: q.correctIndex,
        isCorrect: ok,
        explanation: q.explanation,
      };
    }
    const score = Math.round((correctCount / Math.max(1, questions.length)) * 100);
    setSubmittedResult({
      score,
      correctCount,
      total: questions.length,
      details: detailMap,
    });
  };

  const exitToHub = () => {
    setMode('hub');
    setSubmittedResult(null);
    onClearActiveInterimExam();
  };

  const allInterimExams = textbooks.flatMap((tb) =>
    tb.interimExams.map((ex) => ({ ...ex, textbookTitle: tb.title }))
  );

  if (mode !== 'hub') {
    const q = questions[currentIdx];
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="space-y-5">
        {/* Top Bar */}
        <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              {mode === 'interim' ? 'Oraliq Imtihon' : 'Milliy Sertifikat Simulyatori'}
            </p>
            <h2 className="text-base sm:text-lg font-extrabold text-white">{examTitle}</h2>
          </div>

          <div className="flex items-center gap-2.5">
            {!submittedResult && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-bold text-amber-300 tabular-nums">
                <Clock className="h-4 w-4" />
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
            )}
            <button
              type="button"
              onClick={exitToHub}
              className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
            >
              Chiqish
            </button>
          </div>
        </div>

        {/* Submitted Summary Banner */}
        {submittedResult && (
          <div
            className={`rounded-3xl border p-5 sm:p-6 space-y-3 ${
              submittedResult.score >= passingScore
                ? 'border-emerald-500/40 bg-emerald-950/40'
                : 'border-rose-500/40 bg-rose-950/35'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Yakuniy natija
                </p>
                <p className="text-3xl font-extrabold text-white mt-1">
                  {submittedResult.score}% ({submittedResult.correctCount}/{submittedResult.total})
                </p>
                <p className="text-sm text-slate-200 mt-1">
                  Taxminiy Milliy sertifikat darajasi:{' '}
                  <strong className="text-amber-300">
                    {computeGradeBadge(submittedResult.score)}
                  </strong>
                  {mode === 'interim' && (
                    <span className="ml-2">
                      •{' '}
                      {submittedResult.passed
                        ? "O'tdi — keyingi darslar ochildi!"
                        : `O'tish bali: ${passingScore}%`}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={exitToHub}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Imtihonlar ro&apos;yxatiga qaytish
              </button>
            </div>
          </div>
        )}

        {/* Question Navigator */}
        <div className="glass-card rounded-2xl p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {questions.map((item, idx) => {
              const isSelected = idx === currentIdx;
              const isAnswered = answers[item.id] !== undefined;
              const det = submittedResult?.details[item.id];
              let cls = 'bg-slate-900 border-slate-800 text-slate-400';
              if (det) {
                cls = det.isCorrect
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-200';
              } else if (isSelected) {
                cls = 'bg-indigo-600 border-indigo-400 text-white';
              } else if (isAnswered) {
                cls = 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200';
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`h-9 w-9 rounded-lg border text-xs font-bold transition ${cls}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Question */}
        {q && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                Savol {currentIdx + 1} / {questions.length}
              </span>
              <span className="text-indigo-300 font-medium">{q.topicTitle}</span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white leading-relaxed">
              {q.question}
            </h3>

            <div className="space-y-2.5">
              {q.options.map((opt, oIdx) => {
                const chosen = answers[q.id] === oIdx;
                const det = submittedResult?.details[q.id];
                let style = 'border-slate-800 bg-slate-900/70 hover:border-slate-700 text-slate-200';
                if (det) {
                  if (oIdx === det.correctIndex) {
                    style = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100';
                  } else if (chosen && !det.isCorrect) {
                    style = 'border-rose-500/60 bg-rose-500/15 text-rose-100';
                  }
                } else if (chosen) {
                  style = 'border-indigo-400 bg-indigo-500/25 text-white';
                }

                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={Boolean(submittedResult)}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                    className={`w-full min-h-[48px] text-left rounded-2xl border px-4 py-3 text-sm font-medium transition flex items-center justify-between gap-3 ${style}`}
                  >
                    <span>
                      <strong className="mr-2 text-indigo-300">
                        {String.fromCharCode(65 + oIdx)}.
                      </strong>
                      {opt}
                    </span>
                    {det && oIdx === det.correctIndex && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    )}
                    {det && chosen && !det.isCorrect && (
                      <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {submittedResult?.details[q.id]?.explanation && (
              <div className="rounded-2xl bg-slate-900/90 border border-indigo-500/25 p-4 text-xs sm:text-sm text-slate-200 leading-relaxed">
                <strong className="text-amber-300">Izoh: </strong>
                {submittedResult.details[q.id].explanation}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Oldingi
              </button>

              <div className="flex items-center gap-2">
                {currentIdx < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Keyingi
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : null}

                {!submittedResult && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleSubmitExam}
                    className="min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-5 py-2 text-sm font-bold text-white shadow-lg"
                  >
                    Yakunlash ({answeredCount}/{questions.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mixed Simulator Card */}
      <section className="glass-accent rounded-3xl p-5 sm:p-7 space-y-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-500 shadow-lg">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
              BMBA / TDYU / Milliy Sertifikat
            </p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
              Aralash Imtihon Simulyatori
            </h2>
            <p className="text-sm text-slate-200/90 mt-1 leading-relaxed">
              Barcha ochiq va guruh darsliklaringizdagi Konstitutsiya, Fuqarolik, Jinoyat va Mehnat
              huquqi savollaridan tuzilgan real imtihon muhiti.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Savollar soni:</span>
            {([20, 25, 30] as const).map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setQuestionCount(cnt)}
                className={`min-h-[40px] rounded-xl px-3.5 text-sm font-bold border transition ${
                  questionCount === cnt
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300'
                }`}
              >
                {cnt} ta
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={startSimulator}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition"
          >
            <Play className="h-4 w-4 fill-current" />
            {loading ? 'Yuklanmoqda...' : 'Simulyatorni boshlash'}
          </button>
        </div>
      </section>

      {/* Interim Exams List */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-400" />
          Darsliklardagi Oraliq Imtihonlar
        </h3>

        {allInterimExams.length === 0 ? (
          <p className="text-sm text-slate-400">Hozircha oraliq imtihonlar belgilanmagan.</p>
        ) : (
          <div className="space-y-3">
            {allInterimExams.map((ex) => (
              <div
                key={ex.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-xs font-semibold text-indigo-300">{ex.textbookTitle}</p>
                  <p className="text-sm sm:text-base font-bold text-white mt-0.5">{ex.title}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {ex.questionCount} savol • {ex.durationMinutes} daqiqa • O&apos;tish bali:{' '}
                    {ex.passingScore}%
                    {ex.bestScore >= 0 && (
                      <span className="ml-2 font-bold text-emerald-300">
                        • Eng yaxshi: {ex.bestScore}%
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => startInterim(ex)}
                  className={`min-h-[44px] shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    ex.passed
                      ? 'bg-emerald-600/80 hover:bg-emerald-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {ex.passed ? 'Qayta topshirish' : 'Topshirish'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
