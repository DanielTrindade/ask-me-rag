import { describe, it, expect } from 'vitest';
import { t } from '@/lib/i18n';

describe('t', () => {
  it('returns the pt string', () => {
    expect(t('pt', 'chat.placeholder')).toMatch(/pergunte/i);
  });
  it('returns the en string', () => {
    expect(t('en', 'chat.placeholder')).toMatch(/ask/i);
  });
  it('translates global route states in both locales', () => {
    expect(t('pt', 'route.notFoundTitle')).toBe('Esta página não existe');
    expect(t('en', 'route.notFoundTitle')).toBe('This page does not exist');
  });

  it('falls back to the key when missing', () => {
    expect(t('en', 'nonexistent.key')).toBe('nonexistent.key');
  });
});
