---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Use for /setup-pstack, /skill:setup-pstack, "pstack budget", or changing pstack's model choices.
disable-model-invocation: true
---

# Setup pstack

Run the `/setup-pstack` command.
It asks for a reasoning budget, then lists the models scoped to this Prime Agent session (`enabledModels`, the same set `/scoped-models` shows, or every available model when nothing is scoped) for each role, and writes `~/.prime/agent/pstack/models.json`.

If the command is unavailable, write that JSON yourself:

- `version`: `1`
- `budget`: `inherit`, `unlimited`, `large`, `medium`, or `small`. `inherit` means children keep the parent thinking level. The others map to `thinking="max"`, `"xhigh"`, `"high"`, `"medium"` on `rlm.spawn`.
- `roles`: one key per role listed below
- each value is `inherit-parent`, `auto`, a `provider/id` selector, or an array of those
- never write a selector you have not confirmed is available (`await rlm.find_models(<query>)` returns exact `provider/id` selectors)
- start every role at `inherit-parent` unless the user chose a model

Roles: feature, refactoring; bug-fix; perf-issue; hillclimb; judgment and prose; hardest tasks; how explorer; how explainer; why investigators; why synthesizer; reflect tooling; reflect judgment, divergent, synthesizer; arena runners; arena cross-judge pool; swarm workers; architect runners; interrogate reviewers.

Panel roles (`arena runners`, `arena cross-judge pool`, `architect runners`, `interrogate reviewers`) are arrays: one subagent per entry.

The budget is separate from the model. The upstream plugin bakes effort into model slugs (`...-thinking-max`); Prime Agent passes `thinking=` on `rlm.spawn` instead. A child model whose ceiling is below the budget rejects the spawn, so drop `thinking=` for that child rather than lowering the budget for everyone.

The file is user-level.
Do not commit it.
If `~/.prime/agent/pstack-models.md` exists and the JSON does not, the extension migrates it on session start. A Pi-era `~/.pi/agent/pstack/models.json` is not read; copy it across by hand.

After writing, tell the user it applies to new turns.
Offer `/skill:create-verification-skill` once if the project has no verify skill, same as before.
