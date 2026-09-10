# Final Form Development Log

Last reviewed: 2026-09-10

## Product Summary

Final Form is an Expo/React Native planning app with a conversational planning session. Users describe activities in natural language, and the local planner creates dated sessions, checks conflicts, updates free time, and lets the user adjust or remove plans.

The current AI behavior is local and rule-based. It does not call an external AI service.

## Planning Session

- Conversational prompt input with chat-style user and assistant messages.
- Speech-to-text support through `expo-speech-recognition` when the native module and permissions are available.
- Prompts are submitted by the send button or the text input submit action.
- Prompts are appended to the existing plan instead of replacing previous plans.
- Repeated plans on the same activity and calendar day are detected before insertion.
- Duplicate prompts open a confirmation popup listing the affected dates.
- The user can keep the existing plan or intentionally add another copy.
- Plan IDs include a generated batch identifier to prevent duplicate React keys when plans are added repeatedly.

## Natural-Language Time Logic

The planner recognizes:

- AM and PM times, including `4 PM`, `4pm`, and `4 pm`.
- 24-hour times such as `16:00`.
- `noon`, `midnight`, `in the morning`, `in the afternoon`, `in the evening`, and `in the night`.
- Time ranges such as `8:30 AM to 3 PM`.
- Ranges with an omitted first period, such as `8:30 to 3 PM`, inferred as `8:30 AM to 3 PM`.
- Exact minute values without splitting `8:30` into separate hour and minute prompts.

When a time is ambiguous, the app opens an AM/PM clarification popup. The exact ambiguous time is highlighted in the full prompt. Multiple ambiguous times are clarified sequentially.

When a prompt has no time, the app opens a start/end time popup. Start and end values are selected by pressing and dragging directly on the displayed time, like a combination lock. Dragging upward moves later; dragging downward moves earlier. Changes happen in 15-minute increments. Separate AM/PM controls remain available.

## Date and Recurrence Logic

The planner distinguishes single-day requests from date ranges:

- `today` and `tomorrow`.
- A specific weekday, such as `Thursday` or `next Thursday`.
- `this week`.
- `next week`, `following week`, and `upcoming week`.
- `next 7 days`.
- `this weekend` and `next weekend`.
- `every weekday` and `every weekend`.
- Combined ranges such as `this week and next week`.

Weekday behavior:

- `every weekday next week` creates Monday through Friday of the following week.
- `every weekend next week` creates Saturday and Sunday of the following week.
- `every weekday this week and next week` creates remaining weekdays in the current week and all weekdays in the following week.
- Specific-day prompts create one item instead of expanding to a week.

## Activity Relationships

The planner understands relative phrases such as:

- `after school`.
- `before school`.
- `after class`.
- `before work`.
- `after my lesson`.

A relationship uses the referenced activity as an anchor and adds a 20-minute transition buffer. Relationship plans are only created on dates where the referenced activity actually exists. An anchor from one day is not incorrectly copied onto unrelated days.

Example:

- School: `8:30 AM to 3:00 PM`.
- Prompt: `Gym after school`.
- Result: a workout session at `3:20 PM`, only on days containing school.

## Activity Naming and Categories

Plans are named from the requested activity portion of the prompt, not from a referenced anchor:

- School, class, lecture, or lesson -> `School`.
- Gym, workout, training, or exercise -> `Workout session`.
- Study, learning, course, or exam -> `Study session`.
- Read or book -> `Reading session`.
- Write, writing, or essay -> `Writing session`.
- Meeting, call, or appointment -> `Scheduled commitment`.
- Other activities -> `Focus session`.

Each generated plan also stores an activity category such as `school`, `workout`, `study`, `reading`, `writing`, `commitment`, or `focus`. Categories are used for reliable deduplication and cancellation.

## Conflict Handling

Every newly inserted plan is checked against:

- Existing calendar activities.
- Previously generated AI plans.
- Other items generated in the same prompt.
- Every generated date in a recurring plan.

When plans overlap, the new user-requested plan has priority. The new plan stays at its requested time. The existing conflicting activity is offered for movement instead.

The overlap popup provides per-conflict controls:

- Move the existing item earlier.
- Move the existing item later.
- Drag either target time directly in 15-minute increments.
- Keep the requested time.
- Finish all conflict decisions with `Done`.

The app also supports the existing single-activity rescheduling proposal flow.

## Calendar and Arranged Plan

- The arranged plan shows only one selected plan day at a time.
- Existing activities and AI plans are merged and displayed chronologically.
- The calendar agenda is sorted by numeric start time.
- The day overview shows the complete schedule for the selected date.
- Calendar dots appear only on dates that contain real activities or generated plans.
- Calendar days without events show an empty-state message.
- The calendar, arranged plan, and day overview share the same schedule state.

## Deletion and Removal

Swipe deletion is available inside:

- The arranged plan day overview popup.
- The calendar day agenda.

A left swipe reveals a delete action. Deleting an item updates the arranged plan, calendar, day overview, free-time calculation, and related conflict state.

Prompt-based removal supports targeted and generic commands:

- `I can't go to the gym this week`.
- `Cancel workouts next week`.
- `Delete my appointment next Thursday`.
- `Clear all calendar commitments for next week`.
- `Remove next week's plans`.
- `Delete everything tomorrow`.

Removal logic recognizes straight and curly apostrophes, `cant`, `cannot`, `cancel`, `remove`, `delete`, `clear`, `erase`, `wipe`, `skip`, and similar language.

Removal scopes include:

- Today.
- Tomorrow.
- A specific weekday.
- This week.
- Next week, including `next week's`, `next weeks`, `following week`, and `upcoming week`.
- This week and next week.
- The next 7 days.

The assistant reports the number of removed entries and the number of distinct affected days. Generic removal commands target all plans in the requested window; activity-specific commands target only that activity category.

## Free-Time Calculator

- Uses an 8:00 AM to 10:00 PM planning day.
- Calculates free blocks around existing activities.
- Includes AI plans occurring today.
- Updates when AI plans are added, moved, or deleted.
- Updates when calendar activities are deleted.
- Uses sorted activity times to produce chronological free blocks.

## Local Preference Learning

Planning preferences are stored locally with AsyncStorage under the versioned key `final-form-planning-preferences-v1`.

The app remembers:

- Typical duration by activity.
- Preferred start time by activity.
- Accepted earlier/later movement choices.

Learned preferences apply only when a new prompt does not specify its own timing, duration, or relationship. Explicit user instructions always take priority.

Storage is device/browser-local. There is no account sync or external training service.

## Popup and Gesture System

`src/components/swipe-sheet.tsx` provides the shared popup behavior:

- Animated bottom-sheet presentation.
- Swipe-down dismissal.
- Scrollable popup contents.
- Nested scrolling support.
- Keyboard-safe popup taps.

The planning screen uses popup states for:

- Calendar.
- Free time.
- AM/PM clarification.
- Missing start/end time selection.
- Duplicate confirmation.
- Overlap resolution.
- Day overview.

## Source Map

- `src/app/plan.tsx`: planning screen, prompt routing, popup UI, schedule state, deletion, conflict resolution, and calendar presentation.
- `src/lib/planner.ts`: time parsing, date windows, recurrence, activity relationships, free blocks, overlap detection, formatting, and plan generation.
- `src/lib/planning-memory.ts`: local preference persistence and learned defaults.
- `src/components/swipe-sheet.tsx`: shared animated, scrollable popup container.
- `src/constants/date-time.ts`: app date and timezone helpers.
- `src/constants/theme.ts`: colors, typography, spacing, and layout constants.

## Verification

TypeScript validation:

```powershell
.\\node_modules\\.bin\\tsc.cmd --noEmit
```

Run the web app:

```powershell
npm.cmd run web
```

Then open `http://localhost:8081`.

The repository currently has no ESLint configuration. Running `npm.cmd run lint` reaches Expo's setup prompt and reports that ESLint is not configured; it does not currently provide a lint result.

## Known Boundaries

- The planner is deterministic rule-based logic, not a remote or generative AI model.
- Schedule state currently lives in the planning screen during the session.
- Learned preferences persist locally, but plans themselves are not yet persisted as a full calendar database.
- Existing calendar activities are represented by the current screen's activity state; future persistent calendar integration would require a storage or calendar provider layer.
- Native speech recognition depends on platform permissions and the installed Expo speech module.
