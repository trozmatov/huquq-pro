import { useEffect, useState } from 'react';
import {
  Zap,
  GitBranch,
  FileCheck2,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type { Topic, TopicProgress } from '@shared/types';
import { isUzbekAnswerMatch } from '@shared/utils';

interface StepTestsProps {
  topic: Topic;
  progress: TopicProgress | null;
  onSaveProgress: (patch: {
    quizScore?: number;
    processScore?: number;
    fullTestScore?: number;
    weak?: { timeline?: string[] };
  }) => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function StepTests({ topic, progress, onSaveProgress, onToast }: StepTestsProps) {
  const [subTab, setSubTab] = useState<'quiz' | 'process' | 'full'>('quiz');

  // ==================== 1. QUICK QUIZ (MCQ + CLOZE) ====================
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number | string>>({});
  const [quizChecked, setQuizChecked] = useState(false);

  const handleCheckQuiz = async () => {
    let correct = 0;
    for (const q of topic.quizQuestions) {
      const ans = quizAnswers[q.id];
      if (q.type === 'mcq') {
        if (ans === q.correctIndex) correct++;
      } else {
        if (typeof ans === 'string' && isUzbekAnswerMatch(ans, q.acceptedAnswers || [])) {
          correct++;
        }
      }
    }
    const score = Math.round((correct / Math.max(1, topic.quizQuestions.length)) * 100);
    setQuizChecked(true);
    await onSaveProgress({ quizScore: score });
    onToast('success', `Tezkor mashq natijasi saqlandi: ${score}% (${correct}/${topic.quizQuestions.length})`);
  };

  // ==================== 2. PROCESS SEQUENCE & CAUSE-EFFECT ====================
  const [orderedSteps, setOrderedSteps] = useState<string[]>([]);
  const [causeChoice, setCauseChoice] = useState<number | null>(null);
  const [processChecked, setProcessChecked] = useState(false);
  const [processResultScore, setProcessResultScore] = useState<number | null>(null);

  const initShuffledSteps = () => {
    const steps = [...topic.processTask.steps];
    // Deterministic-safe shuffle ensuring not already completely sorted if length > 2
    for (let i = steps.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [steps[i], steps[j]] = [steps[j], steps[i]];
    }
    if (steps.length > 2 && steps.every((s, idx) => s === topic.processTask.steps[idx])) {
      [steps[0], steps[1]] = [steps[1], steps[0]];
    }
    setOrderedSteps(steps);
    setCauseChoice(null);
    setProcessChecked(false);
    setProcessResultScore(null);
  };

  useEffect(() => {
    initShuffledSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= orderedSteps.length) return;
    const copy = [...orderedSteps];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setOrderedSteps(copy);
  };

  const handleCheckProcess = async () => {
    const correctPositions = orderedSteps.filter(
      (s, idx) => s === topic.processTask.steps[idx]
    ).length;
    const orderPart = (correctPositions / Math.max(1, topic.processTask.steps.length)) * 70;
    const causeOk = causeChoice === topic.processTask.causeEffectQuestion.correctIndex;
    const totalScore = Math.round(orderPart + (causeOk ? 30 : 0));
    setProcessChecked(true);
    setProcessResultScore(totalScore);

    const timelineWeak =
      totalScore < 100
        ? [`${topic.processTask.title} (${totalScore}%)`]
        : undefined;
    await onSaveProgress({
      processScore: totalScore,
      ...(timelineWeak ? { weak: { timeline: timelineWeak } } : {}),
    });
    onToast('success', `Protsessual tartib natijasi: ${totalScore}%`);
  };

  // ==================== 3. FULL TEST (BMBA / MILLIY SERTIFIKAT) ====================
  const [fullAnswers, setFullAnswers] = useState<Record<string, number>>({});
  const [fullIdx, setFullIdx] = useState(0);
  const [fullSubmitted, setFullSubmitted] = useState(false);
  const [fullTimerSec, setFullTimerSec] = useState(() => Math.max(10, topic.fullTestQuestions.length) * 60);

  useEffect(() => {
    setFullAnswers({});
    setFullIdx(0);
    setFullSubmitted(false);
    setFullTimerSec(Math.max(10, topic.fullTestQuestions.length) * 60);
  }, [topic.id, topic.fullTestQuestions.length]);

  useEffect(() => {
    if (subTab !== 'full' || fullSubmitted || fullTimerSec <= 0) return;
    const id = setInterval(() => setFullTimerSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [subTab, fullSubmitted, fullTimerSec]);

  const handleFinishFullTest = async () => {
    let correct = 0;
    for (const q of topic.fullTestQuestions) {
      if (fullAnswers[q.id] === q.correctIndex) correct++;
    }
    const score = Math.round((correct / Math.max(1, topic.fullTestQuestions.length)) * 100);
    setFullSubmitted(true);
    await onSaveProgress({ fullTestScore: score });
    onToast(
      'success',
      `Imtihon testi yakunlandi: ${score}% (${correct}/${topic.fullTestQuestions.length})`
    );
  };

  const activeFullQ = topic.fullTestQuestions[fullIdx];
  const mins = Math.floor(fullTimerSec / 60);
  const secs = fullTimerSec % 60;

  return (
    <div className="space-y-5">
      {/* 3 Sub-mode tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setSubTab('quiz')}
          className={`min-h-[46px] flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            subTab === 'quiz'
              ? 'border-indigo-400 bg-indigo-600/25 text-white'
              : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="h-4 w-4 text-amber-300" />
          Tezkor Mashq ({progress?.quizScore !== null && progress?.quizScore !== undefined ? `${progress.quizScore}%` : `${topic.quizQuestions.length}`})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('process')}
          className={`min-h-[46px] flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            subTab === 'process'
              ? 'border-violet-400 bg-violet-600/25 text-white'
              : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-white'
          }`}
        >
          <GitBranch className="h-4 w-4 text-violet-300" />
          Protsessual Tartib {progress?.processScore !== null && progress?.processScore !== undefined ? `(${progress.processScore}%)` : ''}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('full')}
          className={`min-h-[46px] flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            subTab === 'full'
              ? 'border-amber-400 bg-amber-500/20 text-white'
              : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-white'
          }`}
        >
          <FileCheck2 className="h-4 w-4 text-emerald-300" />
          Imtihon Testi ({progress?.fullTestScore !== null && progress?.fullTestScore !== undefined ? `${progress.fullTestScore}%` : `${topic.fullTestQuestions.length}`})
        </button>
      </div>

      {/* MODE 1: QUICK QUIZ */}
      {subTab === 'quiz' && (
        <div className="space-y-4">
          {topic.quizQuestions.map((q, idx) => {
            const ans = quizAnswers[q.id];
            const isCorrect =
              q.type === 'mcq'
                ? ans === q.correctIndex
                : typeof ans === 'string' && isUzbekAnswerMatch(ans, q.acceptedAnswers || []);

            return (
              <div
                key={q.id}
                className="glass-card rounded-2xl p-4 sm:p-5 space-y-3 border border-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-300">
                    {idx + 1}-savol • {q.type === 'cloze' ? "Bo'shliqni to'ldiring" : 'Test'}
                  </span>
                  {quizChecked &&
                    (isCorrect ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> To&apos;g&apos;ri
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-300">
                        <XCircle className="h-4 w-4" /> Xato
                      </span>
                    ))}
                </div>

                <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
                  {q.question}
                </p>

                {q.type === 'mcq' && q.options ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, oIdx) => {
                      const chosen = ans === oIdx;
                      let cls =
                        'border-slate-800 bg-slate-900/75 text-slate-200 hover:border-slate-700';
                      if (quizChecked) {
                        if (oIdx === q.correctIndex) {
                          cls = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100';
                        } else if (chosen && oIdx !== q.correctIndex) {
                          cls = 'border-rose-500/60 bg-rose-500/15 text-rose-100';
                        }
                      } else if (chosen) {
                        cls = 'border-indigo-400 bg-indigo-500/25 text-white';
                      }
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={quizChecked}
                          onClick={() => setQuizAnswers((p) => ({ ...p, [q.id]: oIdx }))}
                          className={`min-h-[46px] text-left rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-medium transition ${cls}`}
                        >
                          <strong className="mr-1.5 text-indigo-300">
                            {String.fromCharCode(65 + oIdx)}.
                          </strong>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      disabled={quizChecked}
                      value={typeof ans === 'string' ? ans : ''}
                      onChange={(e) => setQuizAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                      placeholder="Javobni kiriting (Lotin yoki Kirill)..."
                      className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-base sm:text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                    {quizChecked && !isCorrect && q.acceptedAnswers && (
                      <p className="text-xs text-emerald-300">
                        To&apos;g&apos;ri javob: <strong>{q.acceptedAnswers[0]}</strong>
                      </p>
                    )}
                  </div>
                )}

                {quizChecked && q.explanation && (
                  <p className="rounded-xl bg-slate-950/75 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-300 leading-relaxed">
                    <strong className="text-amber-300">Izoh: </strong>
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap justify-end gap-3">
            {quizChecked && (
              <button
                type="button"
                onClick={() => {
                  setQuizAnswers({});
                  setQuizChecked(false);
                }}
                className="min-h-[46px] inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
                Qayta ishlash
              </button>
            )}
            {!quizChecked && (
              <button
                type="button"
                onClick={handleCheckQuiz}
                className="min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30"
              >
                Tezkor mashqni tekshirish
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: PROCESS SEQUENCE & CAUSE-EFFECT */}
      {subTab === 'process' && (
        <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-white">
              {topic.processTask.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              {topic.processTask.instruction}
            </p>
          </div>

          <div className="space-y-2.5">
            {orderedSteps.map((stepText, idx) => {
              const isRightPos = processChecked && stepText === topic.processTask.steps[idx];
              const isWrongPos = processChecked && !isRightPos;
              return (
                <div
                  key={`${idx}-${stepText.slice(0, 16)}`}
                  className={`rounded-2xl border p-3.5 flex items-center gap-3 transition ${
                    isRightPos
                      ? 'border-emerald-500/50 bg-emerald-500/15'
                      : isWrongPos
                        ? 'border-rose-500/50 bg-rose-500/15'
                        : 'border-slate-800 bg-slate-900/80'
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-xs font-extrabold text-indigo-300">
                    {idx + 1}
                  </span>
                  <p className="text-xs sm:text-sm text-slate-100 flex-1 leading-relaxed">
                    {stepText}
                  </p>
                  {!processChecked && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, -1)}
                        aria-label="Yuqoriga surish"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 disabled:opacity-35"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedSteps.length - 1}
                        onClick={() => moveStep(idx, 1)}
                        aria-label="Pastga surish"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 disabled:opacity-35"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {processChecked && (
            <div className="rounded-2xl bg-slate-950/75 border border-indigo-500/25 p-4 space-y-1.5">
              <p className="text-xs font-bold uppercase text-emerald-300">
                To&apos;g&apos;ri protsessual tartib:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300">
                {topic.processTask.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Cause-effect / qualification question */}
          <div className="border-t border-slate-800 pt-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Sabab-oqibat va huquqiy kvalifikatsiya
            </p>
            <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
              {topic.processTask.causeEffectQuestion.question}
            </p>
            <div className="space-y-2">
              {topic.processTask.causeEffectQuestion.options.map((opt, oIdx) => {
                const chosen = causeChoice === oIdx;
                const correctIdx = topic.processTask.causeEffectQuestion.correctIndex;
                let cls = 'border-slate-800 bg-slate-900/75 text-slate-200 hover:border-slate-700';
                if (processChecked) {
                  if (oIdx === correctIdx) {
                    cls = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100';
                  } else if (chosen && oIdx !== correctIdx) {
                    cls = 'border-rose-500/60 bg-rose-500/15 text-rose-100';
                  }
                } else if (chosen) {
                  cls = 'border-violet-400 bg-violet-500/25 text-white';
                }
                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={processChecked}
                    onClick={() => setCauseChoice(oIdx)}
                    className={`w-full min-h-[46px] text-left rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium transition ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {processChecked && (
              <p className="rounded-xl bg-slate-950/75 border border-slate-800 p-3 text-xs text-slate-300">
                <strong className="text-amber-300">Izoh: </strong>
                {topic.processTask.causeEffectQuestion.explanation}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {processResultScore !== null ? (
              <span className="text-sm font-extrabold text-amber-300">
                Natija: {processResultScore}%
              </span>
            ) : (
              <span />
            )}
            {processChecked ? (
              <button
                type="button"
                onClick={initShuffledSteps}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Qayta mashq qilish
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckProcess}
                className="min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 text-sm font-bold text-white shadow-lg"
              >
                Tartib va javobni tekshirish
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODE 3: FULL TEST */}
      {subTab === 'full' && activeFullQ && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {topic.fullTestQuestions.map((q, idx) => {
                const answered = fullAnswers[q.id] !== undefined;
                const isCurrent = idx === fullIdx;
                let cls = 'bg-slate-900 border-slate-800 text-slate-400';
                if (fullSubmitted) {
                  cls =
                    fullAnswers[q.id] === q.correctIndex
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-500/20 border-rose-500/50 text-rose-200';
                } else if (isCurrent) {
                  cls = 'bg-indigo-600 border-indigo-400 text-white';
                } else if (answered) {
                  cls = 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200';
                }
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setFullIdx(idx)}
                    className={`h-9 w-9 rounded-lg border text-xs font-bold transition ${cls}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-bold text-amber-300 tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>

          <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Savol {fullIdx + 1} / {topic.fullTestQuestions.length}
              </span>
              {activeFullQ.articleRef && (
                <span className="text-amber-300 font-semibold">{activeFullQ.articleRef}</span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white leading-relaxed">
              {activeFullQ.question}
            </h3>

            <div className="space-y-2.5">
              {activeFullQ.options.map((opt, oIdx) => {
                const chosen = fullAnswers[activeFullQ.id] === oIdx;
                let cls = 'border-slate-800 bg-slate-900/75 text-slate-200 hover:border-slate-700';
                if (fullSubmitted) {
                  if (oIdx === activeFullQ.correctIndex) {
                    cls = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100';
                  } else if (chosen && oIdx !== activeFullQ.correctIndex) {
                    cls = 'border-rose-500/60 bg-rose-500/15 text-rose-100';
                  }
                } else if (chosen) {
                  cls = 'border-indigo-400 bg-indigo-500/25 text-white';
                }

                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={fullSubmitted}
                    onClick={() =>
                      setFullAnswers((prev) => ({ ...prev, [activeFullQ.id]: oIdx }))
                    }
                    className={`w-full min-h-[48px] text-left rounded-2xl border px-4 py-3 text-sm font-medium transition ${cls}`}
                  >
                    <strong className="mr-2 text-indigo-300">
                      {String.fromCharCode(65 + oIdx)}.
                    </strong>
                    {opt}
                  </button>
                );
              })}
            </div>

            {fullSubmitted && activeFullQ.explanation && (
              <div className="rounded-2xl bg-slate-950/80 border border-indigo-500/25 p-4 text-xs sm:text-sm text-slate-200 leading-relaxed">
                <strong className="text-amber-300">Yuridik tushuntirish: </strong>
                {activeFullQ.explanation}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={fullIdx === 0}
                onClick={() => setFullIdx((i) => Math.max(0, i - 1))}
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
              >
                Oldingi
              </button>

              <div className="flex items-center gap-2">
                {fullIdx < topic.fullTestQuestions.length - 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setFullIdx((i) => Math.min(topic.fullTestQuestions.length - 1, i + 1))
                    }
                    className="min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Keyingi
                  </button>
                )}

                {!fullSubmitted ? (
                  <button
                    type="button"
                    onClick={handleFinishFullTest}
                    className="min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2 text-sm font-bold text-slate-950"
                  >
                    Testni yakunlash ({Object.keys(fullAnswers).length}/{topic.fullTestQuestions.length})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFullAnswers({});
                      setFullSubmitted(false);
                      setFullIdx(0);
                      setFullTimerSec(Math.max(10, topic.fullTestQuestions.length) * 60);
                    }}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-bold text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Qayta ishlash
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
