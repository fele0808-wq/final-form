# Project Context for VS Code AI Assistants

Paste this whole file into a fresh VS Code AI chat (Copilot, Cline, Roo Code, Continue,
etc.) before asking questions or asking for changes. It explains the project, the
testing that has already been done, and the verified findings.

---

## 1. What this project is

An **Expo (React Native) weekly-planner app** ("Prompt Planner"). Users type natural
language like `gym after school every weekday` or `meeting at 8:30 AM to 3 PM` and the
app turns it into scheduled plan items. There is also a local "knowledge base" that
remembers user preferences from past prompts.

**Important (from AGENTS.md):** Expo has changed. Read the exact versioned docs at
https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## 2. Key files

| File | Purpose |
|---|---|
| `src/lib/planner.ts` | All core scheduling logic: time/range parsing, activity extraction, dates/recurrence, relationships (after/before anchors), conflicts, overlaps, free time, dedup. |
| `src/lib/planning-memory.ts` | Local knowledge base and plan/activity persistence: `rememberPlan`, `rememberMovedPlan`, `applyPlanningPreferences`, `getPlanningContext`, `learnPromptAlias`, `getActivityKey`, `rememberFact`, `loadPlans`, and `savePlans`. |
| `src/constants/date-time.ts` | Intl helpers in the `Australia/Brisbane` timezone (`getAppDateParts`, `formatAppDate`). |
| `src/app/plan.tsx` | Main screen: prompt bar, quick suggestions, calendar, popups, gesture handling, swipe-to-delete, speech input. |
| `dev-log.md` | The feature log the user wants tested — treat as the feature spec. |
| `scripts/planning-tests.js` | Self-contained test harness (145 assertions mapped to the dev-log sections). No imports/dependencies. |
| `scripts/runner.html`, `scripts/serve.ps1` | Browser-based test runner (dev artifacts). |

## 3. Testing done so far — read this first

A **145-assertion test harness** (`scripts/planning-tests.js`) was built as a faithful
transcription of the pure logic (planner, memory, date-time, plus the standalone
helpers in `plan.tsx`) and ran to **145/145 passing** in a real JS engine.

**Environment constraint:** there is **no Node.js/npm on this machine**, so `tsc`,
`expo`, and jest cannot run. The harness is plain ES2022 JavaScript and was executed
with **Chromium V8 via Edge headless** (`--headless --dump-dom`) against a local static
server. Validation standard for TypeScript is `.\node_modules\.bin\tsc.cmd --noEmit`
(no ESLint configured).

To re-run:

- With Node: `node scripts/planning-tests.js` → prints a JSON summary.
- Without Node: run `scripts/serve.ps1 -Port 8902` (8901 has a stale registration),
  open `http://localhost:8902/scripts/runner.html`, read the `<pre id="out">`.

Reference dates fixed in the harness so results are deterministic:
- `START` = **Sun 2026-09-20** (noon, local)
- `THU` = **Thu 2026-09-24** (noon)
- Calendar weeks start on **Monday**.

### Verified feature behavior (all passing)

- **Time parsing:** `at 8`→08:00, `at 8:30 pm`→20:30, ranges like `8:30 AM to 3 PM`
  → start 510 / duration 390 (omitted first period infers AM); invalid times fall back.
- **Dates/recurrence:** today/tomorrow/tonight; `this week`→Mon–Sun; `next week`;
  `next 7 days`; weekday (5) / weekend (2) / daily (7) recurrence counts;
  `every weekday this week and next week` from Thu→7 items (Thu+Fri this week, then
  Mon–Fri next week); 2-week recurrence popup from Thu→7, no third-week spill.
- **Relationships:** `gym after school every weekday` → 5 plans, one per school day,
  each at **15:20** (school 08:30–15:00 + 20-min buffer); `before school`→07:10;
  no anchor → no plan.
- **Naming/categories:** workout/study/reading/writing/school/commitment titles+keys.
- **Conflicts:** suggestions computed AFTER removing the conflicting activity;
  single-activity day → `null/null`.
- **Overlaps:** new-plan wins; `suggestedLaterStart` returns the plan's own end (620)
  — `findAvailableRelatedSlot` returns `start`, using `start + duration` only as the
  upper-bound check.
- **Free time:** `getFreeBlocks`/`findNextSlot` across 08:00–22:00.
- **Removal:** cancellation windows and activity matching.
- **Dedup:** batch IDs unique (3 calls → 42 unique ids); same title+key+date dedups.
- **Preference learning:** `rememberPlan` learns start/duration/confidence(+0.1)/
  alias/fact; preferences apply to generated plans; facts bounded to 100; `rememberMovedPlan`.
- **Timezone:** UTC→Brisbane conversions (+10h, day-rollover via Intl).
- **Gesture math:** TimeScroller 15-min snapping and 00:00/23:59 clamps.

## 4. Verified divergences from dev-log.md (important findings)

These are code behaviors that CONTRADICT what the dev log describes. All were verified
at runtime by the harness.

1. **`following week` / `upcoming week` (non-recurring)** → creates **5 sequential days
   from today** (from Sun 9/20: Sun–Thu 9/20–9/24, today included), not the following
   week. Cause: the next-week regex only matches `\bnext\s+week\b`.
2. **`this week and next week` (non-recurring)** → **only next week** (7 days
   Mon 9/21–Sun 9/27). The combined two-week branch requires an active recurrence.
3. **`next Thursday` from a Sunday** → 10/1 (Thursday of the week-after-next), not 9/24:
   the Sunday next-weekday calculation lands on the upcoming Thursday, then `+7`.
   From a Monday it correctly gives 10/1.
4. **`every weekend` from a Sunday** → today + next Saturday (9/20 + 9/26), splitting
   the Sat/Sun pair instead of taking the coming weekend (9/26 + 9/27).
5. **Resolved: range prompts now have clean category titles:** `meeting at 9 AM to
   10:30 AM` → **"Scheduled commitment"** and `study from 5 PM to 6 PM` →
   **"Study session"**; timing remains 540/90 and 1020/60 respectively.
6. **Resolved: `book at 8` → "Reading session"**; the command-prefix cleanup no
   longer consumes `book` before category mapping.
7. **Conflict suggestions are optimistic:** computed after removing the conflicting
   activity, so a 2-activity day gives `suggestedStart: null` (removing Work merges
   8:00–noon into one block) and `suggestedLaterStart: 780` (1:00 PM).
8. **"Later" overlap suggestion = plan's own end (620)**, not end+duration.
9. **Alias quirk:** `rememberPlan('i need to pump iron', …)` learns the alias **"need"**
   (bare `i` matches first, then `to` eats the rest of the phrase).
10. `getCancellationActivity('clear all calendar commitments for next week')` →
    **`'commitment'`**, not "all".
11. **Resolved: residual title tokens are removed:** multi-task prompts such as
   `breakfast at 8 AM for 30 minutes` now produce **"Breakfast"**, while
   explicit durations still take precedence over coincidental range parses
   (`for 2 hours` = 120 min, not 300).
12. **Sequential prompt splitting requires an explicit marker:** `then`, `after
   that`, `and then`, or `;` (including a comma immediately before one of those
   markers). Bare commas and bare `and` are preserved inside one activity, so
   `meeting with Sarah, my manager, at 2 PM` and `cook fish and chips at 7 PM`
   each create one plan. A list such as `school, gym, study` without a sequence
   marker remains one plan by design.
13. **Resolved: numeric activity labels are preserved:** context-aware time
   stripping keeps labels such as `Task 1`, `Meeting 2`, and `Test 3` while
   still removing actual clock/range numbers.
14. **Resolved: generic same-day identity is title-based:** plans with the
   catch-all `focus` key compare by normalized title, so unrelated generic
   activities such as `Breakfast` and `Work` no longer collide. Non-focus
   category keys retain category identity and same-activity same-day duplicate
   behavior.
   15. **Resolved: arranged plans and calendar activities persist locally** under
      `final-form-planning-plans-v1`. Dates use local `YYYY-MM-DD` calendar days
      and restore on mount; future external calendar/provider integration remains
      out of scope.

## 5. Elsewhere in the UI (static-only findings, not runtime-tested)

No native/Expo runtime is available, so these were verified by code trace only:

- `plan.tsx:18–29`: `schedule` is initialized to an **empty array** (`schedule=[]`) —
  the calendar apparently never receives real plan data today.
- The home/new-plan flow still uses the **forms template** (probably placeholder).
- `ColorScheme` is possibly **nullable** in the theme wiring.
- Swipe-to-delete threshold is −72px; speech input is guarded by a native
  `SpeechRecognition` global check.

## 6. How to be useful in this repo

- **Ask before changing code.** Treat `dev-log.md` as the spec: when asked to fix or
  build a feature, first point out where the implementation diverges from it (Section 4).
- Keep changes consistent with the existing style/structure of `src/lib/*` and `src/app/*`.
- After touching pure logic in `src/lib/`, extend `scripts/planning-tests.js` with the
  matching assertions and expect **all 145 current tests plus the new ones to stay green**
  (re-run via browser runner or Node).
- TypeScript must pass `tsc --noEmit`; there is no ESLint gate.
- If a fix changes a Section-4 divergence, update this file and `dev-log.md` accordingly.

## 7. Pair protocol: rules for the VS Code agent

The OpenCode agent (Big Pickle) and this VS Code agent are **pair-programming
partners on the same folder**. Follow these rules every turn:

1. **Read `HANDOFF.md` first** (shared log, newest entry at the top) when you
   start work or when your task depends on what the OpenCode agent did.
2. **Save after every edit.** OpenCode notices edits through the file system —
   it cannot see unsaved buffers.
3. **After every completed task, append a `HANDOFF.md` entry** (same format as
   the others): exact changed paths, your decision, verification, and what you
   need from OpenCode next. Newest entry goes directly below the header block.
4. **Verification gate for logic changes** (`src/lib/*`, `src/constants/*`,
   `plan.tsx` helpers): there is no Node.js on this machine, so `tsc`/jest
   cannot run from the CLI. Use VS Code's **inline TypeScript diagnostics**
   (its bundled TS server) as your editor-side gate, and let the OpenCode side
   run the 145-assertion harness (`scripts/planning-tests.js`) for behavioral
   verification. State in your HANDOFF entry which gate you ran.
5. **Always end your reply with** a bullet list: files changed, files needing
   review, and your question/decision for the OpenCode agent.
6. **The handoff is machine-enforced.** `scripts/watch.ps1` maintains
   `scripts\.handoff-status.txt`: whenever a tracked file changes
   (`src\**`, root `*.md`/`*.ts`/`*.tsx`/`*.json`, `scripts\planning-tests.js`)
   and HANDOFF.md has not been updated since, the status flips to
   **STALE** and lists the unlogged files. Appending your HANDOFF.md entry
   flips it back to **OK**.
7. **A HANDOFF entry is REQUIRED after every task that changes files.** Missing
   entry = STALE status, and the OpenCode side will ask for it before relying
   on the change.
8. Always end your reply with: files changed • files needing review •
   decision/question for OpenCode • `HANDOFF: appended ✓ / pending`.