import { useState } from 'react';
import { Users, BookOpen, BarChart3, MessageSquare } from 'lucide-react';
import type { ExamDateItem, UserProfile } from '@shared/types';
import type { EnrichedTextbook } from '@/lib/api';
import { GroupsExamsTab } from './GroupsExamsTab';
import { TextbooksTopicsTab } from './TextbooksTopicsTab';
import { AnalyticsTab } from './AnalyticsTab';
import { AiLogsTab } from './AiLogsTab';

interface TeacherDashboardProps {
  user: UserProfile;
  textbooks: EnrichedTextbook[];
  examDates: ExamDateItem[];
  onRefresh: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

type TeacherTab = 'groups' | 'textbooks' | 'analytics' | 'logs';

export function TeacherDashboard({
  user,
  textbooks,
  examDates,
  onRefresh,
  onToast,
}: TeacherDashboardProps) {
  const [tab, setTab] = useState<TeacherTab>('groups');

  const navTabs: Array<{ id: TeacherTab; label: string; icon: typeof Users }> = [
    { id: 'groups', label: '1. Guruhlar', icon: Users },
    { id: 'textbooks', label: '2. Darsliklar va Mavzular', icon: BookOpen },
    { id: 'analytics', label: '3. Natijalar', icon: BarChart3 },
    { id: 'logs', label: '4. Suhbat loglari', icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-3xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center rounded-full bg-amber-500/20 border border-amber-400/35 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-200">
            {user.role === 'admin' ? 'Administrator paneli' : 'Ustoz boshqaruv paneli'}
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
            HuquqPro Boshqaruv Markazi
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {navTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-bold transition ${
                  active
                    ? 'border-indigo-400 bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'groups' && (
        <GroupsExamsTab
          user={user}
          textbooks={textbooks}
          examDates={examDates}
          onRefresh={onRefresh}
          onToast={onToast}
        />
      )}

      {tab === 'textbooks' && (
        <TextbooksTopicsTab textbooks={textbooks} onRefresh={onRefresh} onToast={onToast} />
      )}

      {tab === 'analytics' && <AnalyticsTab onToast={onToast} />}

      {tab === 'logs' && <AiLogsTab onToast={onToast} />}
    </div>
  );
}
