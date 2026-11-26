import { useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Scale,
  ShieldCheck,
  Target,
  Calendar,
  GraduationCap,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ExamDateItem,
  ExamTrack,
  GradeLevel,
  StudentIdentity,
  StudyProfile,
  TargetGrade,
  UserProfile,
} from '@shared/types';
import { getCountdownParts, TARGET_GRADE_THRESHOLDS } from '@shared/utils';
import { api } from '@/lib/api';

interface OnboardingFlowProps {
  user: UserProfile;
  examDates: ExamDateItem[];
  isEditModal?: boolean;
  onComplete: (updatedUser: UserProfile) => void;
  onCancel?: () => void;
  onError: (msg: string) => void;
}

const IDENTITY_OPTIONS: Array<{
  value: StudentIdentity;
  label: string;
  desc: string;
}> = [
  {
    value: 'school_student',
    label: "Maktab / Litsey o'quvchisi",
    desc: '8–11-sinf «Davlat va huquq asoslari», olimpiada va poydevor bilimlar',
  },
  {
    value: 'applicant',
    label: 'Abituriyent (TDYU / OTM)',
    desc: "Toshkent davlat yuridik universiteti, OTM kirish va Milliy sertifikat",
  },
  {
    value: 'university_student',
    label: 'Talaba',
    desc: "Yurisprudensiya va ijtimoiy fanlar yo'nalishi talabasi",
  },
  {
    value: 'teacher_specialist',
    label: "O'qituvchi / Mutaxassis",
    desc: "Huquq fani o'qituvchisi, attestatsiya yoki malaka oshirish",
  },
];

const GRADE_OPTIONS: GradeLevel[] = ['8-sinf', '9-sinf', '10-sinf', '11-sinf', 'Abituriyent'];

const TARGET_GRADES: Array<{ value: TargetGrade; minPct: number; label: string }> = [
  { value: 'A+', minPct: TARGET_GRADE_THRESHOLDS['A+'], label: 'Eng yuqori natija (100% ball)' },
  { value: 'A', minPct: TARGET_GRADE_THRESHOLDS.A, label: 'Kuchli Milliy sertifikat darajasi' },
  { value: 'B+', minPct: TARGET_GRADE_THRESHOLDS['B+'], label: 'Yuqori ishonchli daraja' },
  { value: 'B', minPct: TARGET_GRADE_THRESHOLDS.B, label: 'Barqaror asosiy daraja' },
  { value: 'C+', minPct: TARGET_GRADE_THRESHOLDS['C+'], label: "O'rta daraja" },
  { value: 'C', minPct: TARGET_GRADE_THRESHOLDS.C, label: "Boshlang'ich o'tish darajasi" },
];

export function OnboardingFlow({
  user,
  examDates,
  isEditModal = false,
  onComplete,
  onCancel,
  onError,
}: OnboardingFlowProps) {
  const needsConsent = !isEditModal && !user.consentAcceptedAt;
  const [consentDone, setConsentDone] = useState(!needsConsent);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);

  const existing = user.studyProfile;
  const [identity, setIdentity] = useState<StudentIdentity>(existing?.identity || 'applicant');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>(existing?.gradeLevel || 'Abituriyent');
  const [examType, setExamType] = useState<ExamTrack>(existing?.examType || 'main_law');
  const [examDateId, setExamDateId] = useState<string | null>(
    existing?.examDateId !== undefined ? existing.examDateId : (examDates[0]?.id ?? null)
  );
  const [targetGrade, setTargetGrade] = useState<TargetGrade>(existing?.targetGrade || 'A+');

  const handleAcceptConsent = async () => {
    try {
      setSaving(true);
      await api.acceptConsent();
      setConsentDone(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Rozilikni saqlashda xatolik.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectIdentity = (val: StudentIdentity) => {
    setIdentity(val);
    if (val === 'university_student') setGradeLevel('Talaba');
    else if (val === 'teacher_specialist') setGradeLevel('Mutaxassis');
    else if (val === 'applicant') setGradeLevel('Abituriyent');
    else if (!GRADE_OPTIONS.includes(gradeLevel)) setGradeLevel('11-sinf');
  };

  const handleSubmitProfile = async () => {
    try {
      setSaving(true);
      const payload: Omit<StudyProfile, 'completedAt'> = {
        identity,
        gradeLevel,
        examType,
        examDateId,
        targetGrade,
      };
      const { user: updated } = await api.saveStudyProfile(payload);
      onComplete(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "So'rovnomani saqlashda xatolik.");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="glass-panel w-full max-w-xl rounded-3xl p-5 sm:p-8 shadow-2xl border border-indigo-500/25">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-500">
            <Scale className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditModal ? 'Maqsad va imtihon rejasini tahrirlash' : 'HuquqPro — Shaxsiy reja'}
            </h2>
            <p className="text-xs text-slate-400">
              {!consentDone
                ? 'Foydalanish shartlari va rozilik'
                : `${step}-bosqich / 4 • Shaxsiy Roadmap sozlamasi`}
            </p>
          </div>
        </div>
        {isEditModal && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Yopish"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Consent screen */}
      {!consentDone ? (
        <div className="space-y-5">
          <div className="rounded-2xl bg-indigo-500/10 border border-indigo-400/25 p-4 flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-slate-200 leading-relaxed">
              <p className="font-semibold text-white">
                Xush kelibsiz, {user.firstName}!
              </p>
              <p>
                HuquqPro platformasi sizning o&apos;quv natijalaringiz, Leitner takrorlash
                kartochkalaringiz va AI Ustoz bilan suhbatlaringizni shaxsiy o&apos;quv rejangizni
                tuzish hamda rivojlanishingizni kuzatish uchun saqlaydi.
              </p>
              <p className="text-xs text-slate-400">
                Istalgan vaqtda «Profil» bo&apos;limi orqali barcha shaxsiy ma&apos;lumotlaringizni
                bir bosishda tozalashingiz mumkin.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleAcceptConsent}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-5 w-5" />
            {saving ? 'Saqlanmoqda...' : "Roziman, so'rovnomani boshlash"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1.5 rounded-full transition-all ${
                  n <= step
                    ? 'bg-gradient-to-r from-indigo-500 to-amber-400'
                    : 'bg-slate-800'
                }`}
              />
            ))}
          </div>

          {/* STEP 1: Identity */}
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-indigo-400" />
                1. Siz kimsiz?
              </h3>
              <div className="space-y-2.5">
                {IDENTITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectIdentity(opt.value)}
                    className={`w-full min-h-[56px] text-left rounded-2xl border p-4 transition ${
                      identity === opt.value
                        ? 'border-indigo-400 bg-indigo-500/20 shadow-md shadow-indigo-500/15'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-sm font-bold text-white">{opt.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Grade / Level & Exam Track */}
          {step === 2 && (
            <div className="space-y-5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-400" />
                2. Yo&apos;nalish va tayyorgarlik darajangiz
              </h3>

              {(identity === 'school_student' || identity === 'applicant') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Sinfingiz / maqomingiz:
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {GRADE_OPTIONS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGradeLevel(g)}
                        className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-bold transition ${
                          gradeLevel === g
                            ? 'border-indigo-400 bg-indigo-500/25 text-white'
                            : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Imtihon turi:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExamType('main_law')}
                    className={`min-h-[72px] text-left rounded-2xl border p-4 transition ${
                      examType === 'main_law'
                        ? 'border-indigo-400 bg-indigo-500/20'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-sm font-bold text-white">Asosiy fan — Huquqshunoslik</p>
                    <p className="text-xs text-slate-400 mt-1">
                      TDYU / yuridik fakultetlar uchun chuqurlashtirilgan 3.1 ballik blok
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamType('mandatory_or_certificate')}
                    className={`min-h-[72px] text-left rounded-2xl border p-4 transition ${
                      examType === 'mandatory_or_certificate'
                        ? 'border-amber-400 bg-amber-500/15'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-sm font-bold text-white">
                      Majburiy fan / Milliy sertifikat
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      BMBA Milliy sertifikat (A+ / A / B+) va umumiy huquqiy tayyorgarlik
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Exam Date */}
          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-400" />
                3. Rejalashtirilgan imtihon sanasi
              </h3>
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {examDates.map((ed) => {
                  const cd = getCountdownParts(ed.date);
                  return (
                    <button
                      key={ed.id}
                      type="button"
                      onClick={() => setExamDateId(ed.id)}
                      className={`w-full min-h-[58px] text-left rounded-2xl border p-4 transition flex items-center justify-between gap-3 ${
                        examDateId === ed.id
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-white">{ed.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(ed.date).toLocaleDateString('uz-UZ', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-slate-950/70 px-2.5 py-1 text-xs font-bold text-amber-300 border border-amber-400/20">
                        {cd.isPast ? "O'tgan" : `${cd.days} kun`}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setExamDateId(null)}
                  className={`w-full min-h-[56px] text-left rounded-2xl border p-4 transition ${
                    examDateId === null
                      ? 'border-indigo-400 bg-indigo-500/20'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-bold text-white">
                    Hali aniq sana yo&apos;q — erkin sur&apos;at
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sanani keyinroq istalgan paytda Profil yoki bosh sahifadan belgilashingiz mumkin
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Target Grade */}
          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-400" />
                4. Maqsad darajangizni tanlang
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {TARGET_GRADES.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setTargetGrade(g.value)}
                    className={`min-h-[82px] text-left rounded-2xl border p-3.5 transition ${
                      targetGrade === g.value
                        ? 'border-amber-400 bg-gradient-to-br from-indigo-500/25 to-amber-500/20 shadow-lg'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-extrabold text-white">{g.value}</span>
                      <span className="text-xs font-bold text-amber-300">{g.minPct}%+</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-tight">{g.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer controls */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={step === 1 || saving}
              onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-4 w-4" />
              Orqaga
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition"
              >
                Keyingi
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmitProfile}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? 'Saqlanmoqda...' : 'Rejani saqlash'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isEditModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
        role="dialog"
        aria-modal="true"
        onClick={() => onCancel && onCancel()}
      >
        <div className="w-full max-w-xl my-auto" onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {content}
    </div>
  );
}
