import { useState } from 'react';
import {
  BookOpen,
  Plus,
  Globe,
  Lock,
  ArrowUp,
  ArrowDown,
  Edit3,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import type { Topic } from '@shared/types';
import { api, type EnrichedTextbook } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TopicEditorModal } from './TopicEditorModal';

interface TextbooksTopicsTabProps {
  textbooks: EnrichedTextbook[];
  onRefresh: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function TextbooksTopicsTab({
  textbooks,
  onRefresh,
  onToast,
}: TextbooksTopicsTabProps) {
  // New textbook form
  const [tbTitle, setTbTitle] = useState('');
  const [tbBranch, setTbBranch] = useState('Konstitutsiyaviy huquq');
  const [tbGrade, setTbGrade] = useState('8–11-sinf • Abituriyent');
  const [tbDesc, setTbDesc] = useState('');
  const [tbPublic, setTbPublic] = useState(true);
  const [creatingTb, setCreatingTb] = useState(false);

  // Topic editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTextbookId, setEditorTextbookId] = useState<string>('');
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  // Interim exam creator modal/inline per textbook
  const [interimForTb, setInterimForTb] = useState<EnrichedTextbook | null>(null);
  const [interimTitle, setInterimTitle] = useState('');
  const [interimAfterOrder, setInterimAfterOrder] = useState(1);
  const [interimPassing, setInterimPassing] = useState(60);
  const [interimSources, setInterimSources] = useState<string[]>([]);

  // Confirm delete dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const handleCreateTextbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tbTitle.trim().length < 2) {
      onToast('error', 'Darslik nomini kiriting.');
      return;
    }
    try {
      setCreatingTb(true);
      await api.createTextbook({
        title: tbTitle.trim(),
        branch: tbBranch.trim(),
        gradeTag: tbGrade.trim(),
        description: tbDesc.trim(),
        isPublic: tbPublic,
      });
      setTbTitle('');
      setTbDesc('');
      onRefresh();
      onToast('success', 'Yangi darslik yaratildi!');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Darslik yaratishda xatolik.');
    } finally {
      setCreatingTb(false);
    }
  };

  const handleTogglePublic = async (tb: EnrichedTextbook) => {
    try {
      await api.updateTextbook(tb.id, { isPublic: !tb.isPublic });
      onRefresh();
      onToast(
        'success',
        !tb.isPublic
          ? `«${tb.title}» barcha o'quvchilar uchun OCHIQ qilindi.`
          : `«${tb.title}» faqat guruhlar uchun YOPIQ qilindi.`
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Holatni o'zgartirishda xatolik.");
    }
  };

  const handleOpenEditTopic = async (topicId: string, tbId: string) => {
    try {
      const { topic } = await api.getTopic(topicId);
      setEditorTextbookId(tbId);
      setEditingTopic(topic);
      setEditorOpen(true);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Mavzuni yuklashda xatolik.');
    }
  };

  const handleReorder = async (topicId: string, direction: 'up' | 'down') => {
    try {
      await api.reorderTopic(topicId, direction);
      onRefresh();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Tartibni o'zgartirishda xatolik.");
    }
  };

  const handleCreateInterim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interimForTb) return;
    if (interimTitle.trim().length < 2 || interimSources.length === 0) {
      onToast('error', 'Oraliq imtihon nomi va kamida 1 ta manba mavzuni tanlang.');
      return;
    }
    try {
      await api.createInterimExam({
        textbookId: interimForTb.id,
        title: interimTitle.trim(),
        afterTopicOrder: interimAfterOrder,
        sourceTopicIds: interimSources,
        passingScore: interimPassing,
        questionCount: 10,
        durationMinutes: 15,
      });
      setInterimForTb(null);
      setInterimTitle('');
      setInterimSources([]);
      onRefresh();
      onToast('success', "Oraliq imtihon qo'shildi!");
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Imtihon yaratishda xatolik.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Textbook Form */}
      <section className="glass-panel rounded-3xl p-5 space-y-4">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-400" />
          Yangi darslik (Huquq tarmog&apos;i / Sinf) yaratish
        </h3>

        <form onSubmit={handleCreateTextbook} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            value={tbTitle}
            onChange={(e) => setTbTitle(e.target.value)}
            placeholder="Darslik nomi (masalan: 9-sinf Davlat va huquq asoslari)"
            className="sm:col-span-4 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
          />
          <input
            type="text"
            value={tbBranch}
            onChange={(e) => setTbBranch(e.target.value)}
            placeholder="Huquq tarmog'i"
            className="sm:col-span-3 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
          />
          <input
            type="text"
            value={tbGrade}
            onChange={(e) => setTbGrade(e.target.value)}
            placeholder="Sinf / Daraja"
            className="sm:col-span-2 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
          />
          <label className="sm:col-span-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={tbPublic}
              onChange={(e) => setTbPublic(e.target.checked)}
              className="accent-emerald-500"
            />
            Ochiq
          </label>
          <button
            type="submit"
            disabled={creatingTb}
            className="sm:col-span-2 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-bold text-white"
          >
            Yaratish
          </button>
          <input
            type="text"
            value={tbDesc}
            onChange={(e) => setTbDesc(e.target.value)}
            placeholder="Darslik haqida qisqa tavsif..."
            className="sm:col-span-12 min-h-[42px] rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-base sm:text-sm text-slate-200"
          />
        </form>
      </section>

      {/* Textbooks & Topics Management */}
      <div className="space-y-5">
        {textbooks.map((tb) => (
          <section key={tb.id} className="glass-card rounded-3xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                    {tb.branch}
                  </span>
                  <span className="text-xs text-amber-300">{tb.gradeTag}</span>
                </div>
                <h4 className="text-lg font-extrabold text-white">{tb.title}</h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTogglePublic(tb)}
                  className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition ${
                    tb.isPublic
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                      : 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  }`}
                >
                  {tb.isPublic ? (
                    <>
                      <Globe className="h-3.5 w-3.5" /> Ochiq (Public)
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" /> Yopiq (Guruh)
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditorTextbookId(tb.id);
                    setEditingTopic(null);
                    setEditorOpen(true);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" />
                  Mavzu / AI Generatsiya
                </button>

                <button
                  type="button"
                  disabled={tb.topics.length === 0}
                  onClick={() => {
                    setInterimForTb(tb);
                    setInterimAfterOrder(tb.topics[0]?.order || 1);
                    setInterimSources(tb.topics.map((t) => t.id));
                    setInterimTitle(`${tb.branch} — Oraliq Imtihon`);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-40"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Oraliq Imtihon
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Darslikni o'chirish",
                      description: `«${tb.title}» darsligi va undagi barcha mavzular o'chiriladi. Tasdiqlaysizmi?`,
                      onConfirm: async () => {
                        await api.deleteTextbook(tb.id);
                        setConfirmAction(null);
                        onRefresh();
                        onToast('info', "Darslik o'chirildi.");
                      },
                    })
                  }
                  aria-label="Darslikni o'chirish"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:border-rose-500/50 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Topics List with Reorder Controls */}
            <div className="space-y-2">
              {tb.topics.map((topic, idx) => (
                <div
                  key={topic.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-xs font-extrabold text-indigo-300">
                      {topic.order}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{topic.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {topic.flashcardCount} karta • {topic.quizCount} quiz • {topic.fullTestCount}{' '}
                        test • {topic.writtenCount} yozma
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleReorder(topic.id, 'up')}
                      aria-label="Yuqoriga"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-35"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === tb.topics.length - 1}
                      onClick={() => handleReorder(topic.id, 'down')}
                      aria-label="Pastga"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-35"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditTopic(topic.id, tb.id)}
                      className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          title: "Mavzuni o'chirish",
                          description: `«${topic.title}» mavzusini o'chirasizmi?`,
                          onConfirm: async () => {
                            await api.deleteTopic(topic.id);
                            setConfirmAction(null);
                            onRefresh();
                            onToast('info', "Mavzu o'chirildi.");
                          },
                        })
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Interim Exams attached to textbook */}
              {tb.interimExams.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-bold text-amber-300">
                      Oraliq Imtihon • {ex.afterTopicOrder}-darsdan keyin • O&apos;tish bali:{' '}
                      {ex.passingScore}%
                    </p>
                    <p className="text-sm font-bold text-white">{ex.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: "Oraliq imtihonni o'chirish",
                        description: `«${ex.title}» oraliq imtihonini o'chirasizmi?`,
                        onConfirm: async () => {
                          await api.deleteInterimExam(ex.id);
                          setConfirmAction(null);
                          onRefresh();
                          onToast('info', "Oraliq imtihon o'chirildi.");
                        },
                      })
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/35 text-rose-300 hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Add Interim Exam Modal */}
      {interimForTb && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setInterimForTb(null)}
        >
          <form
            onSubmit={handleCreateInterim}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-lg rounded-3xl p-6 space-y-4 border border-amber-500/35"
          >
            <h3 className="text-lg font-extrabold text-white">
              Oraliq Imtihon qo&apos;shish ({interimForTb.title})
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Imtihon nomi
              </label>
              <input
                type="text"
                value={interimTitle}
                onChange={(e) => setInterimTitle(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Qaysi darsdan keyin?
                </label>
                <select
                  value={interimAfterOrder}
                  onChange={(e) => setInterimAfterOrder(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base sm:text-sm text-white"
                >
                  {interimForTb.topics.map((t) => (
                    <option key={t.id} value={t.order}>
                      {t.order}-darsdan keyin
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  O&apos;tish bali (%)
                </label>
                <input
                  type="number"
                  min={30}
                  max={100}
                  value={interimPassing}
                  onChange={(e) => setInterimPassing(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base sm:text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Qaysi mavzulardan savollar olinsin?
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {interimForTb.topics.map((t) => {
                  const checked = interimSources.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setInterimSources((prev) =>
                            checked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          )
                        }
                      />
                      <span>
                        {t.order}. {t.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInterimForTb(null)}
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2 text-sm font-bold text-slate-950"
              >
                Saqlash
              </button>
            </div>
          </form>
        </div>
      )}

      <TopicEditorModal
        open={editorOpen}
        textbookId={editorTextbookId}
        initialTopic={editingTopic}
        onSaved={() => {
          setEditorOpen(false);
          onRefresh();
        }}
        onClose={() => setEditorOpen(false)}
        onToast={onToast}
      />

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
