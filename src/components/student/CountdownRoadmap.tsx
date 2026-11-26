import { useEffect, useState } from 'react';
import {
  Play,
  SlidersHorizontal,
  Clock,
  Flame,
  CheckCircle2,
  BookOpen,
  Scale,
  PenTool,
  Award,
} from 'lucide-react';
import type { ExamDateItem, TopicProgress, UserProfile } from '@shared/types';
import { getCountdownParts } from '@shared/utils';
import type { EnrichedTextbook } from '@/lib/api';

interface CountdownRoadmapProps {
  user: UserProfile;
  examDates: ExamDateItem[];
  textbooks: EnrichedTextbook[];
  progressMap: Record<string, TopicProgress>;
  onEditGoal: () => void;
  onContinueTopic: (topicId: string) => void;
  onOpenExamTab: () => void;
}

export function CountdownRoadmap({
  user,
  examDates,
  textbooks,
  progressMap,
  onEditGoal,
  onContinueTopic,
  onOpenExamTab,
}: CountdownRoadmapProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const profile = user.studyProfile;
  const selectedExam = profile?.examDateId
    ? examDates.find((d) => d.id === profile.examDateId) || null
    : null;
  const countdown = selectedExam ? getCountdownParts(selectedExam.date, now) : null;

  const allTopics = textbooks.flatMap((tb) =>
    tb.topics.map((t) => ({ ...t, branch: tb.branch, textbookTitle: tb.title }))
  );
  const totalTopics = allTopics.length;

  const isTopicDone = (topicId: string) => {
    const p = progressMap[topicId];
    return Boolean(
      p && p.konspektRead && (p.quizScore !== null || p.fullTestScore !== null || p.writtenScore !== null)
    );
  };

  const completedTopics = allTopics.filter((t) => isTopicDone(t.id)).length;
  const remainingTopics = Math.max(0, totalTopics - completedTopics);

  const nextUnlockedTopic =
    allTopics.find((t) => !t.locked && !isTopicDone(t.id)) ||
    allTopics.find((t) => !t.locked) ||
    null;

  // Recommended daily pace
  const dailyPaceText = (() => {
    if (remainingTopics === 0) return "Barcha mavzular o'zlashtirilgan — takrorlash va simulyatorga o'ting";
    if (!countdown || countdown.isPast) return 'Kuniga 1 mavzu (erkin barqaror sur’at)';
    const perDay = remainingTopics / Math.max(1, countdown.totalDaysCeil);
    if (perDay >= 1) return `Kuniga kamida ${Math.ceil(perDay)} ta mavzu`;
    const everyNDays = Math.max(1, Math.round(1 / perDay));
    return `Har ${everyNDays} kunda 1 mavzu + 15 daqiqa Leitner takrorlash`;
  })();

  // Roadmap 4-stage percentages
  const konstTopics = allTopics.filter((t) => t.branch.toLowerCase().includes('konstitutsi'));
  const branchTopics = allTopics.filter((t) => !t.branch.toLowerCase().includes('konstitutsi'));

  const pct = (done: number, total: number) =>
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const stage1Pct = pct(
    konstTopics.filter((t) => progressMap[t.id]?.konspektRead || (progressMap[t.id]?.quizScore ?? 0) >= 60).length,
    Math.max(1, konstTopics.length)
  );
  const stage2Pct = pct(
    branchTopics.filter((t) => progressMap[t.id]?.konspektRead || (progressMap[t.id]?.cardsScore ?? 0) >= 40).length,
    Math.max(1, branchTopics.length)
  );
  const stage3Pct = pct(
    allTopics.filter((t) => progressMap[t.id]?.writtenScore !== null && progressMap[t.id]?.writtenScore !== undefined).length,
    Math.max(1, allTopics.length)
  );
  const stage4Pct = pct(
    allTopics.filter((t) => (progressMap[t.id]?.fullTestScore ?? 0) >= 60 || (progressMap[t.id]?.aiTutorScore ?? 0) >= 60).length,
    Math.max(1, allTopics.length)
  );

  const roadmapStages = [
    {
      title: '1. Baza va Konstitutsiya',
      desc: 'Asosiy prinsiplar, inson huquqlari, davlat organlari',
      percent: stage1Pct,
      icon: BookOpen,
      color: 'from-indigo-500 to-violet-500',
    },
    {
      title: '2. Huquq tarmoqlari',
      desc: 'Fuqarolik, Jinoyat, Mehnat va Oila huquqi kodekslari',
      percent: stage2Pct,
      icon: Scale,
      color: 'from-violet-500 to-fuchsia-500',
    },
    {
      title: '3. Kazus va yozma amaliyot',
      desc: 'Ochiq yuridik kazuslar va AI semantik tekshiruv',
      percent: stage3Pct,
      icon: PenTool,
      color: 'from-amber-500 to-orange-500',
    },
    {
      title: '4. Yakuniy imtihon simulyatori',
      desc: "BMBA/Milliy sertifikat testlari va og'zaki AI Ustoz",
      percent: stage4Pct,
      icon: Award,
      color: 'from-emerald-500 to-teal-500',
    },
  ];

  const examTrackLabel =
    profile?.examType === 'mandatory_or_certificate'
      ? 'Milliy sertifikat / Majburiy'
      : 'Asosiy fan — Huquq';

  return (
    <div className="space-y-4">
      {/* Live Countdown Card */}
      <section className="glass-accent rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-indigo-500/25 border border-indigo-400/35 px-3 py-1 text-xs font-bold text-indigo-100">
                {profile?.gradeLevel || 'Abituriyent'}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-900/70 border border-slate-700/70 px-3 py-1 text-xs font-semibold text-slate-200">
                {examTrackLabel}
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-500/20 border border-amber-400/35 px-3 py-1 text-xs font-bold text-amber-200">
                Maqsad: {profile?.targetGrade || 'A+'}
              </span>
            </div>

            <div>
              <h2 className="text-lg sm:text-2xl font-extrabold text-white leading-tight">
                {selectedExam ? selectedExam.title : "Erkin sur'atdagi huquq tayyorgarligi"}
              </h2>
              <p className="mt-1.5 flex items-center gap-2 text-xs sm:text-sm text-slate-200/90">
                <Flame className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  Tavsiya etilgan sur&apos;at: <strong className="text-white">{dailyPaceText}</strong>
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {nextUnlockedTopic && (
                <button
                  type="button"
                  onClick={() => onContinueTopic(nextUnlockedTopic.id)}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Davom ettirish
                </button>
              )}
              <button
                type="button"
                onClick={onEditGoal}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-600/70 bg-slate-900/70 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition"
              >
                <SlidersHorizontal className="h-4 w-4 text-amber-300" />
                Maqsadni tahrirlash
              </button>
            </div>
          </div>

          {/* Live Countdown Tiles */}
          <div className="shrink-0">
            {countdown && !countdown.isPast ? (
              <div className="rounded-2xl bg-slate-950/70 border border-slate-800/90 p-3.5 sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-2 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Imtihongacha qoldi
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-900/90 px-3 py-2 border border-slate-800 min-w-[68px]">
                    <span className="block text-2xl sm:text-3xl font-extrabold text-white tabular-nums">
                      {countdown.days}
                    </span>
                    <span className="text-[11px] text-slate-400">kun</span>
                  </div>
                  <div className="rounded-xl bg-slate-900/90 px-3 py-2 border border-slate-800 min-w-[68px]">
                    <span className="block text-2xl sm:text-3xl font-extrabold text-indigo-300 tabular-nums">
                      {String(countdown.hours).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] text-slate-400">soat</span>
                  </div>
                  <div className="rounded-xl bg-slate-900/90 px-3 py-2 border border-slate-800 min-w-[68px]">
                    <span className="block text-2xl sm:text-3xl font-extrabold text-amber-300 tabular-nums">
                      {String(countdown.minutes).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] text-slate-400">daqiqa</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 text-center min-w-[200px]">
                <p className="text-xs font-semibold text-indigo-300">Umumiy progress</p>
                <p className="text-3xl font-extrabold text-white mt-1">
                  {completedTopics}/{totalTopics}
                </p>
                <p className="text-xs text-slate-400">mavzu bajarildi</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Personal Roadmap */}
      <section className="glass-card rounded-3xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-base font-bold text-white">Shaxsiy tayyorgarlik Roadmap&apos;i</h3>
            <p className="text-xs text-slate-400">
              {completedTopics} / {totalTopics} mavzu o&apos;zlashtirildi
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenExamTab}
            className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition"
          >
            Simulyator →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {roadmapStages.map((st) => {
            const Icon = st.icon;
            return (
              <div
                key={st.title}
                className="rounded-2xl bg-slate-900/75 border border-slate-800/90 p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-indigo-300 shrink-0" />
                    <span className="text-xs font-bold text-slate-100 truncate">{st.title}</span>
                  </div>
                  <span className="text-xs font-extrabold text-amber-300 shrink-0 flex items-center gap-1">
                    {st.percent === 100 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    {st.percent}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{st.desc}</p>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${st.color} transition-all duration-500`}
                    style={{ width: `${st.percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
