import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers,
  RotateCw,
  Check,
  X,
  Puzzle,
  Sparkles,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { FlashcardCategory, LeitnerCardState, Topic } from '@shared/types';
import { FLASHCARD_CATEGORY_LABELS } from '@shared/utils';
import { api } from '@/lib/api';

interface StepCardsProps {
  topic: Topic;
  leitnerCards: LeitnerCardState[];
  onProgressSync: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

const CATEGORY_TABS: Array<{ id: 'all' | FlashcardCategory; label: string }> = [
  { id: 'all', label: 'Barchasi' },
  { id: 'articles', label: 'Moddalar va muddatlar' },
  { id: 'terms', label: 'Yuridik atamalar' },
  { id: 'organs', label: 'Davlat organlari' },
  { id: 'subjects', label: 'Subyektlar va javobgarlik' },
];

export function StepCards({ topic, leitnerCards, onProgressSync, onToast }: StepCardsProps) {
  const [subMode, setSubMode] = useState<'flashcards' | 'matching'>('flashcards');
  const [category, setCategory] = useState<'all' | FlashcardCategory>('all');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localStates, setLocalStates] = useState<Record<string, LeitnerCardState>>(() => {
    const map: Record<string, LeitnerCardState> = {};
    for (const c of leitnerCards) map[c.cardId] = c;
    return map;
  });

  useEffect(() => {
    const map: Record<string, LeitnerCardState> = {};
    for (const c of leitnerCards) map[c.cardId] = c;
    setLocalStates(map);
  }, [leitnerCards]);

  const filteredCards = useMemo(() => {
    if (category === 'all') return topic.flashcards;
    return topic.flashcards.filter((c) => c.category === category);
  }, [topic.flashcards, category]);

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [category, topic.id]);

  const currentCard = filteredCards[index] || null;
  const currentState = currentCard ? localStates[currentCard.id] : undefined;

  const handleAnswer = useCallback(
    async (known: boolean) => {
      if (!currentCard || !flipped || saving) return;
      try {
        setSaving(true);
        const res = await api.reviewLeitnerCard({
          topicId: topic.id,
          cardId: currentCard.id,
          known,
          cardFront: currentCard.front,
        });
        setLocalStates((prev) => ({ ...prev, [currentCard.id]: res.cardState }));
        onProgressSync();
        setFlipped(false);
        setIndex((i) => (i + 1 < filteredCards.length ? i + 1 : 0));
      } catch (err) {
        onToast('error', err instanceof Error ? err.message : 'Natijani saqlashda xatolik.');
      } finally {
        setSaving(false);
      }
    },
    [currentCard, flipped, saving, topic.id, filteredCards.length, onProgressSync, onToast]
  );

  // Keyboard navigation
  useEffect(() => {
    if (subMode !== 'flashcards') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === 'ArrowRight') {
        void handleAnswer(true);
      } else if (flipped && e.key === 'ArrowLeft') {
        void handleAnswer(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subMode, flipped, handleAnswer]);

  // ==================== MATCHING MINI-GAME ====================
  const matchingPairs = useMemo(() => {
    const source = topic.flashcards.slice(0, 6);
    return source.map((c) => ({
      id: c.id,
      left: c.articleRef ? `${c.articleRef}: ${c.front.slice(0, 70)}` : c.front.slice(0, 82),
      right: c.back.slice(0, 100),
    }));
  }, [topic.flashcards]);

  const [shuffledRight, setShuffledRight] = useState<Array<{ id: string; text: string }>>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);

  const resetMatching = useCallback(() => {
    const arr = matchingPairs.map((p) => ({ id: p.id, text: p.right }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledRight(arr);
    setSelectedLeft(null);
    setMatchedIds([]);
    setWrongFlash(null);
    setMistakes(0);
  }, [matchingPairs]);

  useEffect(() => {
    resetMatching();
  }, [resetMatching]);

  const handleSelectRight = (rightId: string) => {
    if (!selectedLeft || matchedIds.includes(rightId)) return;
    if (selectedLeft === rightId) {
      const next = [...matchedIds, rightId];
      setMatchedIds(next);
      setSelectedLeft(null);
      if (next.length === matchingPairs.length) {
        onToast('success', "Barakalla! Barcha yuridik juftliklarni to'g'ri topdingiz!");
      }
    } else {
      setMistakes((m) => m + 1);
      setWrongFlash(rightId);
      setTimeout(() => setWrongFlash(null), 500);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-slate-800 bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => setSubMode('flashcards')}
            className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
              subMode === 'flashcards'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            Leitner Kartalar ({topic.flashcards.length})
          </button>
          <button
            type="button"
            onClick={() => setSubMode('matching')}
            className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
              subMode === 'matching'
                ? 'bg-violet-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Puzzle className="h-4 w-4" />
            Juftini top
          </button>
        </div>

        <span className="text-xs text-slate-400">
          O&apos;zlashtirilgan:{' '}
          <strong className="text-emerald-300">
            {Object.values(localStates).filter((s) => s.known && s.box >= 2).length}
          </strong>{' '}
          / {topic.flashcards.length}
        </span>
      </div>

      {subMode === 'flashcards' ? (
        <div className="space-y-4">
          {/* 4 Legal Category Filters */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                  category === cat.id
                    ? 'border-indigo-400 bg-indigo-500/20 text-white'
                    : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {currentCard ? (
            <div className="glass-panel rounded-3xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Karta {index + 1} / {filteredCards.length}
                </span>
                <span className="font-semibold text-amber-300">
                  {currentState
                    ? `${currentState.box}-quti • Keyingi: ${currentState.intervalDays} kun`
                    : 'Yangi karta'}
                </span>
              </div>

              {/* 3D Flip Card */}
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
                  {/* Front (scrollable inside if long!) */}
                  <div className="absolute inset-0 backface-hidden rounded-2xl border border-indigo-500/35 bg-slate-900/95 p-5 sm:p-7 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                        {FLASHCARD_CATEGORY_LABELS[currentCard.category]}
                      </span>
                      <span className="text-[11px] text-slate-400">Savol</span>
                    </div>
                    <div className="my-2 overflow-y-auto max-h-40 pr-1 flex items-center justify-center">
                      <p className="text-base sm:text-lg font-bold text-white text-center leading-relaxed">
                        {currentCard.front}
                      </p>
                    </div>
                    <p className="text-center text-xs text-indigo-300 flex items-center justify-center gap-1.5">
                      <RotateCw className="h-3.5 w-3.5" />
                      Ochish uchun bosing yoki Space tugmasini bosing
                    </p>
                  </div>

                  {/* Back */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-slate-900 via-indigo-950/75 to-slate-900 p-5 sm:p-7 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
                        {currentCard.articleRef || 'Yuridik asos'}
                      </span>
                      <span className="text-[11px] text-emerald-300">Javob</span>
                    </div>
                    <div className="my-2 overflow-y-auto max-h-40 pr-1 flex items-center justify-center">
                      <p className="text-sm sm:text-base font-medium text-slate-100 text-center leading-relaxed">
                        {currentCard.back}
                      </p>
                    </div>
                    <p className="text-center text-xs text-slate-400">
                      ← Qiyin (1 kun) • → Bildim (Keyingi quti)
                    </p>
                  </div>
                </div>
              </div>

              {/* Active recall action buttons (disabled until flipped) */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!flipped || saving}
                  onClick={() => handleAnswer(false)}
                  className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <X className="h-4 w-4" />
                  Qiyin (Qayta)
                </button>
                <button
                  type="button"
                  disabled={!flipped || saving}
                  onClick={() => handleAnswer(true)}
                  className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-4 py-3 text-sm font-bold text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Check className="h-4 w-4" />
                  Bildim
                </button>
              </div>

              {/* Prev / Next card browse */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFlipped(false);
                    setIndex((i) => (i > 0 ? i - 1 : filteredCards.length - 1));
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Oldingi
                </button>
                {!flipped && (
                  <span className="text-[11px] text-slate-400 text-center">
                    Avval kartani aylantiring
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFlipped(false);
                    setIndex((i) => (i + 1 < filteredCards.length ? i + 1 : 0));
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Keyingi
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-6 text-center text-sm text-slate-400">
              Ushbu toifada kartochkalar mavjud emas.
            </div>
          )}
        </div>
      ) : (
        /* Matching Game */
        <div className="glass-panel rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Puzzle className="h-5 w-5 text-violet-400" />
                «Juftini top» mini-o&apos;yini
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Chap tomondan savol/moddani, o&apos;ng tomondan uning to&apos;g&apos;ri ta&apos;rifini tanlang
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-300 font-bold">
                Topildi: {matchedIds.length}/{matchingPairs.length}
              </span>
              <span className="text-rose-300 font-semibold">Xatolar: {mistakes}</span>
              <button
                type="button"
                onClick={resetMatching}
                className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Qayta
              </button>
            </div>
          </div>

          {matchedIds.length === matchingPairs.length && matchingPairs.length > 0 ? (
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-6 text-center space-y-3">
              <Sparkles className="h-9 w-9 text-amber-300 mx-auto" />
              <p className="text-lg font-extrabold text-white">
                Barcha {matchingPairs.length} ta juftlik topildi!
              </p>
              <p className="text-xs text-slate-300">Xato urinishlar soni: {mistakes}</p>
              <button
                type="button"
                onClick={resetMatching}
                className="min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white"
              >
                Yana o&apos;ynash
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                  Modda / Atama
                </p>
                {matchingPairs.map((pair) => {
                  const isMatched = matchedIds.includes(pair.id);
                  const isSelected = selectedLeft === pair.id;
                  return (
                    <button
                      key={pair.id}
                      type="button"
                      disabled={isMatched}
                      onClick={() => setSelectedLeft(pair.id)}
                      className={`w-full min-h-[56px] text-left rounded-2xl border p-3.5 text-xs sm:text-sm font-medium transition ${
                        isMatched
                          ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200 opacity-75'
                          : isSelected
                            ? 'border-indigo-400 bg-indigo-500/25 text-white shadow-md'
                            : 'border-slate-800 bg-slate-900/75 text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {pair.left}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Mazmuni / Javobi
                </p>
                {shuffledRight.map((item) => {
                  const isMatched = matchedIds.includes(item.id);
                  const isWrong = wrongFlash === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isMatched || !selectedLeft}
                      onClick={() => handleSelectRight(item.id)}
                      className={`w-full min-h-[56px] text-left rounded-2xl border p-3.5 text-xs sm:text-sm font-medium transition ${
                        isMatched
                          ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200 opacity-75'
                          : isWrong
                            ? 'border-rose-500 bg-rose-500/25 text-rose-100'
                            : selectedLeft
                              ? 'border-slate-700 bg-slate-900/80 text-slate-100 hover:border-amber-400/60'
                              : 'border-slate-800/80 bg-slate-900/50 text-slate-400'
                      }`}
                    >
                      {item.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
