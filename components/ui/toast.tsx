'use client';

import * as Toast from '@radix-ui/react-toast';
import { createContext, use, useState, type ReactNode } from 'react';

const ToastCtx = createContext<(message: string) => void>(() => {});
export const useToast = () => use(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  const show = (nextMessage: string) => {
    setMessage(nextMessage);
    setOpen(false);
    requestAnimationFrame(() => setOpen(true));
  };

  return (
    <ToastCtx.Provider value={show}>
      <Toast.Provider swipeDirection="right">
        {children}
        <Toast.Root open={open} onOpenChange={setOpen} duration={4000} className="toast-root px-4 py-3">
          <Toast.Description className="text-sm text-primary">{message}</Toast.Description>
        </Toast.Root>
        <Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" />
      </Toast.Provider>
    </ToastCtx.Provider>
  );
}
