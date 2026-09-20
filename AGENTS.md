# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Pair collaboration protocol (OpenCode ↔ VS Code)

You and the VS Code AI agent work on the same files in this folder. Follow this
protocol on **every turn**:

1. **Before doing anything, read `HANDOFF.md`** (the shared log, newest entry
   first) and check for changed files — diff modification times or read
   `scripts/.file-events.log` if it exists.
2. **Verify, don't trust.** If either side touched pure logic
   (`src/lib/*`, `src/constants/*`, or the standalone helpers in `src/app/plan.tsx`),
   run the verification gate before and after changes:
   `scripts/planning-tests.js` via the browser runner (start `scripts/serve.ps1`,
   load `scripts/runner.html` in Edge headless). Expect the full suite green
   (baseline 145/145).
3. **When you change files, append a `HANDOFF.md` entry immediately** after the
   header block: changed paths, why, verification result, and what you need from
   the VS Code agent next.
4. **Handoffs go through files + `HANDOFF.md`**, not notifications: the VS Code
   agent saves → you notice via the change feed/HANDOFF.md → you act — and the
   same in reverse. You do not need to wait for the user to repeat context.
5. Keep `dev-log.md` as the feature spec; update `AI-CONTEXT-FOR-VSCODE.md`
   whenever actual behavior changes (especially the §4 divergences).
