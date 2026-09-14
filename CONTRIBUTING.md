# Contributing

Thanks for looking. This repo is a port, so most of its value is in staying faithful to upstream while being native to Prime Agent. That shapes what a good change looks like.

## Where a change belongs

| You want to change | Do this |
|---|---|
| A playbook, principle, or workflow skill's substance | Open it upstream first: [cursor/plugins pstack](https://github.com/cursor/plugins/tree/main/pstack). It flows here on the next `npm run sync:upstream`. |
| How a skill talks about Prime Agent (spawning, transcripts, heartbeats, MCP) | Add or edit a seam in `scripts/reground-from-pi.mjs`. Never edit `skills/**/*.md` by hand; the next sync overwrites it. |
| A skill whose Prime Agent text cannot be produced by seam rewriting | Put the whole file under `scripts/prime-overrides/skills/<name>/...`. The sync copies it verbatim. |
| The extension (`/poteto-mode`, `/setup-pstack`, `/pstack`, roster resolution, prompt injection) | `extensions/pstack/*.ts`, with a test in the matching `*.test.ts`. |
| The shipped model roster or budget mapping | `DEFAULT_ROLES` and `BUDGETS` in `extensions/pstack/config.ts`, plus the roster seams in `scripts/reground-from-pi.mjs` and `scripts/prime-overrides/skills/setup-pstack/SKILL.md`. |
| A subagent brief | `agents/*.md`. Keep the frontmatter; the lint checks it. |

## Local setup

```bash
git clone https://github.com/sammyjoyce/prime-pstack
cd prime-pstack
npm run check          # lint + every test layer
prime-agent -e .       # try it in a session without installing
```

Requirements: Node 22.6+ (for `--experimental-strip-types`), bun (for the bundled `orch` and `watch-pr` tools), git.

`npm run check` runs:

- `scripts/lint-skills.mjs`: frontmatter rules, the Discoverable/Hidden split, leftover Pi/Cursor seams, broken relative links, brief frontmatter.
- `node --test` over the extension, the reground lever, and `check-plan.mjs`.
- `bun test` over `orch` and `watch-pr` with `GIT_CONFIG_GLOBAL=/dev/null`, so your personal git hooks do not interfere.

## Syncing from upstream

```bash
npm run sync:upstream              # replay at the commits in upstream.lock.json (should be a no-op)
npm run sync:upstream -- --latest  # advance the pins to each upstream default branch
npm run check
git diff --stat skills/
```

The sync runs two hops: pi-pstack's own `reground-from-cursor.mjs` (Cursor to Pi seams, owned upstream) and then this repo's `reground-from-pi.mjs` (Pi to Prime Agent seams). The second lever fails loudly if any Pi or Cursor seam survives, which is how new upstream phrasing that needs a new seam gets noticed. When that happens, add the seam, re-run, and include both in the same PR.

Commit the `upstream.lock.json` change together with the skill diff it produced.

## Pull requests

- One concern per PR. A sync PR is a sync PR; a roster change is its own PR.
- Tests for extension changes. A seam change needs a case in `scripts/reground-from-pi.test.mjs` when the seam is not obviously mechanical.
- Run `npm run check` before pushing. CI runs the same command on macOS and Linux.
- The reply-writing rules in `skills/poteto-mode/SKILL.md` apply to PR descriptions too: short sentences, no long dashes, say what a user notices before how it was done.

## Reporting a problem in a skill's advice

If a playbook tells the agent to do something wrong on Prime Agent, that is a bug here (open an issue with the skill path and the sentence). If the advice is wrong everywhere, it is an upstream bug; link it from here if you file it there so the sync picks it up.
