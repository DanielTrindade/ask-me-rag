import { describe, it, expect } from 'vitest';
import { FOLLOW_UP_POOL_KEYS, pickFollowUps } from '@/lib/follow-ups';
import { t } from '@/lib/i18n';

describe('pickFollowUps', () => {
  it('returns the first two pool questions when nothing was asked', () => {
    expect(pickFollowUps([], 'pt')).toEqual([
      t('pt', 'chat.followup.recentProject'),
      t('pt', 'chat.followup.fullStack'),
    ]);
  });

  it('skips a question after it was sent and surfaces the next one', () => {
    const sent = [t('pt', 'chat.followup.recentProject')];
    expect(pickFollowUps(sent, 'pt')).toEqual([
      t('pt', 'chat.followup.fullStack'),
      t('pt', 'chat.followup.decisions'),
    ]);
  });

  it('matches sent questions regardless of surrounding whitespace', () => {
    const sent = [`  ${t('pt', 'chat.followup.recentProject')}  `];
    expect(pickFollowUps(sent, 'pt')).not.toContain(
      t('pt', 'chat.followup.recentProject'),
    );
  });

  it('does not resurface a question asked in the other locale', () => {
    const sent = [t('en', 'chat.followup.recentProject')];
    expect(pickFollowUps(sent, 'pt')).not.toContain(
      t('pt', 'chat.followup.recentProject'),
    );
  });

  it('returns an empty list once the pool is exhausted', () => {
    const sent = FOLLOW_UP_POOL_KEYS.map((key) => t('pt', key));
    expect(pickFollowUps(sent, 'pt')).toEqual([]);
  });

  it('localizes the suggestions it returns', () => {
    expect(pickFollowUps([], 'en')[0]).toBe(t('en', 'chat.followup.recentProject'));
  });

  it('has a translation for every pool key in both locales', () => {
    for (const key of FOLLOW_UP_POOL_KEYS) {
      expect(t('pt', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
  });
});
