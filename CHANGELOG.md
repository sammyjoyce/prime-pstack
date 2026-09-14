# prime-pstack

## 0.3.0

- Shipped model roster (was inherit-parent everywhere): `zai/glm-5.3` for code delegates, `anthropic/claude-opus-5` for judgment and prose, `openai/gpt-6-astra` for tooling review, and an opus 5 / astra / glm 5.3 / fable 5.1 panel for arena, architect, and interrogate. Budget defaults to `unlimited`.
- The injected role table is now resolved per session: roster models without live credentials are dropped (role falls back to the parent model), and every entry carries a `thinking=` level clamped to that model's supported ceiling via the same rule pi-ai uses.
- Skill text names the roster defaults in the same places upstream names its Cursor slugs.

## 0.2.0

- Sync upstream Cursor pstack 0.15.2 (the "every claim carries its evidence or its label" reply rule; gender-neutral operator wording in the autopilot and multi-phase playbooks).
- `/setup-pstack` asks for a reasoning budget (`inherit`, `unlimited`, `large`, `medium`, `small`) and stores it as `budget` in `models.json`; the injected role table then names the `thinking=` level for `rlm.spawn`.
- `docs/guide.md`: the upstream guide's flow re-told for Prime Agent (fan-outs, briefs, heartbeats, transcript paths, pitfalls).
- `scripts/prime-overrides/` holds skills whose text is authored for Prime Agent rather than derived by seam rewriting (currently `setup-pstack`).

## 0.1.0

- Port of `@zenspc/pi-pstack` 0.6.0 to Prime Agent. 47 skills (23 playbooks, 23 principle skills), the `/poteto-mode`, `/setup-pstack`, and `/pstack` commands, and two subagent briefs.
- Delegation re-grounded on `rlm.spawn` / `agent_message` / `rlm.collect`; wake chains on `rlm_heartbeat`; standing goals on `goal.create`; transcript lookup on `~/.prime/agent/sessions/<uuid>.jsonl` and `session-artifacts/<parent>/sub-<id>/`.
- Config lives in `$PRIME_AGENT_CODING_AGENT_DIR/pstack/models.json` (default `~/.prime/agent`). `/setup-pstack` offers `enabledModels` first.
- `scripts/reground-from-pi.mjs` replays the port from an upstream pi-pstack checkout and fails on leftover Pi/Cursor seams.
