import { useCallback, useEffect, useState } from 'react';
import {
  RotateCw,
  Check,
  X,
  AlertTriangle,
  Layers,
  RefreshCw,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { FLASHCARD_CATEGORY_LABELS, LEITNER_INTERVALS_DAYS } from '@shared/utils';
import { api, type ReviewTodayResponse } from '@/lib/api';

interface ReviewTabProps {
  onOpenTopic: (topicId: string) => void;
  onProgressUpdated: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function ReviewTab({ onOpenTopic, onProgressUpdated, onToast }: ReviewTabProps) {
  const [data, setData] = useState<ReviewTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadReview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getReviewToday();
      setData(res);
      setCardIndex(0);
      setFlipped(false);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Takrorlash ro'yxatini yuklashda xatolik.");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const currentDue = data?.dueCards[cardIndex] || null;

  const handleReviewAnswer = useCallback(
    async (known: boolean) => {
      if (!currentDue || !flipped || submitting) return;
      try {
        setSubmitting(true);
        const res = await api.reviewLeitnerCard({
          topicId: currentDue.topicId,
          cardId: currentDue.card.id,
          known,
          cardFront: currentDue.card.front,
        });
        onToast(
          known ? 'success' : 'info',
          known
            ? `Ajoyib! Keyingi takrorlash: ${res.cardState.intervalDays} kundan so'ng (${res.cardState.box}-quti).`
            : "1-qutiga qaytarildi — ertaga yana takrorlanadi."
        );
        setFlipped(false);
        setCardIndex((prev) => prev + 1);
        onProgressUpdated();
      } catch (err) {
        onToast('error', err instanceof Error ? err.message : 'Natijani saqlashda xatolik.');
      } finally {
        setSubmitting(false);
      }
    },
    [currentDue, flipped, submitting, onProgressUpdated, onToast]
  );

  // Keyboard shortcuts for active recall
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!currentDue) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === 'ArrowRight') {
        void handleReviewAnswer(true);
      } else if (flipped && e.key === 'ArrowLeft') {
        void handleReviewAnswer(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentDue, flipped, handleReviewAnswer]);

  if (loading) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center text-slate-400">
        Leitner kartochkalari va xatolar banki yuklanmoqda...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Leitner Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs text-slate-400">Bugungi takrorlash</p>
          <p className="text-2xl font-extrabold text-amber-300 mt-1">
            {data ? Math.max(0, data.dueCards.length - cardIndex) : 0}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs text-slate-400">O&apos;zlashtirilgan</p>
          <p className="text-2xl font-extrabold text-emerald-300 mt-1">
            {data?.allLeitnerStats.mastered ?? 0}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs text-slate-400">Jami kuzatuvda</p>
          <p className="text-2xl font-extrabold text-indigo-300 mt-1">
            {data?.allLeitnerStats.totalTracked ?? 0}
          </p>
        </div>
      </div>

      {/* Leitner SRS Deck */}
      <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              Leitner oraliq takrorlash tizimi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Intervallar: {LEITNER_INTERVALS_DAYS.join(' → ')} kun • Klaviatura: Space (aylantirish),
              ← (Qiyin), → (Bildim)
            </p>
          </div>
          <button
            type="button"
            onClick={loadReview}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yangilash
          </button>
        </div>

        {currentDue ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="truncate">{currentDue.topicTitle}</span>
              <span className="shrink-0 font-bold text-indigo-300">
                {cardIndex + 1} / {data!.dueCards.length} •{' '}
                {currentDue.state ? `${currentDue.state.box}-quti` : 'Yangi karta'}
              </span>
            </div>

            <div className="perspective-1000">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFlipped((f) => !f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setFlipped((f) => !f);
                }}
                className={`relative w-full h-64 sm:h-72 cursor-pointer preserve-3d transition-transform duration-500 ${
                  flipped ? 'rotate-y-180' : ''
                }`}
              >
                {/* Front */}
                <div className="absolute inset-0 backface-hidden rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-5 sm:p-7 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                      {FLASHCARD_CATEGORY_LABELS[currentDue.card.category]}
                    </span>
                    <span className="text-[11px] text-slate-400">Savol tomoni</span>
                  </div>
                  <div className="my-2 overflow-y-auto max-h-36 pr-1 flex items-center justify-center">
                    <p className="text-base sm:text-lg font-bold text-white text-center leading-relaxed">
                      {currentDue.card.front}
                    </p>
                  </div>
                  <p className="text-center text-xs text-indigo-300/90 flex items-center justify-center gap-1.5">
                    <RotateCw className="h-3.5 w-3.5" />
                    Javobni ko&apos;rish uchun bosing (yoki Space)
                  </p>
                </div>

                {/* Back */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-slate-900 via-indigo-950/70 to-slate-900 p-5 sm:p-7 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
                      {currentDue.card.articleRef || 'Yuridik javob'}
                    </span>
                    <span className="text-[11px] text-emerald-300">Javob tomoni</span>
                  </div>
                  <div className="my-2 overflow-y-auto max-h-40 pr-1 flex items-center justify-center">
                    <p className="text-sm sm:text-base font-medium text-slate-100 text-center leading-relaxed">
                      {currentDue.card.back}
                    </p>
                  </div>
                  <p className="text-center text-xs text-slate-400">
                    O&apos;zingizni halol baholang: eslay oldingizmi?
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!flipped || submitting}
                onClick={() => handleReviewAnswer(false)}
                className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <X className="h-4 w-4" />
                Qiyin (1 kun)
              </button>
              <button
                type="button"
                disabled={!flipped || submitting}
                onClick={() => handleReviewAnswer(true)}
                className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-4 py-3 text-sm font-bold text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Check className="h-4 w-4" />
                Bildim (Keyingi quti)
              </button>
            </div>
            {!flipped && (
              <p className="text-center text-xs text-slate-400">
                Aktiv eslash qoidasi: baholashdan avval kartani aylantirib javobni tekshiring.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center space-y-2">
            <Sparkles className="h-8 w-8 text-emerald-300 mx-auto" />
            <p className="text-base font-bold text-white">
              Bugungi barcha Leitner kartochkalari takrorlandi!
            </p>
            <p className="text-xs text-slate-300">
              Yangi mavzular kartochkalarini mashq qilsangiz, ular avtomatik jadvalga qo&apos;shiladi.
            </p>
          </div>
        )}
      </section>

      {/* Weak / Mistakes Bank */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Xatolar banki (Barcha mavzular bo&apos;yicha)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Qiyin moddalar, atamalar va yozma kazuslardagi xatolaringiz AI Ustozga ham uzatiladi
            </p>
          </div>
        </div>

        {!data || data.weakBank.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-center">
            <p className="text-sm text-slate-300 font-medium">
              Hozircha xatolar banki bo&apos;sh — a&apos;lo natija!
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Kartochka, Protsessual tartib yoki Yozma kazuslarda xato qilsangiz, ular shu yerda to&apos;planadi.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.weakBank.map((item) => (
              <div
                key={item.topicId}
                className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">{item.topicTitle}</h3>
                  <button
                    type="button"
                    onClick={() => onOpenTopic(item.topicId)}
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 px-3 py-1 text-xs font-semibold text-indigo-200 transition shrink-0"
                  >
                    Mavzuga o&apos;tish
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {item.weak.cards.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase text-amber-300">
                      Qiyin kartochkalar ({item.weak.cards.length})
                    </p>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {item.weak.cards.map((c, idx) => (
                        <li
                          key={idx}
                          className="rounded-lg bg-slate-950/70 px-3 py-2 border border-slate-800/80"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.writtenMistakes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase text-rose-300">
                      Yozma va kazus xatolari ({item.writtenMistakes.length})
                    </p>
                    <div className="space-y-2">
                      {item.writtenMistakes.map((m) => (
                        <div
                          key={m.questionId}
                          className="rounded-xl bg-rose-950/30 border border-rose-500/25 p-3 text-xs space-y-1"
                        >
                          <p className="font-semibold text-white">{m.prompt}</p>
                          <p className="text-rose-200">Sizning javobingiz: {m.studentAnswer || '(bo‘sh)'}</p>
                          <p className="text-emerald-300">To&apos;g&apos;ri asos: {m.expectedAnswer}</p>
                          <p className="text-slate-300 italic">{m.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.weak.timeline.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase text-sky-300">
                      Protsessual tartib xatolari
                    </p>
                    {item.weak.timeline.map((t, i) => (
                      <p key={i} className="text-xs text-slate-300 bg-slate-950/60 px-3 py-2 rounded-lg">
                        {t}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
