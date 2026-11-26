import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  const styles =
    toast.type === 'success'
      ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
      : toast.type === 'error'
        ? 'border-rose-500/40 bg-rose-950/90 text-rose-100'
        : 'border-indigo-500/40 bg-slate-900/95 text-indigo-100';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[72px] right-4 left-4 sm:left-auto sm:max-w-md z-40 pointer-events-auto"
    >
      <div
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md ${styles}`}
      >
        {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
        {toast.type === 'error' && <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />}
        {toast.type === 'info' && <Info className="h-5 w-5 shrink-0 text-indigo-400" />}
        <p className="text-sm font-medium flex-1 leading-snug">{toast.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Xabarni yopish"
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
