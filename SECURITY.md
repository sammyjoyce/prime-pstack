# Security

This package ships skills (instructions the model follows), an extension (TypeScript that runs inside Prime Agent with your user's permissions), and scripts that run under bun. Treat it like any other code you install into an agent.

**What it does not do.** No network calls of its own, no telemetry, no credential access. The extension reads and writes one file, `$PRIME_AGENT_CODING_AGENT_DIR/pstack/models.json` (default `~/.prime/agent/pstack/models.json`), with `0600` permissions, and reads `enabledModels` from `settings.json`. The `watch-pr` and `worktree-audit` tools call `gh` and `git` in the current repo.

**What to review before installing.** `extensions/pstack/index.ts` (the only code that runs on every turn), `agents/*.md` (prompts that children run with full kernel access), and any skill you plan to invoke.

**Reporting.** Open a [GitHub security advisory](https://github.com/sammyjoyce/prime-pstack/security/advisories/new) for anything that lets a repo, a PR, or a skill file escalate what the agent does. For a problem in upstream pstack content, report it to [cursor/plugins](https://github.com/cursor/plugins/security) as well.
