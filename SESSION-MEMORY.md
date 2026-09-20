# SESSION-MEMORY — Durable context for "Final Form" (OpenCode Big Pickle)

> This file is the **master context record** for reviving a fresh OpenCode session
> (or handing off to any other agent) as if this conversation continued.
> Newest first within sections. When a decision lands, update this file the same
> day. Vendored by VS Code agent via GitHub (repo created 2026-09-20).
> Companion files: `HANDOFF.md` (pair log, newest first), `dev-log.md`
> (feature spec), `AI-CONTEXT-FOR-VSCODE.md` (VS briefing), `PLANNER-DIAGNOSTIC-REPORT.md`,
> `FEATURES-VERIFICATION-REPORT.md` (diagnostics).

---

## 1. Project identity

- **Final Form** — an Expo (SDK 57) / React Native planning app. User types
  natural-language plans ("school at 8 then gym after school"); the app parses,
  splits, times, dedups, and schedules them onto a calendar.
- Root: `C:\Users\Laser\Documents\Default Project` (Windows, powershell).
- **No git repo existed at last check (2026-09-20 18:15)**; no `git` CLI and no
  Node.js on the OpenCode side (`tsc`/`jest`/`expo` unavailable → verification is
  **browser-runner-only**). The VS Code agent owns git + GitHub + Expo Go.
- `.gitignore` is the standard Expo template (covers `node_modules/`, `.expo/`,
  `/ios`, `/android`, `.p8/.p12/.key/.pem/.jks`, `*.tsbuildinfo`).

## 2. Pair collaboration protocol (both agents, every turn)

1. **Read `HANDOFF.md` first** (newest entry at top), then check
   `scripts/.file-events.log` (change feed) and `scripts/.handoff-status.txt`
   (must read `OK`).
2. **Verify, don't trust.** Pure-logic changes
   (`src/lib/*`, `src/constants/*`, standalone helpers in `src/app/plan.tsx`)
   must pass the gate **before and after**.
3. **Append a `HANDOFF.md` entry** immediately after changing files (format:
   `## YYYY-MM-DD HH:MM — <Agent>` with Changed / Decision / Verification /
   Needs). Never rewrite history.
4. Handoffs flow through **files + HANDOFF.md**, not notifications.
5. Update `dev-log.md` (spec) and `AI-CONTEXT-FOR-VSCODE.md` §4 whenever actual
   behavior changes.

## 3. Verification gate (the one source of truth)

- Serve: `powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 -Port 8902`
  (test server must be **only on port 8902**).
- Run (Edge headless; always use a **fresh** temp `--user-data-dir`, unique per
  run):
  ```
  & 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --headless --disable-gpu --no-first-run --user-data-dir="<fresh dir>" --virtual-time-budget=20000 --dump-dom http://localhost:8902/scripts/runner.html
  ```
- Parse `<pre id="out">` → `DONE\n<JSON>` (unescape `&quot;`/`&#34;`/`&#39;`/`&#92;`).
  JSON: `passed`, `failed`, `total`, `failures[]`, `groups` =
  `{ "<name>": { passed, failed } }`.
- **Current baseline: 168/168 green** (all suites; see §7).
- Diagnostic pages: `scripts/diagnostic.html`
  (naming 31/31 · splitting 9/9 · multiDay 7/7) and
  `scripts/features-verification.html` (naming 16/16 · splitting 9/9 · multiDay
  7/7 · persistence 12/12).
- Probe pattern: create `scripts/debugN.html` loading `planning-tests.js` and
  calling its globals, dump `DONE\nJSON`, **delete the scratch page afterward**
  (the watcher logs them).
- Watcher: `scripts/watch.ps1` (mtime polling ~2s). Verify alive via
  `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'"` filtered to
  `*watch.ps1*` minus `-Command` self-matches. Currently PID 3400.
- The runner/harness must stay **functionally identical** to `planner.ts` —
  transcription discipline, never copy behavior drift.

## 4. File map

| File | Role | Notes |
|---|---|---|
| `src/lib/planner.ts` | Core parser/scheduler | \~1 file; split, title, time, range, duration, recurrence, overlaps, conflicts, `getPlanIdentity` |
| `src/lib/planning-memory.ts` | AsyncStorage knowledge + **plan persistence** | Keys `final-form-planning-preferences-v1` and `final-form-planning-plans-v1` |
| `src/app/plan.tsx` | Planning screen UI + state machine | Hydration, duplicate/overlap popups, schedule-window queue, cancellation, speech |
| `src/constants/*` | App config | — |
| `scripts/planning-tests.js` | Edge-headless harness | 168 tests; globals reused by diagnostic pages |
| `scripts/runner.html` | Gate runner page | |
| `scripts/serve.ps1` / `watch.ps1` | Server 8902 / change watcher | |
| `scripts/.file-events.log` | Change feed | machine-absolute paths |
| `scripts/.handoff-status.txt` | OK/STALE audit | |
| `scripts/diagnostic.html` + `PLANNER-DIAGNOSTIC-REPORT.md` | Naming/splitting/same-day diagnostic | |
| `scripts/features-verification.html` + `FEATURES-VERIFICATION-REPORT.md` | Composite feature matrix | |
| `HANDOFF.md` | Pair log | newest first |
| `dev-log.md` | Feature spec | VS-owned |
| `AI-CONTEXT-FOR-VSCODE.md` | VS briefing, §4 divergences | |
| `.expo/`, `package.json` (includes `@expo/ngrok` devDep) | Expo dev artifacts | VS-agent side |

## 5. Harness globals available to diagnostic/probe pages

`plan(prompt, opts)`, `splitPromptTasks(prompt)`, `buildPlanFromPrompt(prompt,
startDate, anchors, context, recurringDays, recurringWeeks)`,
`findPlanOverlaps(plans, activities, existing)`, `findScheduleConflict`,
`isSamePlannedActivity(a, b)`, `getPlanIdentity(title, activityKey)`,
`applyPlanningPreferences(items, prefs)`, `getPlanningContext`,
`rememberPlan(prompt, items, storage)`, `makeStorage()`,
`loadPlans(storage)`, `savePlans(storage, items, acts)`, `plansToStorage`,
`plansFromStorage`, `activitiesToStorage`, `activitiesFromStorage`,
`parsePromptTimeRange`, and the date helpers (`d(n)`).

## 6. Decided behaviors (the hard-won learning)

1. **Numeric labels preserved** — `task 1 at 8 AM` → title *Task 1* @ 480;
   `meeting 2 at 3 PM` → *Meeting 2* @ 900 with key `commitment`;
   `test 3 at 3 pm` → *Test 3* @ 900 (label `3` survives next to time `3 pm`);
   `room 12 at 3 pm` → *Room 12*. Implemented via **context-aware time
   stripping** in `extractRequestedActivity` (planner.ts): strip in order clock
   `\d{1,2}:\d{2}` (+optional am/pm), bare `\d{1,2} am|pm`, bare range pairs
   `\d{1,2}(to|through|until|–)\d{1,2}`, numbers after time prepositions
   `(at|by|around|from|to|until|after|for)\s+\d{1,2}`. Duration words still
   stripped. Pinned in harness suite D (line ~1086).
2. **parsePromptTimeRange** requires an explicit start (`am/pm` or `:mm`)
   unless a range connector (`to`/`through`/`until`/`–`) appears. Bare
   `task 1 at 8 AM` start = 480.
3. **Duration precedence**: `explicit durationMatch ?? rangeDuration ??
   learned ?? 60` (applies to both `duration` and `taskDuration`).
4. **Sequential splitting** — split ONLY on `;`, `then`, `after that`,
   `and then`, and comma-before-marker (`school, then gym`). **Bare `and` and
   bare commas stay inside one activity** (§4.12 divergence — see ACTIVE ISSUE
   §10; the user is pushing back on this). This was the P1 anti-over-splitting
   fix: `cook fish and chips`, `call John and Sarah`, `fish and chips` must
   remain single plans.
5. **Clean titles** — `extractRequestedActivity` strips residual duration
   words + trailing connector chain; `book` → *Reading session*; no `&apos;`
   literals anywhere in `plan.tsx`.
6. **Generic same-day identity** — `getPlanIdentity` (planner.ts, exported):
   `activityKey && !== 'focus'` → `key:<key>`; title fallback regex for
   workout/school; otherwise `title:<normalized-title>`. Result: *Breakfast*
   ≠ *Work* same day (both coexist); `gym` vs `workout` still dedup via
   `key:workout`; *Meeting 2* vs *Meeting* dedup via `key:commitment`;
   same title + same day = duplicate regardless of time (documented coarse
   policy — keep-or-copy popup). `isSamePlannedActivity` /
   `isSameScheduledActivity` in plan.tsx route through it.
7. **P6 plan persistence** — key `final-form-planning-plans-v1`.
   `plansToStorage`/`plansFromStorage` use **local calendar day** `YYYY-MM-DD`
   via `getFullYear/getMonth/getDate` (NEVER `toISOString()` — UTC drift).
   Parse round-trips through `new Date(y, m-1, d)`; validation drops malformed
   (blank title, start > 1439, negative/fractional duration, `2026-13-99`).
   `loadPlans`/`savePlans` wrap AsyncStorage with try/catch. plan.tsx hydrates
   on mount + persists on change, guarded by `hydratedRef` to avoid the
   empty-array-overwrite race. Only **confirmed** items persist; relative-day
   prompts become absolute once saved. On-device Expo Go restart check still
   UNCONFIRMED (see §8).
8. **UI scheduling routing** — timed → immediate; ambiguous time → clarify
   popup; untimed → schedule-window queue (§4.12-area). Overlaps → overlap
   popup (new-plan-wins in planner); conflicts → move-earlier/later suggestion.

## 7. Current verifiable state (2026-09-20 ~18:10)

- Gate: **168/168** (raced up 145 → 150 → 151 → 154 → 157 → 162 → 168
  across the numeric-label, splitter-hardening, title-cleanup, identity, and
  persistence changes).
- `scripts/diagnostic.html`: naming **31/31**, splitting **9/9**, multiDay **7/7**.
- `scripts/features-verification.html`: naming **16/16**, splitting **9/9**,
  multiDay **7/7**, persistence **12/12** (44 assertions, independently
  re-run).
- Handoff audit: OK. Watcher PID 3400.

## 8. Unconfirmed / needs the human

- **On-device Expo Go checklist** (neither AI can do it — no physical device):
  add `breakfast at 8 am` + `work at 9 am` → kill & relaunch Expo Go → both
  restored; delete one → relaunch → deletion sticks; a `tomorrow` plan stays on
  that absolute date after relaunch. 5-prompt live smoke: `task 1 at 8 am`,
  `meeting 2 at 3 pm`, breakfast+work coexist, `workout at 6 pm`, repeat-one →
  duplicate keep/both popup.
- GitHub repo: none exists yet; VS agent is expected to `git init`, add all
  (respecting `.gitignore`), commit, create remote, push.

## 9. Known divergences (dev-log vs actual; §4 of AI-CONTEXT, mostly unresolved)

- 1–4: week-recurrence edge cases; `next Thursday`/Sunday anomaly;
  `every weekend` from Sunday.
- 7: optimistic conflict suggestions. 8: "Later" = plan's own end.
  9: alias "need". 10: cancellation matches "commitment" not "all".
- Resolved previously: clean-title items, `&apos;`, `book` naming.

## 10. ACTIVE ISSUE — "school and gym" does not split (user-reported, in flight)

- **User**: "it has trouble splitting school and gym."
- **Reproduced 2026-09-20 17:46 via `scripts/debug7.html`** (results below).
  Cause: current splitting policy (§6.4) keeps bare `and`/`,` inside one
  activity — `school and gym` → **one** plan "School And Gym" @ 540/60;
  `school, gym` → one; `school at 8 and gym at 9` → one plan @ 480 (first time
  wins, second time dropped into one activity — bad).
- Splits fine today: `school then gym`, `school, then gym` → 2 plans. And
  compounds must STAY one: `fish and chips`, `cook fish and chips at 7 PM for
  2 hours` (→ *Cook Fish And Chips* @1140/120), `call John and Sarah`.
- **Constraint set for the fix**: split `school and gym` / `school at 8 and
  gym at 9` / presumably `mow lawn and wash car`; keep `fish and chips`-type
  compounds, verb-object phrases (`cook X and Y`, `call X and Y`) one plan.
- Candidate directions (pick with the user): (a) curated compound-protection
  list; (b) verb-context protection (cook/have/make/eat/call + `X and Y` =
  object, one plan) plus coordinate `and` split otherwise; (c) split when the
  `and` separates two independently time-anchored clauses.
- **Gate implications**: splitter suites + features splitting 9/9 + §4.12
  divergence MUST be updated together; add regression tests; risk of
  re-introducing the P1 over-splitting regression (historical: "cook fish and
  chips" was once cut mid-phrase). NOT fixed yet — next task with user sign-off.

## 11. Backlog / open decisions

- P3: extract the schedule-window / sequential-queue UI state machine into a
  pure lib module for gate coverage (partially paid down via `getPlanIdentity`).
- Calendar-provider integration + "clear all" + persisting mid-flow items
  (duplicate/overlap/schedule-window pending states) — future.
- Open policy Qs for the user: same-activity-different-times same-day = still
  duplicate (keep-or-copy) — keep vs loosen to per-time? `study session 4 at
  7 pm` → *Study Session 4* (label preserved; does NOT collapse to canonical
  "Study session") — keep vs collapse?

## 12. Fresh-session recovery playbook

1. Read `HANDOFF.md` (top entries) + this file (§10 if a bug is in flight).
2. `scripts/serve.ps1 -Port 8902` (only 8902), verify gate 168/168, check
   `.handoff-status.txt` = OK and watcher alive.
3. Re-run `scripts/diagnostic.html` and `scripts/features-verification.html`
   if any planner/harness change happened since last verification.
4. Follow the current "Needs:" line of the newest HANDOFF entry.
5. When changing files: verify before+after, append HANDOFF, update §-relevant
   sections here, keep the gate transcriptions mirror-perfect.