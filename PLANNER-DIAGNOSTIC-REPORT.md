# Planner Diagnostic Report

## Methodology

The diagnostic uses the existing pure-logic globals from `scripts/planning-tests.js`; it does not duplicate planner code. The browser page is `scripts/diagnostic.html`, which loads `planning-tests.js` first and writes `DONE\n<JSON>` to `<pre id="out">`.

Reference date: Sunday 2026-09-20 at noon. Tomorrow is Monday 2026-09-21. The unchanged project suite was also run before the diagnostic: **157/157 passed**.

Diagnostic totals after the numeric-label and identity fixes:

- Naming: 31 cases, 31 passed, 0 failed.
- Splitting: 9 cases, 9 passed, 0 failed.
- Same-day/multi-day append scenarios: 7 cases, 7 passed, 0 failed.

## Section A: Naming Findings

| Case | Expected | Actual | Pass | Root-cause hypothesis |
|---|---|---|---|---|
| `school` | `School` | `School` | yes | Category mapping works. |
| `gym`, `workout`, `training`, `exercise` | `Workout session` | Correct | yes | Workout category mapping works. |
| `study`, `course`, `exam` | `Study session` | Correct | yes | Study category mapping works. |
| `read`, `book` | `Reading session` | Correct | yes | Reading category mapping works. |
| `writing` | `Writing session` | Correct | yes | Writing category mapping works. |
| `meeting`, `call`, `appointment` | `Scheduled commitment` | Correct | yes | Commitment category mapping works. |
| `work at 9 am for 2 hours` | `Work` | `Work` | yes | Clean-title and duration precedence work. |
| `piano practice` | `Piano Practice` | Correct | yes | Generic naming works. |
| `cooking lesson at 8:30 AM to 10 AM` | `Cooking Lesson` | Correct | yes | Range cleanup works. |
| `volunteer at animal shelter on Saturday` | `Volunteer At Animal Shelter` | Correct | yes | Internal `at` and trailing date cleanup are safe. |
| `supermarket at 5 PM to 6 PM` | `Supermarket` | Correct | yes | Range cleanup works. |
| `yoga at 4 PM for 1 hour` | `Yoga` | Correct | yes | Duration-token cleanup works. |
| `gym/dinner/study from ... to ...` | Clean activity/category titles | Correct | yes | Schedule-window phrasing cleans correctly. |
| `task 1 at 8 AM` | `Task 1` at 480 | `Task 1` at 480 | yes | Context-aware time stripping preserves the label number. |
| `task 2 at 9 AM` | `Task 2` at 540 | `Task 2` at 540 | yes | Context-aware time stripping preserves the label number. |
| `meeting 2 at 3 PM` | `Meeting 2` at 900 | `Meeting 2` at 900 | yes | Label remains, so commitment category does not replace the specific title. |
| `test 3 tomorrow at 10 AM` | `Test 3` at 600 | `Test 3` at 600 | yes | Date/time parsing and label preservation both work. |
| `hang out with my mate tomorrow` | Preserved slang title | Correct | yes | Slang preservation works. |
| `tidy up my room a little tomorrow` | `Tidy Up My Room A Little` | Correct | yes | Conversational activity naming works. |
| Additional spot checks: `walk the dog tomorrow`, `have a yarn with my mate on Sunday` | Clean titles | Correct | yes | No additional naming failures found. |

## Section B: Splitting Findings

| Case | Expected | Actual | Pass | Root-cause hypothesis |
|---|---|---|---|---|
| Four-task `school then gym tmr after that ...` | 4 ordered plans | 4 ordered plans at default 9 AM | yes | Explicit sequence markers and normalization work. Untimed default behavior is documented. |
| Three timed tasks with `then` | 3 plans at 480/540/1080, durations 30/120/60 | Exact match | yes | Marker-based splitting and per-task parsing work. |
| `call John at 9, then lunch ... at 12` | 2 plans at 540/720 | Exact match | yes | Comma-before-`then` is recognized. |
| `meeting with Sarah, my manager, at 2 PM` | 1 plan at 840 | 1 plan, clean title, 840 | yes | Bare appositive commas are preserved; timing punctuation normalization changes the returned segment text to `meeting with Sarah, my manager at 2 PM` but does not alter the plan result. |
| `cook fish and chips at 7 PM for 2 hours` | 1 plan at 1140/120 | Exact match | yes | Bare `and` is preserved inside the activity. |
| `gym after school` with a School anchor | Relationship plan at anchor end + 20 | 1 relationship plan at 890 | yes | Relationship wording is not split. |
| `school at 8 then gym` | 2 plans; gym defaults to 540 in pure logic | Exact match | yes | Pure planner output is correct; UI separately routes untimed tasks through its schedule window. |
| `school, gym and study tomorrow` | 1 plan | 1 plan | yes | Known §4.12 design trade-off: bare comma/`and` lists do not split. |
| `walk then run then swim` | 3 plans | 3 plans | yes | Explicit `then` markers work. |

## Section C: Same-Day and Multi-Day Findings

| Scenario | Result | Pass | Root-cause hypothesis |
|---|---|---|---|
| `breakfast at 8 AM` → `work at 9 AM for 2 hours` → `workout at 6 PM` | 3 plans, correct date/order/unique IDs, duplicate count 0 | yes | Generic `focus` plans now compare by normalized title, so unrelated `Breakfast` and `Work` no longer collide. |
| Re-submit `work at 9 AM for 2 hours`, then keep both | 2 copies, duplicate count 1, overlap count 1 | yes | Duplicate detection identifies the repeat; the keep-both simulation preserves both copies. The overlap is expected for identical times. |
| Existing `work 9–11 AM`, then `meeting at 8:30 AM` | 2 plans, 1 overlap | yes | New-plan-wins overlap detection reports the conflict. |
| Two schedule-window completions: gym 8–9, dinner 7–8 | 2 same-day plans, no overlap | yes | Sequential append preserves both. |
| Mixed timed/window completion: school 8, gym 6–7 | 2 same-day plans | yes | Separate completion paths preserve both. |
| Today breakfast plus tomorrow lunch | 2 plans on separate dates | yes | Cross-day append does not disturb today's plan. |
| `work at 9 AM` then `work at 2 PM` | 2 plans at 540/840, duplicate count 1 | yes for plan retention; note | The plans remain distinct by time, but duplicate identity is activity/date based, so same activity on the same day is flagged as a duplicate even at a different time. This is current duplicate policy, not a plan-loss failure. |

## Top Issues

1. **Resolved: numeric labels are preserved.** Context-aware time stripping keeps `Task 1`, `Meeting 2`, and `Test 3` while removing actual clock/range numbers.
2. **Resolved: generic same-day activities use title identity.** `Breakfast` and `Work` no longer collide under the generic `focus` key.
3. **Current policy: same activity and same day is treated as a duplicate even at a different time.** This remains visible in the `work at 9` then `work at 2` scenario. It is not a plan-loss failure, but it may be too coarse if users expect multiple sessions of one activity per day.
4. **Documented trade-off, not a new bug:** bare comma and bare `and` lists remain one plan unless an explicit sequence marker (`then`, `after that`, `and then`, or `;`) is present. This matches §4.12 and prevents appositive/name over-splitting.
5. **No current splitting failures found.** The exact multi-task, appositive, fish-and-chips, relationship, mixed timed/untimed, and bare-list cases all behave as expected.

## Run Instructions

From the project root, start the static server on the documented port:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\serve.ps1 -Port 8902
```

Then run the diagnostic in Edge headless:

```powershell
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --headless --disable-gpu --no-sandbox --virtual-time-budget=20000 --dump-dom http://localhost:8902/scripts/diagnostic.html
```

Read the JSON after `DONE` in `<pre id="out">`. The unchanged baseline runner is:

```text
http://localhost:8902/scripts/runner.html
```

Expected current baseline: **162/162 passed** (157 original tests plus 5 identity/numeric-label regressions). The diagnostic intentionally reports failed matrix cases as data so the page completes without exceptions and the report can distinguish new bugs from documented behavior.
