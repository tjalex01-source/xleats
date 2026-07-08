# CLAUDE.md — XLeats

Project context for Claude. Read this first every session.

---

## What XLeats is

A food-truck tracking + management platform. Two sides:

- **Owners/workers** manage a truck profile, menu, schedule, and posts, and tap **"Go Live"** to tell followers they're open right now — via a responsive **web dashboard**.
- **Customers** follow trucks, see who's live today, and get push notifications — via a native **mobile app** (Expo, later phase).

**Current phase: Phase 1.** Owner dashboard + shared backend, now well beyond initial scaffold (see "What's built" below — admin tooling, Fleet menu sync, and Order Online are all live). Customer app is a later phase — do not build it yet unless asked.

The Phase 1 differentiator is the **live-status indicator** (below), NOT full Life360-style GPS tracking. Live tracking is a deliberately deferred "delight layer."

---

## The live model (core concept)

A truck's status for a given day is one of **five states**, stored on `live_sessions.status` (Postgres enum `live_status`):

| State | Enum | Meaning | Location captured? |
|-------|------|---------|-------------------|
| 🟢 Live now | `live` | Open to public, confirmed at a pin | Yes — one GPS point on button tap |
| 🟡 Out today | `scheduled` | Public spot on schedule, not yet confirmed open | From schedule, not confirmed |
| 🟣 Catering | `catering` | Working a private event, not walk-up available | **No** — never leak client address |
| ⚪ Currently offline | `off` | Hasn't said anything today | No |
| 🔴 Closed today | `closed` | Genuinely not operating today (distinct from "haven't confirmed yet") | No |

**`closed` vs `off` is a deliberate, user-requested distinction** — "closed today" and "haven't gone live yet" are two different facts to a vendor and to a follower, so they get separate states rather than collapsing into one generic "not live." The vendor dashboard (`StatusControl`) exposes both as a true toggle (green Go Live ↔ gray Go Offline) plus a persistent "Scheduled today" / "Closed today" button pair — don't re-merge these back into four states without the user re-raising it.

Key rules:
- **Green = presence + a single timestamped GPS confirmation** ("confirmed 11:02 AM at Mueller Lawn"). Foreground location only, captured once on button press — no background tracking in Phase 1.
- **Always show freshness** ("confirmed 8 min ago"), never just a colored dot.
- **Auto-expire** live status at scheduled end time or +X hours, whichever comes first — enforced by the `expire` cron. A stale green dot is the #1 failure mode — guard against it.
- **Catering is a marketing surface**: shows the truck is working + caters, with a "Request catering" CTA, but **no location** ever. On the public schedule view, a catering day always displays as "Closed" to the public — never leak that it's a private event.

### Saved locations & saved offers (reduce daily friction)
Both are the same pattern — **reusable templates the vendor picks from instead of retyping** — and both exist to make the daily habit low-friction (which is what keeps the green dot trustworthy).
- **Saved locations — built.** Truck-scoped (`saved_locations` table: name, address, lat/lng). Used both on the schedule builder and picked from a dropdown when adding a day/slot — no retyping an address every week. Vendors can also set **multiple locations per day** (e.g. a morning spot + an afternoon spot, or a spot + private catering) — schedules are not limited to one row per day.
- **Saved offers/codes — built, as the general Promos "Offers" system** (see "Promos page — built" below): discount codes, plus birthday/holiday/welcome/custom offers, are all vendor-managed reusable templates now.

---

## Architecture

**Platform split (settled, don't revisit):** vendor side is **responsive web** (mobile-friendly, no native app — browser geolocation handles the Go Live pin); customer side is a **genuine native app** on the Apple App Store and Google Play via Expo/EAS. Web for the people managing, native for the people tracking.

- **Backend:** Supabase — Postgres + **PostGIS** (geo "near me" queries), Auth (email/password + Google OAuth; Facebook OAuth is configured but hidden pending Meta business verification), Storage (menu photos, menu-board photos, post images — logos/banners are still URL-only, see TODO), Realtime (live status broadcast).
- **Owner dashboard:** Next.js 14 (App Router) on **Vercel**. Responsive — works on desktop and mobile browser. Browser Geolocation API handles the "Go Live" pin, so **the owner side needs no native app**.
- **Customer app (later phase):** Expo / React Native — `expo-location`, `expo-notifications` (free Expo push), `react-native-maps`, EAS for builds.
- **Payments:** Stripe (free → pro → fleet upgrade). Not yet wired — trucks are currently comped/managed manually via the admin panel. Deferrable — launch trucks free during seeding, wire Stripe when the paid tier ships.
- **Migrations:** run directly against the linked Supabase project via `npx supabase db query --linked --file <path>` (Supabase CLI is linked to the repo). Always append `notify pgrst, 'reload schema';` to DDL migrations — PostgREST caches schema separately from the direct Postgres connection the CLI uses, so new columns/tables are invisible to the app until that fires.
- **`supabase/schema.sql` is the living source of truth** — every migration that lands in the live DB also gets folded back into this file in the same change, so it always mirrors production shape.

---

## Key design decisions (don't relitigate without reason)

### Multi-truck: `accounts` → `trucks` hierarchy
An **account** (brand) sits above trucks. Trucks belong to an account, not directly to a user.
- Public URLs: `xleats.com/[slug]`, e.g. `/pueblo-viejo-01`, `/pueblo-viejo-02`.
- Gating: **free = 1 truck, pro = 1 truck, fleet = unlimited.** Multiple trucks is the **Fleet** tier only (see Monetization). `accounts.plan` drives the check.
- Billing is per-account.
- **"Add truck" upgrade wall:** a `free`/`pro` account at its 1-truck limit that taps "Add truck" routes to the Fleet upsell messaging, not a dead error.
- **Fleet menu sync — built, and it's a true sync, not per-truck duplication.** `menu_items` is **account-scoped** (not truck-scoped), with `applies_to_all_trucks` boolean + a `menu_item_trucks` join table for items scoped to specific trucks within the fleet. Editing a synced item once updates it everywhere it applies — this was an explicit architecture change (menu items used to be truck-scoped) specifically so Fleet vendors don't have to re-enter the same item on every truck.
- **Per-field "apply to all trucks in my fleet" is the open next step for truck *settings*** (name/cuisine/bio/socials/etc., as distinct from menu items) — see the in-progress Settings redesign below; not built yet.

### Privacy model for birthdays (enforced at row level, NOT just UI)
Customers **optionally** provide **birthday (month/day only, no year) + zip** at signup. This is the sensitive part — the whole feature is built so **trucks never see individual customer PII.** (Not yet built — see TODO — but the model is locked and should not be redesigned casually.)

**Dual-consent model (two separate consents, they authorize different things):**
1. **Providing the birthday** = data collection. Optional field with an encouraging note ("Add your birthday to get free food and discounts on your special day 🎂"). Unchecked/empty is fine.
2. **Receiving nearby-truck offers** = marketing contact. A *separate* checkbox: "Let nearby trucks send me birthday offers." Offers from **followed** trucks ride on the lighter default (following is already opt-in); the **nearby non-follower** blast requires this explicit check. A customer may want their birthday saved for followed trucks but not broadcast to strangers — keep the two consents distinct.
- Trucks create a standing "Birthday Offer" once.
- A daily platform-side matcher finds customers with a birthday today who follow the truck or are in radius, and sends them a one-time code via push.
- **Trucks see only aggregate stats** ("14 delivered, 6 redeemed") + a redeem-by-code flow. They **cannot** query a customer's birthday, zip, or follow list.
- This is enforced by **RLS policies and locked-down functions**, not UI hiding. Do not add any endpoint or query that exposes individual customer rows to a truck. If a feature seems to need it, redesign it through the broker pattern.

### Admin panel — built, not in earlier drafts of this doc
`xleats.com/admin`, gated by a service-role admin client re-verified against an `ADMIN_EMAILS` env-var allowlist on **every** server action call (never trust client-side gating alone). Capabilities:
- Search/list vendors, **suspend/unsuspend** a truck (enforced on both dashboard and public page reads).
- **Comp Pro/Fleet plan access** for a set duration without touching Stripe (`plan_expires_at` + a daily `plan-expire` cron that reverts comped accounts back to free).
- **Announcements** — message all followers of an account, or hand-pick specific vendor accounts via a searchable multi-select (`AccountPicker` / `AnnouncementRecipients`), rendered to vendors via `AnnouncementsList` on the dashboard.
- Backed by crons: `seed-status` (daily, seeds each truck's status from its schedule), `weekly-reminder` (nudges vendors who haven't set a schedule), `plan-expire` (reverts expired comps). All Bearer-token-gated via `CRON_SECRET`, registered in `vercel.json`.

---

## Monetization, pricing & growth

### The core economic fact
**All revenue comes from vendors. Customers are always free** — that's what drives the adoption the whole two-sided network depends on. Customer accounts are the asset; vendors pay for tools to reach them.

### Competitive positioning — commission-free ("we never take a cut")
**The category's revenue models, and why XLeats is different:**
- **BFT:** free software; makes money on a **convenience fee charged to the truck** on the business it routes (BFT holds the payment and deposits it minus the cut). The truck bears the fee.
- **Third-party delivery (UberEats/DoorDash):** **15–30% commission** off the top of the truck's sales — the fee trucks resent most.
- **Roaming Hunger (catering):** service fee **starting ~7% of the booking, added to the host/buyer** (rises with complexity — e.g. ~$105+ on a $1,500 event), plus a vendor revenue-share on some events. Vendors often "keep their bid," but the buyer-side markup can price the truck higher to the customer.
- **XLeats:** sits in **neither side** of the transaction — the Order Online / catering flows send the customer straight to the truck. So XLeats **takes no cut from the truck AND adds no markup to the customer.** Revenue is subscription-only (it structurally *can't* skim a sale it never touches).

**The pitch (vendor-facing):**
- "We **NEVER** take a piece of your sale. If our app drives a catering customer to you, you keep **100%**."
- "We don't mark up your price to your customer either — you quote your rate, they pay exactly that." (Directly counters RH's buyer-side markup — a truck routing leads through XLeats can undercut a marked-up quote and win the job.)
- "**We support local. We support food trucks.**"
- **Catering math (sharpest version):** catering is the highest-dollar transaction a truck does, so avoided fees are largest there. Even the *gentlest* competitor fee — RH's ~7% buyer markup — is ~$105 on one $1,500 event, **more than 5 months of XLeats at $20/mo, from a single booking.** Against delivery's 15–30% it's no contest. One catering lead pays for the year; XLeats adds zero on either side.

**Deliberate tradeoff (captured, not a bug):** taking nothing from catering means **choosing to walk past the most lucrative revenue line in the space** — the exact cut RH built a company on. Intentional: trades per-transaction revenue for trust, a clean brand, and vendor loyalty. Catering upside is monetized indirectly (subscription value; later, premium catering-tools / lead-gen features), never a cut.

**Consequence — the flat fee must keep proving itself:** a commission only charges when the truck sells; a $20 subscription hits monthly regardless. So Pro's value must stay **visible** (birthday prompt, promos, discovery filters driving real traffic) so the fee always feels earned, even in a slow month. Commission/markup models self-justify by only charging on money already moving; a subscription has to demonstrate value continuously.

### Tiers

**Free — forever, for everyone. Never converts to paid.**
Go Live (all states), profile, menu (including Fleet sync if applicable), schedule, posts, public `/[slug]` page, follows, **Order Online link-out** (deliberately available on Free, not gated — see Working conventions).
This tier is **infrastructure, not charity** — it does two jobs you can't switch off:
1. **Seeding engine** — every truck's public page pulls customers into the platform.
2. **Trust in the dot** — Go Live being ubiquitous is what makes customers believe the green dot. Paywalling it would make the core feature feel broken whenever a truck isn't paying.
Because Go Live is free, **a lapsed Pro vendor never goes dark** — they fall back to free, keep their page and Go Live, and just lose the money features. Design consequence: **Pro can never use "pay or lose your page" pressure. It must sell upside (money made), not hostages.**

**Pro — ~$20/mo (entry price; annual = ~2 months free / ~15–17% off).**
The money-making layer: discount codes, contests, the birthday engine + birthday upsell teasers, push blasts to followers, and analytics. (Order Online is Free-tier, per above — it's a link-out, not a money feature.)

**Fleet — multi-truck tier, higher price.**
Everything in Pro **plus more than one truck** and the bulk/cross-truck management that only matters with several: multiple trucks, true menu sync across trucks, bulk announcements, cross-truck analytics.
Rationale: multi-truck operators are established businesses that can absorb the price, and hand-managing several trucks is painful enough that the jump is a no-brainer for them.

**Enterprise — custom / "contact us" (not a published price).**
For large regional or national operators (e.g. a Kona Ice-scale company with hundreds/thousands of trucks). **Do NOT cap these with a flat tier** — a flat "$200/mo unlimited" would drastically *undercharge* a 2,000-truck company. This is an enterprise *sale* (contract, invoicing, account manager, possible custom features), not a self-serve tier. Price **per-truck or negotiated**, so revenue scales with the value delivered (each truck gets local discovery in its market). **Not yet added to the `account_plan` enum** — currently still `free | pro | fleet`; add `enterprise` and/or a per-truck billing model when pricing shape locks.

> **Open decision — multi-truck pricing shape (leaning, not locked):**
> Recommended structure is **Free / Pro (1 truck) / Fleet (multi-truck) / Enterprise (custom)**. Within Fleet, **per-truck pricing** (first truck ~$20, each additional at a volume-discounted rate) is cleaner than stacking flat sub-tiers — it price-discriminates smoothly by size with no arbitrary cutoff to game. Exact tiers/prices are **deliberately loose pre-launch**. The one thing to lock *now*: never put a low flat ceiling above the largest possible customers (keep the Enterprise/per-truck escape hatch).

**Gating split (three tiers today, two independent checks):**
- `account_plan = free | pro | fleet`.
- **Promos / birthday engine / push blasts / analytics / catering menu** gate on **`pro` or above**.
- **2nd-plus truck + bulk/cross-truck tools (Fleet menu sync, admin bulk announcements)** gate on **`fleet`**.
- Order Online is the one exception to the "money features are Pro+" rule — it's Free, by explicit decision, because it's a link-out with no XLeats revenue attached and blocking it would just push vendors to advertise their Square link elsewhere.

### Founding-vendor program (per metro, NOT global)
Seeding is **per-metro** — each new city restarts cold-start from zero, so the founding perk **refreshes per metro** (first ~20–30 trucks in *each* city).
- Perk: **free Pro for 12 months + a locked-in founding rate for life** (e.g. $12 vs $20). Avoids the permanent liability of "free Pro forever" while keeping the loyalty payoff. (The admin panel's "comp Pro/Fleet for N days" tool is the manual mechanism for this today, ahead of Stripe.)
- Only open **paid** Pro signups in a metro once it has real customer density. Apply the "wait for a customer base" rule *locally*, not globally.

### Distribution flywheel (why the model is durable)
Vendors run XLeats's customer acquisition for free: they blast their existing social following and post **QR flyers** on the truck, telling fans to download the app. **Once a customer creates an account, the relationship is platform-owned, not vendor-owned** — they can search all local trucks, see everyone's promos, and follow many. So when a vendor lapses or leaves, **their customers stay on the platform** for every other vendor to market to. Vendors are the acquisition *channel*; the customer base is XLeats's asset.
- **Caveat — weak early, strong at scale:** in a brand-new metro where a customer follows only the one truck that got them to download, that truck leaving *can* still lose the customer. The retention benefit grows with local density → one more reason for per-metro seeding discipline.

### Upsell engine: quantified value-gap teasers
Not yet built (see TODO). The reusable pattern for making paid tiers a no-brainer: **quantify what a free vendor is leaving on the table, at the moment it's live, with one-click trial.** Build it once as a pattern; every Pro feature gets a contextual nudge. Examples:
- **Birthday (flagship):** "3 of your followers have birthdays today — plus 15 local customers with birthdays who don't follow you. Pro lets you send them all a promo. Try Pro free for 14 days?" Free vendor sees the *count*, can't act; Pro brokers the send. Fully consistent with the privacy/broker model (counts only, never identities).
- "Your live session got 40 profile views today — Pro turns views into orders with a one-tap code."
- "You have 120 followers; a push blast reaches all of them — free vendors can't send blasts."

Rules for the teasers:
- **Consent for non-follower outreach:** customers must control offers from trucks they don't follow. Default: offers from *followed* trucks on; offers from *nearby non-followed* trucks **opt-in**. Cap non-follower offers per customer per day so a birthday isn't 10 pings. This is a trust + app-store requirement, not optional. **This customer-side consent is the one rule that always holds** — the counts below only include customers who opted into nearby offers.
- **Free-tier tease vs paid-tier action — different rules:**
  - **Free vendor** seeing an upsell teaser they can't act on → **threshold-gate it** (fire only when the number is worth acting on), or they learn to ignore it.
  - **Paid vendor (Pro/Fleet) getting an actionable prompt → fire it every time, no threshold.** They paid for exactly this. The flagship: the moment a paid vendor **goes live**, prompt "12 potential new customers within 10 miles have birthdays today — send them a discount code?" with a one-tap send. This is meant to be a **daily ritual**, not a rare nudge.
- **Design rationale — why the birthday send is worth more than one meal:** a birthday customer is a *high-emotion* customer, and high-emotion experiences are what people post about. The send buys a shot at word-of-mouth from someone predisposed to be delighted, not just a single discounted plate. Make it effortless and daily.
- Trial mechanics — open decision: **card-required** vs **card-free**. Lean card-free for a viral seeding product; revisit.

### Customer-side discovery filters (demand-pull upsell engine)
Not yet built. The birthday teaser inverted to the customer side: **customer demand becomes vendor upgrade pressure.** In the customer app, offer a shelf of one-tap discovery filters — "Show me a truck with a contest near me today," "trucks with a promo today," "birthday offers near me," "new menu drops." Each filter **only surfaces Pro+ vendors**, so every time a customer taps one, it's simultaneously a customer delight and a reason for vendors to upgrade to appear there.
- Consent-based and customer-benefit-framed, exactly like the birthday model.
- **Feeds the vendor upsell teaser with real demand signals:** the searches are logged as aggregate counts, so a free vendor can be told "17 customers searched for contests near you today — you didn't appear. Start a 14-day trial?"
- **Density caveat:** early in a metro these can return empty, which reads as broken. Soften the empty state or hide a filter until enough Pro vendors exist to populate it.

---

## Go-to-market (geography)

Founder is based in **Tyler, TX** (East Texas, ~90 mi east of Dallas). Seeding is **per-metro** (founding perks refresh for each new metro — see Monetization), and the geography splits into three distinct plays:

- **Tyler = beachhead.** Seed here first, precisely *because* it's not Dallas. Founder can do the unscalable work in-person — visit truck spots and events, sign vendors face-to-face, hand out QR flyers directly. Mid-size East Texas market is less contested, and it's small enough to actually **saturate**: ~20–30 live trucks makes the app feel full to a Tyler customer.
- **East Texas = one connected region.** Tyler, Longview, Marshall, Kilgore, etc. can be treated as a single region — density compounds across them rather than being siloed per town.
- **Dallas / DFW = growth market, second.** Far more trucks (the upside) but bigger, more spread out, more competition, and **can't be hand-seeded on foot**. Enter it with a *proven playbook*, not while still learning.

**Founder as test user:** based in Tyler, the founder can watch every feature work (or not) with real local trucks and customers before scaling. `xands-bbq` is the current live test truck used for this. This in-market feedback loop is worth more than planning.

---

## Feature specs (menu, reviews, adopts, non-goals)

Much of this was gleaned from studying **Best Food Trucks (BFT)** — a mature, *ordering-first* competitor. Key insight: most of what BFT sells (contactless ordering, pre-orders, cart upsell, wireless printing, auto-deposits, auto-86, their "customer for life" capture) is **downstream of the fact that they process the order + payment.** XLeats deferred native ordering to Phase 3, so those are explicit deferrals, not oversights.

### Menu system — mostly built already
- **Categories, description field, "New Item" badge (`is_new`), photo upload per item, whole-menu-board photo upload, Fleet sync (`applies_to_all_trucks` + `menu_item_trucks`), separate Pro/Fleet-gated catering menu (`is_catering`) — all built.**
- **Manual "86 / sold out" toggle** — still TODO. `menu_items.is_available` exists in schema; just needs a prominent one-tap surface on the vendor dashboard.
- **Dietary/allergy tags** per item (GF, DF, VG, VE, nut-free, spicy, etc.) — TODO. Cheap (tags field + icon render), doubles as structured data for future customer-app discovery filters.
- **"Limited today" count (optional)** — TODO. Vendor sets a starting count and taps it down; drives customer-facing urgency.
- **Multiple menus from a shared item pool** (breakfast / lunch / catering) — **Phase 2**, not a Phase 1 scramble. The current catering-menu split via `is_catering` covers the immediate need.
- **OUT OF SCOPE until native ordering:** true automated 86'ing, add-ons/combos/"build your own." Do NOT put auto-86 on the roadmap.
- **Photos are the hero** on the public `/[slug]` page — treat photographed items as a hero element, not a table below the fold. (Built.)

### Reviews — hybrid carousel model (RESOLVED, not yet built)
- **4–5★ reviews** auto-fold into a **public carousel** on the truck's `/[slug]` page — a marketing highlight reel.
- **Below 4★** routes **privately to the vendor** as feedback. No review wasted.
- Framing: a **curated testimonials wall, not a neutral rating system** — present it as "highlights."
- **Consent to display:** the customer okays having their review + handle shown publicly before it enters the carousel.

### Other BFT adopts (ordering-independent, not yet built unless noted)
- **Social auto-share on go-live** — one-tap share of the `/[slug]` link to Instagram/Facebook when a vendor goes live.
- **Expanded employee permissions** — grow `truck_members.can_go_live` into granular toggles: go-live, edit-menu, post, view-analytics.
- **Engagement analytics layer** — profile views, follower growth, go-live frequency, promo/birthday redemptions, best-performing spot by reach.
- **Calendar sync** — schedule → Google Calendar.

### Explicit NON-GOALS (for now)
- **Booking marketplace / "we find you work"** — that's a whole *second business* (demand aggregation + lot management + sales-ops), not software. Keep the lightweight catering-request CTA (built — `catering_requests` table); treat "become a booking agent" as a non-goal.
- **Native ordering / payment processing** — Phase 3. The "Order Online" button (link-out, built) is the Phase 1 bridge.
- **Aggressive cross-marketing without consent** — XLeats deliberately does consent-gated, brokered offers only. Trades some marketing punch for trust + app-store safety, on purpose.

---

## Repo structure (actual, as of this writing)

```
supabase/
  schema.sql              # source of truth — kept in sync with every live migration
  *.sql                   # one-off migration files, run via `npx supabase db query --linked --file <path>`
src/
  app/
    (marketing)            # /, /pricing, /privacy, /terms
    login/, signup/         # email/password + Google OAuth (Facebook configured, hidden)
    [slug]/                 # public truck page — fully built
    order/                  # "leaving XLeats" interstitial for Order Online
    admin/                  # admin panel (layout, page, actions, announcements)
    dashboard/
      page.tsx               # account home
      settings/              # ACCOUNT-level settings (name, email/profile)
      new-truck/
      trucks/[truckId]/
        page.tsx               # per-truck hub + StatusControl
        settings/              # TRUCK-level settings (TruckSettingsForm) — being redesigned, see below
        menu/
        schedule/
        posts/
        promos/                # Pro-tier: discount codes, contests, birthday stats
    api/
      live/                    # backs the Go Live control
      catering/                # public catering-request submission
      cron/
        expire/                  # auto-expire stale live sessions
        seed-status/             # daily: seed status from schedule
        weekly-reminder/         # nudge vendors with no schedule set
        plan-expire/             # revert expired comped plans
        birthdays/               # birthday matcher (stubbed, not fully wired)
  components/                 # StatusControl, TruckSettingsForm, AccountSettingsForm, admin/*
  lib/
    supabase/
      client.ts, server.ts     # createClient (cookie-bound), createPublicClient (cookie-free, for ISR), createAdminClient (service role)
    admin.ts                   # isAdminEmail / requireAdmin
    format.ts                  # formatTime12 — 24h storage, 12h display only
    types.ts                   # kept in sync with schema.sql
vercel.json                  # cron schedule registrations
```

---

## Database schema (summary — schema.sql is the real source of truth)

Tables: `profiles`, `accounts`, `trucks`, `truck_members`, `menu_items`, `menu_item_trucks`, `menu_photos`, `schedules`, `saved_locations`, `posts`, `follows`, `live_sessions`, `catering_requests`, `announcements`, `announcement_recipients`, `devices` (expo push tokens, stubbed), `discount_codes`, `contests`, `contest_entries`, `offers`, `offer_redemptions` (renamed from `birthday_offers`/`birthday_redemptions` — see Promos section).

Enums: `live_status = live | scheduled | catering | off | closed`; `account_plan = free | pro | fleet`; `member_role = owner | manager | worker`; `discount_type = percent | amount | free_item`; `contest_type = count | prediction | first_n | raffle | manual`; `offer_type = birthday | holiday | new_follower | custom`.

`live_sessions` shape:
```
id, truck_id, date, status, started_at, expires_at,
confirmed_lat, confirmed_lng, confirmed_address, catering_note
```
`confirmed_*` are null for catering/off/closed. `catering_note` is an optional light touch ("Available again Thursday").

**`menu_items`** — account-scoped (not truck-scoped): `account_id`, `applies_to_all_trucks`, `is_new`, `is_catering`, `is_available`, category, description, image_url. Fleet-specific truck scoping lives in `menu_item_trucks` (join table).

**`accounts`** — `owner_id`, `name`, `plan`, `suspended`, `plan_expires_at`, `comp_note`, `stripe_customer_id` (unused until Stripe wiring lands).

**`trucks`** — `account_id`, `name`, `slug`, `cuisine`, `bio`, `logo_url`, `banner_url` (both still plain URL fields, not real uploads), `instagram`, `order_url`, `service_radius_miles`.

> Schema additions still needed for features below (not yet in schema.sql — add when building):
> - Birthday nullable/optional field + `allow_offers_from_followed` / `allow_offers_from_nearby` consent columns + per-day offer cap, on the customer profile (customer app phase).
> - Founding-vendor tracking — founding rate / comp window per account, scoped per metro (partially covered today by `plan_expires_at`/`comp_note`, but not metro-scoped).
> - `saved_offers` table (reusable code/offer templates).
> - `menu_items` gains dietary/allergy tags and an optional "limited today" count.
> - `reviews` table (rating 1–5, body, customer_id, truck_id, created_at, `display_consent` boolean).
> - `truck_members` permission columns expand beyond `can_go_live` (edit-menu, post, view-analytics).
> - `account_plan` enum: add `enterprise` (and/or a per-truck count/billing model) when pricing shape locks.
> - Phase 2: menus become many-to-many with items (multiple menus from a shared pool).
> - Real Storage-backed upload for `trucks.logo_url` / `trucks.banner_url` (currently URL text fields only).

---

## What's built and working

- Auth (email/password + Google OAuth; Facebook configured but hidden pending Meta verification) + onboarding.
- Account + multi-truck creation with real **3-tier gating** (`free | pro | fleet` — free/pro = 1 truck, fleet = unlimited).
- **The one-tap live control** (`StatusControl`): captures browser GPS, writes a `live_sessions` row with `expires_at`, handles all **five** states including the Go Live/Go Offline toggle and the separate Scheduled/Closed pair.
- **Public truck page `/[slug]`** — fully built: SEO/OG metadata, ISR (60s revalidate via a cookie-free public client), empty states, Google Maps directions link, full week schedule (multi-entry days, catering days shown as "Closed" to protect privacy), menu with photos/NEW badges/catering section (gated `pro`+), Order Online button, suspension check.
- **Menu system** — categories, description, photo upload, whole-menu-board photo, Fleet true-sync (`menu_item_trucks`/`applies_to_all_trucks`), separate catering menu.
- **Schedule builder** — multiple locations/entries per day, saved-location dropdown, one-tap Mark Closed / Private Catering, inline edit, Exceptions.
- **Posts** — text + real photo upload + Edit + Delete.
- **Order Online** — `order_url` field (Free tier, not gated) + Square setup instructions + "leaving XLeats" interstitial (`/order?truck=<slug>`, looks up the destination server-side to prevent open-redirect).
- **Catering request form** (`/api/catering` → `catering_requests` table + RLS) — public insert, owner-only read.
- **Full admin panel** (`xleats.com/admin`) — vendor search/suspend/comp, announcements (broadcast or targeted), all gated by `ADMIN_EMAILS` allowlist re-verified server-side on every call.
- **Crons**: expire stale sessions, daily status-seed from schedule, weekly schedule-reminder nudge, daily plan-expire (reverts comped accounts), daily offer-matcher (`/api/cron/offers` → `generate_scheduled_offers`).
- Times display **12-hour AM/PM** everywhere in the UI (`formatTime12`), stored as 24-hour in the DB.
- Street-food visual identity (order-ticket cards, paprika accent, signage type).

**Build status:** compiles clean, all routes type-check.

---

## Promos page — built

`/dashboard/trucks/[truckId]/promos` (Pro/Fleet gated) has three sections, each: create → list below with manage actions.

- **Discount codes** — type dropdown (percent/amount/free item), description, optional max-redemptions and expiry, active Pause/Resume + Delete. A "redeem at the window" box calls `redeem_discount_code()`, which now actually enforces expiry/max-redemptions and increments the counter (previously these fields existed in schema but nothing read or wrote them).
- **Offers** — generalized from a birthday-only feature into one box with an `offer_type` dropdown: **Birthday** (matches a customer's own birthday, unchanged), **Holiday / seasonal** (a Father's-Day-style discount — recurring annual date or a one-time date, sent to every follower + nearby customer, not gated on their birthday), **Welcome new follower** (fires instantly via an `on_new_follow` trigger on `follows`, not the daily cron), **Custom** (same date-trigger mechanism as holiday, freeform use). Each offer in the list shows delivered/redeemed counts (`offer_stats()`, one row per offer now instead of one aggregate per truck) and has Pause/Resume + Delete. A "redeem at the window" box calls `redeem_offer_code()`. Renamed tables: `birthday_offers`→`offers`, `birthday_redemptions`→`offer_redemptions`; renamed functions: `generate_birthday_offers`→`generate_scheduled_offers`, `birthday_offer_stats`→`offer_stats`, `redeem_birthday_code`→`redeem_offer_code`. Migration: `supabase/offers_generalization.sql`.
- **Contests** — type dropdown: **Prediction** (guess a number/text; vendor sets the correct answer after close, "Pick winner" resolves to an exact match or closest numeric guess), **First to enter** (auto-resolves to the earliest N `contest_entries` rows), **Raffle drawing** (auto-resolves to N random entries), **Manual / social** (no in-app entries — e.g. an Instagram photo contest — vendor just types in who won). The old `count` type ("100th customer today") is kept in the enum for compatibility but no longer offered in the UI, since it can't be detected without a POS (see gotchas) — `first_n` is its in-app-trackable replacement. Winners resolve via `resolve_contest_winners()`, stored as `contests.winner_entry_ids` (or `winner_note` for manual). Migration: `supabase/contests_expansion.sql`.

**Important structural gap surfaced while building this (not fixed, by design — see below):** there is still no customer-facing signup/follow/birthday-capture flow anywhere in the product — every signup creates a vendor (`role: 'owner'`) account. So `offers`/`contest_entries` have real, working backend logic (verified live with disposable test accounts) but will show `0` delivered/entries for real trucks until the native customer app ships. T.J.'s explicit call: build the vendor side fully now, wire it to make the customer-app integration seamless later, and don't build a stopgap web customer flow.

---

## What's stubbed / still TODO

1. **QR flyer generator** — auto-generated, printable flyer in the dashboard with the truck's `/[slug]` QR baked in.
2. **Manual 86/sold-out toggle surfaced on dashboard** — schema (`is_available`) already exists.
3. **Dietary/allergy tags** on menu items.
4. **"Limited today" count** on menu items.
5. **Reviews — hybrid carousel** (4–5★ public, below-4★ private to vendor).
6. **Push fan-out to followers** (new post / go-live / offer-delivered → Expo push). `devices`/`notifications` tables exist but aren't wired to an actual send path yet.
7. **Upsell teaser engine + customer discovery filters** (quantified value-gap nudges; customer-app one-tap filters that only surface Pro+ vendors).
8. **Expanded employee permissions** (granular `truck_members` toggles beyond `can_go_live`).
9. **Engagement analytics layer** (profile views, follower growth, go-live frequency, redemptions, best spot by reach).
10. **Social auto-share on go-live.**
11. **Calendar sync** (schedule → Google Calendar).
12. **Schedule map-pin picker** (currently address/lat/lng entry, no visual picker).
13. **Stripe checkout** (free → pro → fleet → enterprise), 14-day Pro trial, and wiring the admin comp tool's parity with real billing once Stripe lands.
14. **Enterprise tier** — add to `account_plan` enum + per-truck/negotiated billing model once pricing shape locks.
15. **The native customer app itself** — signup, follow, birthday capture, push tokens. Everything above in "Promos page — built" is real but inert until this ships; T.J.'s stated next major phase after the vendor web app is done.

---

## Truck Settings page redesign — built

T.J. noticed the account-level settings (`/dashboard/settings` — name, login/profile) and the truck-level settings (`/dashboard/trucks/[truckId]/settings` — `TruckSettingsForm`) are two different pages and wanted the truck-level one expanded. All of the below shipped in one pass (migration: `supabase/truck_settings_expansion.sql`):

- **Fleet "apply to all trucks" checkboxes** — for `fleet`-tier accounts, each relevant field on `TruckSettingsForm` (cuisine, bio, logo, banner, instagram, facebook, website, phone, email, order_url) has an optional "Apply to all my trucks" checkbox. This is a **one-time copy-to-all-trucks action on save**, not a live-synced reference like the menu's `applies_to_all_trucks` — a vendor can copy a logo to every truck today and still change one truck's logo independently tomorrow. Implemented client-side: build a patch of only the checked fields, then `update(...).in('id', siblingTruckIds)`. Checkboxes only render when the account is `fleet` and has sibling trucks.
- **Logo/banner: both URL and real upload** — `TruckSettingsForm` keeps the existing URL text field and adds a file input next to it (uploads to the new `truck-branding` bucket, folder-keyed by `truck_id`, same RLS pattern as menu-photos/posts). Whichever was set most recently wins.
- **Facebook handle** field alongside Instagram, both rendered top-right on the public page.
- **Website URL** field (optional, auto-prefixed `https://` like `order_url`), rendered as a "Website" link.
- **Phone + email fields** on `trucks`, each with its own **`show_phone`/`show_email` visibility toggle** — only shown to customers on the public `/[slug]` page when the vendor explicitly opts in. Separate from the account owner's login email.
- **Customer-photo carousel** — new `truck_photos` table + `truck-photos` Storage bucket (same RLS pattern as `menu_photos`). Vendor uploads/deletes photos from the settings page; they render as a horizontal-scroll carousel near the top of the public page.

Verified live: ran the migration via CLI, confirmed the storage buckets/RLS actually accept an authenticated-style upload (curl PUT with the service key), rendered `xands-bbq`'s public page with test facebook/website/phone/email/photos filled in, confirmed everything displayed correctly (including the phone/email visibility gating), then reverted all test data.

---

## Known coding issues & gotchas

- **Google Fonts / `next/font`:** the build sandbox blocked Google Fonts, so fonts were briefly swapped to system fonts during validation, then **restored**. `next/font` fetches fine on Vercel.
- **Strict-mode cookie handlers:** the Supabase middleware cookie handlers needed explicit type annotations under TS strict mode. Already fixed.
- **PostgREST schema cache lag:** always end migrations with `notify pgrst, 'reload schema';` or new columns/tables are invisible to the app immediately after running.
- **ISR vs `cookies()`:** using the cookie-bound `createClient()` on a page forces it fully dynamic, defeating ISR. Public pages that need both caching and DB reads use `createPublicClient()` (cookie-free anon client) instead.
- **Column-level Postgres GRANTs, not just RLS:** on sensitive tables (e.g. `accounts`), broad client insert/update is revoked and only specific columns are granted, so RLS policy bugs can't be paired with a client sending extra columns to escalate privilege.
- **`owns_or_manages_truck(uuid)` and `owns_or_manages_account(uuid)`** — SECURITY DEFINER helper functions used throughout RLS policies and storage bucket policies (folder-keyed by `(storage.foldername(name))[1])::uuid`). Reuse these rather than re-deriving ownership checks per policy.
- **Open-redirect prevention:** `/order` takes a trusted `slug`, looks up `order_url` server-side — never accept a raw destination URL from the client.
- **`spatial_ref_sys` RLS alert cannot be fixed via SQL Editor** — the table is owned by `supabase_admin`, and both the CLI and dashboard SQL Editor connect as `postgres`. This is a genuine platform-level restriction; dismiss the alert or contact Supabase support, don't keep retrying ALTER TABLE on it.
- **Contests — count-based promos** ("100th customer today") **can't auto-detect** the Nth customer in Phase 1 (no POS/ordering). Ship as owner-advertised with a manual tap-counter, or defer to Phase 3.
- **Promotions/sweepstakes legal:** contests are technically promotions with per-state rules. Bake a generic official-rules/"no purchase necessary" template into the contest creator when built. Not legal advice — flag for the owner to check their state.

---

## Setup steps (owner is doing these)

1. Supabase project linked via CLI (`npx supabase db query --linked --file <path>` runs migrations directly — no more copy/pasting SQL into the dashboard).
2. GitHub repo: `tjalex01-source/xleats`, local clone at `D:\Claude\xleats-repo`. **Direct push to `main` is pre-authorized** (see Working conventions) — same workflow as the Court Side/tennis app.
3. Vercel project connected, env vars set, crons registered in `vercel.json`.
4. Storage buckets exist for menu items / menu photos / posts. Logo/banner and customer-photo-carousel buckets are the next ones needed.

Accounts needed later (customer app phase): Expo/EAS, Apple Developer ($99/yr), Google Play ($25 one-time). Not needed for Phase 1.

---

## Recommended next-task order

1. **Truck settings redesign** (in progress — Fleet apply-to-all, logo/banner upload, contact fields + visibility toggle, customer-photo carousel).
2. **Manual 86/sold-out toggle** surfaced on dashboard (cheap, schema already supports it).
3. **Reviews hybrid carousel** (public marketing value + private vendor feedback loop).
4. **Birthday engine** (biggest differentiator left unbuilt; needs customer-app-side capture first, or a web-based lightweight version).
5. **Stripe checkout** (turns on real monetization instead of admin-comped access).
6. **Push fan-out + upsell teaser engine** (pairs naturally with the customer app).

---

## Working conventions

- Owner side stays **responsive web** — don't reach for native on the owner side.
- Never expose individual customer PII to a truck. Route anything birthday/follower-related through the broker pattern + RLS. Counts and brokered sends only.
- **Free tier (incl. Go Live and Order Online) is permanent and universal.** Pro sells upside, never "pay or go dark."
- Founding perks and the "wait for customers" rule are **per-metro**, not global.
- `schema.sql` is the source of truth for data shape — keep it and `lib/types.ts` in sync with every migration, in the same change.
- Preserve the five-state live model and the freshness/auto-expire safeguards; they're the differentiator. `closed` and `off` are intentionally distinct — don't collapse them.
- **T.J. (the user) is a non-developer** — he directs product/design decisions; Claude writes and ships all code, SQL, and infra changes.
- **Direct push to `main` on this repo is pre-authorized**, no PR/confirmation needed per change, matching the Court Side workflow.
- **Run migrations directly via the Supabase CLI** rather than handing T.J. SQL to paste — he set up CLI access specifically so this could be self-serve.
- **Verification methodology for new features:** exercise the real UI flow (or a disposable test account/row when faster), verify the result with a direct SQL query and/or a live curl request against the dev server, then fully clean up any test data (child tables first, FK-safe order) before considering the task done.
