import { useCallback, useEffect, useState } from 'react';
import {
  Scale,
  BookOpen,
  Repeat,
  Award,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  GraduationCap,
} from 'lucide-react';
import type {
  AuthConfigInfo,
  ExamDateItem,
  Group,
  TopicProgress,
  UserProfile,
} from '@shared/types';
import { api, type EnrichedInterimExam, type EnrichedTextbook } from '@/lib/api';
import { ToastBanner, type ToastMessage } from '@/components/ui/ToastBanner';
import { LandingPage } from '@/components/landing/LandingPage';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { LessonsTab } from '@/components/student/LessonsTab';
import { ReviewTab } from '@/components/student/ReviewTab';
import { ExamTab } from '@/components/student/ExamTab';
import { ProfileTab } from '@/components/student/ProfileTab';
import { TopicWorkspace } from '@/components/topic/TopicWorkspace';
import { TeacherDashboard } from '@/components/teacher/TeacherDashboard';

type StudentTab = 'darslar' | 'takrorlash' | 'imtihon' | 'profil';
type ViewMode = 'student' | 'teacher';

function parseRouteFromPath(pathname: string): {
  tab: StudentTab;
  topicId: string | null;
  mode: ViewMode;
} {
  if (pathname.startsWith('/ustoz')) return { tab: 'darslar', topicId: null, mode: 'teacher' };
  if (pathname.startsWith('/mavzu/')) {
    return { tab: 'darslar', topicId: decodeURIComponent(pathname.slice('/mavzu/'.length)), mode: 'student' };
  }
  if (pathname.startsWith('/takrorlash')) return { tab: 'takrorlash', topicId: null, mode: 'student' };
  if (pathname.startsWith('/imtihon')) return { tab: 'imtihon', topicId: null, mode: 'student' };
  if (pathname.startsWith('/profil')) return { tab: 'profil', topicId: null, mode: 'student' };
  return { tab: 'darslar', topicId: null, mode: 'student' };
}

export default function App() {
  const [config, setConfig] = useState<AuthConfigInfo>({
    telegramBotUsername: 'huquqpro_bot',
    devAuthEnabled: false,
    geminiConfigured: false,
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [bootLoading, setBootLoading] = useState(true);

  const [examDates, setExamDates] = useState<ExamDateItem[]>([]);
  const [textbooks, setTextbooks] = useState<EnrichedTextbook[]>([]);
  const [progressList, setProgressList] = useState<TopicProgress[]>([]);

  // Standard browser URL routing state
  const initialRoute = parseRouteFromPath(window.location.pathname);
  const [studentTab, setStudentTab] = useState<StudentTab>(initialRoute.tab);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(initialRoute.topicId);
  const [viewMode, setViewMode] = useState<ViewMode>(initialRoute.mode);
  const [activeInterimExam, setActiveInterimExam] = useState<EnrichedInterimExam | null>(null);
  const [editGoalOpen, setEditGoalOpen] = useState(false);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToast({ id, type, text });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4200);
  }, []);

  const navigate = useCallback((path: string, nextTab: StudentTab, nextTopic: string | null, nextMode: ViewMode) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setStudentTab(nextTab);
    setActiveTopicId(nextTopic);
    setViewMode(nextMode);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => {
      const r = parseRouteFromPath(window.location.pathname);
      setStudentTab(r.tab);
      setActiveTopicId(r.topicId);
      setViewMode(r.mode);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [meRes, edRes, tbRes, progRes] = await Promise.all([
        api.getMe(),
        api.listExamDates(),
        api.listTextbooks(),
        api.getProgress(),
      ]);
      if (meRes.user) setUser(meRes.user);
      if (meRes.groups) setGroups(meRes.groups);
      setExamDates(edRes.examDates);
      setTextbooks(tbRes.textbooks);
      setProgressList(progRes.progress);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik.");
    }
  }, [showToast]);

  // Initial bootstrap
  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, meRes, edRes] = await Promise.all([
          api.getConfig(),
          api.getMe(),
          api.listExamDates(),
        ]);
        setConfig(cfgRes);
        setExamDates(edRes.examDates);
        if (meRes.user) {
          setUser(meRes.user);
          setGroups(meRes.groups || []);
          if ((meRes.user.role === 'teacher' || meRes.user.role === 'admin') && window.location.pathname === '/') {
            setViewMode('teacher');
          }
          const [tbRes, progRes] = await Promise.all([api.listTextbooks(), api.getProgress()]);
          setTextbooks(tbRes.textbooks);
          setProgressList(progRes.progress);
        }
      } catch {
        // non-blocking
      } finally {
        setBootLoading(false);
      }
    })();
  }, []);

  const handleAuthenticated = async (authedUser: UserProfile) => {
    setUser(authedUser);
    if (authedUser.role === 'teacher' || authedUser.role === 'admin') {
      navigate('/ustoz', 'darslar', null, 'teacher');
    } else {
      navigate('/darslar', 'darslar', null, 'student');
    }
    await loadWorkspaceData();
    showToast('success', `Xush kelibsiz, ${authedUser.firstName}!`);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setUser(null);
    setActiveTopicId(null);
    setViewMode('student');
    window.history.pushState({}, '', '/');
    showToast('info', 'Tizimdan muvaffaqiyatli chiqdingiz.');
  };

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-500 animate-pulse">
            <Scale className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-slate-300">HuquqPro yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated -> Landing + Telegram Login Widget
  if (!user) {
    return (
      <>
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
        <LandingPage
          config={config}
          onAuthenticated={handleAuthenticated}
          onError={(msg) => showToast('error', msg)}
        />
      </>
    );
  }

  // First-time student onboarding (Consent + 4-step survey)
  const needsOnboarding = user.role === 'student' && (!user.consentAcceptedAt || !user.studyProfile);
  if (needsOnboarding) {
    return (
      <>
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
        <OnboardingFlow
          user={user}
          examDates={examDates}
          onComplete={(updatedUser) => {
            setUser(updatedUser);
            void loadWorkspaceData();
            showToast('success', 'Shaxsiy tayyorgarlik rejangiz tayyor!');
          }}
          onError={(msg) => showToast('error', msg)}
        />
      </>
    );
  }

  const progressMap: Record<string, TopicProgress> = {};
  for (const p of progressList) progressMap[p.topicId] = p;

  const isStaff = user.role === 'teacher' || user.role === 'admin';

  const navItems: Array<{ id: StudentTab; path: string; label: string; icon: typeof BookOpen }> = [
    { id: 'darslar', path: '/darslar', label: 'Darslar', icon: BookOpen },
    { id: 'takrorlash', path: '/takrorlash', label: 'Takrorlash', icon: Repeat },
    { id: 'imtihon', path: '/imtihon', label: 'Imtihon', icon: Award },
    { id: 'profil', path: '/profil', label: 'Profil', icon: UserIcon },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-x-clip">
      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

      {/* Ambient glow */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/3 h-[340px] w-[520px] rounded-full bg-indigo-600/15 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[360px] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      {/* Desktop & Mobile Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              isStaff && viewMode === 'teacher'
                ? navigate('/ustoz', 'darslar', null, 'teacher')
                : navigate('/darslar', 'darslar', null, 'student')
            }
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-600 to-amber-500 shadow-md">
              <Scale className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="block text-sm font-extrabold text-white leading-none">HuquqPro</span>
              <span className="block text-[10px] font-medium text-amber-300 mt-0.5">
                Oson Huquq
              </span>
            </div>
          </button>

          {/* Desktop 4-tab Navigation (Student mode) */}
          {viewMode === 'student' && (
            <nav className="hidden md:flex items-center gap-1 rounded-2xl border border-slate-800/90 bg-slate-900/70 p-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = !activeTopicId && studentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveInterimExam(null);
                      navigate(item.path, item.id, null, 'student');
                    }}
                    className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                      active
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Right User Menu & Role Switcher */}
          <div className="flex items-center gap-2">
            {isStaff && (
              <button
                type="button"
                onClick={() =>
                  viewMode === 'teacher'
                    ? navigate('/darslar', 'darslar', null, 'student')
                    : navigate('/ustoz', 'darslar', null, 'teacher')
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1.5 text-xs font-bold text-amber-200 transition"
              >
                {viewMode === 'teacher' ? (
                  <>
                    <GraduationCap className="h-4 w-4" />
                    <span className="hidden sm:inline">O&apos;quvchi ko&apos;rinishi</span>
                  </>
                ) : (
                  <>
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Ustoz paneli</span>
                  </>
                )}
              </button>
            )}

            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5">
              {user.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.firstName}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                  {user.firstName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-semibold text-slate-200 max-w-[110px] truncate">
                {user.firstName}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Tizimdan chiqish"
              title="Chiqish"
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Chiqish</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (padded for mobile bottom tab bar) */}
      <main
        className={`mx-auto max-w-6xl px-4 py-6 ${
          viewMode === 'student' ? 'pb-28 md:pb-12' : 'pb-12'
        }`}
      >
        {isStaff && viewMode === 'teacher' ? (
          <TeacherDashboard
            user={user}
            textbooks={textbooks}
            examDates={examDates}
            onRefresh={loadWorkspaceData}
            onToast={showToast}
          />
        ) : activeTopicId ? (
          <TopicWorkspace
            topicId={activeTopicId}
            geminiConfigured={config.geminiConfigured}
            onBack={() => navigate('/darslar', 'darslar', null, 'student')}
            onProgressChanged={loadWorkspaceData}
            onToast={showToast}
          />
        ) : studentTab === 'darslar' ? (
          <LessonsTab
            user={user}
            examDates={examDates}
            textbooks={textbooks}
            progressMap={progressMap}
            onEditGoal={() => setEditGoalOpen(true)}
            onOpenTopic={(tid) => navigate(`/mavzu/${encodeURIComponent(tid)}`, 'darslar', tid, 'student')}
            onStartInterimExam={(exam) => {
              setActiveInterimExam(exam);
              navigate('/imtihon', 'imtihon', null, 'student');
            }}
            onOpenExamTab={() => navigate('/imtihon', 'imtihon', null, 'student')}
          />
        ) : studentTab === 'takrorlash' ? (
          <ReviewTab
            onOpenTopic={(tid) => navigate(`/mavzu/${encodeURIComponent(tid)}`, 'darslar', tid, 'student')}
            onProgressUpdated={loadWorkspaceData}
            onToast={showToast}
          />
        ) : studentTab === 'imtihon' ? (
          <ExamTab
            textbooks={textbooks}
            activeInterimExam={activeInterimExam}
            onClearActiveInterimExam={() => setActiveInterimExam(null)}
            onInterimExamPassed={loadWorkspaceData}
            onToast={showToast}
          />
        ) : (
          <ProfileTab
            user={user}
            groups={groups}
            examDates={examDates}
            progressList={progressList}
            onEditGoal={() => setEditGoalOpen(true)}
            onUserUpdated={(u) => setUser(u)}
            onRefreshAll={loadWorkspaceData}
            onLogout={handleLogout}
            onToast={showToast}
          />
        )}
      </main>

      {/* Mobile Fixed 4-Tab Bottom Navigation Bar (360-430px optimized) */}
      {viewMode === 'student' && (
        <nav
          aria-label="Asosiy mobil navigatsiya"
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800/90 bg-slate-950/95 backdrop-blur-xl pb-safe"
        >
          <div className="grid grid-cols-4 px-2 pt-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = !activeTopicId && studentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveInterimExam(null);
                    navigate(item.path, item.id, null, 'student');
                  }}
                  className={`min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition ${
                    active ? 'text-indigo-300 bg-indigo-500/15' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-bold leading-none">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Goal Edit Modal (z-50 safely above sticky headers) */}
      {editGoalOpen && (
        <OnboardingFlow
          user={user}
          examDates={examDates}
          isEditModal
          onComplete={(updated) => {
            setUser(updated);
            setEditGoalOpen(false);
            showToast('success', 'Maqsad va imtihon sanasi yangilandi!');
          }}
          onCancel={() => setEditGoalOpen(false)}
          onError={(msg) => showToast('error', msg)}
        />
      )}
    </div>
  );
}
