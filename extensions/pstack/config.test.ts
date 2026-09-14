import assert from "node:assert/strict";
import {
	lstatSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	DEFAULT_ROLES,
	type ModelLevels,
	ROLE_NAMES,
	configPath,
	defaultConfig,
	formatRoleTable,
	getAgentDir,
	isSafeModelSelector,
	legacyMarkdownPath,
	loadConfig,
	migrateLegacyMarkdownIfNeeded,
	modelsForRole,
	parseConfig,
	parseLegacyMarkdown,
	readEnabledModels,
	resolveRoster,
	saveConfig,
	supportedThinkingLevels,
	thinkingForBudget,
	thinkingForModel,
} from "./config.ts";

const MAX_CONFIG_BYTES = 100_000;

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("defaultConfig", () => {
	it("ships the roster: glm-5.3 for code, opus 5 for judgment, astra for tooling, a four-member panel", () => {
		const cfg = defaultConfig();
		assert.equal(cfg.version, 1);
		assert.equal(Object.keys(cfg.roles).length, ROLE_NAMES.length);
		assert.equal(cfg.roles["bug-fix"], "zai/glm-5.3");
		assert.equal(cfg.roles["swarm workers"], "zai/glm-5.3");
		assert.equal(cfg.roles["judgment and prose"], "anthropic/claude-opus-5");
		assert.equal(cfg.roles["hardest tasks"], "anthropic/claude-opus-5");
		assert.equal(cfg.roles["reflect tooling"], "openai/gpt-6-astra");
		assert.deepEqual(cfg.roles["interrogate reviewers"], [
			"anthropic/claude-opus-5",
			"openai/gpt-6-astra",
			"zai/glm-5.3",
			"anthropic/claude-fable-5-1",
		]);
		assert.deepEqual(cfg.roles["arena runners"], cfg.roles["interrogate reviewers"]);
		assert.notEqual(cfg.roles["arena runners"], cfg.roles["interrogate reviewers"], "panel arrays are not shared");
		for (const role of ROLE_NAMES) {
			assert.equal(DEFAULT_ROLES[role] !== undefined, true, `${role} has a default`);
		}
	});

	it("enables skills by default", () => {
		assert.equal(defaultConfig().skillsEnabled, true);
	});

	it("defaults the budget to unlimited, and inherit injects no thinking level", () => {
		assert.equal(defaultConfig().budget, "unlimited");
		assert.equal(thinkingForBudget("inherit"), undefined);
	});
});

describe("parseConfig", () => {
	it("drops unknown roles, bad selectors, and wrong versions", () => {
		const parsed = parseConfig({
			version: 1,
			roles: {
				"bug-fix": "anthropic/claude-opus-4-6",
				"not-a-role": "anthropic/claude-opus-4-6",
				"how explorer": "no-slash",
				"arena runners": ["anthropic/ok", "bad", "__proto__/x"],
			},
		});
		assert.equal(parsed.roles["bug-fix"], "anthropic/claude-opus-4-6");
		assert.equal(parsed.roles["not-a-role"], undefined);
		assert.equal(parsed.roles["how explorer"], "zai/glm-5.3", "a bad selector keeps the shipped default");
		assert.deepEqual(parsed.roles["arena runners"], ["anthropic/ok"]);

		const wrongVersion = parseConfig({
			version: 2,
			roles: { "bug-fix": "anthropic/claude-opus-4-6" },
		});
		assert.deepEqual(wrongVersion, defaultConfig());
	});

	it("keeps a known budget and drops an unknown one", () => {
		assert.equal(parseConfig({ version: 1, roles: {}, budget: "large" }).budget, "large");
		assert.equal(parseConfig({ version: 1, roles: {}, budget: "inherit" }).budget, "inherit");
		assert.equal(parseConfig({ version: 1, roles: {}, budget: "huge" }).budget, "unlimited");
		assert.equal(parseConfig({ version: 1, roles: {}, budget: 3 }).budget, "unlimited");
		assert.equal(thinkingForBudget("unlimited"), "max");
		assert.equal(thinkingForBudget("large"), "xhigh");
		assert.equal(thinkingForBudget("medium"), "high");
		assert.equal(thinkingForBudget("small"), "medium");
	});

	it("keeps skillsEnabled false from stored JSON", () => {
		assert.equal(parseConfig({ version: 1, roles: {}, skillsEnabled: false }).skillsEnabled, false);
	});

	it("defaults skillsEnabled to true for missing, non-boolean, and wrong-version input", () => {
		assert.equal(parseConfig({ version: 1, roles: {} }).skillsEnabled, true);
		assert.equal(parseConfig({ version: 1, roles: {}, skillsEnabled: "off" }).skillsEnabled, true);
		assert.equal(parseConfig({ version: 2, roles: {}, skillsEnabled: false }).skillsEnabled, true);
		assert.equal(parseConfig(null).skillsEnabled, true);
	});
});

describe("isSafeModelSelector", () => {
	it("accepts inherit-parent, auto, provider/id, and [high] suffix", () => {
		assert.equal(isSafeModelSelector("inherit-parent"), true);
		assert.equal(isSafeModelSelector("auto"), true);
		assert.equal(isSafeModelSelector("anthropic/claude-opus-4-6"), true);
		assert.equal(isSafeModelSelector("anthropic/claude-opus-4-6[high]"), true);
	});

	it("rejects empty, no slash, __proto__/x, and control chars", () => {
		assert.equal(isSafeModelSelector(""), false);
		assert.equal(isSafeModelSelector("no-slash"), false);
		assert.equal(isSafeModelSelector("__proto__/x"), false);
		assert.equal(isSafeModelSelector("a/b\nc"), false);
	});
});

describe("getAgentDir / configPath / legacyMarkdownPath", () => {
	it("defaults to ~/.prime/agent and the pstack JSON / markdown paths", () => {
		assert.equal(getAgentDir({}, () => "/home/u"), join("/home/u", ".prime", "agent"));
		assert.equal(
			configPath({}, () => "/home/u"),
			join("/home/u", ".prime", "agent", "pstack", "models.json"),
		);
		assert.equal(
			legacyMarkdownPath({}, () => "/home/u"),
			join("/home/u", ".prime", "agent", "pstack-models.md"),
		);
	});

	it("honors PRIME_AGENT_CODING_AGENT_DIR and ~ expansion", () => {
		assert.equal(
			configPath({ PRIME_AGENT_CODING_AGENT_DIR: "~/custom-agent" }, () => "/home/u"),
			join("/home/u", "custom-agent", "pstack", "models.json"),
		);
		assert.equal(
			configPath({ PRIME_AGENT_CODING_AGENT_DIR: "/abs/agent" }, () => "/home/u"),
			join("/abs/agent", "pstack", "models.json"),
		);
	});
});

describe("loadConfig / saveConfig", () => {
	it("returns default for a missing file", () => {
		const dir = tempDir("pstack-missing-");
		try {
			assert.deepEqual(loadConfig(join(dir, "models.json")), defaultConfig());
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns default for a symlink", () => {
		const dir = tempDir("pstack-link-");
		const target = join(dir, "target.json");
		const link = join(dir, "models.json");
		try {
			writeFileSync(target, JSON.stringify({ version: 1, roles: { "bug-fix": "anthropic/x" } }), "utf8");
			symlinkSync(target, link);
			assert.equal(lstatSync(link).isSymbolicLink(), true);
			assert.deepEqual(loadConfig(link), defaultConfig());
			assert.equal(saveConfig(defaultConfig(), link), false);
			assert.equal(lstatSync(link).isSymbolicLink(), true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns default for an oversized file", () => {
		const dir = tempDir("pstack-big-");
		const path = join(dir, "models.json");
		try {
			writeFileSync(path, "x".repeat(MAX_CONFIG_BYTES + 1), "utf8");
			assert.deepEqual(loadConfig(path), defaultConfig());
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns default for invalid JSON", () => {
		const dir = tempDir("pstack-badjson-");
		const path = join(dir, "models.json");
		try {
			writeFileSync(path, "{not json", "utf8");
			assert.deepEqual(loadConfig(path), defaultConfig());
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("round-trips a saved config", () => {
		const dir = tempDir("pstack-roundtrip-");
		const path = join(dir, "pstack", "models.json");
		try {
			const cfg = parseConfig({
				version: 1,
				roles: {
					"bug-fix": "anthropic/claude-opus-4-6",
					"arena runners": ["anthropic/a", "openai/b"],
				},
			});
			assert.equal(saveConfig(cfg, path), true);
			assert.deepEqual(loadConfig(path), cfg);
			if (process.platform !== "win32") {
				assert.equal(lstatSync(path).mode & 0o777, 0o600);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("round-trips skillsEnabled false through save and load", () => {
		const dir = tempDir("pstack-skills-flag-");
		const path = join(dir, "pstack", "models.json");
		try {
			const cfg = { ...defaultConfig(), skillsEnabled: false };
			assert.equal(saveConfig(cfg, path), true);
			assert.equal(loadConfig(path).skillsEnabled, false);
			assert.equal(JSON.parse(readFileSync(path, "utf8")).skillsEnabled, false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("parseLegacyMarkdown", () => {
	it("reads the setup-pstack template shape", () => {
		const parsed = parseLegacyMarkdown(`
# pstack model configuration. comments ignored

feature, refactoring: xai/grok-4.6-fast
arena runners: anthropic/claude-fable-5[high], openai/gpt-5.6
unknown role: anthropic/claude-opus-4-6

bug-fix: openai/gpt-5.6
`);
		assert.equal(parsed.roles["feature, refactoring"], "xai/grok-4.6-fast");
		assert.deepEqual(parsed.roles["arena runners"], [
			"anthropic/claude-fable-5[high]",
			"openai/gpt-5.6",
		]);
		assert.equal(parsed.roles["bug-fix"], "openai/gpt-5.6");
		assert.equal(parsed.roles["unknown role"], undefined);
		assert.equal(parsed.roles["hillclimb"], "zai/glm-5.3");
	});
});

describe("migrateLegacyMarkdownIfNeeded", () => {
	it("writes JSON when only markdown exists, and is a no-op when JSON already exists", () => {
		const dir = tempDir("pstack-migrate-");
		const jsonPath = join(dir, "models.json");
		const mdPath = join(dir, "pstack-models.md");
		try {
			writeFileSync(mdPath, "bug-fix: anthropic/claude-opus-4-6\n", "utf8");
			const migrated = migrateLegacyMarkdownIfNeeded(jsonPath, mdPath);
			assert.ok(migrated);
			assert.equal(migrated.roles["bug-fix"], "anthropic/claude-opus-4-6");
			assert.equal(readFileSync(mdPath, "utf8"), "bug-fix: anthropic/claude-opus-4-6\n");
			assert.deepEqual(loadConfig(jsonPath), migrated);

			writeFileSync(mdPath, "hillclimb: openai/gpt-5.6\n", "utf8");
			const again = migrateLegacyMarkdownIfNeeded(jsonPath, mdPath);
			assert.equal(again, undefined);
			assert.equal(loadConfig(jsonPath).roles["bug-fix"], "anthropic/claude-opus-4-6");
			assert.equal(loadConfig(jsonPath).roles.hillclimb, "zai/glm-5.3");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

const LEVELS_MAX = { minimal: "m", low: "l", medium: "md", high: "h", xhigh: "xh", max: "mx" };
const LEVELS_XHIGH = { minimal: "m", low: "l", medium: "md", high: "h", xhigh: "xh", max: null };
const LEVELS_HIGH = { minimal: "m", low: "l", medium: "md", high: "h" };
const LIVE: ModelLevels[] = [
	{ provider: "anthropic", id: "claude-fable-5-1", reasoning: true, thinkingLevelMap: LEVELS_MAX },
	{ provider: "anthropic", id: "claude-opus-5", reasoning: true, thinkingLevelMap: LEVELS_MAX },
	{ provider: "openai", id: "gpt-6-astra", reasoning: true, thinkingLevelMap: LEVELS_MAX },
	{ provider: "xai", id: "grok-4.6", reasoning: true, thinkingLevelMap: LEVELS_XHIGH },
	{ provider: "zai", id: "glm-5.3", reasoning: true, thinkingLevelMap: LEVELS_MAX },
	{ provider: "opencode-go", id: "grok-4.6", reasoning: true, thinkingLevelMap: LEVELS_HIGH },
	{ provider: "openai", id: "gpt-4.1", reasoning: false },
];

const live = (key: string): ModelLevels => {
	const found = LIVE.find((m) => `${m.provider}/${m.id}` === key);
	assert.ok(found, `fixture ${key}`);
	return found;
};

describe("supportedThinkingLevels / thinkingForModel", () => {
	it("mirrors pi-ai: xhigh and max need an explicit mapping, null hides a level", () => {
		assert.deepEqual(supportedThinkingLevels(live("anthropic/claude-fable-5-1")), ["minimal", "low", "medium", "high", "xhigh", "max"]);
		assert.deepEqual(supportedThinkingLevels(live("xai/grok-4.6")), ["minimal", "low", "medium", "high", "xhigh"]);
		assert.deepEqual(supportedThinkingLevels(live("opencode-go/grok-4.6")), ["minimal", "low", "medium", "high"]);
		assert.deepEqual(supportedThinkingLevels(live("openai/gpt-4.1")), []);
	});

	it("clamps the budget target down to the model ceiling", () => {
		assert.equal(thinkingForModel(live("anthropic/claude-fable-5-1"), "max"), "max");
		assert.equal(thinkingForModel(live("xai/grok-4.6"), "max"), "xhigh");
		assert.equal(thinkingForModel(live("opencode-go/grok-4.6"), "max"), "high");
		assert.equal(thinkingForModel(live("opencode-go/grok-4.6"), "medium"), "medium");
		assert.equal(thinkingForModel(live("openai/gpt-4.1"), "max"), undefined);
	});
});

describe("resolveRoster / formatRoleTable", () => {
	it("drops selectors without live credentials and reports them", () => {
		const cfg = parseConfig({
			version: 1,
			roles: { "bug-fix": "deepseek/deepseek-flash", "interrogate reviewers": ["xai/grok-4.6", "zai/glm-5.2"] },
		});
		const roster = resolveRoster(cfg, LIVE);
		assert.deepEqual(roster.unavailable, ["deepseek/deepseek-flash", "zai/glm-5.2"]);
		assert.equal(roster.roles.some((r) => r.role === "bug-fix"), false);
		const panel = roster.roles.find((r) => r.role === "interrogate reviewers");
		assert.deepEqual(panel?.entries, [{ selector: "xai/grok-4.6", thinking: "xhigh" }]);
	});

	it("injects nothing when every role inherits or nothing is available", () => {
		const inherit = parseConfig({ version: 1, roles: {}, budget: "inherit" });
		for (const role of ROLE_NAMES) inherit.roles[role] = "inherit-parent";
		assert.equal(formatRoleTable(inherit, LIVE), "");
		assert.equal(formatRoleTable(defaultConfig(), []), "");
	});

	it("writes one line per resolved role with the clamped thinking level", () => {
		const cfg = parseConfig({
			version: 1,
			budget: "large",
			roles: { "bug-fix": "opencode-go/grok-4.6", "arena runners": ["anthropic/claude-fable-5-1", "openai/gpt-4.1"] },
		});
		for (const role of ROLE_NAMES) {
			if (role !== "bug-fix" && role !== "arena runners") cfg.roles[role] = "inherit-parent";
		}
		assert.equal(
			formatRoleTable(cfg, LIVE),
			[
				'thinking budget: large (target "xhigh", already clamped per model below)',
				'bug-fix: opencode-go/grok-4.6 (thinking="high")',
				'arena runners: anthropic/claude-fable-5-1 (thinking="xhigh"), openai/gpt-4.1',
			].join("\n"),
		);
	});

	it("resolves the shipped roster fully when all four families are live", () => {
		const table = formatRoleTable(defaultConfig(), LIVE);
		assert.match(table, /^thinking budget: unlimited \(target "max"/);
		assert.match(table, /\nbug-fix: zai\/glm-5\.3 \(thinking="max"\)\n/);
		assert.match(table, /\nreflect tooling: openai\/gpt-6-astra \(thinking="max"\)\n/);
		assert.match(
			table,
			/\ninterrogate reviewers: anthropic\/claude-opus-5 \(thinking="max"\), openai\/gpt-6-astra \(thinking="max"\), zai\/glm-5\.3 \(thinking="max"\), anthropic\/claude-fable-5-1 \(thinking="max"\)$/,
		);
	});
});

describe("modelsForRole", () => {
	it("returns array form and filters inherit-parent and auto", () => {
		const cfg = parseConfig({
			version: 1,
			roles: {
				"bug-fix": "inherit-parent",
				"how explorer": "auto",
				"arena runners": ["anthropic/a", "inherit-parent", "auto", "openai/b"],
			},
		});
		assert.deepEqual(modelsForRole(cfg, "bug-fix"), []);
		assert.deepEqual(modelsForRole(cfg, "how explorer"), []);
		assert.deepEqual(modelsForRole(cfg, "arena runners"), ["anthropic/a", "openai/b"]);
		assert.deepEqual(modelsForRole(cfg, "hillclimb"), ["zai/glm-5.3"], "unset role keeps the shipped default");
	});
});

describe("readEnabledModels", () => {
	it("returns the enabledModels selectors from settings.json, dropping unsafe entries", () => {
		const dir = tempDir("pstack-settings-");
		const path = join(dir, "settings.json");
		writeFileSync(
			path,
			JSON.stringify({ enabledModels: ["anthropic/claude-opus-5", "bad", "__proto__/x", 42, "inherit-parent"] }),
		);
		try {
			assert.deepEqual(readEnabledModels(path), ["anthropic/claude-opus-5"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns [] for a missing file, non-array field, or invalid JSON", () => {
		const dir = tempDir("pstack-settings-");
		try {
			assert.deepEqual(readEnabledModels(join(dir, "missing.json")), []);
			writeFileSync(join(dir, "obj.json"), JSON.stringify({ enabledModels: "anthropic/x" }));
			assert.deepEqual(readEnabledModels(join(dir, "obj.json")), []);
			writeFileSync(join(dir, "bad.json"), "{not json");
			assert.deepEqual(readEnabledModels(join(dir, "bad.json")), []);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
