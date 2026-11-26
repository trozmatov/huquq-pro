import { useCallback, useEffect, useState } from 'react';
import {
  User,
  SlidersHorizontal,
  Users,
  Trash2,
  LogOut,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  KeyRound,
} from 'lucide-react';
import type { AiTutorSession, ExamDateItem, Group, TopicProgress, UserProfile } from '@shared/types';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface ProfileTabProps {
  user: UserProfile;
  groups: Group[];
  examDates: ExamDateItem[];
  progressList: TopicProgress[];
  onEditGoal: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onRefreshAll: () => void;
  onLogout: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function ProfileTab({
  user,
  groups,
  examDates,
  progressList,
  onEditGoal,
  onUserUpdated,
  onRefreshAll,
  onLogout,
  onToast,
}: ProfileTabProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [sessions, setSessions] = useState<AiTutorSession[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [reEvaluatingId, setReEvaluatingId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.listAiSessions();
      setSessions(res.sessions);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteCode.trim().length < 6) {
      onToast('error', "8 xonali taklif kodini to'liq kiriting.");
      return;
    }
    try {
      setJoining(true);
      const res = await api.joinGroup(inviteCode.trim());
      setInviteCode('');
      onUserUpdated(res.user);
      onRefreshAll();
      onToast('success', `«${res.group.name}» guruhiga muvaffaqiyatli qo'shildingiz!`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Guruhga qo'shilishda xatolik.");
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      const res = await api.leaveGroup(groupId);
      onUserUpdated(res.user);
      onRefreshAll();
      onToast('info', 'Guruhdan chiqdingiz.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Xatolik yuz berdi.');
    }
  };

  const handleReEvaluate = async (sessionId: string) => {
    try {
      setReEvaluatingId(sessionId);
      const res = await api.evaluateAiSession(sessionId);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? res.session : s)));
      if (res.session.status === 'completed') {
        onToast('success', `Suhbat baholandi: ${res.session.evaluation?.score} ball!`);
        onRefreshAll();
      } else {
        onToast('info', res.session.errorMessage || "Baholash hali tugamadi.");
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Qayta baholashda xatolik.');
    } finally {
      setReEvaluatingId(null);
    }
  };

  const handleClearMyData = async () => {
    try {
      setClearing(true);
      const res = await api.clearMyData();
      setConfirmClearOpen(false);
      if (res.user) onUserUpdated(res.user);
      onRefreshAll();
      onToast('success', "Barcha o'quv natijalaringiz tozalandi.");
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : "Ma'lumotlarni tozalashda xatolik.");
    } finally {
      setClearing(false);
    }
  };

  const selectedExam = user.studyProfile?.examDateId
    ? examDates.find((d) => d.id === user.studyProfile?.examDateId)
    : null;

  const avgScore = (vals: Array<number | null | undefined>) => {
    const valid = vals.filter((v): v is number => typeof v === 'number');
    if (!valid.length) return '—';
    return `${Math.round(valid.reduce((s, n) => s + n, 0) / valid.length)}%`;
  };

  const pendingSessions = sessions.filter((s) => s.status === 'pending_evaluation');

  return (
    <div className="space-y-6">
      {/* User Identity Card */}
      <section className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.firstName}
              className="h-14 w-14 rounded-2xl object-cover border border-indigo-400/40"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-extrabold text-xl">
              {user.firstName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              {user.firstName} {user.lastName || ''}
            </h2>
            <p className="text-xs text-slate-400">
              {user.username ? `@${user.username} • ` : ''}Telegram ID: {user.telegramId}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                {user.studyProfile?.gradeLevel || "O'quvchi"}
              </span>
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                Maqsad: {user.studyProfile?.targetGrade || 'A+'}
              </span>
              {selectedExam && (
                <span className="text-[11px] text-slate-300">{selectedExam.title}</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onEditGoal}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition"
        >
          <SlidersHorizontal className="h-4 w-4 text-amber-300" />
          Maqsad va sanani sozlash
        </button>
      </section>

      {/* Overall Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatBox
          label="Konspektlar"
          value={`${progressList.filter((p) => p.konspektRead).length} ta`}
        />
        <StatBox
          label="Kartalar"
          value={avgScore(progressList.map((p) => (p.cardsScore > 0 ? p.cardsScore : null)))}
        />
        <StatBox label="Quiz / Test" value={avgScore(progressList.map((p) => p.quizScore))} />
        <StatBox label="Yozma / Kazus" value={avgScore(progressList.map((p) => p.writtenScore))} />
        <StatBox label="AI Ustoz" value={avgScore(progressList.map((p) => p.aiTutorScore))} />
      </section>

      {/* Group Join / Management */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-400" />
          <h3 className="text-base sm:text-lg font-bold text-white">
            Ustoz guruhiga qo&apos;shilish (8 xonali kod)
          </h3>
        </div>

        <form onSubmit={handleJoinGroup} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Masalan: HUQUQ202"
              maxLength={12}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900/80 pl-10 pr-4 py-2.5 text-base sm:text-sm font-mono uppercase tracking-wider text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={joining}
            className="min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white transition"
          >
            {joining ? 'Tekshirilmoqda...' : "Guruhga qo'shilish"}
          </button>
        </form>

        {groups.length > 0 && (
          <div className="space-y-2 pt-1">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/75 border border-slate-800 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-white">{g.name}</p>
                  <p className="text-xs text-slate-400">
                    Kod: <code className="text-amber-300">{g.inviteCode}</code> • {g.textbookIds.length} ta
                    darslik
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLeaveGroup(g.id)}
                  className="min-h-[36px] rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 hover:border-rose-500/40 hover:text-rose-300 transition"
                >
                  Chiqish
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Tutor History & Pending Re-Evaluation */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            AI Huquqshunos Ustoz suhbatlari tarixi
          </h3>
          {pendingSessions.length > 0 && (
            <span className="rounded-full bg-amber-500/20 border border-amber-400/30 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              {pendingSessions.length} ta baholanmagan
            </span>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400">
            Hali AI Ustoz bilan suhbat o&apos;tkazmagansiz. Istalgan mavzuning 5-bosqichidan boshlang.
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const expanded = expandedSessionId === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-white">{s.topicTitle}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(s.startedAt).toLocaleString('uz-UZ')} •{' '}
                        {s.mode === 'voice' ? 'Ovozli' : 'Matnli'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {s.status === 'completed' && s.evaluation ? (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-extrabold text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {s.evaluation.score} ball
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={reEvaluatingId === s.id}
                          onClick={() => handleReEvaluate(s.id)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 transition"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${reEvaluatingId === s.id ? 'animate-spin' : ''}`}
                          />
                          Qayta tekshirish
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedSessionId(expanded ? null : s.id)}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-slate-700 px-2.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {s.errorMessage && s.status === 'pending_evaluation' && (
                    <p className="text-xs text-amber-300/90 bg-amber-500/10 rounded-xl px-3 py-2 border border-amber-500/20">
                      {s.errorMessage}
                    </p>
                  )}

                  {expanded && (
                    <div className="space-y-3 pt-2 border-t border-slate-800">
                      {s.evaluation && (
                        <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/25 p-3 text-xs space-y-1.5">
                          <p className="text-slate-100 font-medium">{s.evaluation.summary}</p>
                          {s.evaluation.strengths.length > 0 && (
                            <p className="text-emerald-300">
                              Kuchli tomonlar: {s.evaluation.strengths.join('; ')}
                            </p>
                          )}
                          {s.evaluation.legalGaps.length > 0 && (
                            <p className="text-amber-300">
                              Huquqiy bo&apos;shliqlar: {s.evaluation.legalGaps.join('; ')}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {s.transcript.map((t, idx) => (
                          <div
                            key={idx}
                            className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                              t.role === 'student'
                                ? 'bg-indigo-600/25 text-indigo-100 ml-6'
                                : 'bg-slate-800/80 text-slate-200 mr-6'
                            }`}
                          >
                            <strong className="block text-[10px] uppercase tracking-wider opacity-75 mb-0.5">
                              {t.role === 'student' ? "O'quvchi" : 'AI Ustoz'}
                            </strong>
                            {t.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Danger Zone & Logout */}
      <section className="glass-card rounded-3xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setConfirmClearOpen(true)}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2.5 text-sm font-semibold text-rose-200 transition"
        >
          <Trash2 className="h-4 w-4" />
          O&apos;z ma&apos;lumotlarimni tozalash
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-bold text-white transition"
        >
          <LogOut className="h-4 w-4" />
          Tizimdan chiqish
        </button>
      </section>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Barcha natijalarni tozalash"
        description="Sizning barcha o'quv ballaringiz, Leitner kartochkalaringiz, yozma natijalaringiz, guruh a'zoligingiz va AI suhbatlaringiz butunlay o'chiriladi. Davom etasizmi?"
        confirmLabel="Ha, tozalash"
        danger
        loading={clearing}
        onConfirm={handleClearMyData}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-2xl p-3.5 text-center">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className="text-xl font-extrabold text-white mt-1">{value}</p>
    </div>
  );
}
