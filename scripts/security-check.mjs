#!/usr/bin/env node
/*
 * security-check.mjs
 * Reusable pre-push security gate for Xandland Next.js + Supabase + Stripe + Vercel apps.
 * Plain Node, no dependencies. Used by both the Claude Code hook and GitHub Actions.
 *
 * HARD FAILURES (block the push, exit 1):
 *   1. A secret exposed to the browser via a NEXT_PUBLIC_ variable
 *   2. A live/secret API key hardcoded in source (Stripe, Resend, OpenAI,
 *      Anthropic, Google/Gemini, GitHub, AWS)
 *   3. .env files not covered by .gitignore
 *   4. The Supabase service-role key used inside a "use client" file
 *      (it bypasses Row Level Security and would ship to the browser)
 *   5. CORS set to allow ALL origins together with credentials
 *
 * WARNINGS (printed, do NOT block — a human should eyeball these):
 *   - A Stripe webhook handler that doesn't verify the signature
 *   - An API route that queries Supabase with no visible auth check
 *   - CORS wildcard (*) without credentials
 *   - dangerouslySetInnerHTML (possible XSS)
 *   - eval() / new Function() (possible code injection)
 *   - A secret logged to console (leaks into Vercel logs)
 *   - Supabase RLS reminder + rate-limiting reminder
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();
const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".vercel", ".turbo", ".claude"]);
const SELF = new Set(["security-check.mjs", "pre-push-guard.mjs"]);

const errors = [];
const warnings = [];

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const rel = (f) => f.replace(ROOT + "/", "");

// --- Secret key patterns (hardcoded live/secret keys) ---------------------
const KEY_PATTERNS = [
  { re: /sk_live_[A-Za-z0-9]{6,}/,          label: "Stripe secret key" },
  { re: /sk_test_[A-Za-z0-9]{6,}/,          label: "Stripe test secret key" },
  { re: /rk_live_[A-Za-z0-9]{6,}/,          label: "Stripe restricted key" },
  { re: /re_[A-Za-z0-9]{16,}/,              label: "Resend API key" },
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/,        label: "Anthropic API key" },
  { re: /sk-proj-[A-Za-z0-9_-]{20,}/,       label: "OpenAI project key" },
  { re: /\bsk-[A-Za-z0-9]{32,}/,            label: "OpenAI API key" },
  { re: /AIza[0-9A-Za-z_-]{35}/,            label: "Google / Gemini API key" },
  { re: /ghp_[A-Za-z0-9]{36}/,              label: "GitHub token" },
  { re: /github_pat_[A-Za-z0-9_]{40,}/,     label: "GitHub fine-grained token" },
  { re: /AKIA[0-9A-Z]{16}/,                 label: "AWS access key" },
];

// A secret exposed to the browser via NEXT_PUBLIC_
const publicSecretRe = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE_KEY|WEBHOOK_SECRET)/;

// API routes that are legitimately public — skip the auth heuristic for these
const PUBLIC_ROUTE_HINTS = /(webhook|cron|health|public|sitemap|robots|og-image|opengraph|revalidate)/i;
// Signals that some auth/authorization check is present
const AUTH_SIGNALS = /(getUser|getSession|getServerSession|requireAuth|currentUser|\bauth\s*\(|authorization|bearer|verifyJwt|verifyToken|getToken|clerk|x-api-key)/i;
// A Supabase data query
const SUPABASE_QUERY = /\.(from|rpc)\s*\(/;

for (const file of files) {
  if (!CODE_EXT.has(extname(file))) continue;
  if (SELF.has(basename(file))) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  const r = rel(file);
  const lines = text.split("\n");

  // Per-line: exposed + hardcoded secrets
  lines.forEach((line, i) => {
    if (publicSecretRe.test(line)) {
      errors.push(`${r}:${i + 1} — a secret is exposed with NEXT_PUBLIC_ (ships to every visitor's browser). Rename it to a server-only variable.`);
    }
    for (const { re, label } of KEY_PATTERNS) {
      if (re.test(line)) {
        errors.push(`${r}:${i + 1} — a ${label} looks hardcoded. Move it to an environment variable and rotate the exposed key.`);
        break;
      }
    }
    if (/console\.(log|error|info|warn|debug)\s*\([^)]*process\.env/.test(line)) {
      warnings.push(`${r}:${i + 1} — a value from process.env is being logged to the console; it will appear in Vercel logs. Remove before shipping.`);
    }
  });

  // Whole-file checks
  const isClient = /^\s*['"]use client['"]/m.test(text);
  if (isClient && /SERVICE_ROLE/.test(text)) {
    errors.push(`${r} — the Supabase SERVICE_ROLE key is referenced in a "use client" file. That key bypasses Row Level Security and must never touch the browser. Use it only in server code.`);
  }

  const wildcardCors = /Access-Control-Allow-Origin['"\s:,]+\*/.test(text);
  const corsCredentials = /Access-Control-Allow-Credentials['"\s:,]+true/i.test(text);
  if (wildcardCors && corsCredentials) {
    errors.push(`${r} — CORS allows ALL origins (*) together with credentials. This exposes authenticated requests to any site. Restrict the allowed origin.`);
  } else if (wildcardCors) {
    warnings.push(`${r} — CORS is set to allow all origins (*). Fine for public read-only endpoints; lock it down if the route returns user data.`);
  }

  if (/dangerouslySetInnerHTML/.test(text)) {
    warnings.push(`${r} — uses dangerouslySetInnerHTML. If the HTML comes from user input or an API, sanitize it (e.g. DOMPurify) to avoid XSS.`);
  }
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) {
    warnings.push(`${r} — uses eval() or new Function(). If any input is user-controlled this is code injection. Avoid if possible.`);
  }

  // API-route auth heuristic
  const isApiRoute = /\/api\//.test(r) && /(^|\/)route\.(t|j)sx?$/.test(r) || /\/pages\/api\//.test(r);
  if (isApiRoute && !PUBLIC_ROUTE_HINTS.test(r)) {
    if (SUPABASE_QUERY.test(text) && !AUTH_SIGNALS.test(text)) {
      warnings.push(`${r} — this API route queries Supabase but has no visible auth check (no session/user/bearer check). Confirm it's meant to be public, or add an auth check.`);
    }
  }
}

// --- .env must be gitignored ----------------------------------------------
let gitignore = "";
if (existsSync(join(ROOT, ".gitignore"))) gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
if (!/(^|\n)\s*\.env/.test(gitignore)) {
  errors.push(".gitignore does not ignore .env files. Add a line `.env*` so secrets are never committed.");
}

// --- Stripe webhook signature verification --------------------------------
for (const file of files) {
  if (!rel(file).toLowerCase().includes("webhook")) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  if (text.toLowerCase().includes("stripe") && !text.includes("constructEvent")) {
    warnings.push(`${rel(file)} — looks like a Stripe webhook but never calls constructEvent(). Without signature verification, anyone can POST a fake "payment succeeded". Verify the signature.`);
  }
}

// --- Supabase RLS check on SQL migrations ---------------------------------
let createsTable = false, enablesRls = false;
for (const file of files) {
  if (extname(file) !== ".sql") continue;
  const text = readFileSync(file, "utf8").toLowerCase();
  if (text.includes("create table")) createsTable = true;
  if (text.includes("enable row level security")) enablesRls = true;
}
if (createsTable && !enablesRls) {
  warnings.push("SQL migrations create tables but no `ENABLE ROW LEVEL SECURITY` was found. Confirm RLS is ON for every table.");
}

// --- Standing reminders ---------------------------------------------------
warnings.push("RLS reminder: confirm every Supabase table has RLS enabled AND policies that scope rows to the correct user.");
warnings.push("Rate-limit reminder: your contact (Resend) and AI endpoints should be rate-limited to prevent abuse and runaway API bills.");

// --- Report ---------------------------------------------------------------
if (warnings.length) {
  console.log("\n\u26A0  Review these (not blocking):");
  for (const w of warnings) console.log("   - " + w);
}
if (errors.length) {
  console.error("\n\u2716 Security check FAILED \u2014 push blocked:");
  for (const e of errors) console.error("   - " + e);
  console.error("\nFix these (or paste them to Claude to fix), then push again.\n");
  process.exit(1);
}
console.log("\n\u2714 Security check passed.\n");
process.exit(0);
