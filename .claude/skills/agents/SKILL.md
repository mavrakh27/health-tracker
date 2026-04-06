# /agents — Dispatch Work to Subagents

Run a task using subagents. Pass the task description as the argument.

## Usage

```
/agents <task description>
```

## Examples

```
/agents write tests for the dailies add flow
/agents research how sync works end-to-end and document findings
/agents refactor the score rendering and review the result
```

## Behavior

When invoked:

1. **Parse the task** from the argument line
2. **Decompose into agents** — liberally spawn multiple agents in parallel when it makes sense:
   - **Research agents** — spawn 2-3 exploring different parts of the codebase simultaneously
   - **Implementation + review** — one agent writes code, another reviews it after
   - **Multi-reviewer** — spawn parallel review agents checking different concerns (correctness, edge cases, style)
   - **Search swarm** — multiple Explore agents searching different patterns/areas at once
3. **Always use Opus** for all agents
4. **Agent types** to consider:
   - `subagent_type: "Explore"` — codebase search, file discovery, understanding code
   - `subagent_type: "Plan"` — architecture, implementation strategy
   - `subagent_type: "code-simplifier"` — cleanup and refactoring review
   - Default (general-purpose) — writing code, tests, multi-step implementation
5. **Multi-agent patterns:**
   - **Fan-out research**: Spawn 3+ Explore agents in parallel, each investigating a different aspect, then synthesize results
   - **Implement + verify**: One agent writes code, then spawn a second to review/test it
   - **Parallel review**: After implementation, spawn multiple reviewers (correctness, edge cases, visual QA) simultaneously
   - **Lead + workers**: For large tasks, one agent plans and coordinates, others execute pieces
6. **Run agents in background** when you have other work to do in parallel. Run in foreground when you need results before proceeding.
7. **Report results** to the user when agents complete

## Agent Prompt Requirements

Always include in every agent prompt:
- Project: Health Tracker PWA at `C:\Users\emily\projects\health-tracker`
- Stack: Vanilla HTML/CSS/JS, no build step, no framework
- Test runner: `node test-fixtures/run-tests.js` (Playwright-based)
- Test data: `test-fixtures/data.js` (fixture builder)
- Convention: No emojis in code or UI
- Branch: `dev` (working branch)
- Read CLAUDE.md for full project context

## For Test-Writing Tasks

When the task involves writing tests:
1. Read the existing test structure in `test-fixtures/run-tests.js`
2. Add new test sections following the existing patterns
3. Run the tests to verify they pass
4. **CRITICAL — tests that never fail are untested tests.** If ALL new tests pass on the first run, that is a red flag, not a success. It means the tests may be checking the wrong thing, using stale selectors, or missing the actual failure mode. You MUST:
   - Write increasingly adversarial tests until at least one genuinely fails
   - Verify the failure is real (not a test bug)
   - Fix the code or adjust the test
   - A test suite where every new test passes immediately is not catching bugs — push harder
5. Report which tests failed before passing — if none did, say so honestly
