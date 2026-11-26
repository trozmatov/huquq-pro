import { useEffect, useState } from 'react';
import { X, Save, Sparkles, Upload, Plus, Trash2 } from 'lucide-react';
import type {
  FlashcardCategory,
  FlashcardItem,
  FullTestQuestion,
  QuizQuestion,
  Topic,
  WrittenCaseQuestion,
} from '@shared/types';
import { api } from '@/lib/api';

interface TopicEditorModalProps {
  open: boolean;
  textbookId: string;
  initialTopic: Topic | null; // null => create new topic
  onSaved: () => void;
  onClose: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

type EditorTab = 'knowledge' | 'flashcards' | 'quiz' | 'fullTest' | 'written' | 'ai';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TopicEditorModal({
  open,
  textbookId,
  initialTopic,
  onSaved,
  onClose,
  onToast,
}: TopicEditorModalProps) {
  const [tab, setTab] = useState<EditorTab>('knowledge');
  const [saving, setSaving] = useState(false);

  // AI auto-generation panel
  const [sourceText, setSourceText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Topic fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(35);
  const [summary, setSummary] = useState('');
  const [keyPointsText, setKeyPointsText] = useState('');
  const [articles, setArticles] = useState<Topic['knowledgePack']['articlesAndDeadlines']>([]);
  const [glossary, setGlossary] = useState<Topic['knowledgePack']['glossary']>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [fullTestQuestions, setFullTestQuestions] = useState<FullTestQuestion[]>([]);
  const [writtenQuestions, setWrittenQuestions] = useState<WrittenCaseQuestion[]>([]);
  // Separate raw string draft for synonyms so commas/spaces NEVER get eaten while typing!
  const [synonymDrafts, setSynonymDrafts] = useState<Record<string, string>>({});
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab('knowledge');
    setSourceText('');
    if (initialTopic) {
      setTitle(initialTopic.title);
      setSubtitle(initialTopic.subtitle);
      setEstimatedMinutes(initialTopic.estimatedMinutes);
      setSummary(initialTopic.knowledgePack.summary);
      setKeyPointsText(initialTopic.knowledgePack.keyPoints.join('\n'));
      setArticles(initialTopic.knowledgePack.articlesAndDeadlines);
      setGlossary(initialTopic.knowledgePack.glossary);
      setFlashcards(initialTopic.flashcards);
      setQuizQuestions(initialTopic.quizQuestions);
      setFullTestQuestions(initialTopic.fullTestQuestions);
      setWrittenQuestions(initialTopic.writtenQuestions);
      const drafts: Record<string, string> = {};
      for (const w of initialTopic.writtenQuestions) {
        drafts[w.id] = (w.synonyms || []).join(', ');
      }
      setSynonymDrafts(drafts);
      setAiQuestions(initialTopic.aiQuestions);
    } else {
      setTitle('');
      setSubtitle('');
      setEstimatedMinutes(35);
      setSummary('');
      setKeyPointsText('');
      setArticles([]);
      setGlossary([]);
      setFlashcards([]);
      setQuizQuestions([]);
      setFullTestQuestions([]);
      setWrittenQuestions([]);
      setSynonymDrafts({});
      setAiQuestions([]);
    }
  }, [open, initialTopic]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setExtracting(true);
      const res = await api.extractFile(file);
      setSourceText(res.text);
      if (!title.trim()) {
        setTitle(res.fileName.replace(/\.[^.]+$/, ''));
      }
      onToast('success', `${res.fileName} o'qildi (${res.charCount} belgi). Endi AI generatsiyani bosing.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Faylni o'qishda xatolik.");
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  const handleAiGenerate = async () => {
    if (title.trim().length < 2) {
      onToast('error', 'Avval mavzu sarlavhasini kiriting.');
      return;
    }
    if (sourceText.trim().length < 40) {
      onToast('error', 'Fayl yuklang yoki kamida 40 belgilik qonun/darslik matnini joylashtiring.');
      return;
    }
    try {
      setGenerating(true);
      const { draft, usedGemini } = await api.generateTopicDraft({
        textbookId,
        title: title.trim(),
        sourceText: sourceText.trim(),
      });
      setSubtitle(draft.subtitle);
      setEstimatedMinutes(draft.estimatedMinutes);
      setSummary(draft.knowledgePack.summary);
      setKeyPointsText(draft.knowledgePack.keyPoints.join('\n'));
      setArticles(draft.knowledgePack.articlesAndDeadlines);
      setGlossary(draft.knowledgePack.glossary);
      setFlashcards(draft.flashcards);
      setQuizQuestions(draft.quizQuestions);
      setFullTestQuestions(draft.fullTestQuestions);
      setWrittenQuestions(draft.writtenQuestions);
      const drafts: Record<string, string> = {};
      for (const w of draft.writtenQuestions) {
        drafts[w.id] = (w.synonyms || []).join(', ');
      }
      setSynonymDrafts(drafts);
      setAiQuestions(draft.aiQuestions);
      onToast(
        'success',
        usedGemini
          ? "AI 2 bosqichda butun o'quv paketini yaratdi! Barcha 6 tabni ko'rib chiqib saqlang."
          : "O'quv paketi qoralamasi tayyorlandi (lokal rejim — GEMINI_API_KEY ulansa chuqur AI generatsiya ishlaydi)."
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'AI generatsiyada xatolik.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (title.trim().length < 2) {
      onToast('error', 'Mavzu sarlavhasini kiriting.');
      return;
    }
    try {
      setSaving(true);
      const finalizedWritten: WrittenCaseQuestion[] = writtenQuestions.map((w) => ({
        ...w,
        synonyms: (synonymDrafts[w.id] ?? (w.synonyms || []).join(', '))
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }));

      const payload: Partial<Topic> & { textbookId: string; title: string } = {
        textbookId,
        title: title.trim(),
        subtitle: subtitle.trim(),
        estimatedMinutes: Number(estimatedMinutes) || 30,
        knowledgePack: {
          summary: summary.trim(),
          keyPoints: keyPointsText
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
          articlesAndDeadlines: articles,
          glossary,
        },
        flashcards,
        quizQuestions,
        fullTestQuestions,
        writtenQuestions: finalizedWritten,
        aiQuestions: aiQuestions.map((q) => q.trim()).filter(Boolean),
      };

      if (initialTopic) {
        await api.updateTopic(initialTopic.id, payload);
        onToast('success', 'Mavzu saqlandi!');
      } else {
        await api.createTopic(payload);
        onToast('success', 'Yangi mavzu yaratildi!');
      }
      onSaved();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Saqlashda xatolik.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: EditorTab; label: string }> = [
    { id: 'knowledge', label: 'Bilim paketi' },
    { id: 'flashcards', label: `Flashcardlar (${flashcards.length})` },
    { id: 'quiz', label: `Quiz (${quizQuestions.length})` },
    { id: 'fullTest', label: `To'liq Test (${fullTestQuestions.length})` },
    { id: 'written', label: `Yozma/Kazus (${writtenQuestions.length})` },
    { id: 'ai', label: `AI Savollar (${aiQuestions.length})` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Mavzu muharriri"
      onClick={() => !saving && onClose()}
    >
      <div
        className="glass-panel w-full max-w-5xl max-h-[92vh] rounded-3xl flex flex-col overflow-hidden border border-indigo-500/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              {initialTopic ? 'Mavzuni tahrirlash (6 tabli muharrir)' : 'Yangi mavzu yaratish'}
            </h2>
            <p className="text-xs text-slate-400">
              PDF/DOCX/DOC/TXT yuklab AI generatsiya qiling yoki qo&apos;lda tahrirlang
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* AI Generator Strip */}
        <div className="px-5 py-3.5 bg-indigo-950/35 border-b border-slate-800 space-y-2.5 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mavzu sarlavhasi..."
              className="md:col-span-5 min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm font-semibold text-white"
            />
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Qisqa tavsif (moddalar, boblar)..."
              className="md:col-span-5 min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-base sm:text-sm text-white"
            />
            <input
              type="number"
              min={5}
              max={240}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              className="md:col-span-2 min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base sm:text-sm text-white"
              title="Taxminiy davomiylik (daqiqa)"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <label className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 cursor-pointer shrink-0">
              <Upload className="h-4 w-4 text-indigo-300" />
              {extracting ? "O'qilmoqda..." : 'PDF / DOCX / DOC / TXT'}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <input
              type="text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Yoki qonun / darslik matnini shu yerga joylashtiring (AI generatsiya uchun)..."
              className="flex-1 min-h-[40px] rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-base sm:text-xs text-slate-200"
            />
            <button
              type="button"
              disabled={generating}
              onClick={handleAiGenerate}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-amber-600 hover:from-indigo-500 hover:to-amber-500 px-4 py-2 text-xs font-bold text-white shrink-0 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {generating ? 'AI generatsiya...' : 'AI Avto-Generatsiya'}
            </button>
          </div>
        </div>

        {/* 6 Editor Tabs */}
        <div className="flex flex-wrap gap-1.5 px-5 py-2.5 border-b border-slate-800 bg-slate-950/60 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                tab === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: KNOWLEDGE PACK */}
          {tab === 'knowledge' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Mavzu konspekti (qisqa mazmun)
                </label>
                <textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-base sm:text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Asosiy qoidalar (har bir qatorda bitta)
                </label>
                <textarea
                  rows={4}
                  value={keyPointsText}
                  onChange={(e) => setKeyPointsText(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-base sm:text-sm text-white"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300">
                    Qonun moddalari va protsessual muddatlar
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setArticles((prev) => [
                        ...prev,
                        { id: uid('ad'), codeOrLaw: '', articleOrPeriod: '', summary: '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-indigo-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> Qo&apos;shish
                  </button>
                </div>
                {articles.map((a, idx) => (
                  <div key={a.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={a.codeOrLaw}
                      onChange={(e) =>
                        setArticles((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, codeOrLaw: e.target.value } : x))
                        )
                      }
                      placeholder="Kodeks/Qonun"
                      className="sm:col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={a.articleOrPeriod}
                      onChange={(e) =>
                        setArticles((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, articleOrPeriod: e.target.value } : x
                          )
                        )
                      }
                      placeholder="Modda / Muddat"
                      className="sm:col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={a.summary}
                      onChange={(e) =>
                        setArticles((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, summary: e.target.value } : x))
                        )
                      }
                      placeholder="Mazmuni"
                      className="sm:col-span-5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setArticles((prev) => prev.filter((_, i) => i !== idx))}
                      className="sm:col-span-1 rounded-lg border border-rose-500/30 text-rose-300 flex items-center justify-center py-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-300">Yuridik atamalar lug&apos;ati</span>
                  <button
                    type="button"
                    onClick={() =>
                      setGlossary((prev) => [...prev, { id: uid('gl'), term: '', definition: '' }])
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-indigo-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> Qo&apos;shish
                  </button>
                </div>
                {glossary.map((g, idx) => (
                  <div key={g.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={g.term}
                      onChange={(e) =>
                        setGlossary((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, term: e.target.value } : x))
                        )
                      }
                      placeholder="Atama"
                      className="sm:col-span-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={g.definition}
                      onChange={(e) =>
                        setGlossary((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, definition: e.target.value } : x))
                        )
                      }
                      placeholder="Ta'rifi"
                      className="sm:col-span-7 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setGlossary((prev) => prev.filter((_, i) => i !== idx))}
                      className="sm:col-span-1 rounded-lg border border-rose-500/30 text-rose-300 flex items-center justify-center py-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: FLASHCARDS */}
          {tab === 'flashcards' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  setFlashcards((prev) => [
                    ...prev,
                    { id: uid('fc'), category: 'articles', front: '', back: '', articleRef: '' },
                  ])
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
              >
                <Plus className="h-4 w-4" /> Flashcard qo&apos;shish
              </button>

              {flashcards.map((fc, idx) => (
                <div
                  key={fc.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={fc.category}
                      onChange={(e) =>
                        setFlashcards((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, category: e.target.value as FlashcardCategory }
                              : x
                          )
                        )
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="articles">Moddalar va muddatlar</option>
                      <option value="terms">Yuridik atamalar</option>
                      <option value="organs">Davlat organlari</option>
                      <option value="subjects">Subyektlar va javobgarlik</option>
                    </select>
                    <input
                      type="text"
                      value={fc.articleRef || ''}
                      onChange={(e) =>
                        setFlashcards((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, articleRef: e.target.value } : x))
                        )
                      }
                      placeholder="Modda havolasi (ixtiyoriy)"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setFlashcards((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-rose-500/30 p-1.5 text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <textarea
                      rows={2}
                      value={fc.front}
                      onChange={(e) =>
                        setFlashcards((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, front: e.target.value } : x))
                        )
                      }
                      placeholder="Old tomon (Savol)"
                      className="rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                    />
                    <textarea
                      rows={2}
                      value={fc.back}
                      onChange={(e) =>
                        setFlashcards((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, back: e.target.value } : x))
                        )
                      }
                      placeholder="Orqa tomon (Javob)"
                      className="rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: QUIZ */}
          {tab === 'quiz' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQuizQuestions((prev) => [
                      ...prev,
                      {
                        id: uid('qz'),
                        type: 'mcq',
                        question: '',
                        options: ['', '', '', ''],
                        correctIndex: 0,
                        explanation: '',
                      },
                    ])
                  }
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" /> MCQ savol
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setQuizQuestions((prev) => [
                      ...prev,
                      {
                        id: uid('qz'),
                        type: 'cloze',
                        question: '',
                        acceptedAnswers: [''],
                        explanation: '',
                      },
                    ])
                  }
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" /> Cloze (bo&apos;shliq)
                </button>
              </div>

              {quizQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-indigo-300">
                      #{idx + 1} ({q.type.toUpperCase()})
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuizQuestions((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-rose-500/30 p-1.5 text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) =>
                      setQuizQuestions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x))
                      )
                    }
                    placeholder="Savol matni..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  {q.type === 'mcq' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(q.options || ['', '', '', '']).map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`qz-corr-${q.id}`}
                            checked={q.correctIndex === oIdx}
                            onChange={() =>
                              setQuizQuestions((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, correctIndex: oIdx } : x))
                              )
                            }
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              setQuizQuestions((prev) =>
                                prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const nextOpts = [...(x.options || ['', '', '', ''])];
                                  nextOpts[oIdx] = e.target.value;
                                  return { ...x, options: nextOpts };
                                })
                              )
                            }
                            placeholder={`Variant ${String.fromCharCode(65 + oIdx)}`}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={(q.acceptedAnswers || []).join(', ')}
                      onChange={(e) =>
                        setQuizQuestions((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  acceptedAnswers: e.target.value
                                    .split(',')
                                    .map((s) => s.trim()),
                                }
                              : x
                          )
                        )
                      }
                      placeholder="Qabul qilinadigan javoblar (vergul bilan)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                    />
                  )}
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) =>
                      setQuizQuestions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, explanation: e.target.value } : x))
                      )
                    }
                    placeholder="Tushuntirish..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300"
                  />
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: FULL TEST */}
          {tab === 'fullTest' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  setFullTestQuestions((prev) => [
                    ...prev,
                    {
                      id: uid('ft'),
                      question: '',
                      options: ['', '', '', ''],
                      correctIndex: 0,
                      explanation: '',
                      difficulty: 'medium',
                      articleRef: '',
                    },
                  ])
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                <Plus className="h-4 w-4" /> Imtihon savoli qo&apos;shish
              </button>

              {fullTestQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-300">#{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFullTestQuestions((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="rounded-lg border border-rose-500/30 p-1.5 text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) =>
                      setFullTestQuestions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x))
                      )
                    }
                    placeholder="BMBA test savoli..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`ft-corr-${q.id}`}
                          checked={q.correctIndex === oIdx}
                          onChange={() =>
                            setFullTestQuestions((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, correctIndex: oIdx } : x))
                            )
                          }
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) =>
                            setFullTestQuestions((prev) =>
                              prev.map((x, i) => {
                                if (i !== idx) return x;
                                const opts = [...x.options];
                                opts[oIdx] = e.target.value;
                                return { ...x, options: opts };
                              })
                            )
                          }
                          placeholder={`Variant ${String.fromCharCode(65 + oIdx)}`}
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) =>
                      setFullTestQuestions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, explanation: e.target.value } : x))
                      )
                    }
                    placeholder="Yuridik tushuntirish..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300"
                  />
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: WRITTEN & CASES (preserving raw comma/space input for synonyms!) */}
          {tab === 'written' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  const newId = uid('wr');
                  setWrittenQuestions((prev) => [
                    ...prev,
                    { id: newId, kind: 'case', prompt: '', expectedAnswer: '', synonyms: [] },
                  ]);
                  setSynonymDrafts((prev) => ({ ...prev, [newId]: '' }));
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
              >
                <Plus className="h-4 w-4" /> Yozma / Kazus qo&apos;shish
              </button>

              {writtenQuestions.map((w, idx) => (
                <div
                  key={w.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={w.kind}
                      onChange={(e) =>
                        setWrittenQuestions((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, kind: e.target.value as 'factual' | 'case' } : x
                          )
                        )
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white"
                    >
                      <option value="factual">Faktik savol</option>
                      <option value="case">Yuridik kazus</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setWrittenQuestions((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="rounded-lg border border-rose-500/30 p-1.5 text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={w.prompt}
                    onChange={(e) =>
                      setWrittenQuestions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, prompt: e.target.value } : x))
                      )
                    }
                    placeholder="Savol yoki kazus matni..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                  />
                  <textarea
                    rows={2}
                    value={w.expectedAnswer}
                    onChange={(e) =>
                      setWrittenQuestions((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, expectedAnswer: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Kalit javob..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                  />
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Sinonimlar (vergul bilan ajratib yozing):
                    </label>
                    <input
                      type="text"
                      value={synonymDrafts[w.id] ?? ''}
                      onChange={(e) =>
                        setSynonymDrafts((prev) => ({ ...prev, [w.id]: e.target.value }))
                      }
                      placeholder="masalan: sud hukmisiz aybsiz, aybsizlik prezumpsiyasi"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 6: AI ORAL QUESTIONS */}
          {tab === 'ai' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAiQuestions((prev) => [...prev, ''])}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
              >
                <Plus className="h-4 w-4" /> Og&apos;zaki AI savoli qo&apos;shish
              </button>

              {aiQuestions.map((q, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) =>
                      setAiQuestions((prev) =>
                        prev.map((x, i) => (i === idx ? e.target.value : x))
                      )
                    }
                    placeholder={`${idx + 1}-og'zaki savol...`}
                    className="flex-1 min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setAiQuestions((prev) => prev.filter((_, i) => i !== idx))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/30 text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2 text-sm font-bold text-white shadow-lg"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saqlanmoqda...' : 'Mavzuni saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
