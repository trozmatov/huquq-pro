import { useState } from 'react';
import { BookOpen, Copy, Check, CheckCircle2, Scale, BookMarked, Sparkles } from 'lucide-react';
import type { Topic, TopicProgress } from '@shared/types';

interface StepKonspektProps {
  topic: Topic;
  progress: TopicProgress | null;
  onMarkRead: () => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function StepKonspekt({ topic, progress, onMarkRead, onToast }: StepKonspektProps) {
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);
  const kp = topic.knowledgePack;

  const handleCopyPack = async () => {
    const lines: string[] = [
      `MAVZU: ${topic.title}`,
      `${topic.subtitle}`,
      '',
      'QISQA MAZMUN:',
      kp.summary,
      '',
      'ASOSIY QOIDALAR:',
      ...kp.keyPoints.map((p, i) => `${i + 1}. ${p}`),
      '',
      'MUHIM QONUN MODDALARI VA PROTSESSUAL MUDDATLAR:',
      ...kp.articlesAndDeadlines.map(
        (a) => `- ${a.codeOrLaw} | ${a.articleOrPeriod}: ${a.summary}`
      ),
      '',
      'ASOSIY YURIDIK ATAMALAR:',
      ...kp.glossary.map((g) => `- ${g.term}: ${g.definition}`),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      onToast('success', 'Bilim paketi buferga nusxalandi!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('error', "Nusxalab bo'lmadi. Brauzer ruxsatini tekshiring.");
    }
  };

  const handleConfirmRead = async () => {
    try {
      setMarking(true);
      await onMarkRead();
      onToast('success', "1-bosqich — Konspekt o'qilgan deb belgilandi!");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header action bar */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">Bilim paketi va konspekt</h2>
              <p className="text-xs text-slate-400">
                Qisqa mazmun, qonun moddalari va atamalar lug&apos;ati
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyPack}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-100 transition"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                Nusxalandi
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-indigo-300" />
                Bilim paketini nusxalash
              </>
            )}
          </button>
        </div>

        <p className="text-sm sm:text-base leading-relaxed text-slate-200">{kp.summary}</p>

        {kp.keyPoints.length > 0 && (
          <div className="rounded-2xl bg-slate-900/75 border border-slate-800 p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Eslab qolish shart bo&apos;lgan asosiy qoidalar
            </h3>
            <ul className="space-y-2">
              {kp.keyPoints.map((pt, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-200 leading-relaxed">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-[11px] font-bold text-indigo-300">
                    {idx + 1}
                  </span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Articles & Procedural Deadlines Timeline/Table */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
          <Scale className="h-5 w-5 text-amber-400" />
          Muhim qonun moddalari va protsessual muddatlar
        </h3>

        <div className="space-y-2.5">
          {kp.articlesAndDeadlines.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="sm:w-52 shrink-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {item.codeOrLaw}
                </p>
                <span className="mt-1 inline-flex items-center rounded-lg bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 text-xs font-extrabold text-amber-200">
                  {item.articleOrPeriod}
                </span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed flex-1">{item.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Legal Glossary */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-violet-400" />
          Asosiy yuridik atamalar lug&apos;ati
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {kp.glossary.map((g) => (
            <div
              key={g.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-1.5"
            >
              <h4 className="text-sm font-bold text-indigo-200">{g.term}</h4>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{g.definition}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mark as read CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={marking}
          onClick={handleConfirmRead}
          className={`min-h-[48px] inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition ${
            progress?.konspektRead
              ? 'bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/35'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
          }`}
        >
          <CheckCircle2 className="h-5 w-5" />
          {progress?.konspektRead
            ? "Konspekt o'qilgan ✓"
            : marking
              ? 'Saqlanmoqda...'
              : "Konspektni o'qib bo'ldim"}
        </button>
      </div>
    </div>
  );
}
