import { cn } from '@/lib/cn';

type AppBrandProps = {
  className?: string;
  kind?: 'mark' | 'wordmark';
};

export function AppBrand({ className, kind = 'wordmark' }: AppBrandProps) {
  if (kind === 'mark') {
    // Drawn as a mask over currentColor so the glyph follows the text colour in
    // both schemes; see .app-brand-mark in globals.css.
    return (
      <span
        className={cn('app-brand-mark', className)}
        role="img"
        aria-label="Daniel Trindade"
      />
    );
  }

  return (
    <span className={cn('app-brand-wordmark', className)}>
      <span className="app-brand-name">Daniel Trindade</span>
    </span>
  );
}
