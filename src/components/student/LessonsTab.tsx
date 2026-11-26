import { useMemo, useState } from 'react';
import {
  Search,
  Lock,
  CheckCircle2,
  BookOpen,
  ShieldAlert,
  ChevronRight,
  Clock,
  Users,
  Globe,
} from 'lucide-react';
import type { ExamDateItem, TopicProgress, UserProfile } from '@shared/types';
import type { EnrichedInterimExam, EnrichedTextbook } from '@/lib/api';
import { CountdownRoadmap } from './CountdownRoadmap';

interface LessonsTabProps {
  user: UserProfile;
  examDates: ExamDateItem[];
  textbooks: EnrichedTextbook[];
  progressMap: Record<string, TopicProgress>;
  onEditGoal: () => void;
  onOpenTopic: (topicId: string) => void;
  onStartInterimExam: (exam: EnrichedInterimExam) => void;
  onOpenExamTab: () => void;
}

export function LessonsTab({
  user,
  examDates,
  textbooks,
  progressMap,
  onEditGoal,
  onOpenTopic,
  onStartInterimExam,
  onOpenExamTab,
}: LessonsTabProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'public' | 'group'>('all');

  const filteredTextbooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return textbooks
      .filter((tb) => {
        if (filter === 'public') return tb.isPublic;
        if (filter === 'group') return !tb.isPublic;
        return true;
      })
      .map((tb) => {
        if (!q) return tb;
        const tbMatches =
          tb.title.toLowerCase().includes(q) ||
          tb.branch.toLowerCase().includes(q) ||
          tb.description.toLowerCase().includes(q);
        // Preserve original topic.order numbers even when searching!
        const matchingTopics = tbMatches
          ? tb.topics
          : tb.topics.filter(
              (t) =>
                t.title.toLowerCase().includes(q) ||
                t.subtitle.toLowerCase().includes(q) ||
                String(t.order) === q
            );
        return { ...tb, topics: matchingTopics };
      })
      .filter((tb) => tb.topics.length > 0 || !q);
  }, [textbooks, search, filter]);

  return (
    <div className="space-y-6">
      <CountdownRoadmap
        user={user}
        examDates={examDates}
        textbooks={textbooks}
        progressMap={progressMap}
        onEditGoal={onEditGoal}
        onContinueTopic={onOpenTopic}
        onOpenExamTab={onOpenExamTab}
      />

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Darslik yoki mavzu qidirish (masalan: Konstitutsiya, Jinoyat, 28-modda)..."
            className="w-full min-h-[44px] rounded-xl border border-slate-800 bg-slate-900/80 pl-10 pr-4 py-2.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(
            [
              { id: 'all', label: 'Barchasi' },
              { id: 'public', label: 'Ochiq' },
              { id: 'group', label: 'Guruh' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilter(btn.id)}
              className={`min-h-[44px] rounded-xl px-3.5 text-xs font-bold transition border ${
                filter === btn.id
                  ? 'border-indigo-400 bg-indigo-500/20 text-white'
                  : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Textbooks & Ordered Lessons + Interim Exam Gates */}
      <div className="space-y-5">
        {filteredTextbooks.length === 0 ? (
          <div className="glass-card rounded-3xl p-8 text-center">
            <BookOpen className="h-10 w-10 text-slate-500 mx-auto mb-3" />
            <p className="text-base font-bold text-white">Mos darslik yoki mavzu topilmadi</p>
            <p className="text-sm text-slate-400 mt-1">
              Qidiruv so&apos;zini o&apos;zgartiring yoki Profil orqali ustoz guruhiga qo&apos;shiling.
            </p>
          </div>
        ) : (
          filteredTextbooks.map((tb) => {
            const examsByAfterOrder = new Map<number, EnrichedInterimExam[]>();
            for (const ex of tb.interimExams) {
              const list = examsByAfterOrder.get(ex.afterTopicOrder) || [];
              list.push(ex);
              examsByAfterOrder.set(ex.afterTopicOrder, list);
            }

            return (
              <section key={tb.id} className="glass-card rounded-3xl p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-400/25 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                        {tb.branch}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                        {tb.isPublic ? (
                          <>
                            <Globe className="h-3 w-3 text-emerald-400" />
                            Ochiq darslik
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3 text-amber-400" />
                            Guruh darsligi
                          </>
                        )}
                      </span>
                      <span className="text-[11px] font-medium text-amber-300">{tb.gradeTag}</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-extrabold text-white">{tb.title}</h3>
                    {tb.description && (
                      <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                        {tb.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ordered Topic Cards */}
                <div className="space-y-3">
                  {tb.topics.map((topic) => {
                    const prog = progressMap[topic.id];
                    const interimAfter = examsByAfterOrder.get(topic.order) || [];
                    const blockingExam = topic.blockingExamId
                      ? tb.interimExams.find((e) => e.id === topic.blockingExamId)
                      : null;

                    return (
                      <div key={topic.id} className="space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (topic.locked && blockingExam) {
                              onStartInterimExam(blockingExam);
                            } else if (!topic.locked) {
                              onOpenTopic(topic.id);
                            }
                          }}
                          className={`w-full text-left rounded-2xl border p-4 transition flex items-start justify-between gap-3 ${
                            topic.locked
                              ? 'border-slate-800/80 bg-slate-900/40 opacity-80 hover:border-amber-500/40'
                              : 'border-slate-800 bg-slate-900/75 hover:border-indigo-400/50 hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-extrabold text-sm ${
                                topic.locked
                                  ? 'bg-slate-800 text-slate-400'
                                  : prog?.konspektRead
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                              }`}
                            >
                              {topic.locked ? <Lock className="h-4 w-4" /> : `${topic.order}`}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-slate-400">
                                  {topic.order}-dars
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                                  <Clock className="h-3 w-3" />
                                  {topic.estimatedMinutes} daq
                                </span>
                                {topic.locked && (
                                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                                    Oraliq imtihon talab etiladi
                                  </span>
                                )}
                              </div>
                              <h4 className="text-sm sm:text-base font-bold text-white mt-0.5 leading-snug">
                                {topic.title}
                              </h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                                {topic.subtitle}
                              </p>

                              {/* 5-step micro status chips */}
                              {!topic.locked && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                  <StageChip
                                    label="Konspekt"
                                    done={Boolean(prog?.konspektRead)}
                                  />
                                  <StageChip
                                    label={`Kartalar${prog?.cardsScore ? ` ${prog.cardsScore}%` : ''}`}
                                    done={(prog?.cardsScore ?? 0) >= 60}
                                  />
                                  <StageChip
                                    label={`Test${prog?.quizScore !== null && prog?.quizScore !== undefined ? ` ${prog.quizScore}%` : ''}`}
                                    done={(prog?.quizScore ?? 0) >= 60 || (prog?.fullTestScore ?? 0) >= 60}
                                  />
                                  <StageChip
                                    label={`Yozma${prog?.writtenScore !== null && prog?.writtenScore !== undefined ? ` ${prog.writtenScore}%` : ''}`}
                                    done={(prog?.writtenScore ?? 0) >= 60}
                                  />
                                  <StageChip
                                    label={`AI Ustoz${prog?.aiTutorScore !== null && prog?.aiTutorScore !== undefined ? ` ${prog.aiTutorScore}%` : ''}`}
                                    done={(prog?.aiTutorScore ?? 0) >= 60}
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <ChevronRight className="h-5 w-5 text-slate-500 shrink-0 mt-2" />
                        </button>

                        {/* Inline Interim Exam gate placed after this topic order */}
                        {interimAfter.map((ex) => (
                          <div
                            key={ex.id}
                            className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              ex.passed
                                ? 'border-emerald-500/35 bg-emerald-500/10'
                                : 'border-amber-500/35 bg-amber-500/10'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                  ex.passed
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {ex.passed ? (
                                  <CheckCircle2 className="h-5 w-5" />
                                ) : (
                                  <ShieldAlert className="h-5 w-5" />
                                )}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                                    Oraliq Imtihon
                                  </span>
                                  <span className="text-xs text-slate-300">
                                    O&apos;tish bali: {ex.passingScore}%
                                  </span>
                                  {ex.bestScore >= 0 && (
                                    <span className="text-xs font-bold text-emerald-300">
                                      Eng yaxshi: {ex.bestScore}%
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-bold text-white mt-0.5">{ex.title}</p>
                                {!ex.passed && (
                                  <p className="text-xs text-slate-300 mt-0.5">
                                    Keyingi blok darslarini ochish uchun kamida {ex.passingScore}% ball to&apos;plang.
                                  </p>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onStartInterimExam(ex)}
                              className={`min-h-[44px] shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                                ex.passed
                                  ? 'bg-emerald-600/80 hover:bg-emerald-500 text-white'
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                              }`}
                            >
                              {ex.passed ? 'Qayta topshirish' : 'Imtihonni boshlash'}
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function StageChip({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold border ${
        done
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
          : 'bg-slate-800/70 border-slate-700/70 text-slate-400'
      }`}
    >
      {done && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
}
