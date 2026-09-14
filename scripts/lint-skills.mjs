#!/usr/bin/env node
// Lint every skill in skills/ against the Agent Skills frontmatter rules Prime
// Agent enforces, plus this package's own invariants. Exit 1 on any problem.
//
//   node scripts/lint-skills.mjs
//
// Checks:
//   - every skill dir has SKILL.md with frontmatter, name === dir name, non-empty description
//   - name: 1-64 chars, [a-z0-9-], no leading/trailing/double hyphens; description <= 1024 chars
//   - exactly the DISCOVERABLE set omits disable-model-invocation; every other skill sets it true
//   - no Pi/Cursor seams survive in .md/.sh (same list the reground lever enforces)
//   - relative links inside a skill resolve to a file
//   - agents/*.md briefs have frontmatter with name and description

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEFTOVER_PATTERNS } from "./reground-from-pi.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(ROOT, "skills");
const AGENTS = join(ROOT, "agents");
export const DISCOVERABLE = new Set(["how", "typescript-best-practices", "unslop", "why"]);

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

function frontmatter(text) {
	if (!text.startsWith("---\n")) return null;
	const close = text.indexOf("\n---\n", 4);
	if (close === -1) return null;
	const fm = {};
	for (const line of text.slice(4, close).split("\n")) {
		const i = line.indexOf(":");
		if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
	}
	return { fm, body: text.slice(close + 5) };
}

function* walk(dir) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (ent.name === "node_modules") continue;
		const p = join(dir, ent.name);
		if (ent.isDirectory()) yield* walk(p);
		else yield p;
	}
}

function unquote(v) {
	return v && /^".*"$/.test(v) ? JSON.parse(v) : v;
}

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function lintSkills() {
	const dirs = readdirSync(SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
	for (const dir of dirs) {
		const path = join(SKILLS, dir, "SKILL.md");
		if (!existsSync(path)) { fail(`skills/${dir}`, "missing SKILL.md"); continue; }
		const parsed = frontmatter(readFileSync(path, "utf8"));
		if (!parsed) { fail(`skills/${dir}/SKILL.md`, "missing frontmatter"); continue; }
		const { fm, body } = parsed;
		const name = unquote(fm.name);
		const description = unquote(fm.description);
		if (name !== dir) fail(path, `name "${name}" does not match directory "${dir}"`);
		if (!name || name.length > 64 || !NAME_RE.test(name)) fail(path, `invalid name "${name}"`);
		if (!description) fail(path, "empty description (skill would silently not load)");
		else if (description.length > 1024) fail(path, `description is ${description.length} chars (max 1024)`);
		const hidden = fm["disable-model-invocation"] === "true";
		if (DISCOVERABLE.has(dir) && hidden) fail(path, "Discoverable skill must omit disable-model-invocation");
		if (!DISCOVERABLE.has(dir) && !hidden) fail(path, "Hidden skill must set disable-model-invocation: true");
		if (body.trim().length === 0) fail(path, "empty body");
	}
	for (const file of walk(SKILLS)) {
		if (!/\.(md|sh)$/.test(file)) continue;
		const text = readFileSync(file, "utf8");
		for (const p of LEFTOVER_PATTERNS) {
			const m = p.exec(text);
			if (m) fail(file, `Pi/Cursor seam: ${JSON.stringify(m[0])}`);
		}
		if (file.endsWith(".md")) {
			const re = /\]\(([^)#?]+)(?:[#?][^)]*)?\)/g;
			let m;
			while ((m = re.exec(text))) {
				const target = m[1];
				if (/^[a-z]+:/.test(target) || target.startsWith("/") || target === "url") continue;
				if (!existsSync(resolve(dirname(file), target))) fail(file, `broken relative link: ${target}`);
			}
		}
	}
	for (const ent of readdirSync(AGENTS)) {
		const path = join(AGENTS, ent);
		if (!statSync(path).isFile() || !ent.endsWith(".md")) continue;
		const parsed = frontmatter(readFileSync(path, "utf8"));
		if (!parsed) { fail(path, "missing frontmatter"); continue; }
		if (!parsed.fm.name) fail(path, "missing name");
		if (!parsed.fm.description) fail(path, "missing description");
		if (unquote(parsed.fm.name) !== ent.replace(/\.md$/, "")) fail(path, "name does not match file name");
	}
	return { skills: dirs.length, problems: [...problems] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	const result = lintSkills();
	for (const p of result.problems) console.error(p);
	console.log(`# ${result.skills} skills, ${result.problems.length} problems`);
	process.exitCode = result.problems.length ? 1 : 0;
}
