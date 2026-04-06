# /bug — Report and Fix a Bug

Takes a bug description as argument, dispatches an Opus subagent to reproduce, diagnose, and fix it.

## Usage

```
/bug <description of the bug>
```

## Behavior

1. **Parse the bug description** from the argument
2. **Dispatch an Opus agent** with a complete prompt including:
   - The bug description exactly as reported
   - Project context (Health Tracker PWA, vanilla JS, no framework)
   - Instructions to: reproduce with Playwright, find root cause, write a failing test, fix, verify test passes
   - Run `/validate` after fixing
3. **Run in background** — free up the conversation for other work
4. **Report the fix** back to the user

## Agent Prompt Template

Always include:

```
You are fixing a bug in the Health Tracker PWA at C:\Users\emily\projects\health-tracker.
Read .claude/CLAUDE.md for full project context.
Branch: dev. Stack: vanilla HTML/CSS/JS, no framework, no build step.

BUG REPORT: <description>

Steps:
1. Read the relevant code to understand the current behavior
2. Reproduce the bug using Playwright (node -e with chromium, viewport 390x844)
   - Inject test data if needed (see test-fixtures/data.js for patterns)
   - Screenshot the broken state
3. Find the root cause — identify the exact file and line
4. Write a test in test-fixtures/run-tests.js that catches the bug
5. Run the test to confirm it fails on the buggy code
6. Fix the bug
7. Run the test again to confirm it passes
8. Run the full test suite: node test-fixtures/run-tests.js
9. Screenshot the fixed state

Report: root cause (file:line), what the fix was, test added.
No emojis in code or UI.
```
