'use client';
import * as Toast from '@radix-ui/react-toast';
import { createContext, use, useState, type ReactNode } from 'react';

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => use(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);

  const show = (m: string) => {
    setMsg(m);
    setOpen(false);
    requestAnimationFrame(() => setOpen(true));
  };

  return (
    <ToastCtx.Provider value={show}>
      <Toast.Provider swipeDirection="right">
        {children}
        <Toast.Root
          open={open}
          onOpenChange={setOpen}
          duration={4000}
          // toast-root class hooks into the CSS keyframe animations in globals.css
          // (data-[state=open] → toast-enter, data-[state=closed] → toast-exit)
          className="toast-root rounded-lg border border-[var(--border)] bg-white px-4 py-3 shadow-lg"
        >
          <Toast.Description className="text-sm text-[var(--text)]">{msg}</Toast.Description>
        </Toast.Root>
        <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" />
      </Toast.Provider>
    </ToastCtx.Provider>
  );
}
