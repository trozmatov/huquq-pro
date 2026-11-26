import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Copy,
  Check,
  Plus,
  Trash2,
  Calendar,
  Edit3,
  Shield,
  BookOpen,
} from 'lucide-react';
import type { ExamDateItem, Group, StudentAnalyticsRow, UserProfile } from '@shared/types';
import { getCountdownParts } from '@shared/utils';
import { api, type EnrichedTextbook } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface GroupsExamsTabProps {
  user: UserProfile;
  textbooks: EnrichedTextbook[];
  examDates: ExamDateItem[];
  onRefresh: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function GroupsExamsTab({
  user,
  textbooks,
  examDates,
  onRefresh,
  onToast,
}: GroupsExamsTabProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [analyticsRows, setAnalyticsRows] = useState<StudentAnalyticsRow[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create group state
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedTbIds, setSelectedTbIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Exam Date CRUD state
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [dateTitle, setDateTitle] = useState('');
  const [dateVal, setDateVal] = useState('');
  const [dateDesc, setDateDesc] = useState('');
  const [dateType, setDateType] = useState<'certificate' | 'admission' | 'olympiad'>('certificate');
  const [savingDate, setSavingDate] = useState(false);

  // Admin teacher allowlist
  const [allowlistIds, setAllowlistIds] = useState<string[]>([]);
  const [envTeachers, setEnvTeachers] = useState<string[]>([]);
  const [envAdmins, setEnvAdmins] = useState<string[]>([]);
  const [newTeacherId, setNewTeacherId] = useState('');

  // Confirm delete dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [gRes, aRes] = await Promise.all([api.listGroups(), api.getTeacherAnalytics()]);
      setGroups(gRes.groups);
      setAnalyticsRows(aRes.rows);
      if (user.role === 'admin') {
        const tRes = await api.getAdminTeachers();
        setAllowlistIds(tRes.allowlistIds);
        setEnvTeachers(tRes.envTeacherIds);
        setEnvAdmins(tRes.envAdminIds);
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik.");
    }
  }, [user.role, onToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCopyInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      onToast('success', `Taklif kodi nusxalandi: ${code}`);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      onToast('error', "Nusxalab bo'lmadi.");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (groupName.trim().length < 2) {
      onToast('error', 'Guruh nomini kiriting.');
      return;
    }
    try {
      setCreatingGroup(true);
      await api.createGroup({
        name: groupName.trim(),
        description: groupDesc.trim(),
        textbookIds: selectedTbIds,
      });
      setGroupName('');
      setGroupDesc('');
      setSelectedTbIds([]);
      await loadData();
      onToast('success', 'Yangi guruh yaratildi!');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Guruh yaratishda xatolik.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleToggleGroupTextbook = async (group: Group, tbId: string) => {
    const exists = group.textbookIds.includes(tbId);
    const nextIds = exists
      ? group.textbookIds.filter((id) => id !== tbId)
      : [...group.textbookIds, tbId];
    try {
      const { group: updated } = await api.updateGroup(group.id, { textbookIds: nextIds });
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      onToast('success', 'Guruh darsliklari yangilandi.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Yangilashda xatolik.');
    }
  };

  const handleSaveExamDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dateTitle.trim().length < 3 || !dateVal) {
      onToast('error', 'Imtihon nomi va sanasini kiriting.');
      return;
    }
    try {
      setSavingDate(true);
      const isoDate = dateVal.includes('T') ? dateVal : `${dateVal}T09:00:00+05:00`;
      if (editingDateId) {
        await api.updateExamDate(editingDateId, {
          title: dateTitle.trim(),
          date: isoDate,
          description: dateDesc.trim(),
          examType: dateType,
        });
        onToast('success', 'Imtihon sanasi yangilandi.');
      } else {
        await api.createExamDate({
          title: dateTitle.trim(),
          date: isoDate,
          description: dateDesc.trim(),
          examType: dateType,
        });
        onToast('success', "Yangi imtihon sanasi qo'shildi.");
      }
      setEditingDateId(null);
      setDateTitle('');
      setDateVal('');
      setDateDesc('');
      onRefresh();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Saqlashda xatolik.');
    } finally {
      setSavingDate(false);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTeacherId.trim();
    if (!/^\d+$/.test(cleaned)) {
      onToast('error', "Telegram ID faqat raqamlardan iborat bo'lishi kerak.");
      return;
    }
    try {
      const res = await api.addTeacherId(cleaned);
      setAllowlistIds(res.allowlistIds);
      setNewTeacherId('');
      onToast('success', `Telegram ID ${cleaned} ga Ustoz roli berildi.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Ruxsat berishda xatolik.');
    }
  };

  return (
    <div className="space-y-6">
      {/* GROUPS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Create Group Form */}
        <section className="lg:col-span-4 glass-panel rounded-3xl p-5 space-y-4 h-fit">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Yangi guruh yaratish
          </h3>

          <form onSubmit={handleCreateGroup} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Guruh nomi</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Masalan: 11-A TDYU guruhi"
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tavsif</label>
              <input
                type="text"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="Qisqa izoh (ixtiyoriy)"
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Darsliklar biriktirish:
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {textbooks.map((tb) => {
                  const checked = selectedTbIds.includes(tb.id);
                  return (
                    <label
                      key={tb.id}
                      className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2 text-xs text-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedTbIds((prev) =>
                            checked ? prev.filter((id) => id !== tb.id) : [...prev, tb.id]
                          )
                        }
                        className="rounded accent-indigo-500"
                      />
                      <span className="truncate">{tb.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={creatingGroup}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              {creatingGroup ? 'Yaratilmoqda...' : 'Guruh yaratish'}
            </button>
          </form>
        </section>

        {/* Groups List */}
        <section className="lg:col-span-8 space-y-4">
          {groups.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 text-center text-sm text-slate-400">
              Hozircha guruhlar mavjud emas. Chap paneldan yangi guruh yarating.
            </div>
          ) : (
            groups.map((g) => {
              const members = analyticsRows.filter((r) => g.memberIds.includes(r.user.id));
              return (
                <div key={g.id} className="glass-card rounded-3xl p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base sm:text-lg font-extrabold text-white">{g.name}</h4>
                      {g.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{g.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyInvite(g.inviteCode)}
                        className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-400/35 px-3.5 py-1.5 text-xs font-mono font-bold text-amber-200 hover:bg-amber-500/25 transition"
                      >
                        {copiedCode === g.inviteCode ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {g.inviteCode}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            title: "Guruhni o'chirish",
                            description: `«${g.name}» guruhini o'chirasizmi? O'quvchilarning shaxsiy progressi saqlanib qoladi.`,
                            onConfirm: async () => {
                              await api.deleteGroup(g.id);
                              setConfirmAction(null);
                              await loadData();
                              onToast('info', "Guruh o'chirildi.");
                            },
                          })
                        }
                        aria-label="Guruhni o'chirish"
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:border-rose-500/50 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Attached textbooks chips */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                      Biriktirilgan darsliklar (bosib ulash/uzish):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {textbooks.map((tb) => {
                        const attached = g.textbookIds.includes(tb.id);
                        return (
                          <button
                            key={tb.id}
                            type="button"
                            onClick={() => handleToggleGroupTextbook(g, tb.id)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition ${
                              attached
                                ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {attached ? '✓ ' : '+ '}
                            {tb.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Group members summary */}
                  <div className="border-t border-slate-800 pt-3">
                    <p className="text-xs font-bold text-slate-300 mb-2">
                      Guruh o&apos;quvchilari ({g.memberIds.length})
                    </p>
                    {members.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Hali o&apos;quvchilar qo&apos;shilmagan. 8 xonali kodni ({g.inviteCode})
                        o&apos;quvchilarga ulashing.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {members.map((m) => (
                          <div
                            key={m.user.id}
                            className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2 text-xs flex items-center justify-between gap-2"
                          >
                            <span className="font-semibold text-white truncate">
                              {m.user.firstName} {m.user.lastName || ''}
                            </span>
                            <span className="text-slate-400 shrink-0">
                              K:{m.averages.cardsScore ?? '—'}% • T:{m.averages.quizScore ?? '—'}% •
                              Y:{m.averages.writtenScore ?? '—'}% • AI:
                              {m.averages.aiTutorScore ?? '—'}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      {/* EXAM DATES CRUD */}
      <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
        <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-400" />
          Milliy Sertifikat va Kirish Imtihoni sanalari boshqaruvi
        </h3>

        <form onSubmit={handleSaveExamDate} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            value={dateTitle}
            onChange={(e) => setDateTitle(e.target.value)}
            placeholder="Imtihon nomi (masalan: Milliy sertifikat — May 2027)"
            className="sm:col-span-4 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
          />
          <input
            type="date"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
            className="sm:col-span-3 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
          />
          <select
            value={dateType}
            onChange={(e) => setDateType(e.target.value as 'certificate' | 'admission' | 'olympiad')}
            className="sm:col-span-2 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base sm:text-sm text-white"
          >
            <option value="certificate">Milliy sertifikat</option>
            <option value="admission">OTM / TDYU</option>
            <option value="olympiad">Olimpiada</option>
          </select>
          <button
            type="submit"
            disabled={savingDate}
            className="sm:col-span-3 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition"
          >
            {editingDateId ? 'Yangilash' : "Sana qo'shish"}
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {examDates.map((ed) => {
            const cd = getCountdownParts(ed.date);
            return (
              <div
                key={ed.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white leading-snug">{ed.title}</p>
                    <span className="shrink-0 rounded-lg bg-amber-500/15 border border-amber-400/25 px-2 py-0.5 text-xs font-bold text-amber-300">
                      {cd.isPast ? "O'tgan" : `${cd.days} kun`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(ed.date).toLocaleDateString('uz-UZ', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDateId(ed.id);
                      setDateTitle(ed.title);
                      setDateVal(ed.date.slice(0, 10));
                      setDateDesc(ed.description || '');
                      setDateType(ed.examType);
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Tahrirlash
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: "Imtihon sanasini o'chirish",
                        description: `«${ed.title}» sanasini o'chirmoqchimisiz?`,
                        onConfirm: async () => {
                          await api.deleteExamDate(ed.id);
                          setConfirmAction(null);
                          onRefresh();
                          onToast('info', "Imtihon sanasi o'chirildi.");
                        },
                      })
                    }
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    O&apos;chirish
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ADMIN TEACHER ALLOWLIST */}
      {user.role === 'admin' && (
        <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 border border-amber-500/25">
          <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            Admin ruxsatnomasi — Ustoz Telegram ID boshqaruvi
          </h3>

          <form onSubmit={handleAddTeacher} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newTeacherId}
              onChange={(e) => setNewTeacherId(e.target.value)}
              placeholder="Ustoz Telegram user ID (masalan: 554433221)"
              className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-base sm:text-sm text-white"
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-bold text-white"
            >
              Ustoz qo&apos;shish
            </button>
          </form>

          <div className="flex flex-wrap gap-2 text-xs">
            {envAdmins.map((id) => (
              <span
                key={`adm-${id}`}
                className="rounded-xl bg-amber-500/15 border border-amber-400/30 px-3 py-1.5 font-mono text-amber-200"
              >
                Admin (env): {id}
              </span>
            ))}
            {envTeachers.map((id) => (
              <span
                key={`env-${id}`}
                className="rounded-xl bg-violet-500/15 border border-violet-400/30 px-3 py-1.5 font-mono text-violet-200"
              >
                Ustoz (env): {id}
              </span>
            ))}
            {allowlistIds.map((id) => (
              <span
                key={`dyn-${id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 font-mono text-indigo-100"
              >
                Ustoz: {id}
                <button
                  type="button"
                  onClick={async () => {
                    const res = await api.removeTeacherId(id);
                    setAllowlistIds(res.allowlistIds);
                    onToast('info', `ID ${id} ustozlar ro'yxatidan olib tashlandi.`);
                  }}
                  className="text-rose-300 hover:text-rose-100 font-sans font-bold"
                  aria-label="Olib tashlash"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        description={confirmAction?.description || ''}
        confirmLabel="O'chirish"
        danger
        onConfirm={() => {
          if (confirmAction) void confirmAction.onConfirm();
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
