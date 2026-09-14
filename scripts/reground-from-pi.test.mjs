import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LEFTOVER_PATTERNS, applyBodyTransforms, assertNoSeams, plan, apply } from "./reground-from-pi.mjs";

describe("applyBodyTransforms", () => {
	it("rewrites Pi paths and delegation calls to Prime Agent primitives", () => {
		const out = applyBodyTransforms(
			[
				"Use `arena runners` from `~/.pi/agent/pstack/models.json` when present.",
				"Spawn `Task` with `subagent({ agent: \"comment-sicko\", task })`. Pass the scope.",
				"- agent: \"worker\"",
				"- `model`: your configured how-explorer model (default inherit-parent)",
				"- tools: read-only (`read, grep, find, ls, bash`)",
				"Open a todolist with one entry per phase.",
			].join("\n"),
		);
		assert.equal(
			out,
			[
				"Use `arena runners` from `~/.prime/agent/pstack/models.json` when present.",
				"Spawn a `comment-sicko` child with `rlm.spawn` (its brief is `agents/comment-sicko.md`). Pass the scope.",
				"- `model=`: your configured how-explorer model (default inherit-parent; omit `model=`)",
				"- read-only brief: state in the prompt that the child must not edit files or commit",
				"Open a todo list in your reply with one entry per phase.",
			].join("\n"),
		);
	});

	it("is idempotent on already-ported text", () => {
		const once = applyBodyTransforms("Spawn all N workers in one message with `agent: \"worker\", `environment: \"cloud\"`, `run_in_background: true`, and the configured model. Use `environment: \"local\"` only when the worker needs access to something on the user's computer.");
		assert.equal(applyBodyTransforms(once), once);
		for (const p of LEFTOVER_PATTERNS) assert.equal(p.test(once), false, `leftover ${p}`);
	});
});

describe("plan / apply / assertNoSeams", () => {
	it("adapts .md and .sh, copies other files verbatim, and fails on leftover seams", () => {
		const from = mkdtempSync(join(tmpdir(), "pi-pstack-"));
		const to = mkdtempSync(join(tmpdir(), "prime-pstack-"));
		try {
			mkdirSync(join(from, "skills", "demo"), { recursive: true });
			writeFileSync(join(from, "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: d\n---\nSee `~/.pi/agent/sessions/`.\n");
			writeFileSync(join(from, "skills", "demo", "tool.ts"), "const x = '~/.pi/agent/sessions/';\n");
			const actions = plan({ from, to });
			assert.deepEqual(actions.map((a) => [a.kind, a.rel]).sort(), [
				["adapt", "skills/demo/SKILL.md"],
				["copy", "skills/demo/tool.ts"],
			]);
			apply(actions);
			assert.equal(readFileSync(join(to, "skills", "demo", "SKILL.md"), "utf8"), "---\nname: demo\ndescription: d\n---\nSee `~/.prime/agent/sessions/`.\n");
			assert.equal(readFileSync(join(to, "skills", "demo", "tool.ts"), "utf8"), "const x = '~/.pi/agent/sessions/';\n");
			assertNoSeams(to);
			writeFileSync(join(to, "skills", "demo", "SKILL.md"), "Use the Task tool.\n");
			assert.throws(() => assertNoSeams(to), /Task tool/);
		} finally {
			rmSync(from, { recursive: true, force: true });
			rmSync(to, { recursive: true, force: true });
		}
	});
});
