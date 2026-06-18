'use client';
import { cn } from '@/lib/cn';

export function Message({ role, children }: { role: string; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <article
      className={cn(
        'max-w-[88%] rounded-lg px-4 py-3 text-[15px] leading-relaxed shadow-sm',
        'motion-safe:animate-[msgIn_300ms_var(--ease-out)]',
        isUser
          ? 'self-end rounded-br-sm bg-[var(--accent)] text-white shadow-[0_16px_32px_rgb(31_111_95_/_18%)]'
          : 'self-start rounded-bl-sm border border-[var(--border)] bg-white/88 text-[var(--text)]',
      )}
    >
      {children}
    </article>
  );
}
