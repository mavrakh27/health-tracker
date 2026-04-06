# /feedback -- Generate User Feedback for the Developer

Collect feedback from the user about their experience with Coach and the app, then generate a structured, copy-paste-ready message they can send to the developer.

## How to Use

The user can run `/feedback` anytime. Coach should also suggest it occasionally — but **no more than once every 3 days**. Check `.claude/last-feedback-prompt` for the last prompt date before suggesting.

Good moments to suggest: end of a session, after setup, after a plan change, or if the user mentions something frustrating.

"By the way — anything about the app or coaching that's been bugging you, or something you wish worked differently? I can put together a quick note for the developer."

## When the User Has Feedback

Have a short conversation to understand what's on their mind. Ask follow-up questions if their feedback is vague. Then generate the output block.

## Output Format

**STRIP ALL PERSONAL DATA.** The output must contain zero identifying info. No names, weights, calorie targets, food details, body stats, or anything that reveals who the user is. Focus only on product feedback.

```
--- Coach Feedback (v{plugin_version}) ---

Setup experience:
- [any friction during onboarding]

App (PWA):
- [UI issues, missing features, confusing flows]

Coaching:
- [tone issues, bad advice, things coach got wrong]

Processing:
- [sync delays, missing analysis, wrong calorie estimates -- describe the issue pattern, not specific meals]

Feature requests:
- [what they wish existed]

Bugs:
- [anything broken]

Overall:
- [general impression, how long they've been using it]
---
```

Only include sections where the user actually has feedback. Skip empty sections. Keep it concise -- this gets copy-pasted in a message to a friend.

Read the plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

## After Generating

1. Write today's date to `.claude/last-feedback-prompt`
2. Tell the user: "Copy the block above and send it to the developer -- they read every one."
