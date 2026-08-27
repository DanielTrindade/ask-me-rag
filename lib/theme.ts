import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * The portfolio reads as a transcript: a career answered out of real documents.
 * So the surface is paper — warm, near-chromaless neutrals instead of the cool
 * blue-grey default — and the single chromatic note is ink: a deep fountain-pen
 * blue used on three things only (send, focus, the assistant's margin rule).
 * Everything else stays greyscale so the ink means something when it appears.
 *
 * The neutrals are pinned explicitly rather than generated from `neutralStyle`,
 * which derives them from the accent hue and washed the whole page lavender.
 */
export const portfolioTheme = defineTheme({
  name: 'daniel-portfolio',
  extends: neutralTheme,

  color: {
    accent: '#14507F',
  },

  // Faster than the Astryx defaults across the board: every animation here is a
  // micro-interaction on a page people use with one thumb, and UI motion over
  // ~300ms reads as lag rather than polish.
  motion: {
    fast: 150,
    medium: 280,
    ratio: 0.75,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },

  tokens: {
    // Bricolage Grotesque carries the display sizes; Geist stays on body text
    // where its neutrality is the point. Loaded by next/font in app/layout.tsx.
    '--font-family-heading':
      'var(--font-bricolage), var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

    // Ink: a deep fountain-pen blue, not a link blue and not a SaaS azure. On
    // paper this warm it sits near the complement, so the accent reads as a pen
    // mark. Dark enough to carry white text at AA (8.5:1 on the send button).
    '--color-accent': ['#14507F', '#7FBCF0'],
    '--color-text-accent': ['#14507F', '#9CCBEE'],
    '--color-icon-accent': ['#14507F', '#7FBCF0'],
    // The accent lightens in dark mode, so white on it would drop below AA.
    // Flip the foreground to ink instead: the send button keeps 8.5:1 light and
    // 9.0:1 dark.
    '--color-on-accent': ['#FFFFFF', '#16151A'],
    '--color-border-blue': ['#14507F', '#7FBCF0'],

    // Astryx's "blue" semantic family is fine in light mode but periwinkle in
    // dark (#9EB7FF), which is the violet cast the accent moved away from.
    // Nothing renders these today; pinning them keeps it that way if something
    // ever does.
    '--color-text-blue': ['#00458C', '#9CCBEE'],
    '--color-icon-blue': ['#00458C', '#7FBCF0'],
    '--color-background-blue': ['#C4DDFB', '#7FBCF03D'],

    // Paper. Warm but almost chromaless — a cream page would fight the ink and
    // land in a look every other AI product already has.
    '--color-background-body': ['#F0EFEC', '#16151A'],
    '--color-background-surface': ['#FCFBFA', '#201F26'],
    '--color-background-card': ['#FCFBFA', '#201F26'],
    '--color-background-popover': ['#FCFBFA', '#282730'],
    '--color-background-inverted': ['#191817', '#FCFBFA'],
    '--color-background-muted': ['#1918170A', '#FFFFFF0A'],

    '--color-text-primary': ['#191817', '#E7E5E2'],
    '--color-text-secondary': ['#5B5854', '#A8A5A0'],
    '--color-text-disabled': ['#A6A29B', '#6E6B67'],
    '--color-icon-primary': ['#191817', '#E7E5E2'],
    '--color-icon-secondary': ['#5B5854', '#A8A5A0'],
    '--color-icon-disabled': ['#A6A29B', '#6E6B67'],

    '--color-border': ['#1918171A', '#F0EFEC1A'],
    '--color-border-emphasized': ['#D5D2CC', '#4A4843'],
    '--color-skeleton': ['#DEDBD5', '#3A383F'],
    '--color-track': ['#DEDBD5', '#3A383F'],

    '--color-overlay-hover': ['#1918170A', '#FFFFFF0A'],
    '--color-overlay-pressed': ['#19181714', '#FFFFFF14'],
    '--color-shadow': ['rgba(25, 24, 23, 0.10)', 'rgba(0, 0, 0, 0.34)'],
  },
});
