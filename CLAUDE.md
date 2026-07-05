# CLAUDE.md — XLeats

Project context for Claude. Read this first every session.

---

## What XLeats is

A food-truck tracking + management platform. Two sides:

- **Owners/workers** manage a truck profile, menu, schedule, and posts, and tap **"Go Live"** to tell followers they're open right now — via a responsive **web dashboard**.
- **Customers** follow trucks, see who's live today, and get push notifications — via a native **mobile app** (Expo, later phase).

**Current phase: Phase 1.** Owner dashboard + shared backend. Customer app is a later phase — do not build it yet unless asked.

The Phase 1 differentiator is the **four-state live indicator** (below), NOT full Life360-style GPS tracking. Live tracking is a deliberately deferred "delight layer."

---

## The four-state live model (core concept)

A truck's status for a given day is one of four states, stored on `live_sessions.status`:

| State | Enum | Meaning | Location captured? |
|-------|------|---------|-------------------|
| 🟢 Live now | `live` | Open to public, confirmed at a pin | Yes — one GPS point on button tap |
| 🟡 Out today | `scheduled` | Public spot on schedule, not yet confirmed open | From schedule, not confirmed |
| 🟣 Catering | `catering` | Working a private event, not walk-up available | **No** — never leak client address |
| ⚪ Not out | `off` | Nothing today | No |

Key rules:
- **Green = presence + a single timestamped GPS confirmation** ("confirmed 11:02 AM at Mueller Lawn"). Foreground location only, captured once on button press — no background tracking in Phase 1.
- **Always show freshness** ("confirmed 8 min ago"), never just a colored dot.
- **Auto-expire** live status at scheduled end time or +X hours, whichever comes first. A stale green dot is the #1 failure mode — guard against it.
- **Catering is a marketing surface**: shows the truck is working + caters, with a "Request catering" CTA, but **no location** ever.

### Saved locations & saved offers (reduce daily friction)
Both are the same pattern — **reusable templates the vendor picks from instead of retyping** — and both exist to make the daily habit low-friction (which is what keeps the green dot trustworthy).
- **Saved locations:** vendor stores frequently-used spots (name + address + lat/lng). On "Go Live" they pick a saved spot and the pin is already set — no GPS-or-type step. Big friction win on the core daily action.
- **Saved offers/codes:** vendor stores reusable discount codes / offer templates (e.g. "Free dessert", "10% off"). Pick from the shelf for a promo or the birthday send instead of composing each time.

---

## Architecture

**Platform split (settled, don't revisit):** vendor side is **responsive web** (mobile-friendly, no native app — browser geolocation handles the Go Live pin); customer side is a **genuine native app** on the Apple App Store and Google Play via Expo/EAS. Web for the people managing, native for the people tracking.

- **Backend:** Supabase — Postgres + **PostGIS** (geo "near me" queries), Auth (email/password), Storage (logos, menu photos, post images), Realtime (live status broadcast).
- **Owner dashboard:** Next.js on **Vercel**. Responsive — works on desktop and mobile browser. Browser Geolocation API handles the "Go Live" pin, so **the owner side needs no native app**.
- **Customer app (later phase):** Expo / React Native — `expo-location`, `expo-notifications` (free Expo push), `react-native-maps`, EAS for builds.
- **Payments:** Stripe (free → pro upgrade). Deferrable — launch trucks free during seeding, wire Stripe when the paid tier ships.

---

## Key design decisions (don't relitigate without reason)

### Multi-truck: `accounts` → `trucks` hierarchy
An **account** (brand) sits above trucks. Trucks belong to an account, not directly to a user.
- Public URLs: `xleats.com/[slug]`, e.g. `/pueblo-viejo-01`, `/pueblo-viejo-02`.
- Central management page scoped to the account: edit a menu/post/announcement and apply to one truck or all.
- Gating: **free = 1 truck, pro = 1 truck, fleet = unlimited.** Multiple trucks is the **Fleet** tier only (see Monetization). `accounts.plan_tier` drives the check.
- Billing is per-account.
- **"Add truck" upgrade wall:** a `free`/`pro` account at its 1-truck limit that taps "Add truck" must route to the **Fleet upgrade**, not a dead error. This is the highest-intent upgrade moment — make it feel like an invitation, not a block.

### Privacy model for birthdays (enforced at row level, NOT just UI)
Customers **optionally** provide **birthday (month/day only, no year) + zip** at signup. This is the sensitive part — the whole feature is built so **trucks never see individual customer PII.**

**Dual-consent model (two separate consents, they authorize different things):**
1. **Providing the birthday** = data collection. Optional field with an encouraging note ("Add your birthday to get free food and discounts on your special day 🎂"). Unchecked/empty is fine.
2. **Receiving nearby-truck offers** = marketing contact. A *separate* checkbox: "Let nearby trucks send me birthday offers." Offers from **followed** trucks ride on the lighter default (following is already opt-in); the **nearby non-follower** blast requires this explicit check. A customer may want their birthday saved for followed trucks but not broadcast to strangers — keep the two consents distinct.
- Trucks create a standing "Birthday Offer" once.
- A daily platform-side matcher finds customers with a birthday today who follow the truck or are in radius, and sends them a one-time code via push.
- **Trucks see only aggregate stats** ("14 delivered, 6 redeemed") + a redeem-by-code flow. They **cannot** query a customer's birthday, zip, or follow list.
- This is enforced by **RLS policies and locked-down functions**, not UI hiding. Do not add any endpoint or query that exposes individual customer rows to a truck. If a feature seems to need it, redesign it through the broker pattern.

---

## Monetization, pricing & growth

### The core economic fact
**All revenue comes from vendors. Customers are always free** — that's what drives the adoption the whole two-sided network depends on. Customer accounts are the asset; vendors pay for tools to reach them.

### Tiers

**Free — forever, for everyone. Never converts to paid.**
Go Live (all four states), profile, menu, schedule, posts, public `/[slug]` page, follows.
This tier is **infrastructure, not charity** — it does two jobs you can't switch off:
1. **Seeding engine** — every truck's public page pulls customers into the platform.
2. **Trust in the dot** — Go Live being ubiquitous is what makes customers believe the green dot. Paywalling it would make the core feature feel broken whenever a truck isn't paying.
Because Go Live is free, **a lapsed Pro vendor never goes dark** — they fall back to free, keep their page and Go Live, and just lose the money features. Design consequence: **Pro can never use "pay or lose your page" pressure. It must sell upside (money made), not hostages.**

**Pro — ~$20/mo (entry price; annual = ~2 months free / ~15–17% off).**
The money-making layer: discount codes, contests, the birthday engine + birthday upsell teasers, push blasts to followers, the "Order Online" button, and analytics.

**Fleet — top tier, higher price.**
Everything in Pro **plus more than one truck** and the bulk/cross-truck management that only matters with several: unlimited trucks, bulk announcements, cross-truck analytics.
Rationale: multi-truck operators are established businesses that can absorb the price, and hand-managing 3+ trucks is painful enough that the jump is a no-brainer for them. Defining the tier by a single axis — **more than one truck** — keeps it trivial to explain and gate.

**Gating split (three tiers, two independent checks):**
- `plan = free | pro | fleet`.
- **Promos / birthday engine / push blasts / Order Online / analytics** gate on **`pro` or above**.
- **2nd-plus truck + bulk/cross-truck tools** gate on **`fleet`**.
- So a single-truck vendor gets the full money-making feature set at Pro; Fleet is purely the multi-truck jump.

### Founding-vendor program (per metro, NOT global)
Seeding is **per-metro** — each new city restarts cold-start from zero, so the founding perk **refreshes per metro** (first ~20–30 trucks in *each* city).
- Perk: **free Pro for 12 months + a locked-in founding rate for life** (e.g. $12 vs $20). Avoids the permanent liability of "free Pro forever" while keeping the loyalty payoff.
- Only open **paid** Pro signups in a metro once it has real customer density. Apply the "wait for a customer base" rule *locally*, not globally.

### Distribution flywheel (why the model is durable)
Vendors run XLeats's customer acquisition for free: they blast their existing social following and post **QR flyers** on the truck, telling fans to download the app. **Once a customer creates an account, the relationship is platform-owned, not vendor-owned** — they can search all local trucks, see everyone's promos, and follow many. So when a vendor lapses or leaves, **their customers stay on the platform** for every other vendor to market to. Vendors are the acquisition *channel*; the customer base is XLeats's asset.
- **Caveat — weak early, strong at scale:** in a brand-new metro where a customer follows only the one truck that got them to download, that truck leaving *can* still lose the customer. The retention benefit grows with local density → one more reason for per-metro seeding discipline.

### Upsell engine: quantified value-gap teasers
The reusable pattern for making paid tiers a no-brainer: **quantify what a free vendor is leaving on the table, at the moment it's live, with one-click trial.** Build it once as a pattern; every Pro feature gets a contextual nudge. Examples:
- **Birthday (flagship):** "3 of your followers have birthdays today — plus 15 local customers with birthdays who don't follow you. Pro lets you send them all a promo. Try Pro free for 14 days?" Free vendor sees the *count*, can't act; Pro brokers the send. Fully consistent with the privacy/broker model (counts only, never identities).
- "Your live session got 40 profile views today — Pro turns views into orders with a one-tap code."
- "You have 120 followers; a push blast reaches all of them — free vendors can't send blasts."

Rules for the teasers:
- **Consent for non-follower outreach:** customers must control offers from trucks they don't follow. Default: offers from *followed* trucks on; offers from *nearby non-followed* trucks **opt-in**. Cap non-follower offers per customer per day so a birthday isn't 10 pings. This is a trust + app-store requirement, not optional. **This customer-side consent is the one rule that always holds** — the counts below only include customers who opted into nearby offers.
- **Free-tier tease vs paid-tier action — different rules:**
  - **Free vendor** seeing an upsell teaser they can't act on → **threshold-gate it** (fire only when the number is worth acting on), or they learn to ignore it.
  - **Paid vendor (Pro/Fleet) getting an actionable prompt → fire it every time, no threshold.** They paid for exactly this. The flagship: the moment a paid vendor **goes live**, prompt "12 potential new customers within 10 miles have birthdays today — send them a discount code?" with a one-tap send. This is meant to be a **daily ritual**, not a rare nudge. Timing is deliberate (they're open, they want customers *now*).
- **Design rationale — why the birthday send is worth more than one meal:** a birthday customer is a *high-emotion* customer, and high-emotion experiences are what people post about. The send buys a shot at word-of-mouth from someone predisposed to be delighted, not just a single discounted plate. Make it effortless and daily.
- Trial mechanics — open decision: **card-required** (higher paid conversion, fewer starts) vs **card-free** (more starts, more tire-kickers). Lean card-free for a viral seeding product; revisit.

---

## Go-to-market (geography)

Founder is based in **Tyler, TX** (East Texas, ~90 mi east of Dallas). Seeding is **per-metro** (founding perks refresh for each new metro — see Monetization), and the geography splits into three distinct plays:

- **Tyler = beachhead.** Seed here first, precisely *because* it's not Dallas. Founder can do the unscalable work in-person — visit truck spots and events, sign vendors face-to-face, hand out QR flyers directly. Mid-size East Texas market is less contested (national apps chase big metros), and it's small enough to actually **saturate**: ~20–30 live trucks makes the app feel full to a Tyler customer. A small pond you can saturate beats a big one you can only sprinkle.
- **East Texas = one connected region.** Tyler, Longview, Marshall, Kilgore, etc. can be treated as a single region — trucks and customers move between these towns, so density compounds across them rather than being siloed per town.
- **Dallas / DFW = growth market, second.** Far more trucks (the upside) but bigger, more spread out, more competition, and **can't be hand-seeded on foot**. Enter it with a *proven playbook*, not while still learning. Sequence: prove the full loop in Tyler (vendors show up → customers follow → green dot gets trusted → birthday/promo engine drives real traffic), then take the working motion into DFW.

**Founder as test user:** based in Tyler, the founder can watch every feature work (or not) with real local trucks and customers before scaling — Go Live, saved locations, the birthday prompt, the QR flyer. Wire up a couple of friendly Tyler trucks first and let them surface what's clunky. This in-market feedback loop is worth more than planning.

---

## Repo structure

```
supabase/
  schema.sql        # run FIRST in Supabase SQL editor
  functions.sql     # run SECOND (functions, cron logic, birthday matcher)
app/                # Next.js owner dashboard
  (auth)/           # login, signup
  dashboard/        # account home, per-truck hub
    menu/           # menu CRUD
    schedule/       # schedule builder
    posts/          # posts composer
    promos/         # Pro-tier: discount codes, contests, birthday stats
  api/
    live/           # backs the Go Live control
    cron/           # expire-sessions + birthday-matcher endpoints
lib/                # Supabase client wiring, types
vercel.json         # cron schedules declared here
README.md           # setup checklist
```

---

## Database schema (summary)

Tables: `profiles`, `accounts`, `trucks`, `truck_members`, `menu_items`, `schedules`, `posts`, `follows`, `live_sessions`, `catering_requests`, `devices` (expo push tokens), `discount_codes`, `contests`, `contest_entries`, plus birthday-offer broker tables.

Enums: `status` = `live | scheduled | catering | off`; `plan` = `free | pro | fleet`.

`live_sessions` shape:
```
id, truck_id, date, status, started_at, expires_at,
confirmed_lat, confirmed_lng, confirmed_address, catering_note
```
`confirmed_*` are null for catering/off. `catering_note` is an optional light touch ("Available again Thursday").

Full column definitions live in `supabase/schema.sql` — treat that file as source of truth.

> Schema additions implied by the monetization design (not yet in schema.sql — add when building):
> - `plan` enum expands to `free | pro | fleet` (was `free | pro`). Update the enum + any gating checks.
> - `trucks.order_url` (or `accounts`-level) — the generic "Order Online" link.
> - Birthday is **nullable/optional** on the customer profile (month/day only).
> - Customer consent fields — `allow_offers_from_followed` (default true) and `allow_offers_from_nearby` (**default false**, the explicit signup checkbox), plus a per-day offer cap. These are two distinct consents.
> - Founding-vendor tracking — founding rate / comp window per account, scoped per metro.
> - `saved_locations` table (truck or account scoped: name, address, lat, lng) — reused on Go Live.
> - `saved_offers` table (reusable code/offer templates) — reused for promos and the birthday send.

---

## What's built and working (Phase 1 scaffold)

- Auth (email/password) + onboarding.
- Account + multi-truck creation, with **tier gating** (free/pro = 1 truck, fleet = unlimited — note: scaffold currently assumes 2-state plan; update to `free | pro | fleet`).
- **The signature one-tap live control**: captures browser GPS, writes a `live_sessions` row with `expires_at`, handles all four states.
- Menu CRUD.
- Schedule builder (weekly recurring + one-off overrides).
- Posts composer (text + optional image field).
- Pro-tier promos page: discount codes, contests, and the birthday offer with delivered/redeemed aggregate stats.
- `api/live` route + both cron endpoints (expire stale sessions, birthday matcher), declared in `vercel.json`.
- Street-food visual identity (order-ticket cards, paprika accent, signage type) — the live control is the one bold element. Not a generic SaaS look.

**Build status:** compiles clean, all routes type-check.

---

## What's stubbed / still TODO

Marked `TODO(phase1)` in code:

1. **Public truck page `/[slug]`** — ⭐ highest-leverage next task. Data + RLS already exist; it's largely a read-only render (live status, menu, schedule, posts, catering CTA). This is what makes a truck shareable on Instagram and unlocks truck-first seeding.
2. **QR flyer generator** — auto-generated, printable flyer in the dashboard with the truck's `/[slug]` QR baked in. Every vendor gets a ready-to-post customer-acquisition asset the day they sign up. Core to the distribution flywheel.
3. **"Order Online" button** — a single `order_url` field (Pro-gated) that renders a branded button. Provider-agnostic (UberEats / DoorDash / Square / Toast / own site). **Do NOT build a UberEats-specific API integration** — most trucks aren't on UberEats (delivery assumes a fixed address; trucks move). Square is the more truck-native tool. This is the low-effort bridge to the deferred Phase 3 order-ahead.
4. **Photo upload to Storage** — buckets are created; wire the actual upload for logos, menu photos, post images. (Menu/posts currently take a URL field, not a real upload.)
5. **Push fan-out to followers** — the notification trigger (live-session-goes-live / new-post → look up followers → send Expo push). Backend function. Also powers the birthday sends and upsell teasers.
6. **Upsell teaser engine** — the quantified value-gap nudges (birthday flagship + others), with consent gating and threshold triggers. See Monetization section.
7. **Schedule map-pin picker** — schedule currently takes address/lat/lng; add a visual pin picker.
8. **Saved locations & saved offers** — reusable templates: saved spots picked on Go Live (pin pre-set), saved codes/offers picked for promos and the birthday send. Low effort, high daily-friction payoff.
9. **Go-live birthday prompt (paid vendors)** — on go-live, a paid vendor sees "N nearby customers have birthdays today — send a code?" with one-tap send. Fires every time (no threshold); pulls from the consent-gated nearby pool. Part of the upsell/notification engine.
8. **Stripe checkout (free → pro → fleet)** — the upgrade flow that flips `plan_tier` across three tiers, including the 14-day Pro trial, founding-vendor comp/rate handling, and the **"add truck" → Fleet upgrade wall** (a free/pro account at its 1-truck limit tapping "Add truck" routes to Fleet checkout, framed as an invitation).

---

## Known coding issues & gotchas

- **Google Fonts / `next/font`:** the build sandbox blocked Google Fonts, so fonts were briefly swapped to system fonts during validation, then **restored**. `next/font` fetches fine on Vercel — if you hit a font fetch error in a restricted environment, that's the network, not the code.
- **Strict-mode cookie handlers:** the Supabase middleware cookie handlers needed explicit type annotations under TS strict mode. Already fixed — keep the annotations if you touch middleware.
- **Contests — count-based promos** ("100th customer today") **can't auto-detect** the Nth customer in Phase 1 (no POS/ordering). Ship as owner-advertised with a manual tap-counter, or defer to Phase 3. Prediction/entry contests ("guess the Cowboys score") are fully buildable now.
- **Promotions/sweepstakes legal:** contests are technically promotions with per-state rules. Bake a generic official-rules/"no purchase necessary" template into the contest creator. Not legal advice — flag for the owner to check their state.

---

## Setup steps (owner is doing these)

1. New Supabase project → run `supabase/schema.sql`, then `supabase/functions.sql`. Enable PostGIS.
2. New GitHub repo → push the scaffold.
3. New Vercel project → connect repo, add Supabase env vars (URL + anon key + service role for crons), confirm the crons in `vercel.json` register.
4. Storage buckets for logos / menu photos / post images.

Accounts needed later (customer app phase): Expo/EAS, Apple Developer ($99/yr), Google Play ($25 one-time). Not needed for Phase 1.

---

## Recommended next-task order

1. **Public truck page `/[slug]`** (unlocks seeding).
2. **QR flyer generator** (arms vendors for the acquisition flywheel).
3. **Photo upload** (makes profiles/menus real).
4. **Stripe upgrade flow + Pro trial** (turns on monetization).
5. **"Order Online" button** (quick Pro value-add).
6. **Push fan-out + upsell teaser engine** (pairs with the customer app).

---

## Working conventions

- Owner side stays **responsive web** — don't reach for native on the owner side.
- Never expose individual customer PII to a truck. Route anything birthday/follower-related through the broker pattern + RLS. Counts and brokered sends only.
- **Free tier (incl. Go Live) is permanent and universal.** Pro sells upside, never "pay or go dark."
- Founding perks and the "wait for customers" rule are **per-metro**, not global.
- `schema.sql` is the source of truth for data shape — keep app types in sync with it.
- Preserve the four-state model and the freshness/auto-expire safeguards; they're the differentiator.
