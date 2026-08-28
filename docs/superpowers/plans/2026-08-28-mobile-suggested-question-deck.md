# Mobile Suggested Question Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked mobile prompt cards on the chat landing state with a full-width, swipeable question deck while preserving the existing desktop grid.

**Architecture:** Keep `RecruiterLanding` as the owner of the initial-chat layout and pass its existing mobile breakpoint state from `ChatView`. Render the established three-column `Grid` on desktop and a small native scroll-snap deck on mobile, using local state only to report and control the current slide. Reuse the existing Astryx components and portfolio theme tokens; add no dependency.

**Tech Stack:** Next.js 16, React 19, TypeScript, Astryx Design System, CSS scroll snap, Vitest, Testing Library.

## Global Constraints

- Preserve all existing Portuguese and English question copy exactly.
- Preserve UTF-8 and Unicode characters.
- Mobile breakpoint remains `(max-width: 760px)`.
- The mobile suggestion card must occupy the same content width as the chat composer.
- Do not auto-advance the deck.
- Keyboard-triggered pagination changes are instant; pointer-triggered changes may scroll smoothly.
- Respect `prefers-reduced-motion` and retain visible keyboard focus.
- Reuse the existing paper, ink, typography, spacing, radius, and motion tokens.
- Keep the current desktop grid behavior.

---

### Task 1: Specify the responsive prompt experience

**Files:**
- Create: `components/chat/recruiter-landing.test.tsx`
- Modify: `components/chat/chat.test.tsx`

**Interfaces:**
- Consumes: `RecruiterLandingProps` and `ChatView` mobile state.
- Produces: tests for mobile ordering, accessible pagination, prompt submission, and desktop fallback.

- [ ] **Step 1: Write the failing mobile deck test**

Render `RecruiterLanding` with `isMobile={true}` and assert that the labelled suggestion region appears before the composer, contains all three unchanged prompt buttons, exposes `1 / 3`, and calls `onSubmitPrompt` with the selected question.

- [ ] **Step 2: Write the failing desktop fallback test**

Render `RecruiterLanding` with `isMobile={false}` and assert that the composer remains before the suggestion grid and pagination controls are absent.

- [ ] **Step 3: Run the focused test and verify failure**

Run: `npm test -- components/chat/recruiter-landing.test.tsx`

Expected: FAIL because `RecruiterLanding` does not yet accept `isMobile` or render deck navigation.

### Task 2: Implement the mobile question deck

**Files:**
- Modify: `components/chat/recruiter-landing.tsx`
- Modify: `components/chat/chat.tsx`
- Modify: `lib/i18n.ts`

**Interfaces:**
- Consumes: `isMobile: boolean`, `Locale`, and `onSubmitPrompt(prompt: string)`.
- Produces: a desktop `Grid` or mobile native scroll-snap deck with accessible slide controls.

- [ ] **Step 1: Pass mobile state to the landing component**

Add `isMobile: boolean` to `RecruiterLandingProps` and pass the existing `ChatView.isMobile` value at the call site.

- [ ] **Step 2: Extract one shared prompt button renderer**

Render the same category and question copy for desktop and mobile. Give the actual Astryx `Button` full-width styling and add the existing `arrowUp` send icon as a quiet action cue.

- [ ] **Step 3: Add native deck state and navigation**

Use a `ref` for the horizontal track and `activePrompt` state. On scroll, select the slide whose `offsetLeft` is closest to `scrollLeft`. Pagination buttons call `scrollTo`; use `behavior: 'auto'` when `MouseEvent.detail === 0` and `behavior: 'smooth'` otherwise.

- [ ] **Step 4: Add localized accessible pagination copy**

Add `chat.showSuggestion` as `Mostrar pergunta` and `Show question`. Compose each dot label with the unchanged question text and expose the locale-neutral visible position as `current / total`.

- [ ] **Step 5: Preserve the desktop grid**

Render the suggestion block after the composer on desktop and before the composer on mobile. Keep `Grid columns={{ minWidth: 220, max: 3, repeat: 'fit' }}` unchanged.

### Task 3: Apply responsive layout and interaction polish

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.chat-suggestion-deck`, `.chat-suggestion-track`, `.chat-suggestion-slide`, `.chat-suggestion-pagination`, and `.chat-suggestion-dot` markup.
- Produces: a full-width one-card viewport with native swipe, snap alignment, accessible controls, and the portfolio ink-rule signature.

- [ ] **Step 1: Keep the actual suggestion button full width**

Set `inline-size: 100%` on `.chat-suggestion.astryx-button` and align the arrow at the trailing edge.

- [ ] **Step 2: Style the mobile scroll-snap track**

Use `display: flex`, `overflow-x: auto`, `scroll-snap-type: x mandatory`, hidden scrollbar, contained horizontal overscroll, and `flex: 0 0 100%` slides.

- [ ] **Step 3: Restore appropriate mobile visual weight**

Remove the compact 48px mobile override. Keep the larger card height and padding, and use a 2px accent border on the inline-start edge to echo assistant answers.

- [ ] **Step 4: Style pagination without decorative motion**

Give each dot a 44px touch target around a small visual mark. Change only color and scale for the selected mark; retain the design-system focus ring and disable scroll movement under reduced motion.

### Task 4: Verify behavior and regression safety

**Files:**
- Test: `components/chat/recruiter-landing.test.tsx`
- Test: `components/chat/chat.test.tsx`
- Test: `lib/i18n.test.ts`

**Interfaces:**
- Consumes: final component, CSS class contract, and translations.
- Produces: passing targeted and repository checks.

- [ ] **Step 1: Run focused component tests**

Run: `npm test -- components/chat/recruiter-landing.test.tsx components/chat/chat.test.tsx lib/i18n.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static checks**

Run: `npm run lint`

Expected: PASS with no new lint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS with a successful Next.js production build.

- [ ] **Step 4: Inspect mobile and desktop renderings**

Verify approximately 390px and 1280px viewport widths. Confirm full-width alignment, swipe and pagination behavior, preserved desktop grid, keyboard focus, exact bilingual copy, and reduced-motion behavior.

## Self-Review

- Spec coverage: mobile deck, width parity, ordering, pagination, no autoplay, desktop preservation, accessibility, motion, and bilingual copy are covered.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: `isMobile`, `activePrompt`, and the CSS class contract use the same names throughout the plan.
