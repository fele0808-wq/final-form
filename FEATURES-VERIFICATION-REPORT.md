# Feature Verification Report

## Methodology

The composite diagnostic is [scripts/features-verification.html](scripts/features-verification.html). It loads `scripts/planning-tests.js` first and calls its existing globals directly: planner generation, splitting, identity checks, overlap checks, preference learning, and injected plan storage. It does not duplicate planner or storage implementations.

The fixed reference date is `START = Sun 2026-09-20` at local noon. All date assertions compare `toDateString()` values. Persistence is simulated with the harness's injected in-memory storage, not AsyncStorage.

The unchanged baseline suite was run before creating the diagnostic: **168/168 passed**. It was run again after the diagnostic was created: **168/168 passed**. The protected source and harness files were not modified.

Edge headless command used:

```powershell
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --headless --disable-gpu --no-sandbox --virtual-time-budget=20000 --dump-dom http://localhost:8902/scripts/runner.html
```

Composite diagnostic command:

```powershell
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --headless --disable-gpu --no-sandbox --virtual-time-budget=20000 --dump-dom http://localhost:8902/scripts/features-verification.html?rev=2
```

The page completed with `DONE\n<JSON>` and no exception.

## Coverage Map

| Claim | Existing gate evidence | Composite result |
|---|---|---:|
| Numeric labels preserve title and time | Suite D numeric-label tests | 16/16 |
| Numeric labels retain category keys | New composite cases for Meeting 2 and Call 2 | 16/16 |
| Durations/ranges still parse | Existing range/duration tests plus composite cases | 16/16 |
| Explicit sequence ordering | Existing splitter tests plus 9 composite split cases | 9/9 |
| Generic same-day identity | Suite I identity tests | 7/7 multiDay |
| Category identity remains coarse where intended | Suite I plus Meeting 2/Meeting and gym/workout composites | 7/7 multiDay |
| Plan/activity storage round-trip | Six storage tests in suite I | 12/12 persistence |
| Local calendar date stability | Storage tests plus 4 boundary dates | 12/12 persistence |
| Restart append/filter behavior | Composite restart simulation | 12/12 persistence |
| Full regression safety | Baseline runner before and after | 168/168 both runs |

## Findings

### Numeric Labels

All 16 naming cases passed. Confirmed behavior includes:

- `task 1 at 8 am` -> `Task 1` at 480.
- `task 2 at 9 am` -> `Task 2` at 540.
- `test 3 tomorrow at 10 am` -> `Test 3` at 600.
- `meeting 2 at 3 pm` -> `Meeting 2`, key `commitment`, at 900.
- `call 2 at 8:30 am` -> `Call 2`, key `commitment`, at 510.
- `room 12 at 3 pm` -> `Room 12` at 900.
- `work 9 to 5` -> `Work`, 540 to 1020, duration 480.
- Learned `Task 1` timing reapplies to a later `task 1` prompt.
- Repeating `task 1` on the same day is still treated as a duplicate by title/date policy.

One policy observation is included as a passing diagnostic touchpoint: `study session 4 at 7 pm` produces `Study Session 4`, key `study`, at 1140. The numeric label is preserved; the category does not canonicalize the longer numbered phrase to `Study session`. This is an observed naming policy divergence, not a timing or persistence failure.

### Splitting

All 9 splitting cases passed:

- The four-task `school then gym tmr after that ...` prompt produces four ordered plans.
- Timed `then` sequences preserve starts 480/540/1080 and durations 30/120/60.
- `call John at 9, then lunch ... at 12` produces 540/720.
- Appositive commas and `fish and chips` remain one plan.
- `gym after school` uses the anchor relationship and starts at 890.
- `school at 8 then gym` produces two pure plans; the pure planner defaults untimed `gym` to 540, while the UI schedule-window flow is the on-device concern.
- Bare `school, gym and study tomorrow` remains one plan by the documented explicit-marker policy.
- `walk then run then swim` produces three plans.

No new splitting bugs were found.

### Same-Day Identity

All 7 composite multi-day scenarios passed:

- Breakfast, Work, and Dinner coexist on the same day with no duplicate identities.
- Generic Work does not collide with Workout session.
- Gym and Workout session still deduplicate through the workout category key.
- Meeting 2 and Meeting still deduplicate through the commitment category key; this is intentionally coarse policy.
- Repeating the same Work prompt is a duplicate.
- Delete-then-readd of Breakfast adds cleanly.
- Work at 9 AM and Work at 2 PM remain duplicates by same-title/same-day policy, even though both times are retained.

### Persistence Lifecycle

All 12 persistence checks passed:

- Full plan/activity batch round-trip preserved fields, types, and local dates.
- Restored plans participated correctly in overlap, identity, and conflict calculations.
- Restart simulation restored Work, appended Breakfast, and filtered a re-submitted Work duplicate without losing the original.
- `2026-12-31`, `2027-01-01`, `2028-02-29`, and `2026-09-30` round-tripped to the same local calendar day.
- Garbage and partial storage shapes returned empty collections without throwing.
- A later save replaced the earlier saved state.

These are injected-storage and pure-logic confirmations. They do not prove that a physical Expo Go process on a phone was killed and relaunched successfully.

## Top Issues

1. No failures were found in the composite numeric-label, identity, or persistence logic matrices.
2. `study session 4` remains an observed policy divergence: numeric labels are preserved, but the longer phrase does not collapse to the canonical `Study session` category title.
3. Same-category identity remains intentionally coarse: Meeting 2/Meeting and Work at different times on one day trigger duplicate handling.
4. The Expo Go lifecycle remains unconfirmed in this environment. AsyncStorage persistence must still be checked on a physical device by killing and relaunching the app.

## On-Device Appendix: User Checklist

These checks are **UNCONFIRMED until run on Expo Go**.

### Persistence lifecycle

- [ ] Start Expo Go with the project.
- [ ] Add `breakfast at 8 am` and `work at 9 am`.
- [ ] Kill Expo Go completely and relaunch it.
- [ ] Confirm both plans return with the correct times and dates.
- [ ] Delete one plan.
- [ ] Kill and relaunch Expo Go again.
- [ ] Confirm the deletion persists.
- [ ] Add a plan for `tomorrow`, relaunch, and confirm it remains on tomorrow's absolute calendar date.

### Five-prompt live smoke

- [ ] `task 1 at 8 am` -> title `Task 1`, 8:00 AM.
- [ ] `meeting 2 at 3 pm` -> title `Meeting 2`, 3:00 PM.
- [ ] `breakfast at 8 am` and `work at 9 am` -> both same-day plans coexist.
- [ ] `workout at 6 pm` -> Workout session, 6:00 PM.
- [ ] Repeat one prompt and confirm the duplicate/keep-both flow appears.

## Final Status

- Baseline before diagnostic: **168/168 passed**.
- Baseline after diagnostic: **168/168 passed**.
- Composite diagnostic: **16/16 naming, 9/9 splitting, 7/7 multiDay, 12/12 persistence**.
- On-device AsyncStorage lifecycle: **UNCONFIRMED pending user/OpenCode Expo Go check**.
