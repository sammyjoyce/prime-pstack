# prime-pstack

## 0.1.0

- Port of `@zenspc/pi-pstack` 0.6.0 to Prime Agent. 47 skills (23 playbooks, 23 principle skills), the `/poteto-mode`, `/setup-pstack`, and `/pstack` commands, and two subagent briefs.
- Delegation re-grounded on `rlm.spawn` / `agent_message` / `rlm.collect`; wake chains on `rlm_heartbeat`; standing goals on `goal.create`; transcript lookup on `~/.prime/agent/sessions/<uuid>.jsonl` and `session-artifacts/<parent>/sub-<id>/`.
- Config lives in `$PRIME_AGENT_CODING_AGENT_DIR/pstack/models.json` (default `~/.prime/agent`). `/setup-pstack` offers `enabledModels` first.
- `scripts/reground-from-pi.mjs` replays the port from an upstream pi-pstack checkout and fails on leftover Pi/Cursor seams.
