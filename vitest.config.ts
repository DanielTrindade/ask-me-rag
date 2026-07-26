import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Multiple jsdom workers exhaust Windows scheduling and make UI tests flaky.
    maxWorkers: 1,
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'vitest.server-only-stub.js'),
    },
  },
});
