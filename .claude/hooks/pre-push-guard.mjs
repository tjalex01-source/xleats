#!/usr/bin/env node
/*
 * pre-push-guard.mjs
 * Claude Code PreToolUse hook. Fires before any Bash command Claude runs.
 * If the command is a `git push`, it runs the security checks first and
 * BLOCKS the push (exit 2) if any check fails. All other commands pass through.
 *
 * No dependencies — reads the hook's JSON from stdin with plain Node.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(input)?.tool_input?.command || "";
  } catch {
    process.exit(0); // couldn't parse — don't get in the way
  }

  // Only gate pushes. Everything else is allowed through untouched.
  if (!/git\s+push/.test(command)) process.exit(0);

  // Both scanners must pass. security-check.mjs protects your secrets;
  // pii-check.mjs protects your subscribers' and buyers' personal data.
  const scans = [
    ["scripts/security-check.mjs", "Security check"],
    ["scripts/pii-check.mjs", "PII check"],
  ];

  for (const [script, label] of scans) {
    if (!existsSync(script)) continue; // not installed in this project — skip
    try {
      execSync(`node ${script}`, { stdio: "inherit" });
    } catch {
      console.error(
        `[pre-push-guard] ${label} failed — push blocked. Fix the issues above, then push again.`
      );
      process.exit(2); // exit 2 tells Claude Code to block the tool call
    }
  }

  process.exit(0); // all checks passed → allow the push
});
