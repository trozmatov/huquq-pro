import { useEffect, useRef, useState } from 'react';
import { Send, ShieldCheck, GraduationCap, UserCheck, Crown } from 'lucide-react';
import type { TelegramAuthPayload, UserProfile } from '@shared/types';
import { api } from '@/lib/api';

declare global {
  interface Window {
    __huquqproTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

interface TelegramLoginWidgetProps {
  botUsername: string;
  devAuthEnabled: boolean;
  onAuthenticated: (user: UserProfile) => void;
  onError: (message: string) => void;
}

export function TelegramLoginWidget({
  botUsername,
  devAuthEnabled,
  onAuthenticated,
  onError,
}: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.__huquqproTelegramAuth = async (tgUser: TelegramAuthPayload) => {
      try {
        setLoading(true);
        const { user } = await api.loginWithTelegram(tgUser);
        onAuthenticated(user);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Telegram orqali kirishda xatolik yuz berdi.');
      } finally {
        setLoading(false);
      }
    };

    const container = containerRef.current;
    if (container && botUsername) {
      container.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '12');
      script.setAttribute('data-onauth', '__huquqproTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      container.appendChild(script);
    }

    return () => {
      delete window.__huquqproTelegramAuth;
    };
  }, [botUsername, onAuthenticated, onError]);

  const handleDevLogin = async (telegramId: string, firstName: string, lastName: string) => {
    try {
      setLoading(true);
      const { user } = await api.devLogin({
        telegramId,
        firstName,
        lastName,
        username: firstName.toLowerCase(),
      });
      onAuthenticated(user);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kirishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-indigo-500/25 bg-slate-900/75 p-5 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-300 border border-indigo-400/20">
          <Send className="h-3.5 w-3.5" />
          Rasmiy Telegram Login Widget
        </div>
        <p className="text-sm text-slate-300 mb-4 max-w-sm">
          Parol va email tasdiqlash shart emas — Telegram hisobingiz orqali 1 bosishda xavfsiz kiring.
        </p>

        {/* Official Telegram Login Widget mount container */}
        <div
          ref={containerRef}
          className="min-h-[44px] flex items-center justify-center"
          data-testid="telegram-widget-container"
        />

        {loading && (
          <p className="mt-3 text-xs text-indigo-300 animate-pulse">
            Telegram imzosi tekshirilmoqda...
          </p>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          HMAC-SHA256 server tekshiruvi • HttpOnly himoyalangan sessiya
        </p>
      </div>

      {devAuthEnabled && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-1">
            Lokal sinov kirishi (faqat 127.0.0.1 / dev)
          </p>
          <p className="text-xs text-slate-400 mb-3">
            Domenni BotFather&apos;da <code className="text-amber-200">/setdomain</code> bilan ulaguncha
            barcha rollarni darhol sinab ko&apos;rishingiz mumkin:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDevLogin('200001', 'Azizbek', 'Karimov')}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2.5 text-sm font-semibold text-white transition shadow-md shadow-indigo-600/25"
            >
              <GraduationCap className="h-4 w-4 shrink-0" />
              O&apos;quvchi
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDevLogin('100002', 'Dilnoza', 'Ustoz')}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-violet-600/90 hover:bg-violet-500 px-3 py-2.5 text-sm font-semibold text-white transition"
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              Ustoz
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDevLogin('100001', 'Sardor', 'Admin')}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-amber-600/90 hover:bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white transition"
            >
              <Crown className="h-4 w-4 shrink-0" />
              Admin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
