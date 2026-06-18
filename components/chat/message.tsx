'use client';
import { cn } from '@/lib/cn';

export function Message({ role, children }: { role: string; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div
      className={cn(
        'max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
        'motion-safe:animate-[msgIn_300ms_var(--ease-out)]',
        isUser
          ? 'self-end bg-[var(--accent)] text-white'
          : 'self-start bg-[var(--surface)] text-[var(--text)]',
      )}
    >
      {children}
    </div>
  );
}
