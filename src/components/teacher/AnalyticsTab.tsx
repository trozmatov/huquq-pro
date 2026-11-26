import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Search, X, CheckCircle2 } from 'lucide-react';
import type { Group, StudentAnalyticsRow } from '@shared/types';
import { api } from '@/lib/api';

interface AnalyticsTabProps {
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function AnalyticsTab({ onToast }: AnalyticsTabProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [topics, setTopics] = useState<Array<{ id: string; title: string; textbookId: string }>>(
    []
  );
  const [rows, setRows] = useState<StudentAnalyticsRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentAnalyticsRow | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const [gRes, aRes] = await Promise.all([
        api.listGroups(),
        api.getTeacherAnalytics({
          groupId: groupId || undefined,
          topicId: topicId || undefined,
          search: search.trim() || undefined,
        }),
      ]);
      setGroups(gRes.groups);
      setTopics(aRes.topics);
      setRows(aRes.rows);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Natijalarni yuklashda xatolik.');
    } finally {
      setLoading(false);
    }
  }, [groupId, topicId, search, onToast]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const fmt = (v: number | null | undefined) => (typeof v === 'number' ? `${v}%` : '—');
  const topicTitleMap = new Map(topics.map((t) => [t.id, t.title]));

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="glass-panel rounded-3xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="relative md:col-span-5">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="O'quvchi ismi, username yoki Telegram ID..."
            className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-4 py-2 text-base sm:text-sm text-white"
          />
        </div>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="md:col-span-3 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base sm:text-sm text-white"
        >
          <option value="">Barcha guruhlar</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          className="md:col-span-4 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base sm:text-sm text-white"
        >
          <option value="">Barcha mavzular (o&apos;rtacha)</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {/* Results Table */}
      <section className="glass-card rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            O&apos;quvchilarning 5 bosqichli analitikasi ({rows.length})
          </h3>
          <span className="text-xs text-slate-400">Batafsil ko&apos;rish uchun qatorga bosing</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Yuklanmoqda...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Hozircha mos o&apos;quvchi natijalari topilmadi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">O&apos;quvchi / Maqsad</th>
                  <th className="px-3 py-3 text-center">Konspekt</th>
                  <th className="px-3 py-3 text-center">Kartalar</th>
                  <th className="px-3 py-3 text-center">Quiz</th>
                  <th className="px-3 py-3 text-center">To&apos;liq Test</th>
                  <th className="px-3 py-3 text-center">Yozma/Kazus</th>
                  <th className="px-3 py-3 text-center">AI Ustoz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {rows.map((row) => (
                  <tr
                    key={row.user.id}
                    onClick={() => setSelectedStudent(row)}
                    className="hover:bg-indigo-500/10 cursor-pointer transition"
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-white">
                        {row.user.firstName} {row.user.lastName || ''}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {row.user.studyProfile
                          ? `${row.user.studyProfile.gradeLevel} • Maqsad: ${row.user.studyProfile.targetGrade}`
                          : "So'rovnoma to'ldirilmagan"}
                        {row.examDateTitle ? ` • ${row.examDateTitle}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-center font-semibold text-emerald-300">
                      {row.averages.konspektReadCount} ta
                    </td>
                    <td className="px-3 py-3.5 text-center font-semibold text-slate-200">
                      {fmt(row.averages.cardsScore)}
                    </td>
                    <td className="px-3 py-3.5 text-center font-semibold text-slate-200">
                      {fmt(row.averages.quizScore)}
                    </td>
                    <td className="px-3 py-3.5 text-center font-semibold text-indigo-300">
                      {fmt(row.averages.fullTestScore)}
                    </td>
                    <td className="px-3 py-3.5 text-center font-semibold text-amber-300">
                      {fmt(row.averages.writtenScore)}
                    </td>
                    <td className="px-3 py-3.5 text-center font-extrabold text-emerald-300">
                      {fmt(row.averages.aiTutorScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-student Topic Breakdown Modal */}
      {selectedStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            className="glass-panel w-full max-w-2xl max-h-[88vh] rounded-3xl overflow-hidden flex flex-col border border-indigo-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  {selectedStudent.user.firstName} {selectedStudent.user.lastName || ''}
                </h3>
                <p className="text-xs text-slate-400">
                  Mavzular kesimidagi 5 bosqichli natijalar •{' '}
                  {selectedStudent.user.studyProfile?.targetGrade
                    ? `Maqsad: ${selectedStudent.user.studyProfile.targetGrade}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {Object.values(selectedStudent.progressByTopic).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  Ushbu o&apos;quvchida hali mavzular bo&apos;yicha natija qayd etilmagan.
                </p>
              ) : (
                Object.values(selectedStudent.progressByTopic).map((p) => (
                  <div
                    key={p.topicId}
                    className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5"
                  >
                    <p className="text-sm font-bold text-white">
                      {topicTitleMap.get(p.topicId) || p.topicId}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-950/70 px-2.5 py-2">
                        <span className="text-slate-400 block">Konspekt</span>
                        <span className="font-bold text-emerald-300 inline-flex items-center gap-1">
                          {p.konspektRead ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> O&apos;qildi
                            </>
                          ) : (
                            'Yo‘q'
                          )}
                        </span>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-2.5 py-2">
                        <span className="text-slate-400 block">Kartalar</span>
                        <span className="font-bold text-white">{p.cardsScore}%</span>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-2.5 py-2">
                        <span className="text-slate-400 block">Quiz / Test</span>
                        <span className="font-bold text-indigo-300">
                          {fmt(p.quizScore)} / {fmt(p.fullTestScore)}
                        </span>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-2.5 py-2">
                        <span className="text-slate-400 block">Yozma</span>
                        <span className="font-bold text-amber-300">{fmt(p.writtenScore)}</span>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 px-2.5 py-2">
                        <span className="text-slate-400 block">AI Ustoz</span>
                        <span className="font-bold text-emerald-300">{fmt(p.aiTutorScore)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
