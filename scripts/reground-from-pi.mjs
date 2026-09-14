#!/usr/bin/env node
// Re-ground the pi-pstack skill tree onto Prime Agent.
//
// Usage: node scripts/reground-from-pi.mjs --from <pi-pstack> --to <prime-pstack> [--dry-run]
//
// Mechanical seams (paths, delegation calls, tool names) are rewritten here so the
// next upstream pull replays them. Skills that needed a real rewrite (why discovery,
// swarm fan-out, reflect transcript lookup, recall, setup-pstack, no-comments) carry
// their Prime Agent text in `scripts/prime-overrides/` and are copied verbatim.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OVERRIDES_DIR = join(HERE, "prime-overrides");

export const SEAMS = [
	{ id: "models-path", from: /(?<!Pi-era `)~\/\.pi\/agent\/pstack\/models\.json/g, to: "~/.prime/agent/pstack/models.json" },
	{ id: "legacy-md-path", from: /~\/\.pi\/agent\/pstack-models\.md/g, to: "~/.prime/agent/pstack-models.md" },
	{ id: "sessions-path", from: /~\/\.pi\/agent\/sessions\//g, to: "~/.prime/agent/sessions/" },
	{ id: "home-sessions", from: /\$HOME\/\.pi\/agent\/sessions/g, to: "$HOME/.prime/agent/sessions" },
	{ id: "user-skills", from: /~\/\.pi\/agent\/skills\//g, to: "~/.prime/agent/skills/" },
	{ id: "npm-skills", from: /~\/\.pi\/agent\/npm\/node_modules\//g, to: "~/.prime/agent/npm/node_modules/" },
	{ id: "project-skills", from: /(?<![\w.])\.pi\/skills\//g, to: ".prime/agent/skills/" },
	{ id: "ask-confirm-intent", from: /confirm intent with `ask_user_question`/g, to: "confirm intent by asking the user" },
	{ id: "ask-structured", from: /Use the `ask_user_question` tool \(structured multi-choice\) rather than asking the user to type from scratch\./g, to: "Ask a structured multi-choice question in your reply rather than asking the user to type from scratch." },
	{ id: "ask-park", from: /Do not park reversible work for the human or use `ask_user_question`\./g, to: "Do not park reversible work for the human or stop to ask a question." },
	{ id: "reflect-readonly-strips", from: / Readonly strips MCPs\./g, to: "" },
	{ id: "smyw-double", from: /other sessions are not this run\. That reads unrelated private chats\./g, to: "other sessions are not this run." },
	{ id: "pickup-cloud-url", from: /, a cloud-agent URL, or a pushed branch/g, to: ", a detached daemon session (`prime-agent agents`, then `prime-agent attach <agent>`), or a pushed branch" },
	{ id: "worktree-audit-var-2", from: /transcripts="\$HOME\/\.prime\/agent\/sessions"/g, to: 'transcripts="${PRIME_AGENT_CODING_AGENT_DIR:-$HOME/.prime/agent}/sessions"' },
	{ id: "ask-user-question", from: /`ask_user_question`/g, to: "ask the user a question" },
	{ id: "ask-user-question-tool", from: /Use the `ask_user_question` tool \(structured multi-choice\)/g, to: "Ask a structured multi-choice question in your reply" },
	{ id: "todolist", from: /Open a todolist/g, to: "Open a todo list in your reply" },
	{ id: "todolist-2", from: /to the todolist/g, to: "to the todo list" },
	{ id: "pi-session", from: /this Pi session/g, to: "this Prime Agent session" },
	{ id: "pi-skills-standard", from: /the Pi Agent Skills standard/g, to: "the Agent Skills standard" },
	{ id: "subagent-poteto", from: /`subagent\(\{ agent: "poteto-agent", task \}\)`/g, to: "`rlm.spawn(<poteto-agent brief>, name=...)` (see the Subagents section)" },
	{ id: "subagent-sicko", from: /Spawn `Task` with `subagent\(\{ agent: "comment-sicko", task \}\)`/g, to: "Spawn a `comment-sicko` child with `rlm.spawn` (its brief is `agents/comment-sicko.md`)" },
	{ id: "subagent-launches", from: /Multiple `subagent\(\)` launches/g, to: "Multiple `rlm.spawn` children" },
	{ id: "subagent-launch-one", from: /One `subagent\(\)` launch, `agent: "worker", /g, to: "One `rlm.spawn` child, " },
	{ id: "subagent-launch-three", from: /three `subagent\(\)` launches, `agent: "worker", explicit `model:` on each/g, to: "three `rlm.spawn` children, explicit `model=` on each" },
	{ id: "agent-worker-line", from: /^- agent: "worker"\n/gm, to: "" },
	{ id: "model-line", from: /- `model`: your configured/g, to: "- `model=`: your configured" },
	{ id: "model-line-2", from: /- `model`: the configured/g, to: "- `model=`: the configured" },
	{ id: "readonly-tools", from: /- tools: read-only \(`read, grep, find, ls, bash`\)/g, to: "- read-only brief: state in the prompt that the child must not edit files or commit" },
	{ id: "agent-mode-mcp", from: /agent mode \(`readonly: false`\)/g, to: "full kernel access (children inherit MCP connections)" },
	{ id: "readonly-false-why", from: /- `readonly`: `false` \(agent mode\)\. \*\*Do not use readonly\/Ask mode\.\*\* It strips MCP access, which disables MCP-backed investigators entirely\. Investigators still shouldn't write anything\./g, to: "- Children inherit the parent's MCP connections (`mcp.list_tools(...)` / `mcp.call_tool(...)`). Investigators still shouldn't write anything; say so in the brief." },
	{ id: "readonly-false-synth", from: /- `readonly`: `false` \(agent mode\)\. The synthesizer's quality check spot-verifies citations, which can require MCP access\. Readonly\/Ask mode strips MCPs and defeats that\./g, to: "- The synthesizer's quality check spot-verifies citations, which can require MCP access. Children inherit the parent's MCP connections." },
	{ id: "task-response-body", from: /Reviewers return findings in the `Task` response body\./g, to: "Reviewers return findings with `await agent_message.send(<findings>, receiver_role='parent')`." },
	{ id: "task-prompts", from: /`Task` prompts that name a skill path/g, to: "`rlm.spawn` prompts that name a skill path" },
	{ id: "read-tool-calls", from: /`Read` tool calls against any `SKILL\.md` file/g, to: "`ipython` reads of any `SKILL.md` file" },
	{ id: "single-message-explorers", from: /Spawn all explorers in a single message:/g, to: "Spawn all explorers in one `ipython` cell (one `rlm.spawn` per explorer, then end the turn):" },
	{ id: "single-message-investigators", from: /Launch all matching investigators in a single message so they run concurrently\./g, to: "Launch all matching investigators in one `ipython` cell (one `rlm.spawn` each, then end the turn) so they run concurrently." },
	{ id: "single-message-reviewers", from: /Launch all reviewers in a single message using the Task tool\./g, to: "Launch all reviewers in one `ipython` cell, one `rlm.spawn` per reviewer, then end the turn." },
	{ id: "task-tool-error", from: /check the valid slugs in the Task tool's error message/g, to: "run `await rlm.find_models(<family>)` and read the returned selectors" },
	{ id: "arena-spawn", from: /Spawn all N subagents in one message with `run_in_background: true`, each with/g, to: "Spawn all N children in one `ipython` cell (`rlm.spawn`, one per candidate, then end the turn), each with" },
	{ id: "one-message-three", from: /One message, three/g, to: "One `ipython` cell, three" },
	{ id: "bun-orch", from: /Use `bun scripts\/orch\/orch\.ts`(?! \(bundled)/g, to: "Use `bun scripts/orch/orch.ts` (bundled with the poteto-mode skill; requires bun)" },
	{ id: "worker-model-prime", from: /\(default inherit-parent\)/g, to: "(default inherit-parent; omit `model=`)" },
	{ id: "cursor-restart", from: /After a Cursor restart: local agents are dead, cloud work is not\./g, to: "After a Prime Agent restart: daemon-backed children survive (`prime-agent agents`, `rlm.list_subagents()`); reattach to them before respawning." },
	{ id: "cursor-dashboard", from: /the cloud agent's status in the Cursor dashboard/g, to: "`await rlm.collect(children, timeout_ms=0)` for child status" },
	{ id: "cursor-mcps", from: /list the available MCPs from the Cursor environment\. Use the available-tools map when present\. Otherwise inspect the `mcps\/` directory Cursor exposes for enabled MCP servers\./g, to: "list the available MCP servers from the system prompt's `# Generic MCP Connections` section, then `await mcp.list_tools(<server>)` for each. Installed Python skills (`linear`, `notion`, `websearch`, ...) count as evidence sources too." },
	{ id: "babysit-cursor", from: /This playbook replaces Cursor's built-in babysit skill for these requests, so do not route there even though its description matches the same words\./g, to: "This playbook owns these requests, even when another installed skill's description matches." },
	{ id: "pi-pstack-package", from: /the pi-pstack package's/g, to: "the prime-pstack package's" },
	// Long-form seams: whole sentences whose Pi/Cursor mechanism has a Prime Agent primitive.
	{ id: "transcripts-automate", from: /Locate the active workspace's transcripts before fanning out\. The system prompt names the workspace's `agent-transcripts\/` directory\. Use only that path\. Don't glob across `~\/\.prime\/agent\/sessions\/`\. That crosses workspace boundaries[^\n]*?\./g, to: "Locate the active workspace's transcripts before fanning out. Sessions live under `~/.prime/agent/sessions/<uuid>.jsonl`; the first line of each file is a header whose `cwd` names the workspace. Filter on `cwd` first (`grep -l '\"cwd\":\"<cwd>\"'`), then order by mtime. Never read another workspace's transcripts; that crosses workspace boundaries." },
	{ id: "transcripts-eval", from: /Read each candidate's local transcript under the active workspace's `agent-transcripts\/` directory \(the system prompt names this path\)\. Do not glob across `~\/\.prime\/agent\/sessions\/`[^\n]*?\./g, to: "Read each candidate's transcript. A child spawned with `rlm.spawn` writes its JSONL under the `session_dir` on its spawn handle (`~/.prime/agent/session-artifacts/<parent>/sub-<id>/`); a root session writes `~/.prime/agent/sessions/<uuid>.jsonl` and names that path in its system prompt as `Conversation log`. Do not glob across every session in `~/.prime/agent/sessions/`; filter on the header line's `cwd`." },
	{ id: "transcripts-pickup", from: /A local transcript under the active workspace's `agent-transcripts\/` directory \(the system prompt names the path\. Do not glob across `~\/\.prime\/agent\/sessions\/`, that crosses workspace boundaries[^\n]*?\)/g, to: "A local transcript under `~/.prime/agent/sessions/<uuid>.jsonl` (filter on the header line's `cwd` for this workspace and sort by mtime; `prime-agent --resume` lists the same set. A child's transcript lives under its parent's `session-artifacts/<parent>/sub-<id>/`. Do not read another workspace's transcripts)" },
	{ id: "transcripts-reflect", from: /The parent finds its own transcript file before fanning out\. The system prompt names the active workspace's `agent-transcripts\/` directory\. Use that path\. Do not glob across `~\/\.prime\/agent\/sessions\/`\. That crosses workspace boundaries[^\n]*?\./g, to: "The parent finds its own transcript file before fanning out. The system prompt names it on the `Conversation log:` line (a root session under `~/.prime/agent/sessions/`, a child under its parent's `session-artifacts/<parent>/sub-<id>/`). Use that path. Do not glob across `~/.prime/agent/sessions/`. That crosses workspace boundaries." },
	{ id: "transcripts-reflect-ls", from: /ls -t <agent-transcripts>\/\*\.jsonl <agent-transcripts>\/\*\/\*\.jsonl <agent-transcripts>\/\*\/subagents\/\*\.jsonl 2>\/dev\/null \| head -10/g, to: "grep -l '\"cwd\":\"'\"$PWD\"'\"' ~/.prime/agent/sessions/*.jsonl | xargs ls -t 2>/dev/null | head -10" },
	{ id: "transcripts-reflect-layouts", from: /Three transcript layouts: legacy flat \(`<id>\.jsonl`\), current nested \(`<id>\/<id>\.jsonl`\), and subagent \(`<parent>\/subagents\/<child>\.jsonl`\)\./g, to: "Two transcript layouts: root (`~/.prime/agent/sessions/<id>.jsonl`) and child (`~/.prime/agent/session-artifacts/<parent-id>/sub-<short>/<id>.jsonl`, the `session_dir` on the spawn handle)." },
	{ id: "transcripts-smyw", from: /Read this run's transcript under the active workspace's `agent-transcripts\/` directory \(the system prompt names the path\)\. Don't glob across `~\/\.prime\/agent\/sessions\/`[^\n]*?\./g, to: "Read this run's transcript at the path the system prompt names on its `Conversation log:` line. Don't glob across `~/.prime/agent/sessions/`; other sessions are not this run." },
	{ id: "orch-worker-cloud", from: /- \*\*Worker \/ verifier\.\*\* Always `environment: "cloud"` unless the task needs this machine: the project's verification skill or harness runtime verification \(from the project's verification skill\)\. Reading local transcripts under `agent-transcripts\/`\. Simulators and local IDE state\. Auth that exists only here\. Cloud agents cannot read the local store, so their briefs inline what they need or point at repo paths\./g, to: "- **Worker / verifier.** A daemon-backed `rlm.spawn` child. Children run on this machine and survive client detach, so they can read the store, the simulators, and local auth, but every child that writes gets its own worktree or branch. Briefs still inline what the child needs or point at repo paths; a child does not inherit the coordinator's context." },
	{ id: "orch-task-tool", from: /Agents are spawned, resumed, and drained only through the Task tool\./g, to: "Agents are spawned with `rlm.spawn`, steered with `agent_message.send(..., receiver_role='child', receiver_name=...)`, and drained with `rlm.collect` plus their `agent_message` replies." },
	{ id: "orch-store-path", from: /Create `orchestrate\/<project-slug>\/` in the current agent's store \(path in the system prompt\)\./g, to: "Create `orchestrate/<project-slug>/` under this session's artifact directory (`$RLM_SESSION_DIR`, the directory named by the kernel's environment)." },
	{ id: "orch-verbatim-cloud", from: /Local spawns may reference the standing-orders file by store path\. Verbatim paste is for cloud spawns and every resume\./g, to: "A spawn may reference the standing-orders file by store path. Paste it verbatim on every resume and every steer, because a steered child does not re-read files it was not told to." },
	{ id: "orch-subcoord-cloud", from: /its spawn budget with the cloud default and the local exception list/g, to: "its spawn budget" },
	{ id: "orch-restack-cloud", from: /Restacks run in cloud\. A local restack at this scale takes the laptop down\./g, to: "Restacks run in their own child with their own worktree, never in the coordinator." },
	{ id: "orch-drain-wake", from: /a frontier watcher wake \(arm it via the loop skill, with a long heartbeat fallback\)/g, to: "a frontier watcher wake (a watcher child that replies on the event, with a long `rlm_heartbeat` fallback)" },
	{ id: "orch-resume", from: /Never resume an agent to check on it\. A resume restarts an idle agent\. Probe read-only: the ledger, `units\.tsv`, `gh`, pushed branches, `await rlm\.collect\(children, timeout_ms=0\)` for child status\./g, to: "Never message an agent to check on it. A message restarts an idle agent's turn. Probe read-only: the ledger, `units.tsv`, `gh`, pushed branches, `await rlm.collect(children, timeout_ms=0)` for child status." },
	{ id: "autopilot-cloud-owner", from: /One Cursor cloud agent per PR owns/g, to: "One daemon-backed `rlm.spawn` child per PR owns" },
	{ id: "autopilot-tick-full", from: /A local root arms each tick as a real terminal a recurring wake\. The loop uses a monitored-shell 30-minute sleep and emits an output-notification sentinel\. A cloud root uses the existing cloud-sleeper wake chain instead\./g, to: "Arm each tick with `await rlm_heartbeat.create(<tick prompt>, interval=\"30m\", label=\"audit\")`. The heartbeat re-enters this session on schedule whether or not a client is attached." },
	{ id: "autopilot-goal", from: /then re-read the armed `\/goal`/g, to: "then re-read the active goal (`await goal.get()`)" },
	{ id: "autopilot-stack-goal", from: /arm a `\/goal` with the full program objective/g, to: "arm a goal with the full program objective (`await goal.create(<objective>)`)" },
	{ id: "mpp-tick", from: /Arm the 30-minute audit tick\. In a local session, a real terminal a recurring wake\. In a cloud root, a cloud-sleeper wake chain\. Never leave the cadence to memory\./g, to: "Arm the 30-minute audit tick with `await rlm_heartbeat.create(<tick prompt>, interval=\"30m\", label=\"audit\")`. Never leave the cadence to memory." },
	{ id: "mpp-standing-goal", from: /record a standing goal with this exact text\./g, to: "record a standing goal with this exact text (`await goal.create(...)`)." },
	{ id: "autonomous-wake", from: /Pick the wake mechanism using a recurring wake \(a built-in, not a pstack skill\)\. An event to watch \(CI, a merge, a ref advancing\) gets a watcher subagent that wakes you on the event, with a long time-based heartbeat as fallback\. No event gets a fixed-interval heartbeat sized to when the result is worth re-checking\./g, to: "Pick the wake mechanism from the `rlm_heartbeat` skill (a built-in, not a pstack skill). An event to watch (CI, a merge, a ref advancing) gets a watcher child (`rlm.spawn`) that replies to the parent on the event, with a long `rlm_heartbeat` as fallback. No event gets a fixed-interval `rlm_heartbeat` sized to when the result is worth re-checking." },
	{ id: "visual-parity-wake", from: /Investigate the pixel delta\. a recurring wake per component until the diff is zero\./g, to: "Investigate the pixel delta. Loop per component until the diff is zero." },
	{ id: "shipping-cloud", from: /One subagent per PR, not batched, each a Cursor cloud agent, each exercising/g, to: "One `rlm.spawn` child per PR, not batched, each exercising" },
	{ id: "worktree-cursor-cache", from: /`~\/Library\/Application Support\/Cursor` \(`state\.vscdb\.backup`, and `snapshots\/roots\/<root>` where a `<root>` named for a folder you opened as a workspace balloons\), /g, to: "" },
	{ id: "swarm-cloud-intro", from: /Fan out N parallel cloud workers\./g, to: "Fan out N parallel `rlm.spawn` workers." },
	{ id: "swarm-cloud-n", from: /N is total workers, not the cloud concurrency limit\./g, to: "N is total workers. Keep it under the parent inbox limit (20 pending replies) or have workers write reports to files." },
	{ id: "swarm-spawn", from: /Spawn all N workers in one message with `agent: "worker", `environment: "cloud"`, `run_in_background: true`, and the configured model\. Use `environment: "local"` only when the worker needs access to something on the user's computer\./g, to: "Spawn all N workers in one `ipython` cell, one `rlm.spawn(brief, name=<unique>, model=<configured or omitted>)` each, then end the turn. Replies arrive as agent messages; a worker that writes a report to disk names the path in its reply." },
	{ id: "swarm-base-branch", from: /When a worker must start from a non-default pushed branch, pass `cloud_base_branch`\./g, to: "When a worker must start from a non-default branch, tell it the branch and give it its own worktree (`git worktree add`)." },
	{ id: "swarm-terminal-results", from: /Read the terminal results\./g, to: "Read the replies (`await rlm.collect(handles, timeout_ms=0)` for status, the agent messages or report files for content)." },
	{ id: "poteto-subagents-wrapper", from: /\*\*Use `rlm\.spawn\(<poteto-agent brief>, name=\.\.\.\)` \(see the Subagents section\) for any subagent you spawn inside a playbook step\*\* \(code-writing delegates, ad-hoc helpers\)\. `\/poteto-mode` and `poteto-agent` route through the same wrapper\. Routed workflow skills \(`how`, `why`, `interrogate`, `reflect`, `swarm`\) set their own agent for diverse-model review\. Respect what the skill prescribes, don't override to `poteto-agent`\./g, to: "**Any subagent you spawn inside a playbook step** (code-writing delegates, ad-hoc helpers) is an `rlm.spawn` child whose prompt starts with the `poteto-agent` brief (`agents/poteto-agent.md` in this package: read the file, paste its body above the task). `/poteto-mode` and `poteto-agent` route through the same wrapper. Routed workflow skills (`how`, `why`, `interrogate`, `reflect`, `swarm`) write their own briefs for diverse-model review. Respect what the skill prescribes, don't prepend `poteto-agent` there." },
	{ id: "poteto-subagent-defaults", from: /\*\*Defaults for every `subagent\(\)` launch\.\*\* `run_in_background: true`, agent mode \(readonly strips MCP\), file pointers not inlined context, explicit model per role \(configurable via `\/setup-pstack`\. Defaults inherit-parent for code, inherit-parent for prose and judgment\)\./g, to: "**Defaults for every `rlm.spawn` launch.** A unique `name=`; the call returns at admission, never with the answer, so end the turn and let replies arrive. File pointers, not inlined context. A brief that names its own reply contract (`await agent_message.send(<report>, receiver_role='parent')`, or a report file path). Explicit `model=` per role (configurable via `/setup-pstack`; every role defaults to inherit-parent, which means omit `model=`)." },
	{ id: "poteto-model-omit", from: /and a role line of `inherit-parent` or `auto` runs that role on the parent chat model \(omit Task `model`\)\./g, to: "and a role line of `inherit-parent` or `auto` runs that role on the parent chat model (omit `model=`)." },
	{ id: "poteto-interrupt", from: /Interrupt-chained resumes silently drop directives, so fire a fresh subagent with consolidated scope rather than trusting a "done" summary\./g, to: "A steered child can drop earlier directives, so fire a fresh child with consolidated scope rather than trusting a \"done\" summary." },
	{ id: "mpp-explore", from: /Explore in subagents with `rlm\.spawn\(<poteto-agent brief>, name=\.\.\.\)` \(see the Subagents section\) and an explicit model per the Subagents section/g, to: "Explore in `rlm.spawn` children (poteto-agent brief, explicit model per the Subagents section)" },
	{ id: "worktree-audit-sessions", from: /# Transcripts dir: ~\/\.pi\/agent\/sessions \(JSONL, one file per session\)\./g, to: "# Transcripts dir: ~/.prime/agent/sessions (JSONL, one file per session; header line carries cwd)." },
	{ id: "worktree-audit-var", from: /transcripts="\$HOME\/\.pi\/agent\/sessions"/g, to: 'transcripts="${PRIME_AGENT_CODING_AGENT_DIR:-$HOME/.prime/agent}/sessions"' },
	{ id: "automate-mode-skills", from: /Look recursively for `\.prime\/agent\/skills\/\*\*\/\*-mode\/SKILL\.md` and `~\/\.prime\/agent\/skills\/\*-mode\/SKILL\.md` matching the user's handle\./g, to: "Look recursively for `.prime/agent/skills/**/*-mode/SKILL.md`, `.agents/skills/**/*-mode/SKILL.md`, `~/.prime/agent/skills/*-mode/SKILL.md`, and `~/.agents/skills/*-mode/SKILL.md` matching the user's handle." },

	{ id: "recall-transcripts", from: /Transcripts live at `~\/\.prime\/agent\/sessions\/`, where `<slug>` is the workspace path with the leading slash dropped and each "\/" turned into "-" \(so `\/Users\/you\/proj` becomes `Users-you-proj`\)\. Every line is one chat message[^\n]*?\./g, to: "Transcripts live at `~/.prime/agent/sessions/<uuid>.jsonl`, one file per root session. The first line is a header with `cwd`, so filter on `\"cwd\":\"<workspace>\"` to stay inside one workspace. Later lines are one entry each (`message` entries carry the chat; `custom`, `model_change`, and bookkeeping entries can be skipped). Children spawned with `rlm.spawn` live under `~/.prime/agent/session-artifacts/<parent-uuid>/sub-<short>/`." },
	{ id: "setup-migrate", from: /If `~\/\.prime\/agent\/pstack-models\.md` exists and the JSON does not, the extension migrates it on session start\.(?! A Pi-era)/g, to: "If `~/.prime/agent/pstack-models.md` exists and the JSON does not, the extension migrates it on session start. A Pi-era `~/.pi/agent/pstack/models.json` is not read; copy it across by hand." },
	{ id: "setup-verify-selector", from: /- never write a selector you have not confirmed is available(?! \()/g, to: "- never write a selector you have not confirmed is available (`await rlm.find_models(<query>)` returns exact `provider/id` selectors)" },
	{ id: "poteto-agent-find", from: /\(use `fffind` or `ls` under the prime-pstack package's `skills\/poteto-mode\/` if it is not already in context\)/g, to: "(its path is the `<location>` of the `poteto-mode` entry in your system prompt's skill list)" },
];

export function applyBodyTransforms(text) {
	for (let i = 0; i < 20; i++) {
		let next = text;
		for (const seam of SEAMS) next = next.replace(seam.from, seam.to);
		if (next === text) return next;
		text = next;
	}
	throw new Error("seam fixpoint did not converge");
}

const SKIP_WALK = new Set([".git", "node_modules"]);
function walkFiles(root) {
	const out = [];
	(function rec(dir, rel) {
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			if (SKIP_WALK.has(ent.name)) continue;
			const r = rel ? `${rel}/${ent.name}` : ent.name;
			if (ent.isDirectory()) rec(join(dir, ent.name), r);
			else out.push(r);
		}
	})(root, "");
	return out;
}

const ADAPT_EXT = new Set([".md", ".sh"]);
function isAdaptable(rel) {
	const dot = rel.lastIndexOf(".");
	return dot !== -1 && ADAPT_EXT.has(rel.slice(dot));
}

export function plan({ from, to }) {
	const overrides = existsSync(OVERRIDES_DIR) ? new Set(walkFiles(OVERRIDES_DIR)) : new Set();
	const actions = [];
	for (const rel of walkFiles(join(from, "skills"))) {
		const skillRel = `skills/${rel}`;
		if (overrides.has(skillRel)) {
			actions.push({ kind: "override", rel: skillRel, src: join(OVERRIDES_DIR, skillRel), dest: join(to, skillRel) });
			continue;
		}
		actions.push({ kind: isAdaptable(rel) ? "adapt" : "copy", rel: skillRel, src: join(from, skillRel), dest: join(to, skillRel) });
	}
	for (const rel of overrides) {
		if (!actions.some((a) => a.rel === rel)) {
			actions.push({ kind: "override", rel, src: join(OVERRIDES_DIR, rel), dest: join(to, rel) });
		}
	}
	return actions;
}

function writeIfChanged(dest, text, modeSrc) {
	mkdirSync(dirname(dest), { recursive: true });
	if (existsSync(dest) && readFileSync(dest, "utf8") === text) return false;
	const opts = {};
	if (modeSrc && existsSync(modeSrc)) opts.mode = lstatSync(modeSrc).mode & 0o777;
	writeFileSync(dest, text, opts);
	return true;
}

export function apply(actions) {
	let changed = 0;
	for (const a of actions) {
		const text = readFileSync(a.src, "utf8");
		const out = a.kind === "adapt" ? applyBodyTransforms(text) : text;
		if (writeIfChanged(a.dest, out, a.src)) changed++;
	}
	return changed;
}

export const LEFTOVER_PATTERNS = [
	/(?<!Pi-era `)~\/\.pi\//,
	/\$HOME\/\.pi/,
	/(?<![\w.])\.pi\/skills/,
	/subagent\(\{/,
	/`subagent\(\)`/,
	/agent: "worker"/,
	/run_in_background/,
	/environment: "cloud"/,
	/cloud_base_branch/,
	/ask_user_question/,
	/`readonly`/,
	/Task tool/,
	/`Task`/,
	/\bCursor\b/,
	/agent-transcripts/,
	/PI_CODING_AGENT_DIR/,
	/PI_SESSION_FILE/,
	/\bthis Pi session\b/,
];

export function assertNoSeams(to) {
	const leftover = [];
	for (const rel of walkFiles(join(to, "skills"))) {
		if (!isAdaptable(rel)) continue;
		const text = readFileSync(join(to, "skills", rel), "utf8");
		for (const p of LEFTOVER_PATTERNS) {
			const m = p.exec(text);
			if (m) leftover.push(`skills/${rel}: ${m[0]}`);
		}
	}
	if (leftover.length) throw new Error(`pi seams remain:\n${leftover.join("\n")}`);
}

export function parseArgs(argv) {
	let from, to, dryRun = false;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--from") from = argv[++i];
		else if (argv[i] === "--to") to = argv[++i];
		else if (argv[i] === "--dry-run") dryRun = true;
		else throw new Error(`unknown arg: ${argv[i]}`);
	}
	if (!from || !to) throw new Error("usage: --from <pi-pstack> --to <prime-pstack> [--dry-run]");
	from = resolve(from); to = resolve(to);
	if (!existsSync(join(from, "skills"))) throw new Error(`no skills/ in ${from}`);
	return { from, to, dryRun };
}

export function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	const actions = plan(args);
	if (args.dryRun) {
		for (const a of actions) console.log(`${a.kind}\t${a.rel}`);
		console.log(`# ${actions.length} actions`);
		return;
	}
	const changed = apply(actions);
	assertNoSeams(args.to);
	console.log(`# ${changed} files written`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	try { main(); } catch (err) { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; }
}
