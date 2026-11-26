import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Layers,
  CheckSquare,
  PenTool,
  Mic,
  CheckCircle2,
} from 'lucide-react';
import type { LeitnerCardState, Topic, TopicProgress } from '@shared/types';
import { api } from '@/lib/api';
import { StepKonspekt } from './StepKonspekt';
import { StepCards } from './StepCards';
import { StepTests } from './StepTests';
import { StepWritten } from './StepWritten';
import { StepAiTutor } from './StepAiTutor';

interface TopicWorkspaceProps {
  topicId: string;
  geminiConfigured: boolean;
  onBack: () => void;
  onProgressChanged: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

type StepKey = 'konspekt' | 'cards' | 'tests' | 'written' | 'ai';

export function TopicWorkspace({
  topicId,
  geminiConfigured,
  onBack,
  onProgressChanged,
  onToast,
}: TopicWorkspaceProps) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [progress, setProgress] = useState<TopicProgress | null>(null);
  const [leitnerCards, setLeitnerCards] = useState<LeitnerCardState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepKey>('konspekt');

  const loadTopic = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTopic(topicId);
      setTopic(res.topic);
      setProgress(res.progress);
      setLeitnerCards(res.leitnerCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mavzuni yuklashda xatolik.');
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void loadTopic();
  }, [loadTopic]);

  const handleSaveProgress = async (
    patch: Parameters<typeof api.updateTopicProgress>[1]
  ) => {
    if (!topic) return;
    const res = await api.updateTopicProgress(topic.id, patch);
    setProgress(res.progress);
    onProgressChanged();
  };

  if (loading) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center text-slate-400">
        Mavzu o&apos;quv paketi yuklanmoqda...
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center space-y-4">
        <p className="text-base font-bold text-rose-300">{error || 'Mavzu topilmadi.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Darslarga qaytish
        </button>
      </div>
    );
  }

  const steps: Array<{
    key: StepKey;
    num: number;
    label: string;
    icon: typeof BookOpen;
    done: boolean;
    badge?: string;
  }> = [
    {
      key: 'konspekt',
      num: 1,
      label: 'Konspekt',
      icon: BookOpen,
      done: Boolean(progress?.konspektRead),
    },
    {
      key: 'cards',
      num: 2,
      label: 'Kartalar',
      icon: Layers,
      done: (progress?.cardsScore ?? 0) >= 60,
      badge: progress?.cardsScore ? `${progress.cardsScore}%` : undefined,
    },
    {
      key: 'tests',
      num: 3,
      label: 'Testlar',
      icon: CheckSquare,
      done: (progress?.quizScore ?? 0) >= 60 || (progress?.fullTestScore ?? 0) >= 60,
      badge:
        progress?.fullTestScore !== null && progress?.fullTestScore !== undefined
          ? `${progress.fullTestScore}%`
          : progress?.quizScore !== null && progress?.quizScore !== undefined
            ? `${progress.quizScore}%`
            : undefined,
    },
    {
      key: 'written',
      num: 4,
      label: 'Yozma',
      icon: PenTool,
      done: (progress?.writtenScore ?? 0) >= 60,
      badge:
        progress?.writtenScore !== null && progress?.writtenScore !== undefined
          ? `${progress.writtenScore}%`
          : undefined,
    },
    {
      key: 'ai',
      num: 5,
      label: 'AI Ustoz',
      icon: Mic,
      done: (progress?.aiTutorScore ?? 0) >= 60,
      badge:
        progress?.aiTutorScore !== null && progress?.aiTutorScore !== undefined
          ? `${progress.aiTutorScore}%`
          : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Topic Header */}
      <div className="glass-panel rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Darslarga qaytish"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
              {topic.order}-dars • 5 bosqichli erkin sikl
            </span>
            <h1 className="text-lg sm:text-2xl font-extrabold text-white leading-snug">
              {topic.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{topic.subtitle}</p>
          </div>
        </div>

        {/* Free-switch 5-Step Navigation */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {steps.map((s) => {
            const Icon = s.icon;
            const active = activeStep === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveStep(s.key)}
                className={`min-h-[54px] rounded-2xl border px-1 sm:px-3 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center transition ${
                  active
                    ? 'border-indigo-400 bg-indigo-600/30 text-white shadow-md shadow-indigo-600/20'
                    : s.done
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
                      : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  <Icon className="h-4 w-4 shrink-0" />
                  {s.done && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 absolute -top-1.5 -right-2 bg-slate-950 rounded-full" />
                  )}
                </div>
                <span className="text-[10px] tracking-tight sm:tracking-normal sm:text-xs font-bold leading-tight whitespace-nowrap">
                  {s.label}
                </span>
                {s.badge && (
                  <span className="hidden lg:inline-block rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                    {s.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      {activeStep === 'konspekt' && (
        <StepKonspekt
          topic={topic}
          progress={progress}
          onMarkRead={() => handleSaveProgress({ konspektRead: true })}
          onToast={onToast}
        />
      )}

      {activeStep === 'cards' && (
        <StepCards
          topic={topic}
          leitnerCards={leitnerCards}
          onProgressSync={() => {
            void loadTopic();
            onProgressChanged();
          }}
          onToast={onToast}
        />
      )}

      {activeStep === 'tests' && (
        <StepTests
          topic={topic}
          progress={progress}
          onSaveProgress={handleSaveProgress}
          onToast={onToast}
        />
      )}

      {activeStep === 'written' && (
        <StepWritten
          topic={topic}
          progress={progress}
          onGraded={(updated) => {
            setProgress(updated);
            onProgressChanged();
          }}
          onToast={onToast}
        />
      )}

      {activeStep === 'ai' && (
        <StepAiTutor
          topic={topic}
          progress={progress}
          geminiConfigured={geminiConfigured}
          onSessionEvaluated={() => {
            void loadTopic();
            onProgressChanged();
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
