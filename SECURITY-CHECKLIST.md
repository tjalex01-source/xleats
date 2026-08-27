# Xandland Security Checklist

A working checklist for the Xandland stack: Next.js (App Router) +
Supabase + Stripe + Vercel + Anthropic API, built through Claude Code
and deployed via GitHub Desktop.

Two scripts in this kit automate part of this. The rest is judgment and
one-time configuration. Items marked **[auto]** are checked by
`security-check.mjs` or `pii-check.mjs` on every push; everything else
you verify by hand.

---

## 0. The idea this all rests on

Every vendor here runs a **shared responsibility model**. They secure the
platform. You secure the configuration. Nobody at Supabase, Stripe, or
Anthropic can know which rows in *your* database a given visitor is
allowed to see — only you know that. So they hand you the mechanism and
leave the decision to you.

| Layer | Theirs | Yours |
|---|---|---|
| Supabase | Postgres patching, disk encryption, infrastructure | **RLS policies**, which keys go where, bucket visibility |
| Stripe | Card data, PCI compliance, the vault | **Webhook signature verification**, what you store |
| Vercel | TLS, platform isolation, edge network | **What you log**, env var scoping, headers |
| Anthropic | Model weights, endpoint security, output safety | **What you send**, prompt construction, rate limiting |

**The thing to internalize:** your Supabase anon key is public by
design. It ships inside your JavaScript bundle. Supabase auto-generates
a REST API over every table. So anyone can do this:

```
curl 'https://yourproject.supabase.co/rest/v1/profiles?select=*' \
  -H "apikey: eyJhbGci..."
```

No exploit — that's the documented, intended API. If RLS is off on that
table, it returns every row. Your UI never displaying emails is
irrelevant, because your UI was never the gate. **RLS is the gate.**

Why this bites specifically: tables created in the Supabase dashboard
get RLS on by default with a visible warning. Tables created by
**running SQL migrations** — exactly how Claude Code builds schema — do
not. Nothing warns you, and the app works perfectly either way.

At solo-operator scale, a breach almost never means a vendor got
hacked. It means a table was public and nobody checked.

---

## 1. Database — the highest-stakes section

- [ ] **Every table has RLS enabled.** No exceptions, including boring
      lookup tables. "This one's fine" is the habit that eventually
      skips the one that isn't. **[auto — migration files only]**
- [ ] **Every RLS-enabled table has at least one policy — unless zero
      policies is the point.** Under RLS the *absence* of a policy is the
      enforcement. A migration ledger only the service role should touch
      is correctly locked with none. Same trick makes an event log
      append-only in the database: grant select and insert, omit update
      and delete, and no client can rewrite history. Comment the intent
      above the `alter` so the next reader knows it's deliberate. **[auto — warns]**
- [ ] **Order of operations:** write the policy *first*, then enable
      RLS. Reversed, the app goes blank until you catch up.
- [ ] **Public-read is a decision, not a default.** `for select using
      (true)` on a menu or truck listing is correct. On anything with a
      person attached to it, it isn't.
- [ ] **Check Supabase → Advisors → Security in every project**, not just
      the ones you're actively working on. It catches
      `rls_disabled_in_public` and reports it by email.
- [ ] **Schema built in the dashboard?** The script can't see it. Verify
      RLS by hand in Table Editor.
- [ ] **No card numbers, CVVs, SSNs, or routing numbers in your schema.**
      Ever. Store the Stripe customer ID. **[auto]**
- [ ] **Storage buckets:** private + signed URLs for anything
      user-uploaded. Public buckets are enumerable. **[auto]**
- [ ] **Realtime subscriptions respect RLS only if RLS is on.** Otherwise
      every subscriber receives every row change. **[auto]**

### Two policy shapes that cover most cases

```sql
-- User-owned private data (profiles, orders, subscriptions)
create policy "own rows" on your_table
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
alter table your_table enable row level security;

-- Public catalog with owner write (food trucks, listings, portfolios)
create policy "anyone can read" on your_table
  for select using (true);
create policy "owner manages" on your_table
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
alter table your_table enable row level security;
```

**The trap:** a `profiles` or `owners` table with a public read policy
because the UI needed to show a display name. That's how a phone number
ends up shipping to every visitor. Scope the columns, or split the
public fields into their own table.

---

## 2. Keys and secrets

- [ ] **Nothing secret behind `NEXT_PUBLIC_`.** That prefix means
      "compile into the browser bundle." **[auto]**
- [ ] **No hardcoded API keys** — Stripe, Resend, OpenAI, Anthropic,
      Google, GitHub, AWS. **[auto]**
- [ ] **`.env` is gitignored.** **[auto]**
- [ ] **Service-role key never in a `"use client"` file.** **[auto]**
- [ ] **Service-role key never in a route without an auth check.** It
      bypasses RLS completely — one unguarded route undoes every policy
      you wrote. **[auto]**
- [ ] **GitHub secret scanning + push protection on**, per repo.
- [ ] **Rotate anything that ever touched a commit.** Git history is
      forever; deleting the line doesn't help.

---

## 3. API routes

- [ ] **Auth check at the top of any route touching identity data**,
      returning 401 when there's no user. **[auto]**
- [ ] **Never return raw error objects to the browser.** Postgres errors
      carry table names, column names, sometimes row values. Log the
      real error server-side, return a generic message. **[auto]**
- [ ] **Name your columns.** `.select('id, display_name')`, not
      `.select('*')` — so adding an `email` column later doesn't
      silently start shipping it. **[auto]**
- [ ] **Stripe webhooks verify the signature.** Without it, anyone can
      POST a fake `payment_intent.succeeded` and get free product. **[auto]**
- [ ] **No CORS wildcard with credentials.** **[auto]**
- [ ] **Rate limit anything expensive**, especially AI routes. An
      unthrottled endpoint calling Sonnet is someone else's free Claude
      on your card. **[auto — AI routes]**
- [ ] **Validate redirect targets by resolving them, not by string
      prefix.** `startsWith('/') && !startsWith('//')` does not work: the
      URL parser normalises backslashes and strips tabs *after* your
      string test has already passed, so `?next=%2F%5Cevil.com` sails
      through and lands on `https://evil.com/`. Resolve against your own
      origin, compare `url.origin`, and redirect to the resolved absolute
      URL — never to a pathname, because `/..//evil.com` normalises to a
      pathname of `//evil.com` that goes hostile the moment anything
      resolves it again. This matters most on the auth callback: the user
      authenticates legitimately on your real domain and gets handed to
      someone else's, which is the exact shape of a credential-phishing
      page borrowing your credibility.
- [ ] **Supabase → Authentication → URL Configuration:** the Redirect
      URLs allowlist is a *second*, separate redirect gate that sits in
      front of your callback code. A wildcard entry there is an open
      redirect no amount of application-side validation can close.

---

## 4. Personal data handling

- [ ] **Never log personal data.** Vercel retains runtime logs and
      anyone with dashboard access can read them. Log an opaque ID. **[auto]**
- [ ] **No email, phone, name, or address in URL query strings.** They
      land in server logs, browser history, and the `Referer` header
      sent to every third-party script on the page. **[auto]**
- [ ] **Third-party analytics off signup, checkout, and profile pages**,
      or inputs explicitly masked. Session recorders capture keystrokes
      in form fields by default. **[auto]**
- [ ] **Collect less.** The field you never added is the field that
      can't leak.
- [ ] **Have a deletion path** before you have users asking for one.

---

## 5. AI-specific

- [ ] **Static system prompts.** Never concatenate user content into the
      system message — a screenplay or uploaded repo containing "ignore
      previous instructions" can hijack the call. Pass user content as a
      separate user message inside clear delimiters. **[auto]**
- [ ] **Don't send customer PII into prompts.** It's a third-party
      disclosure your privacy policy has to cover. Pass a first name or
      an anonymous ID if the model needs a handle. **[auto]**
- [ ] **Treat model output as untrusted** wherever it reaches the DOM —
      the `dangerouslySetInnerHTML` path is where bad output becomes
      XSS. **[auto]**
- [ ] **Log AI calls without logging their contents.** You want cost and
      abuse visibility, not a transcript of customer material.
- [ ] **File/archive intake** (XLSecure, XLCoverage): cap uncompressed
      size and entry count, reject entries whose resolved path escapes
      the extraction directory. **[auto]**

---

## 6. Per-product open questions

### XLResale — host address policy **[auto, standing reminder]**

The one exposure that's about **physical safety**, not just privacy. A
stranger reading the map learns that a LIVE sale means a specific house
is occupied by someone distracted and expecting strangers to walk up —
and that a CLOSED sale means nobody is watching a house that just
advertised it had valuables.

1. Pin precision before the sale goes live — exact, or block-level
   until start time?
2. At close — does the exact address stay, degrade, or disappear?
3. Does the address ship in the `sales_near()` payload to every
   browser, or only after a host action? **Start here.** If it does,
   pin precision in the UI is decoration — anyone can open the network
   tab and pull every host's address in a radius, including sales that
   haven't started.
4. Can a host preview what a stranger sees before publishing?
5. Is there a takedown path if a host feels unsafe mid-sale?

Record the answer in `docs/ADDRESS-POLICY.md` to clear the reminder.

### XLEats
Food truck locations are commercial and broadcasting them is the
product — no safety tension. But the **operator** account rows
(email, phone, Stripe IDs) are private and need their own policy.

### XLPeeps / XLSites
User profiles are public by intent. Split public display fields from
private account fields so a public-read policy can't reach the latter.

### XLShorts
Uploads are the moderation surface, not the PII surface — separate
concern, separate pipeline.

---

## 7. Before any product takes a real user

- [ ] Supabase Advisors clean on that project
- [ ] Both scanners passing
- [ ] Auth flow tested logged-out, logged-in, and as a *different* user
      — the third one is where RLS bugs actually show up
- [ ] Stripe webhook signature verified against a real test event
- [ ] Privacy policy exists and matches what you actually collect
- [ ] Deletion path works
- [ ] Dormant projects paused or deleted, not left running unattended

---

## 8. Limits of this kit

Pattern-matching, not analysis. It catches common mistakes, not logic
flaws. **A scanner that cries wolf on a clean repo gets switched off,
which is worse than no scanner** — so when it flags something correct,
fix the scanner, don't contort the code. Two real examples: it once
hardcoded the `public` schema and reported every correctly-secured table
in a custom schema as a blocking failure; and it matched the bare word
`adm-zip`, so the only way to satisfy it was to delete a comment
explaining why `adm-zip` was unreachable. Both are fixed. Both were the
scanner's fault. It reads migration files — dashboard-built schema is invisible
to it. It can tell you a policy exists, never that a policy is
*correct*. Semgrep and Dependabot in the workflow cover deeper ground,
and Supabase Advisors covers what the repo can't see.

Nothing here replaces looking at your own tables and asking who can
read them.
