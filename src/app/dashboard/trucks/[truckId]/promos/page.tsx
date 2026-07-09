'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type {
  AccountPlan, DiscountCode, DiscountType, Offer, OfferType, OfferStat,
  Contest, ContestType, ContestEntry, ContestWinnerName, PromoBlast,
} from '@/lib/types';

const OFFER_TYPE_LABEL: Record<OfferType, string> = {
  birthday: 'Birthday', holiday: 'Holiday / seasonal', new_follower: 'Welcome new follower', custom: 'Custom date',
};
const CONTEST_TYPE_LABEL: Record<ContestType, string> = {
  count: 'Count (legacy)', prediction: 'Prediction', first_n: 'First to enter', raffle: 'Raffle drawing',
  manual: 'Manual / social', milestone: 'Nth customer (live counter)',
};
const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  percent: '% off', amount: '$ off', free_item: 'Free item',
};
const inputCls = 'rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function discBlastMessage(d: { code: string; type: DiscountType; value: number | null; description: string | null; expires_at: string | null }) {
  const discountText = d.type === 'percent' ? `${d.value}% off`
    : d.type === 'amount' ? `$${d.value} off`
    : (d.description || 'a free item');
  return `🎉 New code ${d.code}: ${discountText}!${d.description ? ` ${d.description}.` : ''}${d.expires_at ? ` Ends ${fmtDate(d.expires_at)}.` : ''}`;
}

type BlastModalState = { kind: 'discount_code' | 'offer' | 'contest'; blastId: string; defaultMessage: string } | null;

export default function Promos() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isFleet, setIsFleet] = useState(false);
  const [siblingTruckIds, setSiblingTruckIds] = useState<string[]>([]);
  const [blasts, setBlasts] = useState<Record<string, PromoBlast>>({});

  // Blast modal (shared across all 3 sections)
  const [blastModal, setBlastModal] = useState<BlastModalState>(null);
  const [blastMsg, setBlastMsg] = useState('');
  const [blastMode, setBlastMode] = useState<'now' | 'schedule'>('now');
  const [blastScheduleAt, setBlastScheduleAt] = useState('');

  // Discount codes
  const [discs, setDiscs] = useState<DiscountCode[]>([]);
  const [editingDiscId, setEditingDiscId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [discType, setDiscType] = useState<DiscountType>('percent');
  const [discValue, setDiscValue] = useState('');
  const [discDesc, setDiscDesc] = useState('');
  const [discMax, setDiscMax] = useState('');
  const [discStarts, setDiscStarts] = useState('');
  const [discExpires, setDiscExpires] = useState('');
  const [discApplyAll, setDiscApplyAll] = useState(false);
  const [redeemMsgByRow, setRedeemMsgByRow] = useState<Record<string, string>>({});

  // Offers
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerStats, setOfferStats] = useState<Record<string, OfferStat>>({});
  const [offerType, setOfferType] = useState<OfferType>('birthday');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [triggerMode, setTriggerMode] = useState<'annual' | 'once'>('annual');
  const [triggerMonth, setTriggerMonth] = useState('');
  const [triggerDay, setTriggerDay] = useState('');
  const [triggerDate, setTriggerDate] = useState('');
  const [offerApplyAll, setOfferApplyAll] = useState(false);
  const [redeemOfferCode, setRedeemOfferCode] = useState('');
  const [redeemOfferMsg, setRedeemOfferMsg] = useState<string | null>(null);

  // Contests
  const [contests, setContests] = useState<Contest[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [contestType, setContestType] = useState<ContestType>('prediction');
  const [contestTitle, setContestTitle] = useState('');
  const [contestDesc, setContestDesc] = useState('');
  const [contestPrize, setContestPrize] = useState('');
  const [contestCloses, setContestCloses] = useState('');
  const [contestWinnerLimit, setContestWinnerLimit] = useState('1');
  const [contestTargetCount, setContestTargetCount] = useState('100');
  const [contestApplyAll, setContestApplyAll] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [winnerNoteDrafts, setWinnerNoteDrafts] = useState<Record<string, string>>({});
  const [winnerEntries, setWinnerEntries] = useState<Record<string, ContestEntry[]>>({});
  const [winnerNames, setWinnerNames] = useState<Record<string, ContestWinnerName[]>>({});
  const [redeemContestCodeInput, setRedeemContestCodeInput] = useState('');
  const [redeemContestMsg, setRedeemContestMsg] = useState<string | null>(null);

  async function load() {
    const { data: truck } = await supabase.from('trucks')
      .select('account_id, accounts(plan)').eq('id', truckId).single();
    const accId: string | null = truck?.account_id ?? null;
    // @ts-expect-error nested select typing
    const planVal: AccountPlan = truck?.accounts?.plan ?? 'free';
    setAccountId(accId);
    setPlan(planVal);
    setIsFleet(planVal === 'fleet');
    if (accId) {
      const { data: sibs } = await supabase.from('trucks').select('id').eq('account_id', accId).neq('id', truckId);
      setSiblingTruckIds((sibs ?? []).map((s) => s.id));
    }

    const { data: d } = await supabase.from('discount_codes').select('*').eq('truck_id', truckId).order('created_at', { ascending: false });
    setDiscs((d as DiscountCode[]) ?? []);

    const { data: o } = await supabase.from('offers').select('*').eq('truck_id', truckId).order('created_at', { ascending: false });
    setOffers((o as Offer[]) ?? []);
    const { data: stats } = await supabase.rpc('offer_stats', { p_truck: truckId });
    const statMap: Record<string, OfferStat> = {};
    for (const s of (stats as OfferStat[]) ?? []) statMap[s.offer_id] = s;
    setOfferStats(statMap);

    const { data: c } = await supabase.from('contests').select('*').eq('truck_id', truckId).order('created_at', { ascending: false });
    setContests((c as Contest[]) ?? []);

    const blastIds = [
      ...(d ?? []).map((x) => x.blast_id),
      ...(o ?? []).map((x) => x.blast_id),
      ...(c ?? []).map((x) => x.blast_id),
    ].filter((x): x is string => !!x);
    if (blastIds.length > 0) {
      const { data: blastRows } = await supabase.from('promo_blasts').select('*').in('id', Array.from(new Set(blastIds)));
      const map: Record<string, PromoBlast> = {};
      for (const b of (blastRows as PromoBlast[]) ?? []) map[b.id] = b;
      setBlasts(map);
    }

    const contestIds = (c ?? []).map((x) => x.id);
    if (contestIds.length > 0) {
      const { data: entries } = await supabase.from('contest_entries').select('id, contest_id').in('contest_id', contestIds);
      const counts: Record<string, number> = {};
      for (const e of entries ?? []) counts[e.contest_id] = (counts[e.contest_id] ?? 0) + 1;
      setEntryCounts(counts);

      const winnerIds = (c ?? []).flatMap((x) => x.winner_entry_ids ?? []);
      if (winnerIds.length > 0) {
        const { data: winEntries } = await supabase.from('contest_entries').select('*').in('id', winnerIds);
        const grouped: Record<string, ContestEntry[]> = {};
        for (const e of (winEntries as ContestEntry[]) ?? []) {
          grouped[e.contest_id] = [...(grouped[e.contest_id] ?? []), e];
        }
        setWinnerEntries(grouped);
      }

      const closedWithWinners = (c ?? []).filter((x) => x.status === 'closed' && (x.winner_entry_ids ?? []).length > 0);
      if (closedWithWinners.length > 0) {
        const results = await Promise.all(
          closedWithWinners.map((x) => supabase.rpc('contest_winner_first_names', { p_contest: x.id }))
        );
        const namesMap: Record<string, ContestWinnerName[]> = {};
        closedWithWinners.forEach((x, i) => {
          namesMap[x.id] = (results[i].data as ContestWinnerName[]) ?? [];
        });
        setWinnerNames(namesMap);
      }
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  // --- Blast (shared) -------------------------------------------------------
  function openBlast(kind: 'discount_code' | 'offer' | 'contest', blastId: string, defaultMessage: string) {
    setBlastModal({ kind, blastId, defaultMessage });
    setBlastMsg(defaultMessage);
    setBlastMode('now');
    setBlastScheduleAt('');
  }
  async function confirmBlast() {
    if (!blastModal) return;
    if (blastMode === 'now') {
      await supabase.from('promo_blasts').update({ message: blastMsg }).eq('id', blastModal.blastId);
      await supabase.rpc('send_promo_blast', { p_blast: blastModal.blastId });
    } else {
      await supabase.from('promo_blasts').update({
        message: blastMsg,
        scheduled_at: blastScheduleAt ? new Date(blastScheduleAt).toISOString() : null,
      }).eq('id', blastModal.blastId);
    }
    setBlastModal(null);
    load();
  }
  async function cancelSchedule(blastId: string) {
    await supabase.from('promo_blasts').update({ scheduled_at: null }).eq('id', blastId);
    load();
  }

  // --- Discount codes ---------------------------------------------------
  function resetDiscForm() {
    setEditingDiscId(null);
    setCode(''); setDiscValue(''); setDiscDesc(''); setDiscMax('');
    setDiscStarts(''); setDiscExpires(''); setDiscApplyAll(false);
  }
  function startEditDisc(d: DiscountCode) {
    setEditingDiscId(d.id);
    setCode(d.code); setDiscType(d.type);
    setDiscValue(d.value != null ? String(d.value) : '');
    setDiscDesc(d.description ?? ''); setDiscMax(d.max_redemptions != null ? String(d.max_redemptions) : '');
    setDiscStarts(d.starts_at ? d.starts_at.slice(0, 10) : '');
    setDiscExpires(d.expires_at ? d.expires_at.slice(0, 10) : '');
  }
  async function saveDiscount() {
    if (!code || !accountId) return;
    const patch = {
      code: code.toUpperCase(),
      type: discType,
      value: discType === 'free_item' ? null : (discValue ? Number(discValue) : null),
      description: discDesc || null,
      max_redemptions: discMax ? Number(discMax) : null,
      starts_at: discStarts ? new Date(discStarts).toISOString() : null,
      expires_at: discExpires ? new Date(discExpires).toISOString() : null,
    };
    if (editingDiscId) {
      await supabase.from('discount_codes').update(patch).eq('id', editingDiscId);
    } else {
      const targetTruckIds = (isFleet && discApplyAll) ? [truckId, ...siblingTruckIds] : [truckId];
      const { data: blast } = await supabase.from('promo_blasts')
        .insert({ account_id: accountId, kind: 'discount_code' }).select().single();
      const rows = targetTruckIds.map((tid) => ({ ...patch, truck_id: tid, blast_id: blast?.id ?? null }));
      await supabase.from('discount_codes').insert(rows);
    }
    resetDiscForm();
    load();
  }
  async function toggleDiscount(d: DiscountCode) {
    await supabase.from('discount_codes').update({ active: !d.active }).eq('id', d.id);
    load();
  }
  async function deleteDiscount(id: string) {
    await supabase.from('discount_codes').delete().eq('id', id);
    load();
  }
  async function refreshDisc(d: DiscountCode) {
    await supabase.from('discount_codes').update({ active: true, blast_id: null }).eq('id', d.id);
    startEditDisc(d);
    load();
  }
  async function redeemDiscountRow(d: DiscountCode) {
    const { data } = await supabase.rpc('redeem_discount_code', { p_code: d.code, p_truck: truckId });
    const messages: Record<string, string> = {
      ok: 'Redeemed!', not_found: 'Code not found.', expired: 'That code has expired.',
      inactive: 'That code is paused.', maxed: 'That code has hit its redemption limit.',
    };
    setRedeemMsgByRow((prev) => ({ ...prev, [d.id]: messages[data as string] ?? 'Something went wrong.' }));
    load();
  }

  // --- Offers -------------------------------------------------------------
  async function addOffer() {
    if (!offerTitle || !accountId) return;
    const usesTrigger = offerType === 'holiday' || offerType === 'custom';
    const targetTruckIds = (isFleet && offerApplyAll) ? [truckId, ...siblingTruckIds] : [truckId];
    const { data: blast } = await supabase.from('promo_blasts')
      .insert({ account_id: accountId, kind: 'offer' }).select().single();
    const rows = targetTruckIds.map((tid) => ({
      truck_id: tid,
      offer_type: offerType,
      title: offerTitle,
      description: offerDesc || null,
      trigger_month: usesTrigger && triggerMode === 'annual' && triggerMonth ? Number(triggerMonth) : null,
      trigger_day: usesTrigger && triggerMode === 'annual' && triggerDay ? Number(triggerDay) : null,
      trigger_date: usesTrigger && triggerMode === 'once' && triggerDate ? triggerDate : null,
      blast_id: blast?.id ?? null,
    }));
    await supabase.from('offers').insert(rows);
    setOfferTitle(''); setOfferDesc(''); setTriggerMonth(''); setTriggerDay(''); setTriggerDate(''); setOfferApplyAll(false);
    load();
  }
  async function toggleOffer(o: Offer) {
    await supabase.from('offers').update({ active: !o.active }).eq('id', o.id);
    load();
  }
  async function deleteOffer(id: string) {
    await supabase.from('offers').delete().eq('id', id);
    load();
  }
  async function redeemOffer() {
    if (!redeemOfferCode) return;
    const { data } = await supabase.rpc('redeem_offer_code', { p_code: redeemOfferCode.toUpperCase(), p_truck: truckId });
    setRedeemOfferMsg(data ? 'Redeemed!' : 'Code not found, already used, or invalid.');
    setRedeemOfferCode('');
    load();
  }

  // --- Contests -------------------------------------------------------------
  async function addContest() {
    if (!contestTitle || !accountId) return;
    const targetTruckIds = (isFleet && contestApplyAll) ? [truckId, ...siblingTruckIds] : [truckId];
    const { data: blast } = await supabase.from('promo_blasts')
      .insert({ account_id: accountId, kind: 'contest' }).select().single();
    const rows = targetTruckIds.map((tid) => ({
      truck_id: tid,
      type: contestType,
      title: contestTitle,
      description: contestDesc || null,
      prize: contestPrize || null,
      closes_at: contestType === 'manual' || contestType === 'milestone'
        ? null : (contestCloses ? new Date(contestCloses).toISOString() : null),
      winner_limit: contestType === 'first_n' || contestType === 'raffle' ? Number(contestWinnerLimit) || 1 : null,
      target_count: contestType === 'milestone' ? Number(contestTargetCount) || 100 : null,
      blast_id: blast?.id ?? null,
    }));
    await supabase.from('contests').insert(rows);
    setContestTitle(''); setContestDesc(''); setContestPrize(''); setContestCloses('');
    setContestWinnerLimit('1'); setContestTargetCount('100'); setContestApplyAll(false);
    load();
  }
  async function redeemContest() {
    if (!redeemContestCodeInput) return;
    const { data } = await supabase.rpc('redeem_contest_code', { p_code: redeemContestCodeInput.toUpperCase(), p_truck: truckId });
    setRedeemContestMsg(data ? 'Redeemed!' : 'Code not found, already used, or invalid.');
    setRedeemContestCodeInput('');
    load();
  }
  async function saveAnswer(id: string) {
    const answer = answerDrafts[id];
    if (!answer) return;
    await supabase.from('contests').update({ answer }).eq('id', id);
    load();
  }
  async function resolveContest(id: string) {
    await supabase.rpc('resolve_contest_winners', { p_contest: id });
    load();
  }
  async function saveManualWinner(id: string) {
    const note = winnerNoteDrafts[id];
    if (!note) return;
    await supabase.from('contests').update({ winner_note: note, status: 'closed' }).eq('id', id);
    load();
  }
  async function deleteContest(id: string) {
    await supabase.from('contests').delete().eq('id', id);
    load();
  }

  if (plan === null) return <p className="text-muted">Loading…</p>;

  if (plan === 'free') {
    return (
      <div>
        <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
        <div className="mt-5 rounded-ticket border border-edge bg-white p-8 text-center shadow-ticket">
          <div className="eyebrow mb-2">Pro feature</div>
          <h1 className="font-display text-2xl font-extrabold">Promos drive regulars back</h1>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            Discount codes, contests, and automatic birthday/holiday offers — delivered to your
            followers and nearby customers without ever handing you their personal details.
          </p>
          <Link href="/dashboard/billing" className="mt-5 inline-block rounded-lg bg-brand px-6 py-3 font-display font-bold text-white">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  const usesTrigger = offerType === 'holiday' || offerType === 'custom';
  const usesWinnerLimit = contestType === 'first_n' || contestType === 'raffle';
  const canApplyAll = isFleet && siblingTruckIds.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
        <h1 className="mt-3 font-display text-3xl font-extrabold">Promos</h1>
      </div>

      {/* Discount codes */}
      <section className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="eyebrow mb-2">Discount codes</div>
        <div className="grid grid-cols-2 gap-2">
          <input className={`${inputCls} uppercase`} placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} />
          <select className={inputCls} value={discType} onChange={(e) => setDiscType(e.target.value as DiscountType)}>
            {(Object.keys(DISCOUNT_TYPE_LABEL) as DiscountType[]).map((t) => (
              <option key={t} value={t}>{DISCOUNT_TYPE_LABEL[t]}</option>
            ))}
          </select>
          {discType !== 'free_item' && (
            <input className={inputCls} placeholder={discType === 'percent' ? '% off' : '$ off'}
              inputMode="numeric" value={discValue} onChange={(e) => setDiscValue(e.target.value)} />
          )}
          <input className={`${inputCls} ${discType === 'free_item' ? 'col-span-2' : ''}`}
            placeholder="Description (e.g. Free medium drink)" value={discDesc} onChange={(e) => setDiscDesc(e.target.value)} />
          <input className={inputCls} placeholder="Max redemptions (optional)" inputMode="numeric"
            value={discMax} onChange={(e) => setDiscMax(e.target.value)} />
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Start date (optional)</label>
              <input type="date" className={`${inputCls} w-full`} value={discStarts} onChange={(e) => setDiscStarts(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">End date (optional)</label>
              <input type="date" className={`${inputCls} w-full`} value={discExpires} onChange={(e) => setDiscExpires(e.target.value)} />
            </div>
          </div>
        </div>
        {canApplyAll && !editingDiscId && (
          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={discApplyAll} onChange={(e) => setDiscApplyAll(e.target.checked)} />
            Apply to all my trucks
          </label>
        )}
        <div className="mt-2 flex gap-2">
          <button onClick={saveDiscount} className="flex-1 rounded-lg bg-brand py-2 font-display font-bold text-white">
            {editingDiscId ? 'Save changes' : 'Add code'}
          </button>
          {editingDiscId && <button onClick={resetDiscForm} className="rounded-lg border border-edge px-4 text-sm font-semibold">Cancel</button>}
        </div>

        <div className="mt-4 space-y-2">
          {discs.map((d) => {
            const blast = d.blast_id ? blasts[d.blast_id] : null;
            const isSent = !!blast?.sent_at;
            const isScheduled = !!blast?.scheduled_at && !isSent;
            const isEnded = !!d.expires_at && new Date(d.expires_at) < new Date();
            return (
              <div key={d.id} className="rounded-lg border border-edge p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold">{d.code}</span>
                    <span className="ml-2 text-muted">
                      {d.type === 'percent' && `${d.value}% off`}
                      {d.type === 'amount' && `$${d.value} off`}
                      {d.type === 'free_item' && 'Free item'}
                    </span>
                    {d.description && <div className="mt-0.5 text-xs text-muted">{d.description}</div>}
                    <div className="mt-1 text-xs text-muted">
                      {d.starts_at ? `From ${fmtDate(d.starts_at)}` : 'Starts immediately'}
                      {' – '}{d.expires_at ? fmtDate(d.expires_at) : 'no end date'}
                      {' · '}{d.redemptions}{d.max_redemptions ? `/${d.max_redemptions}` : ''} used
                      {!d.active && ' · paused'}
                      {isEnded && ' · ended'}
                    </div>
                    {isSent && blast && <div className="mt-1 text-xs text-green-700">Sent {fmtDateTime(blast.sent_at!)}</div>}
                    {isScheduled && blast && (
                      <div className="mt-1 text-xs text-amber-700">
                        Scheduled for {fmtDateTime(blast.scheduled_at!)}{' '}
                        <button onClick={() => cancelSchedule(d.blast_id!)} className="underline">Cancel</button>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button onClick={() => redeemDiscountRow(d)} className="rounded-lg bg-ink px-3 py-1 text-xs font-semibold text-white">Redeem</button>
                    <div className="flex gap-2 text-xs font-semibold">
                      {!isSent && <button onClick={() => startEditDisc(d)} className="text-brand">Edit</button>}
                      <button onClick={() => toggleDiscount(d)} className="text-brand">{d.active ? 'Pause' : 'Resume'}</button>
                      <button onClick={() => deleteDiscount(d.id)} className="text-muted">Delete</button>
                    </div>
                    {!isSent && !isScheduled && d.blast_id && (
                      <button onClick={() => openBlast('discount_code', d.blast_id!, discBlastMessage(d))}
                        className="rounded-lg border border-brand px-3 py-1 text-xs font-semibold text-brand">Blast</button>
                    )}
                    {isEnded && (
                      <button onClick={() => refreshDisc(d)} className="rounded-lg border border-edge px-3 py-1 text-xs font-semibold">Refresh</button>
                    )}
                  </div>
                </div>
                {redeemMsgByRow[d.id] && <p className="mt-1 text-xs text-muted">{redeemMsgByRow[d.id]}</p>}
              </div>
            );
          })}
          {discs.length === 0 && <p className="text-sm text-muted">No discount codes yet.</p>}
        </div>

        <p className="mt-3 rounded-lg bg-cream p-2 text-xs text-muted">
          Reminder: this code is redeemed in person at your window — XLeats never touches payment.
          If you want customers to be able to use it for online orders too, add the same code as a
          real discount in Square (or whatever you use to take online orders) — it doesn&rsquo;t sync automatically.
        </p>
      </section>

      {/* Offers — birthday, holiday, welcome, custom */}
      <section className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="eyebrow mb-2">Offers</div>
        <p className="mb-3 text-sm text-muted">
          We deliver these to followers and nearby customers automatically when they qualify. You
          see counts only — never names, birthdays, or addresses. Redeem at the window with their code.
        </p>

        <div className="space-y-2">
          <select className={`${inputCls} w-full`} value={offerType} onChange={(e) => setOfferType(e.target.value as OfferType)}>
            {(Object.keys(OFFER_TYPE_LABEL) as OfferType[]).map((t) => (
              <option key={t} value={t}>{OFFER_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <input className={`${inputCls} w-full`} placeholder="e.g. Free dessert on your birthday"
            value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} />
          <input className={`${inputCls} w-full`} placeholder="Description (optional)"
            value={offerDesc} onChange={(e) => setOfferDesc(e.target.value)} />

          {usesTrigger && (
            <div className="rounded-lg border border-edge p-2">
              <div className="mb-2 flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={triggerMode === 'annual'} onChange={() => setTriggerMode('annual')} />
                  Every year on this date
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={triggerMode === 'once'} onChange={() => setTriggerMode('once')} />
                  One time only
                </label>
              </div>
              {triggerMode === 'annual' ? (
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Month (1-12)" inputMode="numeric"
                    value={triggerMonth} onChange={(e) => setTriggerMonth(e.target.value)} />
                  <input className={inputCls} placeholder="Day" inputMode="numeric"
                    value={triggerDay} onChange={(e) => setTriggerDay(e.target.value)} />
                </div>
              ) : (
                <input type="date" className={inputCls} value={triggerDate} onChange={(e) => setTriggerDate(e.target.value)} />
              )}
              <p className="mt-1 text-xs text-muted">
                Since this isn&rsquo;t tied to a customer&rsquo;s birthday, it goes out to every follower and
                nearby customer on this date — a Father&rsquo;s Day discount, a grand-opening anniversary, etc.
              </p>
            </div>
          )}
          {offerType === 'new_follower' && (
            <p className="text-xs text-muted">Sent the moment someone new follows your truck — a welcome offer.</p>
          )}
          {offerType === 'birthday' && (
            <p className="text-xs text-muted">Sent automatically to any customer whose birthday is today.</p>
          )}
          {canApplyAll && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={offerApplyAll} onChange={(e) => setOfferApplyAll(e.target.checked)} />
              Apply to all my trucks
            </label>
          )}

          <button onClick={addOffer} className="w-full rounded-lg bg-brand py-2 font-display font-bold text-white">Create offer</button>
        </div>

        <div className="mt-4 space-y-2">
          {offers.map((o) => {
            const s = offerStats[o.id];
            const blast = o.blast_id ? blasts[o.blast_id] : null;
            const isSent = !!blast?.sent_at;
            const isScheduled = !!blast?.scheduled_at && !isSent;
            return (
              <div key={o.id} className="rounded-lg border border-edge p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-muted">{OFFER_TYPE_LABEL[o.offer_type]}</span>
                    <div className="mt-1 font-semibold">{o.title}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-3 text-xs font-semibold">
                      <button onClick={() => toggleOffer(o)} className="text-brand">{o.active ? 'Pause' : 'Resume'}</button>
                      <button onClick={() => deleteOffer(o.id)} className="text-muted">Delete</button>
                    </div>
                    {!isSent && !isScheduled && o.blast_id && (
                      <button onClick={() => openBlast('offer', o.blast_id!, `🎉 New: ${o.title}! ${o.description ?? ''}`.trim())}
                        className="rounded-lg border border-brand px-3 py-1 text-xs font-semibold text-brand">Blast</button>
                    )}
                  </div>
                </div>
                {!o.active && <p className="mt-1 text-xs text-muted">Paused — not being sent right now.</p>}
                {isSent && blast && <p className="mt-1 text-xs text-green-700">Announced {fmtDateTime(blast.sent_at!)}</p>}
                {isScheduled && blast && (
                  <p className="mt-1 text-xs text-amber-700">
                    Scheduled for {fmtDateTime(blast.scheduled_at!)}{' '}
                    <button onClick={() => cancelSchedule(o.blast_id!)} className="underline">Cancel</button>
                  </p>
                )}
                {s && (
                  <div className="mt-2 flex gap-6">
                    <div><div className="font-display text-xl font-extrabold">{s.delivered}</div><div className="eyebrow">delivered</div></div>
                    <div><div className="font-display text-xl font-extrabold">{s.redeemed}</div><div className="eyebrow">redeemed</div></div>
                  </div>
                )}
              </div>
            );
          })}
          {offers.length === 0 && <p className="text-sm text-muted">No offers yet.</p>}
        </div>

        <div className="mt-4 border-t border-edge pt-3">
          <label className="mb-1 block text-xs font-semibold text-muted">Redeem a code at the window</label>
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 uppercase`} value={redeemOfferCode} onChange={(e) => setRedeemOfferCode(e.target.value)} />
            <button onClick={redeemOffer} className="rounded-lg bg-ink px-4 font-display font-bold text-white">Redeem</button>
          </div>
          {redeemOfferMsg && <p className="mt-1 text-xs text-muted">{redeemOfferMsg}</p>}
        </div>
      </section>

      {/* Contests */}
      <section className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="eyebrow mb-2">Contests</div>
        <p className="mb-3 text-sm text-muted">
          Predictions, first-to-enter, raffle drawings, a live Nth-customer counter, or a manual/social
          contest you run yourself (like an Instagram photo contest) and just record the winner here.
        </p>

        <div className="space-y-2">
          <select className={`${inputCls} w-full`} value={contestType} onChange={(e) => setContestType(e.target.value as ContestType)}>
            {(['prediction', 'first_n', 'raffle', 'manual', 'milestone'] as ContestType[]).map((t) => (
              <option key={t} value={t}>{CONTEST_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <input className={`${inputCls} w-full`} placeholder={contestType === 'milestone' ? 'Title (e.g. 100th Customer of the Day)' : 'Title (e.g. Guess the Cowboys score)'}
            value={contestTitle} onChange={(e) => setContestTitle(e.target.value)} />
          <input className={`${inputCls} w-full`} placeholder="Description (optional)"
            value={contestDesc} onChange={(e) => setContestDesc(e.target.value)} />
          <input className={`${inputCls} w-full`} placeholder="Prize (optional)"
            value={contestPrize} onChange={(e) => setContestPrize(e.target.value)} />
          <div className="flex gap-2">
            {contestType !== 'manual' && contestType !== 'milestone' && (
              <input type="datetime-local" className={inputCls} placeholder="Closes at"
                value={contestCloses} onChange={(e) => setContestCloses(e.target.value)} />
            )}
            {usesWinnerLimit && (
              <input className={inputCls} placeholder="# of winners" inputMode="numeric"
                value={contestWinnerLimit} onChange={(e) => setContestWinnerLimit(e.target.value)} />
            )}
            {contestType === 'milestone' && (
              <input className={inputCls} placeholder="Which customer # wins (e.g. 100)" inputMode="numeric"
                value={contestTargetCount} onChange={(e) => setContestTargetCount(e.target.value)} />
            )}
          </div>
          {contestType === 'manual' && (
            <p className="text-xs text-muted">
              No in-app entries — just describe the rules (e.g. &ldquo;post a photo with our truck tagged&rdquo;)
              and record the winner below once you&rsquo;ve picked one.
            </p>
          )}
          {contestType === 'milestone' && (
            <p className="text-xs text-muted">
              Once created, a big counter button shows up on your truck&rsquo;s main page — tap it after
              every sale. When you hit the target, confetti flies and you can announce the winner as a
              post with a photo. There&rsquo;s no way to know in advance whether the winning customer
              follows you, so this can&rsquo;t auto-notify their phone — you record who won by hand, right there.
            </p>
          )}
          {canApplyAll && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={contestApplyAll} onChange={(e) => setContestApplyAll(e.target.checked)} />
              Apply to all my trucks{contestType === 'milestone' ? ' (each truck gets its own counter)' : ''}
            </label>
          )}
          <button onClick={addContest} className="w-full rounded-lg bg-brand py-2 font-display font-bold text-white">Create contest</button>
        </div>

        <div className="mt-4 space-y-3">
          {contests.map((c) => {
            const winners = winnerEntries[c.id] ?? [];
            const names = winnerNames[c.id] ?? [];
            const nameFor = (entryId: string) => names.find((n) => n.entry_id === entryId)?.first_name;
            const blast = c.blast_id ? blasts[c.blast_id] : null;
            const isSent = !!blast?.sent_at;
            const isScheduled = !!blast?.scheduled_at && !isSent;
            return (
              <div key={c.id} className="rounded-lg border border-edge p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-muted">{CONTEST_TYPE_LABEL[c.type] ?? c.type}</span>
                    <div className="mt-1 font-semibold">{c.title}</div>
                    {c.prize && <div className="text-xs text-muted">Prize: {c.prize}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-3 text-xs font-semibold">
                      <span className="text-muted">{c.status}</span>
                      <button onClick={() => deleteContest(c.id)} className="text-muted">Delete</button>
                    </div>
                    {!isSent && !isScheduled && c.blast_id && (
                      <button onClick={() => openBlast('contest', c.blast_id!, `🎉 New contest: ${c.title}! ${c.description ?? ''}`.trim())}
                        className="rounded-lg border border-brand px-3 py-1 text-xs font-semibold text-brand">Blast</button>
                    )}
                  </div>
                </div>

                {isSent && blast && <p className="mt-1 text-xs text-green-700">Announced {fmtDateTime(blast.sent_at!)}</p>}
                {isScheduled && blast && (
                  <p className="mt-1 text-xs text-amber-700">
                    Scheduled for {fmtDateTime(blast.scheduled_at!)}{' '}
                    <button onClick={() => cancelSchedule(c.blast_id!)} className="underline">Cancel</button>
                  </p>
                )}

                {c.type === 'milestone' ? (
                  <div className="mt-1 text-xs text-muted">
                    {c.tap_count} / {c.target_count} tapped
                    {c.status === 'open' && ' — tap the counter on your truck’s main page after each sale'}
                  </div>
                ) : c.type !== 'manual' && (
                  <div className="mt-1 text-xs text-muted">{entryCounts[c.id] ?? 0} entries</div>
                )}

                {c.type === 'prediction' && c.status === 'open' && (
                  <div className="mt-2 flex gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="Correct answer (after it happens)"
                      value={answerDrafts[c.id] ?? c.answer ?? ''}
                      onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))} />
                    <button onClick={() => saveAnswer(c.id)} className="rounded-lg border border-edge px-3 text-sm font-semibold">Save answer</button>
                    <button onClick={() => resolveContest(c.id)} className="rounded-lg bg-ink px-3 text-sm font-semibold text-white">Pick winner</button>
                  </div>
                )}
                {(c.type === 'first_n' || c.type === 'raffle') && c.status === 'open' && (
                  <button onClick={() => resolveContest(c.id)} className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white">
                    {c.type === 'raffle' ? 'Draw winners' : 'Pick winners'}
                  </button>
                )}
                {c.type === 'manual' && c.status === 'open' && (
                  <div className="mt-2 flex gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="Who won? (e.g. @handle)"
                      value={winnerNoteDrafts[c.id] ?? ''}
                      onChange={(e) => setWinnerNoteDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))} />
                    <button onClick={() => saveManualWinner(c.id)} className="rounded-lg bg-ink px-3 text-sm font-semibold text-white">Save & close</button>
                  </div>
                )}

                {c.status === 'closed' && (
                  <div className="mt-2 text-sm">
                    <span className="font-semibold">Winner: </span>
                    {c.type === 'manual' || c.type === 'milestone'
                      ? (c.winner_note || 'Not recorded')
                      : winners.length > 0
                        ? winners.map((w) => {
                            const first = nameFor(w.id);
                            return c.type === 'prediction' && w.entry_value
                              ? `${first ?? '—'} (guessed ${w.entry_value})`
                              : (first ?? '—');
                          }).join(', ')
                        : 'No entries'}
                  </div>
                )}
              </div>
            );
          })}
          {contests.length === 0 && <p className="text-sm text-muted">No contests yet.</p>}
        </div>

        <div className="mt-4 border-t border-edge pt-3">
          <label className="mb-1 block text-xs font-semibold text-muted">Redeem a winner&rsquo;s code at the window</label>
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 uppercase`} value={redeemContestCodeInput} onChange={(e) => setRedeemContestCodeInput(e.target.value)} />
            <button onClick={redeemContest} className="rounded-lg bg-ink px-4 font-display font-bold text-white">Redeem</button>
          </div>
          {redeemContestMsg && <p className="mt-1 text-xs text-muted">{redeemContestMsg}</p>}
        </div>
      </section>

      {/* Blast review modal */}
      {blastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-ticket bg-white p-5 shadow-ticket">
            <h2 className="font-display text-xl font-extrabold">Review & send</h2>
            <p className="mt-1 text-xs text-muted">
              Goes out to your followers, plus nearby customers who&rsquo;ve opted in to hear from trucks
              they don&rsquo;t follow yet — take a second look before it sends.
            </p>
            <textarea className={`${inputCls} mt-3 w-full`} rows={3} value={blastMsg} onChange={(e) => setBlastMsg(e.target.value)} />
            <div className="mt-3 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={blastMode === 'now'} onChange={() => setBlastMode('now')} /> Send now
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={blastMode === 'schedule'} onChange={() => setBlastMode('schedule')} /> Schedule for later
              </label>
            </div>
            {blastMode === 'schedule' && (
              <input type="datetime-local" className={`${inputCls} mt-2 w-full`}
                value={blastScheduleAt} onChange={(e) => setBlastScheduleAt(e.target.value)} />
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setBlastModal(null)} className="flex-1 rounded-lg border border-edge py-2 text-sm font-semibold">Cancel</button>
              <button onClick={confirmBlast} className="flex-1 rounded-lg bg-brand py-2 font-display font-bold text-white">
                {blastMode === 'now' ? 'Send now' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
