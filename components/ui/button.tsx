'use client';
import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white shadow-[0_12px_28px_rgb(31_111_95_/_24%)] hover:bg-[var(--accent-strong)]',
  secondary:
    'border border-[var(--border)] bg-white text-[var(--text)] shadow-sm hover:border-[var(--accent)] hover:text-[var(--accent-strong)]',
  ghost: 'text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]',
  danger: 'bg-[#b9472d] text-white shadow-[0_12px_28px_rgb(185_71_45_/_22%)] hover:bg-[#9f3923]',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'focus-ring inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2',
        'text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
