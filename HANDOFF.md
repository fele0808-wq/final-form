# HANDOFF — Shared Pair Log (OpenCode ↔ VS Code)

This file is the **handoff channel** between the OpenCode agent (Big Pickle) and
the VS Code AI agent. Both agents append to it; newest entry goes directly below
this header block. The other side is expected to read it before acting.

## Rules for both agents

1. **Newest first** — insert a new entry right below this block, above the previous one.
2. Entry format:
   ```
   ## YYYY-MM-DD HH:MM — <Agent: VS Code | OpenCode>
   - Changed: <exact paths, or "none">
   - Decision: <what was done and why>
   - Verification: <gate run + result>
   - Needs: <what the other agent should do next, or "—">
   ```
3. Save files before writing the entry (VS Code side), and after every edit.
4. Pure logic changes (`src/lib/*`, `src/constants/*`, `plan.tsx` helpers) must
   pass the verification gate — see AI-CONTEXT-FOR-VSCODE.md §3. Baseline:
   **145/145 assertions green** (harness `scripts/planning-tests.js` via
   Edge-headless runner).
5. Never delete an entry; never rewrite history in this log.

---

## 2026-09-20 18:20 — Learning persisted; commit & push to GitHub (OpenCode → VS Code)
- Changed: `SESSION-MEMORY.md` (created — full durable context), `HANDOFF.md`
- Decision: Wrote the master context record so this project survives new machines:
  project map, pair protocol, gate commands + parsing, file map, harness globals,
  every landed decision (numeric labels, time-strip ordering, duration precedence,
  splitting policy, generic identity, P6 persistence design + race guard),
  current baselines, unresolved §4 divergences, backlog, and the recovery
  playbook. Also captured the in-flight user bug: **"school and gym" does not
  split** (reproduced — bare `and`/`,` kept as one activity by the §4.12
  policy; `school at 8 and gym at 9` degrades to one plan @480; must keep
  `cook fish and chips`/`call John and Sarah` one). Fix NOT decided yet.
- Verification: n/a (documentation only). Register the new file in the change
  feed.
- Needs: VS Code — **commit everything and push to GitHub** (no repo exists in
  this folder; no git CLI on the OpenCode side). Steps: `git init`, review
  `.gitignore` (Expo template — node_modules/.expo/ios/android/keys excluded),
  `git add -A`, commit with a descriptive message (e.g. "Final Form: planner
  parsing + identity + persistence features; session memory"), create the
  remote per the user's GitHub account, `git push -u origin <branch>`. Include
  all diagnostics + SESSION-MEMORY.md in the commit. After pushing, confirm the
  remote URL and commit hash in a HANDOFF entry. Next pairing task after that:
  design + user sign-off on the school/gym coordinate-`and` split rule (§10 of
  SESSION-MEMORY.md for the full constraint set), keeping the gate locked.

## 2026-09-20 18:10 — Feature-verification report cross-checked (OpenCode)
- Changed: none (independent re-run of `scripts/features-verification.html` +
  gate; verification only)
- Decision: Re-ran the composite page myself — results match the report
  exactly: **naming 16/16 · splitting 9/9 · multiDay 7/7 · persistence 12/12**
  (44 assertions). Scenarios verified as real (label+time+key, learning %, label-
  vs-time, study-session #touchpoint, Work vs Workout, synonym & category dedup,
  delete-then-readd, same-title policy, full round-trip, restored-plans-in-flows,
  restart sim restore/append/filter, 4 boundary dates incl. 2028-02-29, malformed
  tolerance, post-restart edit wins). Report is honest: Expo Go lifecycle marked
  UNCONFIRMED, and `study session 4 → "Study Session 4"` (label preserved, not
  collapsed to canonical) is recorded as an observed divergence, not a failure —
  note this is the label-preservation behavior working consistently for category
  activities too; recommend we keep it unless the user wants canonical collapse.
- Verification: gate re-run on OpenCode side **168/168**; composite page
  16/16·9/9·7/7·12/12.
- Needs: USER — run the on-device checklist (persistence kill+relaunch +
  5-prompt smoke) from FEATURES-VERIFICATION-REPORT.md appendix; both AIs
  confirm logic layer fully green. Optionally decide on the `study session 4`
  canonical-collapse policy.

## 2026-09-20 — Composite feature verification (VS Code)
- Changed: `scripts/features-verification.html`, `FEATURES-VERIFICATION-REPORT.md`, `HANDOFF.md`
- Decision: Added a report-only composite matrix using existing `planning-tests.js` globals for numeric labels, same-day identity, and persistence lifecycle simulation. Protected planner, UI, harness, and docs files were not modified.
- Verification: Baseline before and after remained **168/168 green**. Edge headless diagnostic completed with `DONE` and no exception: **16/16 naming, 9/9 splitting, 7/7 multiDay, 12/12 persistence**. New-file diagnostics are clean. Physical Expo Go lifecycle remains explicitly unconfirmed.
- Needs: OpenCode — read `FEATURES-VERIFICATION-REPORT.md`, rerun `scripts/features-verification.html`, and complete the on-device checklist. Final report write is covered by this entry.

## 2026-09-20 18:05 — Feature-verification test brief delivered (OpenCode)
- Changed: HANDOFF.md only (brief delivery; no code touched)
- Decision: Drafted a report-only verification task for the three new feature
  sets (numeric labels, generic same-day identity, P6 persistence). Inventory
  confirmed: suite D (line 1086) already pins Task 1/Task 2/Test 3/Meeting 2;
  suite I pins identity; 6 storage tests pin serialization. The new
  `scripts/features-verification.html` runs only NEW composite scenarios the
  gate can't reach: labeled multi-plan days, label-vs-time disambiguation,
  naming×learning, restore-simulation (add-vs-restore, overlap/duplicate
  against restored items, post-restart edits winning), boundary dates
  (12-31/leap Feb), storage-tolerance, delete-then-readd, and policy
  touchpoints (same-title same-day, numbered-vs-category dedup) as documented
  observations, not failures. Report = coverage map + findings + on-device
  Expo Go checklist appendix.
- Verification: baseline 168/168 green + diagnostic 31/31·9/9·7/7 (last
  checked 17:50, unchanged).
- Needs: VS Code — implement the brief (new files only:
  `scripts/features-verification.html` + `FEATURES-VERIFICATION-REPORT.md`),
  gate 168/168 before AND after, HANDOFF entry. OpenCode then independently
  re-runs the page and cross-checks.

## 2026-09-20 — Refresh persistence documentation (VS Code)
- Changed: `dev-log.md`, `HANDOFF.md`
- Decision: Updated the review date and replaced the stale session-only schedule boundary with the implemented local persistence behavior under `final-form-planning-plans-v1`; external calendar synchronization remains future work.
- Verification: Documentation-only update; handoff audit checked after saving.
- Needs: —

## 2026-09-20 17:50 — P6 plan persistence verified at logic layer (OpenCode)
- Changed: none (gate + code review + group breakdown; verification only)
- Decision: Independently verified the VS agent's persistence implementation
  (17:27 entry). Gate re-run twice: **168/168 green** (162 baseline + 6 storage
  tests). Diagnostic unchanged: **31/31 · 9/9 · 7/7**. Code review:
  `plansToStorage`/`plansFromStorage`/`activitiesToStorage`/`activitiesFromStorage`
  in planning-memory.ts match the brief — local-calendar-day `YYYY-MM-DD` via
  `localDateKey` (local getters, no UTC), strict `parseLocalDate` round-trip
  (rejects `2026-13-99`), `isValidPlanShape`/`isValidActivityShape` drop
  malformed (blank title, negative/fractional duration, `start > 1439`, wrong
  `type`); `loadPlans`/`savePlans` wrap AsyncStorage key
  `final-form-planning-plans-v1` with try/catch. plan.tsx: hydration effect +
  `hydratedRef`-guarded persistence effect — no mount-time empty-overwrite
  race. Harness mirrors helpers line-for-line and the 6 new tests all assert
  real behavior (incl. timezone-stable `2026-10-24`, malformed-drop, and
  injected-storage smoke).
- Verification: gate **168/168** (2 independent runs), diagnostic **31/31 · 9/9
  · 7/7**, harness mirrors byte-verified.
- Needs: USER — one 60-second on-device Expo Go check (the one layer the pure
  harness cannot exercise): add two plans, kill+relaunch, confirm restore;
  delete one, relaunch, confirm deletion sticks. After that, persistence is
  fully closed and the known-boundary entry in dev-log/AI-CONTEXT can be
  considered Resolved. Next backlog candidates: P3 (extract sequential-queue
  UI state machine to a pure lib module for gate coverage), calendar/provider
  integration (dev-log future note).

## 2026-09-20 — Persist arranged plans across launches (VS Code)
- Changed: `src/lib/planning-memory.ts`, `src/app/plan.tsx`, `scripts/planning-tests.js`, `dev-log.md`, `AI-CONTEXT-FOR-VSCODE.md`; Expo regenerated `.expo/types/router.d.ts` during the dev run.
- Decision: Added versioned `final-form-planning-plans-v1` storage with pure local-date serialization/validation helpers for plans and activities, injected-storage harness wrappers, and race-safe PlanScreen hydration/persistence guarded by `hydratedRef`. Confirmed plans and activities now persist through AsyncStorage; external calendar-provider integration remains future scope.
- Verification: VS Code diagnostics clean; browser harness **168/168 green** (162 baseline + 6 storage tests); diagnostic unchanged at **31/31 naming, 9/9 splitting, 7/7 multiDay**; injected-storage round-trip and local-date tests pass. Physical Expo Go kill/relaunch verification was not available from this environment and remains for the user/OpenCode side.
- Needs: OpenCode — run `check`; perform the Expo Go relaunch/delete persistence smoke test on-device and confirm tomorrow's date remains absolute. Final storage write is covered by this entry.

## 2026-09-20 17:45 — P6 plan-persistence task briefed (OpenCode)
- Changed: HANDOFF.md only (brief delivery; no code touched)
- Decision: Drafted the P6 task for the next session: persist the arranged plan
  across launches. Storage: new versioned key `final-form-planning-plans-v1` in
  `src/lib/planning-memory.ts` (mirrors the preferences pattern). Pure helpers
  `plansToStorage`/`plansFromStorage`/`activitiesToStorage`/`activitiesFromStorage`
  (Date → local `YYYY-MM-DD` string, validation, drop-malformed) get harness
  parity + tests; thin `loadPlans`/`savePlans` wrap AsyncStorage. UI: hydrate
  `plannedItems`/`activities` on mount and persist on change — *must* guard the
  first save with a hydrated ref to avoid an empty-array overwrite race on
  mount. deps: `date: Date` is serialized timezone-safely via local getters;
  only confirmed items persist; relative-day prompts become absolute once saved.
- Verification: brief only — baseline remains 162/162 green (verified 17:30),
  diagnostic 31/31 · 9/9 · 7/7.
- Needs: VS Code — implement per the full brief (files: `src/lib/planning-memory.ts`,
  `src/app/plan.tsx`, `scripts/planning-tests.js`, `dev-log.md`,
  `AI-CONTEXT-FOR-VSCODE.md`), gate green (162 + new tests ~168), Expo Go
  restart check, HANDOFF entry. OpenCode then re-verifies.

## 2026-09-20 17:30 — Numeric-label + identity fixes verified (OpenCode)

- Changed: none (probe `scripts/debug6.html` created + removed; verification only)
- Decision: Independently verified the VS code agent's label/identity fix (17:16
  HANDOFF entry). Gate re-run: **162/162 green**. Diagnostic re-run:
  **naming 31/31 · splitting 9/9 · multiDay 7/7** (was 27/31 + 6/7). Code
  review: `extractRequestedActivity` now uses context-aware numeric strips
  (clock-with-`:mm`, am/pm-suffixed, bare range pairs, time-preposition +
  number); `getPlanIdentity` treats non-`focus` keys as identity but generic
  `focus`/title items by normalized title (`title:...`); plan.tsx
  `isSamePlannedActivity`/`isSameScheduledActivity` wired to it (activity.type
  → workout/commitment keys); harness mirrors planner line-for-line. Live probe:
  `task 13 at 8 AM` → **"Task 13"** @ 480; `meeting 2`/`test 3` labels preserved;
  `Breakfast` vs `Work` → `title:breakfast` ≠ `title:work` (no longer
  duplicates); `Meeting 2` vs `Meeting` → both `key:commitment` (intended);
  `work 9 to 5` → "Work" 480m; `gym at 8` → "Workout session" @ 480;
  `room 12 at 3 PM` → "Room 12" (non-time numbers preserved); category titles
  unchanged ("Scheduled commitment" 540/90).
- Verification: gate **162/162**, diagnostic **31/31 · 9/9 · 7/7**, probe above.
- Needs: — the "couldn't put two plans on one day" issue is resolved at the
  logic layer. Tidy-up suggestions for the next sweep: (1) the UI duplicate
  flow now has pure coverage via `getPlanIdentity` (P3 partial win); (2)
  remaining roadmap: plan persistence (P6), and optionally the
  same-activity-different-times policy question for the user.

## 2026-09-20 — Numeric labels and generic identity fix (VS Code)
- Changed: `src/lib/planner.ts`, `src/app/plan.tsx`, `scripts/planning-tests.js`, `AI-CONTEXT-FOR-VSCODE.md`, `PLANNER-DIAGNOSTIC-REPORT.md`; Expo regenerated `.expo/types/router.d.ts` during the dev run.
- Decision: Replaced broad numeric time stripping with context-aware clock/suffix/range/preposition strips so labels such as `Task 1`, `Meeting 2`, and `Test 3` remain in titles. Added exported `getPlanIdentity`; non-focus categories keep category identity while generic focus plans compare by normalized title, eliminating `Breakfast`/`Work` collisions. Existing same-activity same-day duplicate policy remains unchanged.
- Verification: VS Code diagnostics clean; planner/harness extraction and identity logic mirrored; browser harness **162/162 green**; diagnostic rerun **31/31 naming, 9/9 splitting, 7/7 multiDay**; report refreshed with post-fix findings.
- Needs: OpenCode — run `check` and review the numeric-label and generic-identity changes.

## 2026-09-20 17:20 — Diagnostic cross-checked + root causes (OpenCode)

- Changed: none (re-ran `scripts/diagnostic.html` in Edge headless; verification only)
- Decision: Independently re-ran the VS diagnostic — results match the report
  exactly: naming **27/31**, splitting **9/9**, multiDay **6/7**. Root causes
  confirmed in code:
  1. **Naming — numeric labels stripped:** `extractRequestedActivity` (planner.ts:
     535) strips `\b\d{1,2}\b` bare numbers as "times", so `task 1 at 8 AM` →
     "Task", `meeting 2 at 3 PM` → "Scheduled commitment" (label eaten before
     category mapping). Times stay correct; names lose the label.
  2. **Same-day — generic activities collide:** `isSamePlannedActivity`
     (plan.tsx:161-169) uses `item.activityKey` as identity when present, and
     `getPromptActivityKey` tags every generic activity `'focus'`. So
     `Breakfast` and `Work` (both focus) on the same day are classified as
     duplicates — this is the user's "can't put more than one plan in a day"
     pain. Splitting itself is 100% healthy (9/9).
  3. Policy note: same activity same day at different times still dedups
     (dev-log keep-or-copy flow) — leaving as-is unless user wants looser.
- Verification: diagnostic 27/31 + 9/9 + 6/7 confirmed independently; gate
  baseline 157/157 untouched (report-only task).
- Needs: VS Code — implement the two fixes per the task brief OpenCode sends:
  (A) preserve numeric activity labels in `extractRequestedActivity` (planner +
  harness mirror + label regressions), (B) split duplicate identity for
  generic `focus`/title items by normalized title (extract a pure
  `getPlanIdentity` helper into planner.ts, mirror + test it, wire plan.tsx to
  it) — this also chips away at P3 (pure-ify UI identity for gate coverage).

## 2026-09-20 — Planner diagnostic report (VS Code)
- Changed: `scripts/diagnostic.html`, `PLANNER-DIAGNOSTIC-REPORT.md`, `HANDOFF.md`
- Decision: Added a repeatable browser diagnostic using the existing `planning-tests.js` globals. It covers naming, marker-based splitting, same-day append/duplicate/overlap behavior, cross-day safety, and same-activity different-time cases. No planner, UI, harness, or dev-log code was modified.
- Verification: Unchanged browser harness **157/157 green**. Diagnostic completed with `DONE` and no exception: naming **27/31**, splitting **9/9**, multiDay **6/7**. Report records the four numeric-label naming failures and the generic-`focus` duplicate collision. Final artifact write is covered by this entry.
- Needs: OpenCode — read `PLANNER-DIAGNOSTIC-REPORT.md`, rerun `scripts/diagnostic.html`, and decide which reported issues should become fixes or §4 entries.

## 2026-09-20 — Fix missing ThemedView import (VS Code)
- Changed: `src/app/plan.tsx`; existing Expo runtime changes `.expo/dev/logs/start.log` and `.expo/types/router.d.ts` also covered.
- Decision: Imported the existing `ThemedView` component used by `PlanScreen`, fixing the runtime `Property 'ThemedView' doesn't exist` render error at line 712.
- Verification: VS Code diagnostics clean for `src/app/plan.tsx`.
- Needs: OpenCode — confirm the Expo screen now renders after reload.

## 2026-09-20 17:10 — Clean-title fix verified (OpenCode)

- Changed: none (probe `scripts/debug5.html` created + removed; verification only)
- Decision: Independently verified the VS Code agent's title-cleanup fix (16:48
  HANDOFF entry). Gate re-run: **157/157 green**. Reviewed `extractRequestedActivity`
  (planner.ts 530-552): residual duration words and trailing connector chains are
  stripped; harness transcription is identical; pinned malformed-title tests were
  updated (range title → `Scheduled commitment`; multi-task → `['Breakfast',
  'Work', 'Workout session']`). Live probe of the full matrix:
  - meeting 9-10:30 → `Scheduled commitment` (540/90) · study 5-6 PM → `Study
    session` · workout 6 PM/1h → `Workout session` · book at 8 → `Reading
    session` (was "At") · fish and chips → `Cook Fish And Chips` ·
    supermarket → `Supermarket` · yoga → `Yoga`.
  - Safety rule held: `volunteer at animal shelter on Saturday` → `Volunteer At
    Animal Shelter`; `piano practice` → `Piano Practice`; slang preserved.
- Verification: **157/157** all green; probe evidence in chat. `&apos;` literals:
  none remain in plan.tsx (0 matches).
- Needs: — docs §4.5/6/11 now "Resolved". Remaining open: P3 (extract the
  sequential-queue UI state machine into a pure lib module for gate coverage)
  and P6 (plan persistence — dev-log known boundary). Loop stable at 157/157.

## 2026-09-20 — Clean title cleanup (VS Code)
- Changed: `src/lib/planner.ts`, `scripts/planning-tests.js`, `src/app/plan.tsx`, `AI-CONTEXT-FOR-VSCODE.md`; Expo regenerated `.expo/types/router.d.ts` during the dev run.
- Decision: Removed trailing standalone duration words and trailing time connectors from activity extraction, preserving real internal name words. Stopped stripping `book` as a command so category mapping produces `Reading session`. Replaced the two remaining React Native `&apos;` literals and marked the resolved title divergences in the context document. Splitter behavior, numeric-label parsing, and duration precedence were unchanged.
- Verification: VS Code diagnostics clean; planner/harness `extractRequestedActivity` and title logic are mirrored; browser harness **157/157 green**; focused title matrix passed for meeting, study, workout, book, fish and chips, supermarket, yoga, volunteer, piano, and slang cases.
- Needs: OpenCode — run `check` and confirm the clean-title results in the pair gate.

## 2026-09-20 17:00 — Splitter-hardening verified (OpenCode)

- Changed: none (probe `scripts/debug4.html` created + removed; verification only)
- Decision: Independently verified the VS Code agent's `splitPromptTasks`
  hardening (16:43 HANDOFF entry). Gate re-run: **154/154 green**. Reviewed
  code + `planning-tests.js` transcription: **line-by-line identical**. New
  splitter (split only on `;`, `then`, `after that`, `and then`, comma-before-
  marker; bare commas/`and` preserved inside one activity) confirmed against
  the live probe:
  - `meeting with Sarah, my manager, at 2 PM` → **1 plan**, "Meeting With
    Sarah, My Manager", start **840** (time no longer lost; no bogus plans).
  - `cook fish and chips at 7 PM for 2 hours` → **1 plan**, start 1140 / 120m.
  - 4-task `then`/`after that` example still splits into 4 ordered plans;
    `call John at 9, then lunch with the lads at 12` → 2 plans (540/720);
    `gym after school` unsplit; bare comma lists now stay together (documented
    §4.12 trade-off).
  - UI routing (plan.tsx 446-555) verified: timed tasks complete immediately,
    ambiguous tasks clarify in order first, untimed tasks queue to the
    schedule window — P2 addressed. `couldn&apos;t` → `couldn't` at line 441.
- Verification: **154/154** all green; probe evidence in chat.
- Needs: — two small leftovers for a later sweep: (1) `&apos;` entities still
  literal at plan.tsx 1069 & 1125 (`today&apos;s`, `I&apos;ll`); (2) P3 stands —
  extract the sequential-queue state machine into a pure lib module so the
  UI half can be gate-covered. Title-token cleanup (P5) and plan persistence
  (P6) remain open as before.

## 2026-09-20 — Harden sequential splitter (VS Code)
- Changed: `src/lib/planner.ts`, `scripts/planning-tests.js`, `src/app/plan.tsx`, `AI-CONTEXT-FOR-VSCODE.md`, `dev-log.md`; Expo also regenerated `.expo/types/router.d.ts`.
- Decision: Restricted task splitting to explicit `then`, `after that`, `and then`, semicolon, or comma-before-marker boundaries. Bare commas and bare `and` now remain inside one activity. Added punctuation normalization only for a comma immediately before a timing phrase. Updated the UI to inspect each sequence task independently, completing timed tasks immediately and queueing only untimed tasks; ambiguous timed tasks are clarified in order before the untimed schedule queue. Replaced the React Native `&apos;` literal. Preserved numeric-label parsing, duration precedence, title rules, and relationship behavior.
- Verification: VS Code diagnostics clean for all changed source and harness files; planner/harness `splitPromptTasks` implementations match; browser harness **154/154 green**; focused hard-case matrix passed for appositive commas, `fish and chips`, the four-task example, `then`, `gym after school`, and bare comma lists.
- Needs: OpenCode — run `check` and review the mixed timed/untimed queue in Expo Go, especially `school at 8 then gym`.

## 2026-09-20 16:50 — Vision risk review (OpenCode)

- Changed: none (probe `scripts/debug3.html` created + removed; verified only)
- Decision: Reviewed all recent changes (numeric-label fix, duration precedence,
  sequential multi-plan, `tmr`/`I'm gonna` normalization) against dev-log.md's
  vision. Gate independently re-run: **151/151 green**. Live-probed the new
  `splitPromptTasks` edges — found real problems to address:
  - **P1 Over-splitting:** bare commas + `and` split too aggressively.
    `meeting with Sarah, my manager, at 2 PM` → 3 plans ("Meeting With Sarah",
    bogus "My Manager", junk "At") and the first segment *loses its 2 PM time*.
    `cook fish and chips at 7 PM for 2 hours` → "Cook Fish" @ 9:00 + "Chips"
    @ 19:00. The intended `then`/`after that` path works perfectly.
  - **P2 Partially-timed gap:** `school at 8 then gym` has an explicit time, so
    the whole prompt bypasses the schedule window and untimed `gym` is silently
    placed at the 9 AM default instead of popping the start/end window (contra
    dev-log §Planning Session: "When a prompt has no time, the app opens a
    start/end time popup").
  - **P3 UI half is gate-invisible:** the sequential queue, popups, calendar,
    and swipe flows are not covered by the harness (L = pure parts only); the
    new feature's UI was hand-verified in Expo Go. Suggest extracting the
    sequential queue/resolution into a pure lib module later for coverage.
  - **P4 cosmetic:** `plan.tsx:441` renders literal `couldn&apos;t` (HTML entity
    not decoded in RN text).
  - P5 title-token cleanup still open (unchanged), P6 no plan persistence
    (known dev-log boundary).
- Verification: gate **151/151**; probe outputs documented in chat (evidence
  above).
- Needs: VS Code — on user approval, harden `splitPromptTasks` (recommended:
  split only on explicit sequence markers `then`/`after that`/`;`/`and then`
  and drop bare commas/`and`, or filter segments that yield no activity core)
  with regression tests for the appositive-comma and multi-word-name cases;
  close the partially-timed schedule-window gap; replace the `&apos;`.

## 2026-09-20 — Sequential multi-plan scheduling (VS Code)
- Changed: `src/lib/planner.ts`, `src/app/plan.tsx`, `scripts/planning-tests.js`, `HANDOFF.md`; Expo setup also changed `package.json`, `package-lock.json` and created `.expo/dev/logs/start.log`, `.expo/devices.json`, `.expo/README.md`, `expo-env.d.ts`, `.expo/types/router.d.ts`.
- Decision: Added natural sequential-task splitting for `then`, `after that`, commas, and semicolons. Untimed multi-task prompts now open the schedule window once per activity, in prompt order, with a visible task counter. Normalized `tmr` to tomorrow and conversational `I'm gonna` wording so the example produces School, Workout session, Cook Dinner, and Tidy Up My Room A Little. Existing relationship wording such as `gym after school` remains unsplit.
- Verification: VS Code diagnostics clean for `planner.ts`, `plan.tsx`, and `planning-tests.js`; browser harness **151/151 green**; focused exact-prompt check passed with 4 ordered titles and tomorrow dates; relationship prompt without an anchor still returns no plan.
- Needs: OpenCode — run `check` and review the sequential schedule queue in Expo Go. Note: `@expo/ngrok` was added as a dev dependency to support tunnel mode.

## 2026-09-20 16:10 — Activity-name regression sweep (OpenCode)

- Changed: none (created + removed probe `scripts/debug2.html` for verification)
- Decision: Confirmed NO regression in activity-name intelligence from the
  numeric-label fix. The change is confined to `parsePromptTimeRange`'s START
  guard; name extraction, categories, learning, aliases, and relationships are
  untouched code paths. Live-probed dev-log's own examples in the current
  build: `I've got work...` → 'Work' (14 days), `piano practice every day` →
  'Piano Practice' (7), slang `hang out with my mate tomorrow` preserved (1),
  `cooking lesson at 8:30 AM to 10 AM` → start 510 / dur 90, `supermarket at
  5 PM to 6 PM` → 1020 / 60, `yoga at 4 PM for 1 hour` → 960 / 60,
  `work at 9 am for 2 hours` → 540 / 120, and the fix case `task 1 at 8 AM` →
  **480**. The only artifact is the known residual-title divergence ("At To" /
  "At For Hour" tokens, §4.8 family) — pre-existing, documented, deferred as
  the title-cleanup decision. Not a regression.
- Verification: full gate **150/150** (D 31/31, J 9/9, C 7/7); probe output
  above.
- Needs: — remaining open decision: title cleanup.

## 2026-09-20 16:00 — Numeric-label fix verified (OpenCode)

- Changed: none (verification + logging only)
- Decision: Independently verified the VS Code agent's numeric-label fix by
  re-running the full gate and line-reading both files:
  - `parsePromptTimeRange` now requires an explicit start time (am/pm suffix
    OR `:mm`) unless followed by an explicit range connector (`to`/`through`/
    `until`/`–`). `task 1 at 8 AM` no longer parses as 1:00→8:00.
  - planner.ts and the `planning-tests.js` transcription are **functionally
    identical** (group indexing, guard, end-inference all match).
  - All 4 existing range tests + the new `task 1`/`task 2`/`task 13`
    regressions pass. Titles untouched (still deferred).
  - Bonus: the enforcement loop was observed working — the 15:45/15:46 edits
    flipped `scripts/.handoff-status.txt` to STALE, and the agent's HANDOFF
    entry at 15:46:54 reset it to OK.
- Verification: full gate re-run (Edge headless, :8902) = **150/150 green**.
- Needs: — loop stable at 150/150. Remaining open decision: title cleanup.

## 2026-09-20 — Numeric label range fix (VS Code)
- Changed: `src/lib/planner.ts`, `scripts/planning-tests.js`
- Decision: Required explicit start-time evidence for range parsing (AM/PM suffix or `:mm`), while preserving bare-number starts only for explicit `to`, `through`, `until`, or en-dash connectors. Added regressions for `task 1`, `task 2`, and `task 13` labels. Title cleanup and other behavior were left unchanged.
- Verification: VS Code diagnostics clean for both changed files; planner and harness parser changes are functionally identical; browser harness **150/150 green**; focused 12-task numeric-label matrix and bare-number connector cases passed.
- Needs: OpenCode — run the full harness/check and confirm the pair handoff.

## 2026-09-20 15:55 — Stress-test analysis + numeric-label decision (OpenCode)

- Changed: none (analysis + handoff prompt only)
- Decision: Reviewed the VS Code stress-test findings.
  - **Healthy:** harness 147/147 green; natural-name matrix 44/44; mixed-format
    edge cases 5/5. Multi-task splitting across `, ; then and` with counts 2–12
    is solid.
  - **Real bug:** numeric-label matrix 0/44. Verified in `parsePromptTimeRange`:
    the START token accepts any bare number ≤ 12, so `task 1 at 8 AM` parses as
    a range 1:00→8:00 (start = 60). Labels ≥ 13 fall back correctly. Counts and
    durations are unaffected.
  - **Decision: FIX it.** Recommended approach: require the START half of a
    range to be an explicit time (am/pm suffix OR `:mm`); allow bare-number
    starts only when followed by an explicit range connector (`to`, `through`,
    `until`, `–`). Keep the 4 existing range tests green and mirror the change
    in `planning-tests.js`'s transcription. Title cleanup remains deferred.
  - A ready-to-paste task prompt for the user → VS Code agent covers this.
- Verification: none needed (no code touched); suite remains 147/147.
- Needs: User — paste the task prompt into VS Code. VS Code agent — implement
  the fix + mirror + regression tests + HANDOFF entry (§7 contract).

## 2026-09-20 — Multi-plan stress test (VS Code)
- Changed: none (testing only)
- Decision: Stress-tested one-prompt daily planning with 2 through 12 activities using comma, semicolon, `then`, and `and` separators, mixed durations, explicit ranges, 24-hour times, noon, and exact-minute times.
- Verification: Existing browser harness **147/147 green**. Natural activity-name matrix **44/44 passed** (all counts 2–12 across four separators). Mixed-format edge cases **5/5 passed**. Numeric-label matrix **0/44 passed**: activity labels such as `task 1 at 8 AM` are parsed with starts at 1:00 AM, 2:00 AM, etc., because the range parser treats the label number as a range start. Counts and durations remained correct. No fixes made per request.
- Needs: OpenCode — review the numeric activity-label parser finding and decide whether to fix it.

## 2026-09-20 15:50 — Watcher engine v3 + audit live (OpenCode)

- Changed: `scripts/watch.ps1` (rewritten as an mtime POLLING engine — the
  FileSystemWatcher event pump never fires in post-restart background shells,
  so the feed had gone silent at 15:19:26 despite running processes); also
  `AI-CONTEXT-FOR-VSCODE.md` (port note §3). This entry is the corrective
  HANDOFF for this turn's changes.
- Decision: Switched the watch to a 2-second poll scan that diffs file mtimes
  and logs Created/Changed/Deleted to `scripts/.file-events.log`, and maintains
  `scripts/.handoff-status.txt` (OK = every tracked change covered by a
  HANDOFF entry; STALE = a tracked file changed and no HANDOFF update since).
  Verified end-to-end with a probe file: baseline OK without log flood,
  tracked change → STALE listing it, delete → listed, HANDOFF.md append →
  OK. Probe artifacts `src/lib/__probe__.ts` (Created+Deleted) are covered by
  this entry.
- Verification: gate = **147/147 green** (Edge headless, :8902). Watcher probe
  passed (timestamps 15:33:16 / 15:33:22).
- Needs: VS Code agent — the STALE signal is now reliable; append a HANDOFF
  entry after EVERY task that changes files. Open decision: title cleanup
  (see the 15:45 entry).

## 2026-09-20 15:45 — Duration precedence fix (OpenCode)

- Changed: `src/lib/planner.ts` (duration + taskDuration precedence),
  `scripts/planning-tests.js` (mirror + regression test), `scripts/watch.ps1`
  (handoff audit → `scripts/.handoff-status.txt`), `AI-CONTEXT-FOR-VSCODE.md`
  (new §4.11 finding + §7.6–7.8 enforcement contract)
- Decision: Implemented the 15:30 verdict — an explicit `for N hours/minutes`
  now wins over a coincidental time-range parse (`parsePromptTimeRange('9 am
  for 2 hours')` misread the bare `2` as 2 PM = 300). Range duration still
  applies when no duration word is present; all range tests pass unchanged.
  Titles intentionally left as-is (residual "At For Minutes" tokens) — pinned
  in the test; title cleanup is a separate pair decision (it cascades into the
  "Meeting At To" divergence + §4).
- Verification: gate via Edge headless = **147/147 green** (1 new regression
  test added).
- Needs: VS Code agent — decide title cleanup (recommend stripping
  "at/for <time|duration>" tokens from titles, then updating the range-title
  test + AI-CONTEXT §4 together). Also: HANDOFF entries now REQUIRED per task
  (`scripts/.handoff-status.txt` shows STALE otherwise).

## 2026-09-20 15:30 — Verdict on VS Code changes (OpenCode)

- Changed: none (created + removed scratch `scripts/debug.html` while diagnosing)
- Decision: Picked up the VS Code side's feed events (15:18:32 `planner.ts`,
  15:19:24 `planning-tests.js`) and ran the gate. **Suite is RED: 145/146**
  (the agent added one test, `one prompt can plan multiple timed tasks across
  the day`, which fails).
- Diagnosis: `parsePromptTimeRange('work at 9 am for 2 hours')` matches the
  bare `2` of "2 hours" as a range end (9:00→2:00 PM = 300) and the range
  overrides the explicit `2 hours` duration (`taskRangeDuration ?? durationMatch`
  precedence). Real `planner.ts` behaves identically (verified against the
  transcription). Only task phrases whose end-hour lands in 1–12 with `am/pm`
  hit this — `30 minutes` and `1 hour` avoid it.
- Recommended decision for the pair: make the explicit `for N hours/minutes`
  duration take precedence over a spurious range (`durationMatch ?? rangeDuration
  ?? learned ?? 60`), re-check the two range tests, mirror the change + test in
  `planning-tests.js`, and open/close the loop here. Alternative: accept current
  behavior and change the test expectation to `[30,300,60]` (documented
  divergence).
- Verification: harness = 146 tests, **1 failed** (above); all 145 prior tests
  green.
- Needs: VS Code agent — confirm which behavior is intended (explicit duration
  should win, I assume), then either I fix both sides or you do; log a HANDOFF
  entry. Also: please always append a HANDOFF entry when changing files so the
  pair loop doesn't rely on the feed alone.

## 2026-09-20 15:15 — Loop confirmed (OpenCode)

- Changed: none (verification + logging only)
- Decision: Confirmed the pair loop end-to-end from the OpenCode side. The VS
  Code agent's edit and HANDOFF entry arrived via the change feed (15:11:58
  `date-time.ts`, 15:12:02 `HANDOFF.md`), the comment is on disk at
  `date-time.ts:1`, and the entry is correctly formatted newest-first.
- Verification: harness re-run fresh via Edge headless (server on `:8902`,
  since `:8901` has a stale HTTP.sys registration) — **145/145 green**.
- Needs: — loop proven; resume normal pair work. Follow-ups may be "check"ed
  anytime.

## 2026-09-20 — Handoff test (VS Code)
- Changed: C:\Users\Laser\Documents\Default Project\src\constants\date-time.ts
- Decision: added pair-test comment to verify the pair handoff loop end-to-end.
- Verification: none needed (comment only, no logic changed).
- Needs: OpenCode — confirm the edit in the file-change feed and reply.

## 2026-09-20 — Feed fix (OpenCode)

- Changed: `scripts/watch.ps1` (unique `-SourceIdentifier` per event type)
- Decision: Fixed a PowerShell subscriber-ID collision that silently dropped
  Changed/Renamed/Deleted events; restarted the watcher and verified the feed
  end-to-end (`scripts/.file-events.log` now records Created/Changed events).
- Verification: no app logic touched — harness baseline remains **145/145 green**.
- Needs: —

## 2026-09-20 — Pair protocol enabled (OpenCode)

- Changed: `AGENTS.md` (added §Pair collaboration protocol), `HANDOFF.md`
  (created), `AI-CONTEXT-FOR-VSCODE.md` (added §7 rules for the VS Code agent),
  `scripts/watch.ps1` (created + running — live feed → `scripts/.file-events.log`)
- Decision: Set up the workspace-pair loop for this folder: shared `HANDOFF.md`
  log, file-change feed, and a verification gate (145-assertion harness) that
  both sides run decisions through.
- Verification: no logic touched — harness baseline remains **145/145 green**.
- Needs: VS Code agent — load the updated `AI-CONTEXT-FOR-VSCODE.md` (§7) and
  start writing HANDOFF entries after each task. User — say "check" or just keep
  working; OpenCode will read this file and the change feed by itself.

## 2026-09-20 — Session baseline (OpenCode)

- Changed: none (setup only)
- Decision: Initialized this handoff log and the pair protocol (see AGENTS.md).
  Also created `scripts/watch.ps1` — a live file-change feed logging to
  `scripts/.file-events.log` so either side can see what the other touched.
- Verification: `scripts/planning-tests.js` — **145/145 pass** (Edge headless).
- Needs: VS Code agent — follow the protocol in AI-CONTEXT-FOR-VSCODE.md §7;
  read this file before starting work.

## 2026-09-20 — Known divergences (OpenCode, prior session)

- Changed: none (findings only)
- Decision: Behavior conflicting with `dev-log.md` — full list in
  AI-CONTEXT-FOR-VSCODE.md §4 (e.g. `following week` falls back to 5 days from
  today; `next Thursday` Sunday anomaly; range titles like "Meeting At To").
- Verification: verified by 145-test harness.
- Needs: whenever fixing one, update AI-CONTEXT-FOR-VSCODE.md §4 and add tests
  to `scripts/planning-tests.js`.