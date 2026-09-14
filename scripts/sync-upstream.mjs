#!/usr/bin/env node
// Sync the skill tree from upstream in two hops:
//
//   cursor/plugins (pstack)  --reground-from-cursor-->  pi-pstack shape  --reground-from-pi-->  this repo
//
// The first hop uses pi-pstack's own lever (checked out from zenspc/pi-extensions), so the
// mechanical Cursor-to-Pi seams stay owned upstream. The second hop is scripts/reground-from-pi.mjs.
// Pinned commits live in upstream.lock.json; pass --latest to move them to each default branch.
//
//   node scripts/sync-upstream.mjs            # sync at the pinned commits (idempotent)
//   node scripts/sync-upstream.mjs --latest   # advance the pins, then sync
//   node scripts/sync-upstream.mjs --dry-run  # print the plan only
//
// Requires git and network. Clones go under upstream/ (gitignored).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, "upstream.lock.json");
const WORK = join(ROOT, "upstream");

function sh(args, cwd = ROOT) {
	return execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function readLock() {
	return JSON.parse(readFileSync(LOCK, "utf8"));
}

function checkout(entry, dest, latest) {
	if (!existsSync(dest)) {
		mkdirSync(dirname(dest), { recursive: true });
		sh(["git", "clone", "--quiet", "--filter=blob:none", "--no-checkout", entry.repo, dest]);
	}
	sh(["git", "fetch", "--quiet", "origin"], dest);
	const ref = latest ? `origin/${entry.branch}` : entry.commit;
	sh(["git", "checkout", "--quiet", "--detach", ref], dest);
	return { commit: sh(["git", "rev-parse", "HEAD"], dest), date: sh(["git", "log", "-1", "--format=%cI"], dest) };
}

export function main(argv = process.argv.slice(2)) {
	const latest = argv.includes("--latest");
	const dryRun = argv.includes("--dry-run");
	const lock = readLock();

	const cursorDir = join(WORK, "cursor-plugins");
	const piDir = join(WORK, "pi-extensions");
	const cursor = checkout(lock.cursor, cursorDir, latest);
	const pi = checkout(lock.pi, piDir, latest);
	const cursorPstack = join(cursorDir, lock.cursor.path);
	const piPstack = join(piDir, lock.pi.path);
	const piVersion = JSON.parse(readFileSync(join(piPstack, "package.json"), "utf8")).version;
	const cursorVersion = JSON.parse(readFileSync(join(cursorPstack, ".cursor-plugin", "plugin.json"), "utf8")).version;

	console.log(`cursor/plugins pstack ${cursorVersion} @ ${cursor.commit.slice(0, 12)} (${cursor.date})`);
	console.log(`pi-pstack ${piVersion} @ ${pi.commit.slice(0, 12)} (${pi.date})`);

	// Hop 1: Cursor -> Pi shape, into a scratch copy of pi-pstack so its lever sees a full package.
	const staged = join(WORK, "pi-pstack-staged");
	rmSync(staged, { recursive: true, force: true });
	sh(["cp", "-R", piPstack, staged]);
	sh(["node", join(piPstack, "scripts", "reground-from-cursor.mjs"), "--from", cursorPstack, "--to", staged]);

	// Hop 2: Pi shape -> this repo.
	const args = ["node", join(ROOT, "scripts", "reground-from-pi.mjs"), "--from", staged, "--to", ROOT];
	if (dryRun) args.push("--dry-run");
	console.log(sh(args));

	if (!dryRun) {
		const next = {
			...lock,
			cursor: { ...lock.cursor, commit: cursor.commit, version: cursorVersion, date: cursor.date },
			pi: { ...lock.pi, commit: pi.commit, version: piVersion, date: pi.date },
		};
		writeFileSync(LOCK, `${JSON.stringify(next, null, 2)}\n`);
		console.log(`# upstream.lock.json ${latest ? "advanced" : "confirmed"}`);
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	try {
		main();
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	}
}
