import { useEffect, useState } from 'react';
import {
  Scale,
  BookOpen,
  Layers,
  CheckSquare,
  PenTool,
  Mic,
  Calendar,
  Shield,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { AuthConfigInfo, ExamDateItem, Textbook, UserProfile } from '@shared/types';
import { getCountdownParts } from '@shared/utils';
import { api } from '@/lib/api';
import { TelegramLoginWidget } from '@/components/auth/TelegramLoginWidget';

interface LandingPageProps {
  config: AuthConfigInfo;
  onAuthenticated: (user: UserProfile) => void;
  onError: (msg: string) => void;
}

const METHODOLOGY_STEPS = [
  {
    step: '01',
    title: 'Konspekt',
    desc: "Yangi Konstitutsiya va kodeks moddalari, protsessual muddatlar va yuridik atamalar lug'ati.",
    icon: BookOpen,
    color: 'text-indigo-300 bg-indigo-500/15 border-indigo-400/25',
  },
  {
    step: '02',
    title: 'Kartalar (Leitner)',
    desc: '4 yuridik toifa, 3D flashcardlar, 1–3–7–14–30 kunlik takrorlash va «Juftini top» o‘yini.',
    icon: Layers,
    color: 'text-violet-300 bg-violet-500/15 border-violet-400/25',
  },
  {
    step: '03',
    title: 'Testlar va Tartib',
    desc: 'Tezkor Quiz (MCQ + Cloze), protsessual ketma-ketlik kazusi va BMBA imtihon testi.',
    icon: CheckSquare,
    color: 'text-sky-300 bg-sky-500/15 border-sky-400/25',
  },
  {
    step: '04',
    title: 'Yozma va Kazuslar',
    desc: "Ochiq huquqiy kazuslarni Gemini AI semantik baholashi (sinonim va Lotin/Kirill qo'llab-quvvatlovi).",
    icon: PenTool,
    color: 'text-amber-300 bg-amber-500/15 border-amber-400/25',
  },
  {
    step: '05',
    title: 'AI Huquqshunos Ustoz',
    desc: "Real vaqtdagi ovozli (Gemini Live) va matnli og'zaki imtihon hamda shaxsiy tahlil hisoboti.",
    icon: Mic,
    color: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/25',
  },
];

export function LandingPage({ config, onAuthenticated, onError }: LandingPageProps) {
  const [textbooks, setTextbooks] = useState<Array<Textbook & { topicCount: number }>>([]);
  const [examDates, setExamDates] = useState<ExamDateItem[]>([]);

  useEffect(() => {
    api
      .getPublicCatalog()
      .then((res) => {
        setTextbooks(res.textbooks);
        setExamDates(res.examDates);
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-x-clip">
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full bg-indigo-600/20 blur-[130px]" />
        <div className="absolute top-1/3 -right-24 h-[340px] w-[340px] rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[380px] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-600 to-amber-500 shadow-lg shadow-indigo-500/30">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="block text-base font-extrabold tracking-tight text-white">
                HuquqPro
              </span>
              <span className="block text-[11px] font-medium text-amber-300/90 -mt-0.5">
                Oson Huquq • AI LMS
              </span>
            </div>
          </div>

          <a
            href="#login-section"
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition shadow-lg shadow-indigo-600/25"
          >
            Telegram orqali kirish
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16 space-y-16">
        {/* Hero + Central Login Widget */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-200">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              TDYU • Milliy Sertifikat • 8–11-sinf Huquqshunoslik
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
              Huquqshunoslikni{' '}
              <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-amber-300 bg-clip-text text-transparent">
                5 bosqichli metodika
              </span>{' '}
              va AI Ustoz bilan mukammal o&apos;rganing
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              O&apos;zbekiston Respublikasining yangi tahrirdagi Konstitutsiyasi, Fuqarolik, Jinoyat
              va Mehnat kodekslari asosida tuzilgan mustaqil ta&apos;lim platformasi. Real vaqtdagi
              ovozli AI Huquqshunos Ustoz bilan og&apos;zaki imtihon va kazus tahlilidan o&apos;ting.
            </p>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="glass-card rounded-2xl p-3.5">
                <p className="text-xl sm:text-2xl font-extrabold text-white">5 bosqich</p>
                <p className="text-xs text-slate-400 mt-0.5">To&apos;liq o&apos;zlashtirish sikli</p>
              </div>
              <div className="glass-card rounded-2xl p-3.5">
                <p className="text-xl sm:text-2xl font-extrabold text-amber-300">Leitner</p>
                <p className="text-xs text-slate-400 mt-0.5">1–3–7–14–30 kunlik takror</p>
              </div>
              <div className="glass-card rounded-2xl p-3.5">
                <p className="text-xl sm:text-2xl font-extrabold text-indigo-300">AI Live</p>
                <p className="text-xs text-slate-400 mt-0.5">Ovozli og&apos;zaki imtihon</p>
              </div>
            </div>
          </div>

          <div id="login-section" className="lg:col-span-5">
            <div className="glass-panel rounded-3xl p-5 sm:p-7 shadow-2xl border border-indigo-500/25">
              <div className="mb-5 text-center">
                <h2 className="text-xl font-bold text-white">Platformaga kirish</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Shaxsiy Roadmap, Countdown va AI Ustozni ishga tushiring
                </p>
              </div>

              <TelegramLoginWidget
                botUsername={config.telegramBotUsername}
                devAuthEnabled={config.devAuthEnabled}
                onAuthenticated={onAuthenticated}
                onError={onError}
              />
            </div>
          </div>
        </section>

        {/* 5-step methodology */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">
                Ilmiy-pedagogik yondashuv
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Har bir mavzu uchun 5 bosqichli erkin sikl
              </h2>
            </div>
            <p className="text-sm text-slate-400 max-w-md">
              O&apos;quvchi xohlagan bosqichdan boshlashi mumkin — barcha natijalar va xatolar banki
              avtomatik sinxronlanadi.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {METHODOLOGY_STEPS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="glass-card rounded-2xl p-5 flex flex-col justify-between hover:border-indigo-400/35 transition"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border ${item.color}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-500">{item.step}</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Public Courses Catalog & Upcoming Exam Dates */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Ochiq huquqshunoslik darsliklari katalogi
              </h2>
              <span className="text-xs text-slate-400">{textbooks.length} ta ochiq kurs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {textbooks.map((tb) => (
                <div
                  key={tb.id}
                  className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-indigo-500/35 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                        {tb.branch}
                      </span>
                      <span className="text-[11px] font-medium text-amber-300">{tb.gradeTag}</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{tb.title}</h3>
                    <p className="mt-1.5 text-xs text-slate-300 leading-relaxed line-clamp-3">
                      {tb.description}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>{tb.topicCount} ta mavzu</span>
                    <span className="text-emerald-400 font-medium">Bepul ochiq</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-400" />
              Yaqin imtihon sanalari
            </h2>
            <div className="space-y-3">
              {examDates.map((ed) => {
                const cd = getCountdownParts(ed.date);
                return (
                  <div key={ed.id} className="glass-card rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white leading-snug">{ed.title}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(ed.date).toLocaleDateString('uz-UZ', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-amber-500/15 border border-amber-400/25 px-2.5 py-1 text-xs font-bold text-amber-300">
                        {cd.isPast ? "O'tgan" : `${cd.days} kun`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-8 text-center text-xs text-slate-400">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-indigo-400" />
            HuquqPro / Oson Huquq — O&apos;zbekiston huquqshunoslik ta&apos;lim platformasi
          </span>
          <span>Mustaqil veb-platforma • Telegram Login orqali xavfsiz kirish</span>
        </div>
      </footer>
    </div>
  );
}
