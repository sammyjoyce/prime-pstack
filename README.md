# prime-pstack

[![check](https://github.com/sammyjoyce/prime-pstack/actions/workflows/check.yml/badge.svg)](https://github.com/sammyjoyce/prime-pstack/actions/workflows/check.yml)
[![upstream pstack 0.15.2](https://img.shields.io/badge/upstream%20pstack-0.15.2-blue)](https://github.com/cursor/plugins/tree/main/pstack)
[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**pstack for [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent).** Rigorous agent workflows you can parallelize with confidence: 23 playbooks behind one `/poteto-mode` command, 23 engineering principles the agent cites by name, multi-model review panels, and subagent briefs that run as native `rlm.spawn` children.

This is a port of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack) (Cursor) by way of [`@zenspc/pi-pstack`](https://github.com/zenspc/pi-extensions/tree/master/packages/pi-pstack) (Pi). The skills are upstream's, synced mechanically and pinned in [`upstream.lock.json`](upstream.lock.json). What is new here is the Prime Agent grounding: delegation, transcripts, heartbeats, goals, MCP discovery, and a model roster that resolves per session.

> If you want to go fast, go deep first. pstack helps you write less, but higher quality code.

## Install

```bash
prime-agent package install git:github.com/sammyjoyce/prime-pstack
```

Or try it for one session:

```bash
prime-agent -e git:github.com/sammyjoyce/prime-pstack
```

Requires Prime Agent. No other package: subagents are native `rlm.spawn` children. The bundled `orch` and `watch-pr` tools (orchestrate and babysit playbooks) need [bun](https://bun.sh).

## Get started

1. `/poteto-mode <task>` turns the mode on for the session and sends the task. The agent matches a playbook, copies its steps into a todo list, and calls the other skills as steps fire. `/poteto-mode off` turns it off.
2. `/setup-pstack` (optional) picks a reasoning budget and a model per role. The shipped roster already works; see below.
3. `/pstack off` hides the four discoverable skills (`how`, `why`, `unslop`, `typescript-best-practices`) from the prompt. `/skill:<name>` keeps working.

New here? [docs/guide.md](docs/guide.md) walks through setup, a first task, fan-outs, and overnight runs on Prime Agent.

```text
/poteto-mode the export writes duplicate rows when a retry lands mid-run. repro first, then fix and verify.
```

## What you get

- **47 skills** (upstream pstack 0.15.2).
  - `poteto-mode`: the entry point. 23 playbooks: investigation, bug fix, perf, hillclimb, runtime and trace forensics, feature, refactoring, prototype, visual parity, authoring a skill, eval, babysit, shipping, autonomous run, orchestrate, autopilot-full, autopilot-stack, session pickup, pause safely, multi-phase plan, worktree cleanup, opening a PR.
  - Workflow skills: `how`, `why`, `recall`, `blast-radius`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `teach`, `tdd`, `no-comments`, `unslop`, `deslop`, `bro`, `figure-it-out`, `show-me-your-work`, `create-verification-skill`, `maintain-verification-skill`, `automate-me`, `technical-writing`, `typescript-best-practices`.
  - 23 `principle-*` skills, one rule each, indexed inline by `poteto-mode`.
- **2 subagent briefs** in [`agents/`](agents/): `poteto-agent` (runs poteto's style end to end) and `comment-sicko` (read-only comment reviewer, used by `no-comments`). A skill that says "spawn a comment-sicko child" means: paste the brief above the scope and `rlm.spawn` it.
- **The extension**: `/poteto-mode`, `/setup-pstack`, `/pstack`, and per-turn injection of the resolved model roster plus a `pstack skills dir:` line, so a child spawned with the `poteto-agent` brief can find the hidden `poteto-mode` skill.
- **Bundled tools** under `skills/poteto-mode/scripts/`: `orch` (coordination ledger), `watch-pr` (PR readiness), `check-plan.mjs` (multi-phase plan lint), `worktree-audit.sh`.

## Model roster

Out of the box the mode splits work by model strength, the same way upstream does, with models that exist on Prime Agent:

| Role | Default |
|---|---|
| Code delegates: feature, refactoring, bug-fix, perf-issue, hillclimb, how explorer, why investigators, swarm workers | `zai/glm-5.3` |
| Judgment and prose, hardest tasks, how explainer, why synthesizer, reflect judgment | `anthropic/claude-opus-5` |
| Reflect tooling | `openai/gpt-6-astra` |
| Panels: arena runners, arena cross-judge pool, architect runners, interrogate reviewers | `anthropic/claude-opus-5`, `openai/gpt-6-astra`, `zai/glm-5.3`, `anthropic/claude-fable-5-1` |
| Budget | `unlimited` (`thinking="max"`) |

On every turn the extension resolves this roster against the models your session can actually spawn and injects one line per role, each entry with its `thinking=` level clamped to that model's ceiling (`xai/grok-4.6` tops out at `xhigh`, the `opencode-go` mirrors at `high`). A roster model you have no credentials for is dropped for the session and its role runs on your parent model, so the defaults are safe with only some providers configured.

`/setup-pstack` writes `~/.prime/agent/pstack/models.json` (or `$PRIME_AGENT_CODING_AGENT_DIR/pstack/models.json`). A missing role keeps the default. `inherit-parent` or `auto` runs a role on the parent model. The budget (`unlimited`, `large`, `medium`, `small`, `inherit`) maps to a `thinking=` target of `max`, `xhigh`, `high`, `medium`, or none.

## How upstream concepts map to Prime Agent

| Upstream (Cursor / pi-subagents) | Here |
|---|---|
| `subagent_type: "poteto-agent"` / `subagent({ agent, task })` | `await rlm.spawn(<agents/poteto-agent.md body> + task, name=..., model=..., thinking=...)` |
| `readonly: true`, tool allowlists | stated in the brief ("do not edit files or commit") |
| "launch in a single message" | several `rlm.spawn` calls in one `ipython` cell, then end the turn |
| `Task` response body | `await agent_message.send(report, receiver_role="parent")`, or a report file |
| `run_in_background: true` | always; `rlm.spawn` returns at admission |
| `environment: "cloud"` | not applicable; children are daemon-backed local sessions with their own worktree |
| `/loop`, wake chains | `rlm_heartbeat.create(...)` and watcher children that reply on an event |
| `/goal` | `goal.create(...)` / `goal.get()` |
| `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.prime/agent/sessions/<uuid>.jsonl` (header line carries `cwd`); children under `~/.prime/agent/session-artifacts/<parent>/sub-<id>/` |
| `~/.cursor/rules/pstack-models.mdc` (effort baked into slugs) | `~/.prime/agent/pstack/models.json` (model and `thinking=` kept separate, clamped per model) |
| `AskQuestion` tool, todo tool | ask in the reply; a todo list in the reply |
| `mcps/` directory | the system prompt's `# Generic MCP Connections` section plus `await mcp.list_tools(...)` |

Not ported: `make-bot-ui` (Cursor Grok Bot UI) and the `benny` automation pack (Cursor automations).

## Staying in sync with upstream

The skill tree is generated, not hand-edited. [`scripts/sync-upstream.mjs`](scripts/sync-upstream.mjs) clones both upstreams at the commits in [`upstream.lock.json`](upstream.lock.json), runs pi-pstack's own Cursor-to-Pi lever, then this repo's Pi-to-Prime lever ([`scripts/reground-from-pi.mjs`](scripts/reground-from-pi.mjs)), and fails if any Pi or Cursor seam survives. CI verifies the committed tree is that fixpoint, and a weekly workflow opens a PR when upstream moves.

```bash
npm run sync:upstream              # no-op at the pinned commits
npm run sync:upstream -- --latest  # advance the pins
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for where each kind of change belongs.

## Development

```bash
npm run check        # lint + node --test + bun test
prime-agent -e .     # load from the working tree
```

## License

MIT. Derived from pstack (Lauren Tan) and pi-pstack (dhairyaar), both MIT; see [NOTICE](NOTICE).
