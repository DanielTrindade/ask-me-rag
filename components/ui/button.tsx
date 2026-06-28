'use client';
import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<ButtonVariant, string> = {
  primary:
    'border border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_18px_rgb(94_106_210_/_22%)] hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)]',
  secondary:
    'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)]',
  ghost: 'text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]',
  danger: 'border border-[#ba4a31] bg-[#ba4a31] text-white shadow-[0_8px_18px_rgb(186_74_49_/_20%)] hover:bg-[#a43d27]',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'focus-ring inline-flex min-h-9 items-center justify-center rounded-md px-3 py-2',
        'text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
