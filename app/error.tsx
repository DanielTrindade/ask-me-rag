'use client';

import { useEffect } from 'react';
import { RouteState } from '@/components/route-state';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return <RouteState kind="error" reset={reset} />;
}
