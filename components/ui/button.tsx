'use client';
import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2',
        'text-white font-medium transition-transform duration-150 ease-out',
        'active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100',
        className,
      )}
      {...props}
    />
  );
}
