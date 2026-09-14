import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultConfig, parseConfig } from "./config.ts";
import { lastPotetoEnabled, modelSelectors, systemPromptInjection } from "./index.ts";
import { ROLE_NAMES, type ModelLevels } from "./config.ts";

const POTETO_ONE_LINER =
	"New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't.";
const TABLE_HEADER =
	"pstack role table (pass `model=` and `thinking=` to `rlm.spawn` exactly as written; a role with no line inherits the parent model and thinking level):";

const LIVE: ModelLevels[] = [{ provider: "anthropic", id: "claude-opus-4-6", reasoning: true, thinkingLevelMap: { xhigh: "x", max: "y" } }];
const INHERIT_ROLES = Object.fromEntries(ROLE_NAMES.map((role) => [role, "inherit-parent"]));
const INHERIT_CONFIG = parseConfig({ version: 1, roles: INHERIT_ROLES, budget: "inherit" });
const SLUG_CONFIG = parseConfig({
	version: 1,
	roles: { ...INHERIT_ROLES, "bug-fix": "anthropic/claude-opus-4-6" },
	budget: "inherit",
});
const SLUG_LINES = `${TABLE_HEADER}\nthinking budget: inherit (omit thinking=; children inherit the parent level)\nbug-fix: anthropic/claude-opus-4-6`;

describe("systemPromptInjection", () => {
	it("injects only the Poteto Mode one-liner when the mode is on and every role inherits", () => {
		assert.equal(systemPromptInjection(INHERIT_CONFIG, true, LIVE), POTETO_ONE_LINER);
		assert.equal(systemPromptInjection(defaultConfig(), true, []), POTETO_ONE_LINER, "no live models: no table");
	});

	it("injects no Poteto Mode text when the mode is off", () => {
		assert.equal(systemPromptInjection(INHERIT_CONFIG, false, LIVE), "");
		assert.equal(systemPromptInjection(SLUG_CONFIG, false, LIVE), SLUG_LINES);
	});

	it("still injects a configured role slug with Poteto Mode on", () => {
		assert.equal(systemPromptInjection(SLUG_CONFIG, true, LIVE), `${SLUG_LINES}\n\n${POTETO_ONE_LINER}`);
	});
});

describe("systemPromptInjection budget line", () => {
	it("clamps the budget per model in the injected table", () => {
		const large = parseConfig({ version: 1, roles: { ...INHERIT_ROLES, "bug-fix": "anthropic/claude-opus-4-6" }, budget: "large" });
		assert.equal(
			systemPromptInjection(large, false, LIVE),
			`${TABLE_HEADER}\nthinking budget: large (target "xhigh", already clamped per model below)\nbug-fix: anthropic/claude-opus-4-6 (thinking="xhigh")`,
		);
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
