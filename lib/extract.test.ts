import { describe, it, expect } from 'vitest';
import { isPdf } from '@/lib/extract';

describe('isPdf', () => {
  it('detects pdf by extension', () => {
    expect(isPdf('cv.pdf')).toBe(true);
    expect(isPdf('CV.PDF')).toBe(true);
  });
  it('returns false for text files', () => {
    expect(isPdf('notes.md')).toBe(false);
    expect(isPdf('bio.txt')).toBe(false);
  });
});
