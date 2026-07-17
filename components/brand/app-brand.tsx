import Image from 'next/image';
import { cn } from '@/lib/cn';

type AppBrandProps = {
  className?: string;
  kind?: 'mark' | 'wordmark';
  priority?: boolean;
};

export function AppBrand({
  className,
  kind = 'wordmark',
  priority = false,
}: AppBrandProps) {
  if (kind === 'mark') {
    return (
      <span className={cn('app-brand-mark', className)}>
        <Image
          src="/logo.svg"
          alt="Logo Daniel Trindade"
          width={32}
          height={32}
          priority={priority}
        />
      </span>
    );
  }

  return (
    <span className={cn('app-brand-wordmark', className)}>
      <span className="app-brand-mark" aria-hidden="true">
        <Image
          src="/logo.svg"
          alt=""
          width={32}
          height={32}
          priority={priority}
        />
      </span>
      <span className="app-brand-name">Daniel Trindade</span>
    </span>
  );
}
