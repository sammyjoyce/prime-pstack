import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const ROLE_NAMES = [
	"feature, refactoring",
	"bug-fix",
	"perf-issue",
	"hillclimb",
	"judgment and prose",
	"hardest tasks",
	"how explorer",
	"how explainer",
	"why investigators",
	"why synthesizer",
	"reflect tooling",
	"reflect judgment, divergent, synthesizer",
	"arena runners",
	"arena cross-judge pool",
	"swarm workers",
	"architect runners",
	"interrogate reviewers",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
export type RoleValue = string | string[];

/**
 * Reasoning budget. The Cursor plugin bakes effort into model slugs
 * (`...-thinking-max`); Prime Agent passes it separately as `thinking=` on
 * `rlm.spawn`, so the budget is one label mapped to one thinking level.
 * `inherit` injects nothing and children inherit the parent level.
 */
export const BUDGETS = [
	{ label: "unlimited", thinking: "max", choice: "unlimited - keep max" },
	{ label: "large", thinking: "xhigh", choice: "large - xhigh reasoning" },
	{ label: "medium", thinking: "high", choice: "medium - high reasoning" },
	{ label: "small", thinking: "medium", choice: "small - medium reasoning" },
] as const;
export type BudgetLabel = (typeof BUDGETS)[number]["label"] | "inherit";
const BUDGET_LABELS: ReadonlySet<string> = new Set(BUDGETS.map((b) => b.label));

export interface PstackConfig {
	version: 1;
	roles: Record<string, RoleValue>;
	skillsEnabled: boolean;
	budget: BudgetLabel;
}

export function thinkingForBudget(budget: BudgetLabel): string | undefined {
	return BUDGETS.find((b) => b.label === budget)?.thinking;
}

export function parseBudget(value: unknown): BudgetLabel {
	if (value === "inherit") return "inherit";
	return typeof value === "string" && BUDGET_LABELS.has(value) ? (value as BudgetLabel) : "unlimited";
}

export const LIST_ROLES: ReadonlySet<RoleName> = new Set([
	"arena runners",
	"arena cross-judge pool",
	"architect runners",
	"interrogate reviewers",
]);

const ROLE_NAME_SET: ReadonlySet<string> = new Set(ROLE_NAMES);
const DANGEROUS_KEY_PARTS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_CONFIG_BYTES = 100_000;
const MAX_MODEL_KEY_LENGTH = 256;
const INHERIT_SELECTORS = new Set(["inherit-parent", "auto"]);

export function getAgentDir(env: NodeJS.ProcessEnv = process.env, home: () => string = homedir): string {
	const envDir = env.PRIME_AGENT_CODING_AGENT_DIR;
	return envDir
		? envDir.replace(/^~(\/|$)/, `${home()}$1`)
		: join(home(), ".prime", "agent");
}

export function settingsPath(env: NodeJS.ProcessEnv = process.env, home: () => string = homedir): string {
	return join(getAgentDir(env, home), "settings.json");
}

export function readEnabledModels(path: string = settingsPath()): string[] {
	try {
		if (!existsSync(path)) return [];
		const st = lstatSync(path);
		if (!st.isFile() || st.size > MAX_CONFIG_BYTES) return [];
		const raw = JSON.parse(readFileSync(path, "utf8")) as { enabledModels?: unknown };
		if (!Array.isArray(raw.enabledModels)) return [];
		return raw.enabledModels.filter(isSafeModelSelector).filter((value) => !INHERIT_SELECTORS.has(value));
	} catch {
		return [];
	}
}

export function configPath(env: NodeJS.ProcessEnv = process.env, home: () => string = homedir): string {
	return join(getAgentDir(env, home), "pstack", "models.json");
}

export function legacyMarkdownPath(env: NodeJS.ProcessEnv = process.env, home: () => string = homedir): string {
	return join(getAgentDir(env, home), "pstack-models.md");
}

/**
 * Shipped roster. Mirrors the upstream Cursor plugin's split (a fast code
 * model for delegates, the strongest judgment model for prose and the hardest
 * changes, a four-member panel for reviews) with selectors that work on Prime
 * Agent: `zai/glm-5.3` takes the code seat (grok upstream),
 * `anthropic/claude-opus-5` the judgment seat (fable upstream),
 * `openai/gpt-6-astra` the OpenAI seat (sol upstream), and
 * `anthropic/claude-fable-5-1` is the panel's fourth member. A role whose
 * model has no live credentials in a session is dropped at injection time and
 * runs on the parent model (see `resolveRoster`).
 */
const CODE_MODEL = "zai/glm-5.3";
const JUDGMENT_MODEL = "anthropic/claude-opus-5";
const TOOLING_MODEL = "openai/gpt-6-astra";
const PANEL: readonly string[] = [JUDGMENT_MODEL, TOOLING_MODEL, CODE_MODEL, "anthropic/claude-fable-5-1"];

export const DEFAULT_ROLES: Readonly<Record<RoleName, RoleValue>> = {
	"feature, refactoring": CODE_MODEL,
	"bug-fix": CODE_MODEL,
	"perf-issue": CODE_MODEL,
	hillclimb: CODE_MODEL,
	"judgment and prose": JUDGMENT_MODEL,
	"hardest tasks": JUDGMENT_MODEL,
	"how explorer": CODE_MODEL,
	"how explainer": JUDGMENT_MODEL,
	"why investigators": CODE_MODEL,
	"why synthesizer": JUDGMENT_MODEL,
	"reflect tooling": TOOLING_MODEL,
	"reflect judgment, divergent, synthesizer": JUDGMENT_MODEL,
	"arena runners": [...PANEL],
	"arena cross-judge pool": [...PANEL],
	"swarm workers": CODE_MODEL,
	"architect runners": [...PANEL],
	"interrogate reviewers": [...PANEL],
};

export function defaultConfig(): PstackConfig {
	const roles: Record<string, RoleValue> = Object.create(null);
	for (const role of ROLE_NAMES) {
		const value = DEFAULT_ROLES[role];
		roles[role] = Array.isArray(value) ? [...value] : value;
	}
	return { version: 1, roles, skillsEnabled: true, budget: "unlimited" };
}

export function isSafeModelSelector(value: unknown): value is string {
	if (typeof value !== "string") return false;
	if (INHERIT_SELECTORS.has(value)) return true;
	if (!value || value.length > MAX_MODEL_KEY_LENGTH) return false;
	if (/[\u0000-\u001f\u007f\\]/.test(value)) return false;

	const slash = value.indexOf("/");
	if (slash <= 0 || slash === value.length - 1) return false;

	const provider = value.slice(0, slash);
	const id = value.slice(slash + 1);
	if (!provider || !id) return false;

	for (const part of value.split("/")) {
		if (!part || DANGEROUS_KEY_PARTS.has(part)) return false;
	}
	return true;
}

function parseRoleValue(value: unknown): RoleValue | undefined {
	if (typeof value === "string") {
		return isSafeModelSelector(value) ? value : undefined;
	}
	if (!Array.isArray(value)) return undefined;
	const selectors = value.filter(isSafeModelSelector);
	if (selectors.length === 0) return undefined;
	return selectors;
}

export function parseConfig(raw: unknown): PstackConfig {
	const fallback = defaultConfig();
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;

	const record = raw as { version?: unknown; roles?: unknown };
	if (record.version !== 1 || !record.roles || typeof record.roles !== "object" || Array.isArray(record.roles)) {
		return fallback;
	}

	const roles: Record<string, RoleValue> = Object.create(null);
	for (const role of ROLE_NAMES) {
		roles[role] = fallback.roles[role];
	}
	for (const [key, value] of Object.entries(record.roles as Record<string, unknown>)) {
		if (!ROLE_NAME_SET.has(key)) continue;
		const parsed = parseRoleValue(value);
		if (parsed === undefined) continue;
		roles[key] = parsed;
	}
	const storedSkillsEnabled = (raw as { skillsEnabled?: unknown }).skillsEnabled;
	return {
		version: 1,
		roles,
		skillsEnabled:
			storedSkillsEnabled === true || storedSkillsEnabled === false
				? storedSkillsEnabled
				: fallback.skillsEnabled,
		budget: parseBudget((raw as { budget?: unknown }).budget),
	};
}

export function loadConfig(path: string = configPath()): PstackConfig {
	try {
		if (!existsSync(path)) return defaultConfig();
		const st = lstatSync(path);
		if (!st.isFile()) return defaultConfig();
		if (st.size > MAX_CONFIG_BYTES) return defaultConfig();
		const text = readFileSync(path, "utf8");
		if (text.length > MAX_CONFIG_BYTES) return defaultConfig();
		return parseConfig(JSON.parse(text));
	} catch {
		return defaultConfig();
	}
}

export function saveConfig(config: PstackConfig, path: string = configPath()): boolean {
	const clean = parseConfig(config);
	const body = `${JSON.stringify(
		{ version: 1, roles: clean.roles, skillsEnabled: clean.skillsEnabled, budget: clean.budget },
		null,
		2,
	)}\n`;
	const dir = dirname(path);
	const tmp = join(dir, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
	try {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		if (existsSync(path)) {
			const st = lstatSync(path);
			if (!st.isFile()) return false;
		}
		writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
		renameSync(tmp, path);
		return true;
	} catch {
		try {
			if (existsSync(tmp)) unlinkSync(tmp);
		} catch {
			// best-effort temp cleanup
		}
		return false;
	}
}

export function parseLegacyMarkdown(text: string): PstackConfig {
	const roles: Record<string, RoleValue> = Object.create(null);
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colon = trimmed.indexOf(":");
		if (colon <= 0) continue;
		const name = trimmed.slice(0, colon).trim();
		if (!ROLE_NAME_SET.has(name)) continue;
		const parts = trimmed
			.slice(colon + 1)
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		const parsed = parseRoleValue(parts.length <= 1 ? (parts[0] ?? "") : parts);
		if (parsed === undefined) continue;
		roles[name] = parsed;
	}
	return parseConfig({ version: 1, roles });
}

function isRegularFile(path: string): boolean {
	try {
		return existsSync(path) && lstatSync(path).isFile();
	} catch {
		return false;
	}
}

export function migrateLegacyMarkdownIfNeeded(
	jsonPath: string = configPath(),
	markdownPath: string = legacyMarkdownPath(),
): PstackConfig | undefined {
	if (existsSync(jsonPath)) return undefined;
	if (!isRegularFile(markdownPath)) return undefined;
	try {
		const migrated = parseLegacyMarkdown(readFileSync(markdownPath, "utf8"));
		if (!saveConfig(migrated, jsonPath)) return undefined;
		return migrated;
	} catch {
		return undefined;
	}
}

export function modelsForRole(config: PstackConfig, role: string): string[] {
	const value = config.roles[role];
	const list = Array.isArray(value) ? value : value ? [value] : [];
	return list.filter((selector) => !INHERIT_SELECTORS.has(selector));
}

/** The subset of a registry Model the roster needs. */
export interface ModelLevels {
	provider: string;
	id: string;
	reasoning: boolean;
	thinkingLevelMap?: Partial<Record<string, string | null | undefined>>;
}

const THINKING_LADDER = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** Mirrors pi-ai's getSupportedThinkingLevels: reasoning models support every
 * level not mapped to null, except xhigh/max which need an explicit mapping. */
export function supportedThinkingLevels(model: ModelLevels): string[] {
	if (!model.reasoning) return [];
	return THINKING_LADDER.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		if (level === "xhigh" || level === "max") return mapped !== undefined;
		return true;
	});
}

/** Highest supported level at or below the budget target, else the lowest
 * supported level, else undefined (non-reasoning model: omit `thinking=`). */
export function thinkingForModel(model: ModelLevels, target: string): string | undefined {
	const supported = supportedThinkingLevels(model);
	if (supported.length === 0) return undefined;
	const targetIndex = THINKING_LADDER.indexOf(target as (typeof THINKING_LADDER)[number]);
	for (let i = targetIndex; i >= 0; i--) {
		if (supported.includes(THINKING_LADDER[i])) return THINKING_LADDER[i];
	}
	return supported[0];
}

export interface RosterEntry {
	selector: string;
	thinking?: string;
}

export interface ResolvedRoster {
	budget: BudgetLabel;
	roles: { role: RoleName; entries: RosterEntry[] }[];
	unavailable: string[];
}

/**
 * Resolve the configured roster against the models this session can spawn.
 * Entries without live credentials are dropped (and listed in `unavailable`);
 * a role with nothing left is omitted, which the skills read as inherit-parent.
 */
export function resolveRoster(config: PstackConfig, available: readonly ModelLevels[]): ResolvedRoster {
	const byKey = new Map<string, ModelLevels>();
	for (const model of available) byKey.set(`${model.provider}/${model.id}`, model);
	const target = thinkingForBudget(config.budget);
	const roles: ResolvedRoster["roles"] = [];
	const unavailable = new Set<string>();
	for (const role of ROLE_NAMES) {
		const entries: RosterEntry[] = [];
		for (const selector of modelsForRole(config, role)) {
			const model = byKey.get(selector);
			if (!model) {
				unavailable.add(selector);
				continue;
			}
			entries.push(target ? { selector, thinking: thinkingForModel(model, target) } : { selector });
		}
		if (entries.length > 0) roles.push({ role, entries });
	}
	return { budget: config.budget, roles, unavailable: [...unavailable].sort() };
}

function formatEntry(entry: RosterEntry): string {
	return entry.thinking ? `${entry.selector} (thinking="${entry.thinking}")` : entry.selector;
}

export function formatRoleTable(config: PstackConfig, available: readonly ModelLevels[]): string {
	const roster = resolveRoster(config, available);
	if (roster.roles.length === 0) return "";
	const lines: string[] = [];
	const target = thinkingForBudget(roster.budget);
	lines.push(
		target
			? `thinking budget: ${roster.budget} (target "${target}", already clamped per model below)`
			: "thinking budget: inherit (omit thinking=; children inherit the parent level)",
	);
	for (const { role, entries } of roster.roles) {
		lines.push(`${role}: ${entries.map(formatEntry).join(", ")}`);
	}
	return lines.join("\n");
}
