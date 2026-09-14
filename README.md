# prime-pstack

pstack for [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent): rigorous agent workflows you can parallelize with confidence. Ported from [`@zenspc/pi-pstack`](https://github.com/zenspc/pi-extensions/tree/master/packages/pi-pstack), which was itself ported from the Cursor pstack plugin.

If you want to go fast, go deep first. pstack helps you write less, but higher quality code. When an agent goes deep and writes good, verifiable code, you can parallelize with confidence. Start multiple agents with `poteto-mode` and trust they will apply rigorous engineering principles to their work.

## Install

```bash
prime-agent package install /absolute/path/to/prime-pstack
# or, once published:
prime-agent package install git:github.com/<owner>/prime-pstack
```

To try it for one run without installing:

```bash
prime-agent -e /absolute/path/to/prime-pstack
```

No other package is required. Subagents are native `rlm.spawn` children, so `pi-subagents` is not needed.

## Get started

1. Run `/setup-pstack` once to pick a reasoning budget and which models each role uses (optional; every role inherits the parent session model and thinking level otherwise). The picker lists your `enabledModels` (the same set `/scoped-models` shows) when configured, otherwise every available model.
2. Use `/poteto-mode` for sticky Poteto Mode. It stays on until `/poteto-mode off`. `/skill:poteto-mode` also enables it.
3. Run `/pstack off` to hide even the four Discoverable skills (`how`, `why`, `unslop`, `typescript-best-practices`) from the Skill catalog.
   Off persists in `~/.prime/agent/pstack/models.json`.
   `/skill:<name>` keeps working.
   `/pstack on` restores those four, not all 47.

That is it. The other skills are Hidden; the mode skill uses them as needed. New here? [docs/guide.md](docs/guide.md) walks through setup, a first task, fan-outs, and overnight runs on Prime Agent.

## What you get

- **47 skills** (tracking upstream pstack 0.15.2), including:
  - `poteto-mode`: the main entry point. Reads your request, matches one of 23 playbooks (bug fix, perf, feature, refactoring, investigation, shipping, orchestrate, autopilot, and more), copies its steps in verbatim, and routes to the other skills as steps fire.
  - Workflow skills: `how`, `why`, `recall`, `blast-radius`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `teach`, `tdd`, `no-comments`, `unslop`, `deslop`, `bro`, `figure-it-out`, `show-me-your-work`, `create-verification-skill`, `maintain-verification-skill`, `automate-me`, `technical-writing`, `typescript-best-practices`.
  - 23 principle skills (`principle-laziness-protocol`, `principle-model-the-domain`, `principle-prove-it-works`, ...), one rule each, indexed inline by `poteto-mode`.
- **2 subagent briefs** in `agents/`, pasted above the task in an `rlm.spawn` prompt:
  - `poteto-agent`: runs poteto's style end to end. Reads `poteto-mode` in full before any work.
  - `comment-sicko`: read-only comment reviewer that savors deletion. Usually invoked through the `no-comments` skill.
- **Bundled scripts**: `skills/poteto-mode/scripts/` ships the `orch` coordination CLI (orchestrate playbook), the `watch-pr` watcher (babysit playbook), `check-plan.mjs` (multi-phase plan lint), and `worktree-audit.sh`. `orch` and `watch-pr` run under [bun](https://bun.sh).

## Model roles and budget

Per-role model choices and the reasoning budget live in `~/.prime/agent/pstack/models.json` (or `$PRIME_AGENT_CODING_AGENT_DIR/pstack/models.json`). Run `/setup-pstack` to write it. The extension injects the role table into the system prompt only when a role has a real `provider/id` selector or the budget is not `inherit`. Default inherit-all injects nothing. `inherit-parent` or `auto` runs on the parent session model (omit `model=` in `rlm.spawn`).

The budget maps to the `thinking=` argument of `rlm.spawn`: `unlimited` is `max`, `large` is `xhigh`, `medium` is `high`, `small` is `medium`. Upstream bakes effort into model slugs; Prime Agent keeps model and thinking level separate, so the budget is one line and does not rewrite selectors.

## How delegation maps onto Prime Agent

| pi-pstack (pi-subagents) | prime-pstack (RLM) |
|---|---|
| `subagent({ agent: "poteto-agent", task })` | `await rlm.spawn(<agents/poteto-agent.md body> + task, name=...)` |
| `subagent({ agent: "comment-sicko", task })` | `await rlm.spawn(<agents/comment-sicko.md body> + scope, name=...)` |
| `agent: "worker"`, `model:` | plain `rlm.spawn(prompt, name=..., model="provider/id")` |
| `readonly: true` / tool allowlists | stated in the brief ("do not edit files or commit") |
| "launch in a single message" | several `rlm.spawn` calls in one `ipython` cell, then end the turn |
| `Task` response body | `await agent_message.send(report, receiver_role="parent")` or a report file |
| `run_in_background: true` | always true; `rlm.spawn` returns at admission |
| `environment: "cloud"` | not applicable; children are daemon-backed local sessions with their own worktree |
| `/loop`, wake chains | `rlm_heartbeat.create(...)` and watcher children that reply on an event |
| `/goal` | `goal.create(...)` / `goal.get()` |
| `~/.pi/agent/sessions/<slug>/...` | `~/.prime/agent/sessions/<uuid>.jsonl` (header line carries `cwd`); children under `~/.prime/agent/session-artifacts/<parent>/sub-<id>/` |
| `ask_user_question` tool | ask in the reply |
| todolist tool | a todo list in the reply |

## Differences from pi-pstack

- Hidden skills set `disable-model-invocation: true` and stay out of the Skill catalog. `/skill:name` still loads them. The four Discoverable skills are `how`, `why`, `unslop`, and `typescript-best-practices`.
- The `agents/` directory holds prompt briefs, not `pi-subagents` agent definitions. The frontmatter is documentation only.
- The config directory honours `PRIME_AGENT_CODING_AGENT_DIR` and defaults to `~/.prime/agent`. A Pi-era `~/.pi/agent/pstack/models.json` is not read automatically.
- `/setup-pstack` reads `enabledModels` from `settings.json` when the host does not expose `ctx.scopedModels` on the command context.

## Re-grounding from upstream

`scripts/reground-from-pi.mjs` replays every mechanical seam (paths, delegation calls, tool names, wake and goal primitives) from a pi-pstack checkout onto this tree and fails if any Pi or Cursor seam survives:

```bash
node scripts/reground-from-pi.mjs --from ../pi-extensions/packages/pi-pstack --to . --dry-run
node scripts/reground-from-pi.mjs --from ../pi-extensions/packages/pi-pstack --to .
npm test
```

## License

MIT
