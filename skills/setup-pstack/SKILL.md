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
- `budget`: `unlimited` (default), `large`, `medium`, `small`, or `inherit`. The first four map to a `thinking=` target of `max`, `xhigh`, `high`, `medium` on `rlm.spawn`, clamped per model to what that model supports. `inherit` means children keep the parent thinking level.
- `roles`: one key per role listed below
- each value is `inherit-parent`, `auto`, a `provider/id` selector, or an array of those
- never write a selector you have not confirmed is available (`await rlm.find_models(<query>)` returns exact `provider/id` selectors)
- a role you leave out keeps the shipped roster below

Shipped roster (mirrors the upstream split with models that work here: `zai/glm-5.3` takes the fast code seat, `anthropic/claude-opus-5` the judgment seat, `openai/gpt-6-astra` the OpenAI seat, and `anthropic/claude-fable-5-1` is the panel's fourth member):

```
feature, refactoring: zai/glm-5.3
bug-fix: zai/glm-5.3
perf-issue: zai/glm-5.3
hillclimb: zai/glm-5.3
judgment and prose: anthropic/claude-opus-5
hardest tasks: anthropic/claude-opus-5
how explorer: zai/glm-5.3
how explainer: anthropic/claude-opus-5
why investigators: zai/glm-5.3
why synthesizer: anthropic/claude-opus-5
reflect tooling: openai/gpt-6-astra
reflect judgment, divergent, synthesizer: anthropic/claude-opus-5
arena runners: anthropic/claude-opus-5, openai/gpt-6-astra, zai/glm-5.3, anthropic/claude-fable-5-1
arena cross-judge pool: anthropic/claude-opus-5, openai/gpt-6-astra, zai/glm-5.3, anthropic/claude-fable-5-1
swarm workers: zai/glm-5.3
architect runners: anthropic/claude-opus-5, openai/gpt-6-astra, zai/glm-5.3, anthropic/claude-fable-5-1
interrogate reviewers: anthropic/claude-opus-5, openai/gpt-6-astra, zai/glm-5.3, anthropic/claude-fable-5-1
```

A roster entry with no live credentials in a session is dropped from the injected table for that session (the role then runs on the parent model), so the shipped roster is safe on a machine that has only some of these providers.

Roles: feature, refactoring; bug-fix; perf-issue; hillclimb; judgment and prose; hardest tasks; how explorer; how explainer; why investigators; why synthesizer; reflect tooling; reflect judgment, divergent, synthesizer; arena runners; arena cross-judge pool; swarm workers; architect runners; interrogate reviewers.

Panel roles (`arena runners`, `arena cross-judge pool`, `architect runners`, `interrogate reviewers`) are arrays: one subagent per entry.

The budget is separate from the model. The upstream plugin bakes effort into model slugs (`...-thinking-max`); Prime Agent passes `thinking=` on `rlm.spawn` instead. The injected table already clamps the budget to each model's ceiling (for example `xai/grok-4.6` tops out at `xhigh` and the `opencode-go` mirrors at `high`), so copy the `thinking=` value as written.

The file is user-level.
Do not commit it.
If `~/.prime/agent/pstack-models.md` exists and the JSON does not, the extension migrates it on session start. A Pi-era `~/.pi/agent/pstack/models.json` is not read; copy it across by hand.

After writing, tell the user it applies to new turns.
Offer `/skill:create-verification-skill` once if the project has no verify skill, same as before.
