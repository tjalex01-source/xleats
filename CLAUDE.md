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

- **Discount codes** — type dropdown (percent/amount/free item), description, max-redemptions, and **both a start and end date** (`starts_at`/`expires_at` — a code isn't live until its start date, and disappears once its end date passes). Each code gets its own one-tap **Redeem** button in the list (no typing — the code text is already known/displayed, unlike offer/contest codes which are generated per-recipient and must be typed in). List shows discount, description, date range, redemption count, sent/scheduled/paused/ended status. **Edit** is available until the code is actually blasted (editable even while a send is merely *scheduled*, per T.J.: only an actual send locks it) — after that, only Pause/Resume/Delete remain, and the vendor has to create a fresh one instead of silently changing terms customers already saw. An **ended** code (past its end date) stays in the list with a **Refresh** button that reactivates the same row and reopens it for editing with new dates (clears `blast_id` so it can be re-blasted). `redeem_discount_code()` actually enforces expiry/max-redemptions and increments the counter now (previously these fields existed in schema but nothing read or wrote them).
- **Offers** — generalized from a birthday-only feature into one box with an `offer_type` dropdown: **Birthday** (matches a customer's own birthday, unchanged), **Holiday / seasonal** (a Father's-Day-style discount — recurring annual date or a one-time date, sent to every follower + nearby customer, not gated on their birthday), **Welcome new follower** (fires instantly via an `on_new_follow` trigger on `follows`, not the daily cron), **Custom** (same date-trigger mechanism as holiday, freeform use). Each offer in the list shows delivered/redeemed counts (`offer_stats()`, one row per offer now instead of one aggregate per truck) and has Pause/Resume + Delete. A "redeem at the window" box calls `redeem_offer_code()`. Renamed tables: `birthday_offers`→`offers`, `birthday_redemptions`→`offer_redemptions`; renamed functions: `generate_birthday_offers`→`generate_scheduled_offers`, `birthday_offer_stats`→`offer_stats`, `redeem_birthday_code`→`redeem_offer_code`. Migration: `supabase/offers_generalization.sql`.
- **Contests** — type dropdown: **Prediction** (guess a number/text; vendor sets the correct answer after close, "Pick winner" resolves to an exact match or closest numeric guess), **First to enter** (auto-resolves to the earliest N `contest_entries` rows), **Raffle drawing** (auto-resolves to N random entries), **Manual / social** (no in-app entries — e.g. an Instagram photo contest — vendor just types in who won), **Nth customer / milestone** (see below). The old `count` type ("100th customer today") is kept in the enum for compatibility but no longer offered in the UI, since it can't be detected without a POS — `milestone` is its live, in-person replacement, and `first_n` is its in-app-entry equivalent. Winners resolve via `resolve_contest_winners()`, stored as `contests.winner_entry_ids` (or `winner_note` for manual/milestone). Migration: `supabase/contests_expansion.sql` + `supabase/contest_milestone_and_winners.sql`.

**Important structural gap surfaced while building this (not fixed, by design — see below):** there is still no customer-facing signup/follow/birthday-capture flow anywhere in the product — every signup creates a vendor (`role: 'owner'`) account. So `offers`/`contest_entries`/blasts have real, working backend logic (verified live with disposable test accounts) but will show `0` delivered/entries/real recipients for real trucks until the native customer app ships. T.J.'s explicit call: build the vendor side fully now, wire it to make the customer-app integration seamless later, and don't build a stopgap web customer flow.

### Promo blasts + Fleet-wide apply — built
T.J.'s explicit growth framing: "always lean toward growth" — a blast should reach followers **and** nearby non-followers who've opted in, not just maintain the existing base.
- **`promo_blasts`** — one row created alongside every discount code / offer / contest (even if the vendor never sends it — it's a lightweight draft by default). Holds the customer-facing `message` (editable, auto-drafted from the code/offer/contest details), `scheduled_at`, and `sent_at`.
- **Send flow**: click **Blast** on any not-yet-sent item → review modal shows the auto-generated message (editable) → **Send now** or **Schedule for later**. Only once `sent_at` is actually set does the item lock for editing — a *scheduled* (not yet sent) blast can still be edited or cancelled, per T.J.'s explicit call.
- **Audience + consent**: `_deliver_promo_blast()` matches distinct customers who (a) follow one of the blast's trucks **and** have `allow_offers_from_followed` (default `true`), **or** (b) are within the truck's radius **and** have `allow_offers_from_nearby` (default `false`, opt-in) — then inserts one `notifications` row per matched customer. **Found and fixed a real, previously-live privacy gap while building this**: `generate_scheduled_offers()` had been matching "nearby" customers by radius alone with **zero consent check**, because the `allow_offers_from_followed`/`allow_offers_from_nearby` columns didn't exist on `profiles` until this pass. Both the offers matcher and the new blast sender now respect them.
- **Scheduled sends** fire via a new cron: `process_due_blasts()` → `/api/cron/send-blasts` (every 15 min).
- **Fleet-wide apply**: an "Apply to all my trucks" checkbox (Fleet tier + has sibling trucks) on discount codes, offers, and contests creates one independent row per truck (own tracking/redemption/pause per location — a milestone contest, for instance, gets its own tap counter per truck) but **one shared `promo_blasts` row**, so a customer who follows multiple of the fleet's trucks gets a single combined notification, not a duplicate per truck.
- **Public display**: only *actually sent* discount codes, within their start/end window, show in a "Specials & Promos" section on `/[slug]` (right under the live-status badge) — drafts and merely-scheduled ones stay private. This required a new public-read RLS policy on `promo_blasts` (`sent_at is not null`) since the table otherwise has no public visibility at all; without it the nested PostgREST join silently returned `null` and nothing showed. Offers/contests don't get this public listing yet — an open contest inviting entries still isn't shown publicly (flagged previously, still not built).
- Migration: `supabase/promo_blasts_and_fleet.sql`.

**Scope note:** the richer discount-code treatment above (start/end dates, edit-lock, ended+Refresh) was NOT applied to Offers/Contests in this pass — those have different date semantics (event-triggered vs. window-based) that T.J. and I agreed to revisit separately. Offers/Contests only got the two mechanics that clearly transfer as-is: Fleet apply-to-all and the Blast/review/schedule flow.

### Milestone ("Nth customer") contests — built
T.J.'s idea: some food trucks run "100th customer wins" promos in person, with no way to know in advance which real customer will hit the number. Built as its own contest type, entirely separate from the app-entry-based types above:
- Creating a `milestone` contest (title + `target_count`, e.g. 100) makes a big counter button appear on the truck's **hub page** (`/dashboard/trucks/[truckId]`, right under `StatusControl` — component: `MilestoneContest.tsx`), showing `{tap_count} / {target_count}` and a live-ticking elapsed clock since the contest was created.
- The vendor taps it after every sale. `bump_contest_tap_count()` increments `contests.tap_count` and auto-closes the contest (`status = 'closed'`) the instant it hits `target_count` — no separate "resolve" step, since counting IS the resolution.
- Hitting the target shows client-side confetti (a small inline component, no new npm dependency) plus a modal: type the winner's first name (freeform — there are no entries to attach an identity to) and optionally attach a photo. "Post it" uploads the photo to the `truck-photos` bucket (adds it straight to the carousel), inserts a `posts` row announcing it ("🎉 {name} was our {N}th customer today at {truck}!"), and sets `contests.winner_note`.
- **Deliberately NOT built: auto-notifying the winner's phone if they're a follower.** There is no way to know who the physical Nth customer is without either (a) the vendor looking them up from the follower list, which breaks the hard privacy rule that trucks can never see individual customer rows, or (b) the customer self-identifying through the not-yet-built native app. `contests.winner_user_id` exists, nullable, specifically so a future customer-app "That's me!" self-claim flow can attach real identity + trigger a push notification later without another schema change — but nothing sets it today.

### Contest winner announcements — built
For **prediction / first_n / raffle** contests (the ones with real `contest_entries`), the resolved winner(s)' **first name only** — never anything else from their profile — is shown both to the vendor (promos page) and publicly on `/[slug]` ("🎉 Beth won: Free Taco Raffle!"), via a SECURITY DEFINER function `contest_winner_first_names()` that only returns rows for CLOSED contests. For **manual / milestone** contests, the vendor's own freeform `winner_note` is shown instead (no profile lookup needed — they typed it themselves). Winning `contest_entries` rows also get a `redemption_code` (same pattern as offer/discount codes) so an async winner (raffle/prediction resolved later) can claim a prize at the window — a real gap before this: contests had no way to verify a winner at all.

---

## What's stubbed / still TODO

1. **QR flyer generator** — auto-generated, printable flyer in the dashboard with the truck's `/[slug]` QR baked in.
2. **Manual 86/sold-out toggle surfaced on dashboard** — schema (`is_available`) already exists.
3. **Dietary/allergy tags** on menu items.
4. **"Limited today" count** on menu items.
5. **Reviews — hybrid carousel** (4–5★ public, below-4★ private to vendor).
6. **Push fan-out to followers** (new post / go-live / offer-delivered / promo blast → Expo push). `devices`/`notifications` tables exist and are now actively written to (promo blasts, offer deliveries) but nothing sends an actual phone push yet — this is the single biggest lever left: every "notify customers" feature built so far (blasts, offers, milestone/contest winner posts) is real up to the `notifications` table and stops there.
7. **Upsell teaser engine + customer discovery filters** (quantified value-gap nudges; customer-app one-tap filters that only surface Pro+ vendors).
8. **Expanded employee permissions** (granular `truck_members` toggles beyond `can_go_live`).
9. **Profile/page-view tracking** — nothing counts a `/[slug]` visit today; the Stats page (built) can't show views until this instrumentation exists. NOT possible at all without an ordering system: best-seller/revenue stats.
10. **Social auto-share on go-live.**
11. **Calendar sync** (schedule → Google Calendar).
12. **Schedule map-pin picker** (currently structured address + geocode, no visual pin-drop picker).
13. **14-day Pro trial** — not yet wired into checkout (Stripe supports `trial_period_days`; add when desired). Also not yet built: annual Fleet pricing (Fleet is monthly-only for now), and truck-*removal* quantity sync (adding a Fleet truck re-meters Stripe; removing one doesn't yet — slight overcharge until the next add).
14. **Enterprise tier** — `account_plan` enum still has no `enterprise` value; it's a "contact us" mailto on the billing page today, no self-serve checkout. Add the enum value + per-truck/negotiated billing model when a real Enterprise deal justifies it.
15. **The native customer app itself** — signup, follow, birthday capture, push tokens. Everything above in "Promos page — built" is real but inert until this ships; T.J.'s stated next major phase after the vendor web app is done.

---

## Menu "Specials" — built

A special is a **cross-cutting flag/schedule on an existing menu item** — not a new item, and not the old unused "Specials" *category* label (removed from the category dropdown; category list is now Appetizers/Entrees/Breakfast/Sides/**Add-ons**/Drinks/Desserts/Other — **Add-ons** added per T.J. for sauces/extra cheese/small upcharges).

- **Creation** — its own box on the vendor Menu page, below the item list: pick an existing item from a dropdown, set a special price, optionally "advertise the savings" (auto-computed % off vs. the item's regular price), and choose **Every week** (multi-select day-of-week toggle buttons, same interaction pattern as elsewhere) or **One day only** (a single date, today or future). Full list below with Edit/Pause/Delete. Table: `specials` (`truck_id`, `menu_item_id`, `special_price`, `advertise_discount`, `recurring`, `days_of_week int[]`, `special_date`).
- **Public display** — a prominent "Today's Specials" section on `/[slug]`, placed right after the live-status badge (above even the discount-code "Specials & Promos" section) showing whichever specials match today's date or day-of-week, with the item's photo (or placeholder box), description, special price, and computed "(N% off)" badge.
- **Tap counter** — `SpecialTapCounter.tsx` on the truck hub page (next to `StatusControl`/`MilestoneContest`): shows a button per special active *today*, tap to increment. Pure honor-system tracking (mirrors the milestone-contest tap pattern) via `bump_special_tap_count()`, one row per `(special_id, day)` in `special_taps` — feeds the future Stats page, resolves nothing, gates nothing.
- **Placeholder photo boxes** — a real, permanent UI change (not just for the demo): any menu item without a photo now renders a dashed-border placeholder box (🍽️) instead of nothing, on both the public page and the vendor Menu page's item list, so the layout reads consistently whether or not every item has a photo yet.
- Migration: `supabase/specials.sql`.

**Demo data**: seeded a full 18-item menu across every category (including Add-ons) plus two live specials (one recurring, one one-time) directly onto the real `xands-bbq` test truck — not a disposable QA account — specifically so T.J. can view `xleats.com/xands-bbq` (or the local dev server) himself and see the real flow/layout. This is intentionally different from this session's usual verify-then-delete pattern; the seeded items are real rows he can edit or delete via the Menu page whenever he wants. No fake images were generated (no image-gen tool available) — every seeded item relies on the new placeholder box.

---

## Schedule: structured addresses + real geocoding — built

T.J. flagged that a single free-typed address field is unreliable for Google Maps to pinpoint, and that the "one-time exceptions" section (which already covers "a future one-off location and date" — no separate feature was needed there) was missing start/end time fields the weekly form has.

- **Street / City / State / Zip are now real columns** on `schedules` and `saved_locations` (not just composed into the existing `address` text column and discarded) — added via `supabase/schedule_address_fields.sql`. `address` is still kept as the always-present composed display string every existing render path already uses (public page, schedule list), so nothing broke; the structured fields exist purely so re-editing an entry is accurate instead of trying to re-split a free-text string.
- **Real geocoding**: `GOOGLE_GEOCODING_API_KEY` (Google Cloud → Geocoding API, restricted to that API only) is a server-only secret, proxied via a new authenticated route `POST /api/geocode` (rejects unauthenticated calls, so it can't be spammed to run up the bill) — the Schedule page composes the four fields into one address string client-side and calls this route on save, storing the real `lat`/`lng` it returns. Both the weekly recurring form and the one-time exceptions form do this now; exceptions also gained the missing start/end time fields.
- **This was a bigger fix than it looks**: `lat`/`lng` on `schedules` had *never* been populated by anything before this — not even when a vendor picked a saved location, since `saved_locations.lat`/`lng` was also never written to despite existing in the schema since early in the project. That means the "nearby customer" radius matching inside `generate_scheduled_offers()` and `_deliver_promo_blast()` — which both anchor a truck's location by reading `schedules.lat`/`lng` — has been silently matching **zero** nearby non-followers this entire time, no matter how the consent/radius settings were configured, because the truck-location half of the join was always null. Real geocoded coordinates flowing into `schedules` is what actually makes that matching functional for the first time, not just a "Get directions" cosmetic improvement.
- `.env.example` documents `GOOGLE_GEOCODING_API_KEY`; production requires T.J. to add the same key to Vercel's env vars himself (no Vercel access from here).

Verified live with the real Google API key: geocoded a real Tyler, TX address through the actual Schedule page UI, confirmed accurate lat/lng landed in the database, confirmed the composed address and times rendered correctly on the public page's week view. Test data deleted afterward.

---

## Stats page — built

`/dashboard/trucks/[truckId]/stats`, sixth hub tile alongside Menu/Schedule/Posts/Promos/Settings. Pro/Fleet gated (free tier gets an upgrade wall, same pattern as Promos).

- **Two SECURITY DEFINER functions** (`supabase/stats.sql`), both gated on `owns_or_manages_truck()` so the follows-privacy boundary is never crossed — a truck gets aggregate counts, never a customer row (same pattern as `truck_follower_count`/`offer_stats`; returning zero rows for a non-manager is the intentional no-leak behavior):
  - `truck_stats(p_truck)` → headline totals: followers, new-followers-30d, go-lives-30d, posts-30d, all-time discount redemptions, offers delivered/redeemed, special-taps-30d, active-codes/offers/open-contests.
  - `truck_activity_by_week(p_truck, p_weeks)` → weekly time series (new followers / go-lives / posts per week) for the last N weeks.
- **UI**: headline stat cards + three CSS mini bar charts (no chart library — plain divs with height %, matching the "no new npm dependency" convention). Fleet accounts additionally get a cross-truck comparison table (calls `truck_stats` per truck in the account).
- **Data source notes**: go-lives count `live_sessions` rows with `started_at` set (not `status='live'`, since the expire cron flips finished sessions back to `off` — counting current status would undercount). Everything is real, live-computable data. Deliberately NOT included: profile/page views (nothing counts a `/[slug]` visit — see TODO) and any revenue/best-seller stat (no ordering system, by design).

Verified live with a disposable Fleet account seeded with follows/go-lives/posts/redemptions spread across several weeks: every headline number and weekly bar matched the seed exactly, and the Fleet comparison table rendered both trucks. Test data deleted afterward.

---

## Stripe billing — built (test mode; live cutover is T.J.'s step)

Real self-serve subscriptions replacing the admin-comp workaround. `/dashboard/billing` is the hub (Free upgrade CTAs across Promos/Stats/new-truck all route here).

- **Tiers (T.J.'s decision)**: Free / Pro ($20/mo or $200/yr, 1 truck) / Fleet ($15/truck/mo, **min 2** so Pro stays the cheapest single-truck option) / Enterprise (a "contact us" mailto — no self-serve, `account_plan` enum has no `enterprise` value yet).
- **Products/prices** created by `scripts/stripe-setup.mjs` (idempotent via lookup_key; run once per Stripe mode). Each price carries metadata `xleats_plan=pro|fleet`, which is how the sync logic maps a subscription back to `accounts.plan`. Price IDs live in env (`STRIPE_PRICE_PRO_MONTHLY/PRO_ANNUAL/FLEET_MONTHLY`).
- **Routes** (`src/app/api/stripe/*`): `checkout` (creates customer if needed + Checkout Session; Fleet quantity = `max(truckCount, 2)`), `portal` (Stripe Billing Portal for card/cancel), `sync` (reconciles plan from live Stripe state — called on checkout return so the happy path never waits on a webhook), `sync-quantity` (re-meters Fleet quantity after a truck is added), `webhook` (safety net for out-of-band changes: portal cancellations, failed renewals). Shared logic: `syncCustomerPlan(customerId)` in `src/lib/stripe.ts`, used by both `sync` and `webhook`.
- **Plan storage**: `accounts.stripe_customer_id` (existed) + new `accounts.stripe_subscription_id`. On an active/trialing sub, sync sets `plan` from price metadata and clears `plan_expires_at` (so a formerly-comped account that starts paying isn't wrongly downgraded by the `plan-expire` cron — Stripe accounts always have `plan_expires_at = null`). On no active sub, reverts to `free`.
- **The `stripe` npm package was added** — this is the one place a new dependency is correct (vs. the no-dep convention elsewhere).

**Env / go-live (T.J.'s steps, no access from here):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three price IDs must be added to Vercel. For live mode: run `scripts/stripe-setup.mjs` with the **live** secret key to get live price IDs, create a webhook endpoint in the Stripe dashboard pointing at `https://xleats.com/api/stripe/webhook` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Everything shipped so far was built and verified against **test mode**.

**Verified live (test mode) via the Stripe API against the real checkout-created customer** (the preview sandbox blocks navigating to Stripe's hosted card page, but that page is Stripe's own UI — every line of *our* path was exercised): Pro subscribe → sync → `plan=pro` + subscription id stored + `plan_expires_at` cleared; cancel → sync → back to `free` (the webhook's downgrade path); Fleet subscribe qty 2 → `plan=fleet`; add trucks (→3) → `sync-quantity` → Stripe billed quantity updated to 3. All test data (Stripe customer/subs, DB rows, auth user) deleted afterward.

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
- **`pgcrypto` lives in the `extensions` schema on this Supabase project, not `public`.** Any `SECURITY DEFINER` function that does `set search_path = public` (without `extensions`) will fail with `function gen_random_bytes(integer) does not exist` (error 42883) the moment it's actually called — this was a real, live bug found while building contest winner codes (`resolve_contest_winners` had been silently broken since it was written; `generate_scheduled_offers` and `handle_new_follow` had the same latent bug, just never triggered live before). Any new function that calls `gen_random_bytes()` (or other pgcrypto functions) needs `extensions` added to its `search_path`, e.g. `set search_path = public, extensions`. Column defaults like `default gen_random_uuid()` are unaffected — those run under the session's normal search path, not a function's overridden one.
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

All five dashboard sections (Promos, Menu, Schedule, Posts, Settings), the Stats page, and Stripe billing are now built. T.J.'s stated direction: payment links (done), then the customer-facing app.

1. ~~Stats page~~ — done.
2. ~~Stripe checkout~~ — done (test mode; T.J. does the live-key cutover in Vercel). Remaining billing polish is minor: 14-day trial, annual Fleet, truck-removal quantity sync.
3. **Push notification delivery (Expo)** — the biggest lever left; every notification-generating feature built so far (blasts, offers, contest/milestone winners) stops at writing a `notifications` row today. Needed before or alongside the customer app, not after.
4. **The native customer app itself.**

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
