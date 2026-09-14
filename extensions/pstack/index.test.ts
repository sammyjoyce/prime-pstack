import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { defaultConfig, parseConfig } from "./config.ts";
import pstackExtension, { lastPotetoEnabled, modelSelectors, skillsDirLine, systemPromptInjection } from "./index.ts";
import { ROLE_NAMES, type ModelLevels } from "./config.ts";

const POTETO_ONE_LINER =
	"New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't.";
const TABLE_HEADER =
	"pstack role table (pass `model=` and `thinking=` to `rlm.spawn` exactly as written; a role with no line inherits the parent model and thinking level):";
const SKILLS_DIR = "/pkg/prime-pstack/skills";
const SKILLS_LINE =
	"pstack skills dir: /pkg/prime-pstack/skills (every pstack skill, hidden ones included, is <name>/SKILL.md under it)";

const LIVE: ModelLevels[] = [{ provider: "anthropic", id: "claude-opus-4-6", reasoning: true, thinkingLevelMap: { xhigh: "x", max: "y" } }];
const INHERIT_ROLES = Object.fromEntries(ROLE_NAMES.map((role) => [role, "inherit-parent"]));
const INHERIT_CONFIG = parseConfig({ version: 1, roles: INHERIT_ROLES, budget: "inherit" });
const SLUG_CONFIG = parseConfig({
	version: 1,
	roles: { ...INHERIT_ROLES, "bug-fix": "anthropic/claude-opus-4-6" },
	budget: "inherit",
});
const SLUG_LINES = `${TABLE_HEADER}\nthinking budget: inherit (omit thinking=; children inherit the parent level)\nbug-fix: anthropic/claude-opus-4-6`;

describe("skillsDirLine", () => {
	it("names the skills dir and says hidden skills live there too", () => {
		assert.equal(skillsDirLine(SKILLS_DIR), SKILLS_LINE);
		assert.match(skillsDirLine(SKILLS_DIR), /hidden ones included/);
	});
});

describe("systemPromptInjection", () => {
	it("always leads with the skills dir line, even with no table and the mode off", () => {
		assert.equal(systemPromptInjection(INHERIT_CONFIG, false, LIVE, SKILLS_DIR), SKILLS_LINE);
		assert.equal(systemPromptInjection(defaultConfig(), false, [], SKILLS_DIR), SKILLS_LINE, "no live models: no table");
	});

	it("injects the Poteto Mode one-liner after the skills dir line when the mode is on and every role inherits", () => {
		assert.equal(systemPromptInjection(INHERIT_CONFIG, true, LIVE, SKILLS_DIR), `${SKILLS_LINE}\n\n${POTETO_ONE_LINER}`);
		assert.equal(
			systemPromptInjection(defaultConfig(), true, [], SKILLS_DIR),
			`${SKILLS_LINE}\n\n${POTETO_ONE_LINER}`,
			"no live models: no table",
		);
	});

	it("injects no Poteto Mode text when the mode is off", () => {
		assert.equal(systemPromptInjection(SLUG_CONFIG, false, LIVE, SKILLS_DIR), `${SKILLS_LINE}\n\n${SLUG_LINES}`);
	});

	it("still injects a configured role slug with Poteto Mode on", () => {
		assert.equal(
			systemPromptInjection(SLUG_CONFIG, true, LIVE, SKILLS_DIR),
			`${SKILLS_LINE}\n\n${SLUG_LINES}\n\n${POTETO_ONE_LINER}`,
		);
	});
});

describe("systemPromptInjection budget line", () => {
	it("clamps the budget per model in the injected table", () => {
		const large = parseConfig({ version: 1, roles: { ...INHERIT_ROLES, "bug-fix": "anthropic/claude-opus-4-6" }, budget: "large" });
		assert.equal(
			systemPromptInjection(large, false, LIVE, SKILLS_DIR),
			`${SKILLS_LINE}\n\n${TABLE_HEADER}\nthinking budget: large (target "xhigh", already clamped per model below)\nbug-fix: anthropic/claude-opus-4-6 (thinking="xhigh")`,
		);
	});
});

describe("pstackExtension before_agent_start", () => {
	it("appends a skills dir line whose path holds poteto-mode/SKILL.md on disk", async () => {
		const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
		const pi = {
			on: (name: string, fn: (event: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(name, fn),
			registerCommand: () => undefined,
			appendEntry: () => undefined,
			sendUserMessage: () => undefined,
		};
		const previous = process.env.PRIME_AGENT_CODING_AGENT_DIR;
		process.env.PRIME_AGENT_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pstack-agent-dir-"));
		try {
			pstackExtension(pi as unknown as Parameters<typeof pstackExtension>[0]);
			const before = handlers.get("before_agent_start");
			assert.ok(before, "before_agent_start registered");
			const ctx = { modelRegistry: { getAvailable: () => [] }, hasUI: false };
			const out = (await before({ systemPrompt: "base prompt" }, ctx)) as { systemPrompt: string };
			const line = out.systemPrompt.split("\n").find((l) => l.startsWith("pstack skills dir: "));
			assert.ok(line, `skills dir line present in: ${out.systemPrompt}`);
			const dir = line.slice("pstack skills dir: ".length).split(" (")[0];
			assert.ok(existsSync(join(dir, "poteto-mode", "SKILL.md")), `${dir}/poteto-mode/SKILL.md exists`);
			assert.ok(out.systemPrompt.startsWith("base prompt\n\n"), "base prompt kept first");
		} finally {
			if (previous === undefined) delete process.env.PRIME_AGENT_CODING_AGENT_DIR;
			else process.env.PRIME_AGENT_CODING_AGENT_DIR = previous;
		}
	});
});

describe("lastPotetoEnabled", () => {
	it("takes the last pstack-mode entry on the branch and ignores other custom entries", () => {
		assert.equal(lastPotetoEnabled([]), false);
		assert.equal(
			lastPotetoEnabled([
				{ type: "custom", customType: "pstack-mode", data: { enabled: true } },
				{ type: "custom", customType: "other", data: { enabled: false } },
			]),
			true,
		);
		assert.equal(
			lastPotetoEnabled([
				{ type: "custom", customType: "pstack-mode", data: { enabled: true } },
				{ type: "custom", customType: "pstack-mode", data: { enabled: false } },
			]),
			false,
		);
	});
});

describe("modelSelectors", () => {
	const registry = [
		{ provider: "anthropic", id: "claude-opus-5" },
		{ provider: "deepseek", id: "deepseek-flash" },
	];

	it("prefers ctx.scopedModels when the host exposes it", () => {
		const scoped = [{ model: { provider: "xai", id: "grok-4.6" } }];
		assert.deepEqual(modelSelectors(scoped, ["anthropic/claude-opus-5"], registry), [
			"inherit-parent",
			"auto",
			"xai/grok-4.6",
		]);
	});

	it("falls back to enabledModels from settings.json when scopedModels is undefined", () => {
		assert.deepEqual(modelSelectors(undefined, ["anthropic/claude-opus-5", "bad", "anthropic/claude-opus-5"], registry), [
			"inherit-parent",
			"auto",
			"anthropic/claude-opus-5",
		]);
	});

	it("falls back to the full registry when nothing is scoped", () => {
		assert.deepEqual(modelSelectors([], [], registry), [
			"inherit-parent",
			"auto",
			"anthropic/claude-opus-5",
			"deepseek/deepseek-flash",
		]);
	});
});
