#!/usr/bin/env node
/**
 * pii-check.mjs — Customer PII protection scanner
 * Companion to scripts/security-check.mjs (Xandland Security Kit).
 *
 * Focus: protecting the identities and personal information of
 * subscribers and buyers. Stack: Next.js App Router + Supabase +
 * Stripe + Vercel + Anthropic API.
 *
 * Exit 1 = blocking issue found. Exit 0 = clean or warnings only.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';

const ROOT = process.cwd();

// Skipped no matter where they appear
const ALWAYS_SKIP = new Set([
  'node_modules', '.next', '.git', '.vercel', '.turbo', '.cache',
]);

// Build/output folders — skipped ONLY at the repo root, so a real route
// like app/api/coverage/ or app/api/public/ still gets scanned.
const ROOT_ONLY_SKIP = new Set([
  'dist', 'build', 'out', 'coverage', 'public', '.output',
]);

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SQL_EXT = new Set(['.sql']);

// Columns / fields that mean "this is a real person"
const PII_WORDS = [
  'email', 'phone', 'address', 'full_name', 'first_name', 'last_name',
  'display_name', 'street', 'zip', 'postal', 'dob', 'birth',
  'ip_address', 'lat', 'lng', 'latitude', 'longitude',
];

// Tables that hold subscriber / buyer identity
const PII_TABLES = [
  'profiles', 'users', 'customers', 'subscribers', 'buyers', 'sellers',
  'hosts', 'members', 'accounts', 'orders', 'payments', 'subscriptions',
  'contacts', 'leads', 'waitlist', 'messages', 'dms',
];

// Fields that should never exist in your database at all
const NEVER_STORE = [
  'card_number', 'cardnumber', 'cc_number', 'cvv', 'cvc', 'card_cvc',
  'ssn', 'social_security', 'tax_id', 'routing_number', 'account_number',
  'password_plain', 'plaintext_password',
];

const blocks = [];
const warns = [];

function block(file, line, msg, hint) {
  blocks.push({ file, line, msg, hint });
}
function warn(file, line, msg, hint) {
  warns.push({ file, line, msg, hint });
}

/* ---------------------------------------------------------------- utils */

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  const atRoot = dir === ROOT;
  for (const name of entries) {
    if (ALWAYS_SKIP.has(name)) continue;
    if (atRoot && ROOT_ONLY_SKIP.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Blank out comments while preserving byte offsets, so line numbers
 *  stay accurate. A comment explaining a risk is documentation, not the
 *  risk — matching on it forces people to delete the explanation to
 *  satisfy the scanner, which is exactly backwards. */
function stripComments(src, sql = false) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  if (sql) {
    return src
      .replace(/--[^\n]*/g, blank)
      .replace(/\/\*[\s\S]*?\*\//g, blank);
  }
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
}

/** Blank out string literal CONTENTS so `console.log('user created')`
 *  doesn't look like it's logging a user. Template `${...}` is kept. */
function stripStringContents(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      const quote = c;
      out += quote;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') { out += ' '; i += 2; continue; }
        out += ' ';
        i++;
      }
      out += quote;
      i++;
    } else if (c === '`') {
      out += '`';
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { out += ' '; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1;
          out += '${';
          i += 2;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') depth--;
            out += depth > 0 ? src[i] : '}';
            i++;
          }
          continue;
        }
        out += ' ';
        i++;
      }
      out += '`';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function isClientComponent(src) {
  return /^\s*['"]use client['"]/m.test(src);
}

function isApiRoute(rel) {
  return /(^|[\\/])app[\\/]api[\\/].*route\.(ts|js|tsx|jsx)$/.test(rel);
}

const anyOf = (words) => words.join('|');

/* ------------------------------------------------------------ SQL checks */

function checkSql(files) {
  const sqlFiles = files.filter((f) => SQL_EXT.has(extname(f)));
  if (!sqlFiles.length) {
    warn(
      '(no .sql files found)',
      0,
      'No SQL migrations found in the repo, so RLS could not be verified.',
      'If your schema lives only in the Supabase dashboard, open Table Editor and confirm every table with customer data shows "RLS enabled". This is the single most important protection for subscriber identity.'
    );
    return;
  }

  const corpus = sqlFiles.map((f) => stripComments(readFileSync(f, 'utf8'), true)).join('\n');

  // Supabase-managed schemas — not yours to secure, and they have their
  // own RLS story. Only flag tables in your own schemas.
  const SYSTEM_SCHEMAS = new Set([
    'auth', 'storage', 'realtime', 'supabase_functions', 'extensions',
    'graphql', 'graphql_public', 'net', 'vault', 'pgsodium', 'cron',
  ]);

  for (const file of sqlFiles) {
    const rawSrc = readFileSync(file, 'utf8');
    const src = stripComments(rawSrc, true);
    const rel = relative(ROOT, file);
    const lower = src.toLowerCase();

    // 1. Tables created without RLS enabled anywhere in the migration set.
    //    Handles any schema qualifier — public.projects, xlscreenplay.projects,
    //    or a bare table name — rather than assuming "public".
    const tableRe =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:["']?([a-z0-9_]+)["']?\s*\.\s*)?["']?([a-z0-9_]+)["']?/gi;
    let m;
    while ((m = tableRe.exec(src)) !== null) {
      const schema = (m[1] || '').toLowerCase();
      const table = m[2].toLowerCase();
      if (SYSTEM_SCHEMAS.has(schema)) continue;

      // Match "alter table <table>", "alter table <anyschema>.<table>"
      const qualifier = `(?:["']?[a-z0-9_]+["']?\\s*\\.\\s*)?`;
      const rlsRe = new RegExp(
        `alter\\s+table\\s+(?:if\\s+exists\\s+)?${qualifier}["']?${table}["']?\\s+(?:force\\s+)?enable\\s+row\\s+level\\s+security`,
        'i'
      );
      if (!rlsRe.test(corpus)) {
        const looksPii =
          PII_TABLES.includes(table) ||
          PII_WORDS.some((w) =>
            new RegExp(`create\\s+table[\\s\\S]{0,2000}?${table}[\\s\\S]{0,2000}?${w}`, 'i').test(src)
          );
        const label = schema ? `${schema}.${table}` : table;
        const msg = `Table "${label}" is created but row level security is never enabled.`;
        const hint =
          'Without RLS, anyone holding your public anon key can read every row in this table from the browser. Add: alter table ' +
          (schema ? `${schema}.${table}` : table) +
          ' enable row level security;  — then add a policy scoping rows to auth.uid().';
        if (looksPii) block(rel, lineOf(src, m.index), msg, hint);
        else warn(rel, lineOf(src, m.index), msg, hint);
      }
    }

    // 2. RLS on but no policy. Sometimes intentional — a table only the
    //    service role should ever touch is correctly locked with zero
    //    policies — so this warns rather than blocks.
    const rlsOnRe =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:["']?[a-z0-9_]+["']?\s*\.\s*)?["']?([a-z0-9_]+)["']?\s+(?:force\s+)?enable\s+row\s+level\s+security/gi;
    while ((m = rlsOnRe.exec(src)) !== null) {
      const table = m[1].toLowerCase();
      const polRe = new RegExp(
        `create\\s+policy[\\s\\S]{0,400}?on\\s+(?:["']?[a-z0-9_]+["']?\\s*\\.\\s*)?["']?${table}["']?`,
        'i'
      );
      if (!polRe.test(corpus)) {
        warn(
          rel,
          lineOf(src, m.index),
          `Table "${table}" has RLS enabled but no policy defined.`,
          'Under RLS the absence of a policy IS the enforcement — nothing but the service role can touch it. That is a legitimate design for migration ledgers and internal tables; if that is the intent here, say so in a comment above the alter statement. Otherwise add a policy such as: create policy "own rows" on ' +
            table +
            ' for all using (auth.uid() = user_id);'
        );
      }
    }

    // 3. Public storage buckets
    const bucketRe = /insert\s+into\s+storage\.buckets[\s\S]{0,300}?true/gi;
    while ((m = bucketRe.exec(src)) !== null) {
      warn(
        rel,
        lineOf(src, m.index),
        'A Supabase storage bucket is being created as public.',
        'Public buckets can be listed and enumerated by anyone. For user-uploaded photos (XLResale listings, XLPeeps avatars) prefer a private bucket plus signed URLs, or confirm the bucket truly holds nothing identifying.'
      );
    }

    // 4. Fields that must never be stored
    for (const field of NEVER_STORE) {
      const idx = lower.indexOf(field);
      if (idx !== -1) {
        block(
          rel,
          lineOf(src, idx),
          `Schema defines a "${field}" column.`,
          'Never store this. Card data belongs only in Stripe — store the Stripe customer/payment-method ID instead. Storing raw card or government ID numbers creates PCI and breach-notification liability you do not want as a solo operator.'
        );
      }
    }
  }
}

/* ----------------------------------------------------------- code checks */

function checkCode(files) {
  const codeFiles = files.filter((f) => CODE_EXT.has(extname(f)));

  for (const file of codeFiles) {
    const rel = relative(ROOT, file);
    if (rel.includes(`scripts${sep}pii-check`) || rel.includes(`scripts${sep}security-check`)) continue;

    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const src = stripStringContents(stripComments(raw));
    const client = isClientComponent(raw);
    const api = isApiRoute(rel);
    let m;

    // 5. PII written to logs (Vercel retains these)
    const logRe = /console\.(?:log|info|warn|error|debug)\(([\s\S]{0,300}?)\)/g;
    while ((m = logRe.exec(src)) !== null) {
      const args = m[1];
      const hit = PII_WORDS.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(args)) ||
        (/\b(user|customer|profile|session|subscriber|buyer|member)\b\s*[,)\]]/i.test(args)
          ? 'a whole user/customer object'
          : null);
      if (hit) {
        block(
          rel,
          lineOf(src, m.index),
          `Personal data (${hit}) is written to the console.`,
          'Vercel keeps runtime logs, and anyone with dashboard access can read them. Log an opaque ID instead of the person: console.log("checkout ok", { userId }).'
        );
      }
    }

    // 6. Raw error objects returned to the client
    const errRe = /(?:NextResponse\.json|res\.json|Response\.json)\(\s*\{[^}]{0,120}\berror\s*:\s*(err|error|e|exception)\b/g;
    while ((m = errRe.exec(src)) !== null) {
      block(
        rel,
        lineOf(src, m.index),
        'A raw error object is returned in an API response.',
        'Supabase and Postgres errors leak table names, column names, and sometimes row values straight to the browser. Log the real error server-side and return a generic message: { error: "Something went wrong" }.'
      );
    }

    // 7. select('*') on an identity table
    // Two things this must NOT do, both of which it used to (found on XLEats,
    // where every hit was a false positive):
    //   * Attribute a select('*') to the wrong table. The window may not cross
    //     another .from( -- past that point we're looking at a different query,
    //     and reporting it against the identity table is simply wrong.
    //   * Flag .select('*', { count: 'exact', head: true }). That's a COUNT.
    //     head:true returns no rows at all, so no column is exposed.
    // A scanner that cries wolf gets switched off, which is worse than none.
    const selRe = new RegExp(
      `\\.from\\(\\s*["'\`](${anyOf(PII_TABLES)})["'\`]\\s*\\)` +
        `(?:(?!\\.from\\()[\\s\\S]){0,200}?` +
        `\\.select\\(\\s*["'\`]\\*["'\`]\\s*(?!,\\s*\\{[^}]*\\bhead\\s*:\\s*true)`,
      'gi'
    );
    while ((m = selRe.exec(raw)) !== null) {
      const msg = `select('*') on the "${m[1]}" table returns every column, including any personal fields.`;
      const hint =
        "Name the columns you actually render: .select('id, display_name, avatar_url'). This way adding an email or phone column later doesn't silently start shipping it to the browser.";
      if (client) block(rel, lineOf(raw, m.index), msg, hint);
      else warn(rel, lineOf(raw, m.index), msg, hint);
    }

    // 8. API route touching identity tables with no auth check
    if (api) {
      const touchesPii = new RegExp(`\\.from\\(\\s*["'\`](${anyOf(PII_TABLES)})["'\`]`, 'i').test(raw);
      const hasAuth = /(getUser|getSession|auth\.uid|currentUser|requireAuth|verifyAuth|getServerSession|clerk)/i.test(raw);
      if (touchesPii && !hasAuth) {
        block(
          rel,
          1,
          'This API route reads or writes an identity table with no visible auth check.',
          'Add an auth check at the top of the handler and return 401 when there is no user. If this route is genuinely public, scope the query to non-identifying columns only.'
        );
      }

      // 9. Service role key in a route with no auth check
      if (/SUPABASE_SERVICE_ROLE|service_role/i.test(raw) && !hasAuth) {
        block(
          rel,
          1,
          'The service-role key is used in an API route with no auth check.',
          'The service-role key bypasses RLS entirely — this route can read every subscriber row regardless of who calls it. Gate it behind an auth check, or use the normal anon client so RLS still applies.'
        );
      }

      // 10. AI-calling route with no rate limit
      const callsAi = /api\.anthropic\.com|@anthropic-ai|api\.openai\.com|generativelanguage\.googleapis/i.test(raw);
      const hasLimit = /(ratelimit|rate_limit|rateLimit|upstash|limiter|throttle)/i.test(raw);
      if (callsAi && !hasLimit) {
        warn(
          rel,
          1,
          'This route calls an AI API with no visible rate limiting.',
          'An unthrottled AI endpoint is someone else\'s free Claude on your credit card, and abuse traffic is also how scrapers harvest whatever the route returns. @upstash/ratelimit keyed on user ID is the usual fix.'
        );
      }
    }

    // 11. PII interpolated into an AI prompt
    const promptRe = /(messages\s*:\s*\[|system\s*:\s*|api\.anthropic\.com)[\s\S]{0,600}?\.(email|phone|full_name|address|first_name|last_name|real_name)\b/g;
    while ((m = promptRe.exec(src)) !== null) {
      warn(
        rel,
        lineOf(src, m.index),
        `A customer's ${m[2]} appears to be sent into an AI prompt.`,
        'Personal data leaving your systems for a third-party API is a disclosure your privacy policy has to cover. Pass a first name or an anonymous ID if the model needs a handle at all.'
      );
    }

    // 12. Untrusted user content concatenated into a system prompt
    const injectRe = /system\s*:\s*[`"'][\s\S]{0,300}?\$\{/g;
    while ((m = injectRe.exec(raw)) !== null) {
      warn(
        rel,
        lineOf(raw, m.index),
        'User-supplied content is interpolated directly into a system prompt.',
        'A screenplay or uploaded file containing "ignore previous instructions" can hijack the call and make the model reveal your prompt or other context. Keep the system prompt static and pass user content as a separate user message wrapped in clear delimiters.'
      );
    }

    // 13. Identity in URLs (leaks via logs, referer headers, analytics)
    const urlRe = /[?&](email|phone|name|address)=/gi;
    while ((m = urlRe.exec(raw)) !== null) {
      warn(
        rel,
        lineOf(raw, m.index),
        `"${m[1]}" is passed in a URL query string.`,
        'Query strings land in server logs, browser history, and the Referer header sent to any third-party script on the page. Move it to a POST body or use an opaque token.'
      );
    }

    // 14. Archive extraction without limits (XLSecure zip intake)
    const ARCHIVE_LIBS = 'adm-zip|jszip|yauzl|unzipper|node-stream-zip';
    const archiveImported = new RegExp(
      `(?:import[^;]{0,120}from\\s*["'\`](?:${ARCHIVE_LIBS})["'\`]` +
        `|require\\(\\s*["'\`](?:${ARCHIVE_LIBS})["'\`]` +
        `|import\\(\\s*["'\`](?:${ARCHIVE_LIBS})["'\`])`,
      'i'
    ).test(src);
    if (archiveImported) {
      const guarded = /(maxSize|max_size|sizeLimit|MAX_ENTRIES|entryLimit|normalize\(|\.\.\/|path\.resolve)/i.test(raw);
      if (!guarded) {
        warn(
          rel,
          1,
          'An archive is extracted with no size or path guards.',
          'Cap total uncompressed bytes and entry count (zip bombs), and reject any entry whose resolved path escapes the extraction directory (path traversal). Both matter for the XLSecure zip intake.'
        );
      }
    }

    // 15. Third-party scripts on pages that collect data
    if (/<Script\b|<script\s+src=/i.test(raw) && /<(form|input)\b/i.test(raw)) {
      const thirdParty = /(googletagmanager|google-analytics|hotjar|fullstory|clarity\.ms|facebook\.net|posthog)/i.test(raw);
      if (thirdParty) {
        warn(
          rel,
          1,
          'A third-party analytics script sits on a page containing form inputs.',
          'Session-recording and tag-manager scripts can capture keystrokes in form fields by default. Mask inputs explicitly, or keep these scripts off signup, checkout, and profile pages.'
        );
      }
    }

    // 16. Broad client-side exposure of an identity table via realtime
    if (client && /\.channel\(|postgres_changes/i.test(raw)) {
      const t = PII_TABLES.find((tb) => new RegExp(`table\\s*:\\s*["'\`]${tb}["'\`]`, 'i').test(raw));
      if (t) {
        warn(
          rel,
          1,
          `A client-side Realtime subscription listens to the "${t}" table.`,
          'Realtime respects RLS only if RLS is enabled on that table — otherwise every subscriber receives every row change. Confirm RLS is on before shipping this.'
        );
      }
    }
  }
}

/* ------------------------------------------- XLResale: host address policy */

/**
 * XLResale publishes the home addresses of private individuals on a public
 * map, tied to a live/closed status. That is a physical-safety exposure, not
 * just a privacy one, and no pattern match can tell you the right answer —
 * it's a product decision. So this fires as a standing reminder whenever the
 * repo looks like XLResale, and keeps firing until the decision is written
 * down.
 *
 * To silence it: create docs/ADDRESS-POLICY.md, or put the token
 * ADDRESS-POLICY-DECIDED in a comment anywhere in the repo.
 */
function checkResaleAddressPolicy(files) {
  let looksLikeResale = false;
  let decided = false;

  // Sentinel split at runtime so this file's own source can't match it.
  const TOKEN = 'ADDRESS-POLICY' + '-DECIDED';

  for (const file of files) {
    const ext = extname(file);
    const base = relative(ROOT, file);

    // Never let the kit's own files vote — the scanner and its README
    // both discuss XLResale, which would otherwise self-trigger (or
    // self-clear) this reminder in every project the kit is installed in.
    if (/^(scripts[\\/](pii|security)-check\.mjs|README\.md|SECURITY-CHECKLIST\.md|docs[\\/]ADDRESS-POLICY\.template\.md)$/.test(base)) {
      continue;
    }

    const isDoc = /\.md$/i.test(base);
    if (!CODE_EXT.has(ext) && !SQL_EXT.has(ext) && !/package\.json$/.test(base) && !isDoc) continue;

    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    if (src.includes(TOKEN)) decided = true;
    if (/^docs[\\/]ADDRESS-POLICY\.md$/i.test(base)) decided = true;

    // Prose mentioning XLResale is not evidence you're IN XLResale, so
    // only code, schema, and package.json count toward detection.
    if (isDoc) continue;

    if (
      /sales_near|xlresale|winding_down/i.test(src) ||
      (/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?sales["']?/i.test(src) &&
        /\b(address|street|lat|lng|latitude|longitude|geography|geometry)\b/i.test(src))
    ) {
      looksLikeResale = true;
    }
  }

  if (!looksLikeResale || decided) return;

  warn(
    'XLRESALE — OPEN DECISION',
    0,
    'Host home addresses are published on a public map with a live/closed status, and no address-precision policy is recorded in this repo.',
    [
      'This is the one exposure in XLResale that is about physical safety, not just privacy. A stranger reading the map learns two useful things: a LIVE sale means a specific house is occupied by someone distracted and expecting strangers to walk up; a CLOSED sale means nobody is watching a house that just advertised it had valuables.',
      '',
      '      Decide and write down:',
      '      1. Pin precision before the sale goes live — exact address, or block-level / street-only until start time?',
      '      2. What happens at close — does the exact address stay visible, degrade back to approximate, or disappear?',
      '      3. Does the address ship in the sales_near() RPC payload to every browser, or only after a host action?',
      '      4. Can a host preview exactly what a stranger sees before they publish?',
      '      5. Is there a takedown path if a host feels unsafe mid-sale?',
      '',
      '      Then create docs/ADDRESS-POLICY.md (or add ADDRESS-POLICY-DECIDED in a comment) to clear this reminder.',
    ].join('\n')
  );
}

/* -------------------------------------------------------------- reporting */

function report() {
  const line = '─'.repeat(60);
  console.log('\n' + line);
  console.log('  PII CHECK — subscriber & buyer identity protection');
  console.log(line);

  if (!blocks.length && !warns.length) {
    console.log('\n  ✓ No personal-data issues found.\n');
    return 0;
  }

  if (blocks.length) {
    console.log(`\n  ✗ ${blocks.length} BLOCKING issue${blocks.length > 1 ? 's' : ''}\n`);
    for (const b of blocks) {
      console.log(`  ✗ ${b.file}:${b.line}`);
      console.log(`      ${b.msg}`);
      console.log(`      → ${b.hint}\n`);
    }
  }

  if (warns.length) {
    console.log(`\n  ! ${warns.length} warning${warns.length > 1 ? 's' : ''} (review, does not block)\n`);
    for (const w of warns) {
      console.log(`  ! ${w.file}:${w.line}`);
      console.log(`      ${w.msg}`);
      console.log(`      → ${w.hint}\n`);
    }
  }

  console.log(line);
  if (blocks.length) {
    console.log('  Push blocked. Fix the ✗ items above, or run with --warn-only\n');
    return 1;
  }
  console.log('  Warnings only — push allowed.\n');
  return 0;
}

/* ------------------------------------------------------------------- main */

const files = walk(ROOT);
checkSql(files);
checkCode(files);
checkResaleAddressPolicy(files);

const code = report();
const warnOnly = process.argv.includes('--warn-only');
process.exit(warnOnly ? 0 : code);
