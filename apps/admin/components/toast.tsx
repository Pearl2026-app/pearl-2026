'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from '@sahyadri/ui';

type Toast = { id: number; text: string; tone: 'success' | 'danger' | 'info' };
const Ctx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'max-w-sm rounded-md px-4 py-3 text-sm text-white shadow-lg',
              t.tone === 'success' && 'bg-success',
              t.tone === 'danger' && 'bg-danger',
              t.tone === 'info' && 'bg-ink',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
ToastProvider.Ctx = Ctx;

export const useToast = () => useContext(Ctx);
