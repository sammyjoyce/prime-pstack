import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultConfig, parseConfig } from "./config.ts";
import { lastPotetoEnabled, modelSelectors, systemPromptInjection } from "./index.ts";

const POTETO_ONE_LINER =
	"New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't.";
const TABLE_HEADER =
	"pstack role table (pass the selector as `model=` to `rlm.spawn`; a role with no line inherits the parent model and thinking level):";

const SLUG_CONFIG = parseConfig({
	version: 1,
	roles: { "bug-fix": "anthropic/claude-opus-4-6" },
});

describe("systemPromptInjection", () => {
	it("injects only the Poteto Mode one-liner when the mode is on", () => {
		assert.equal(systemPromptInjection(defaultConfig(), true), POTETO_ONE_LINER);
	});

	it("injects no Poteto Mode text when the mode is off", () => {
		assert.equal(systemPromptInjection(defaultConfig(), false), "");
		assert.equal(
			systemPromptInjection(SLUG_CONFIG, false),
			`${TABLE_HEADER}\nbug-fix: anthropic/claude-opus-4-6`,
		);
	});

	it("still injects a configured role slug with Poteto Mode on", () => {
		assert.equal(
			systemPromptInjection(SLUG_CONFIG, true),
			`${TABLE_HEADER}\nbug-fix: anthropic/claude-opus-4-6\n\n${POTETO_ONE_LINER}`,
		);
	});
});

describe("systemPromptInjection budget line", () => {
	it("injects the thinking budget line only for a real budget", () => {
		const large = parseConfig({ version: 1, roles: {}, budget: "large" });
		assert.equal(
			systemPromptInjection(large, false),
			`${TABLE_HEADER}\nthinking budget: large (pass thinking="xhigh" to rlm.spawn; omit it for a child model whose ceiling is lower)`,
		);
		assert.equal(systemPromptInjection(parseConfig({ version: 1, roles: {}, budget: "inherit" }), false), "");
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
