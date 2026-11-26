import { inBackground } from "@/lib/background";
import Link from "next/link";
import { kickoffParts } from "@/lib/format";
import { loadAnalyses } from "@/lib/data";
import { getStore } from "@/lib/auth/store";
import { loadDay, mainPick, settleDay, trDate, type SnapEntry } from "@/lib/tracking";
import { loadLiveDay, settleLive, type LiveRecord } from "@/lib/liveTracking";
import { analyzedRec } from "@/lib/pnl";
import { computeOddsPicks } from "@/lib/oddsPicks";
import { selectShown, SHOW_LABEL, SHOW_MIN_ODD, SHOW_MIN_PROB, STRONG_PROB, tierOf, type ShowTier } from "@/lib/showRule";

export const dynamic = "force-dynamic";

/**
 * Seçki: üç sistemin (Maçlar, Canlı, Oranlar) kendi güvenine göre şartı geçen tercihleri, ayrı ayrı.
 * Şart: oran ≥ 1.50, güven ≥ %60; %70+ Güçlü. Sistemlerin hesabı değişmez.
 */

type Pick = {
  key: string;
  href: string;
  kickoff: string;
  league: string;
  home: string;
  away: string;
  label: string;
  odd: number;
  prob: number; // kazanma olasılığı (0–1)
  extra?: string; // ör. canlıda öneri anındaki dakika ve skor
  result?: { hg: number; ag: number; won: boolean | null | undefined };
  tier: ShowTier | null;
};

const DAYS = { dun: -1, bugun: 0 } as const;
type DayKey = keyof typeof DAYS;

function PickRow({ p, now }: { p: Pick; now: number }) {
  const k = kickoffParts(p.kickoff);
  const st = p.result ? (p.result.won === true ? "won" : p.result.won === false ? "lost" : "void") : null;
  const started = new Date(p.kickoff).getTime() <= now;
  return (
    <Link href={p.href} className={`card sk-row${st ? ` oa-${st}` : ""}`}>
      <div className="sk-top">
        <span className="muted small">
          {k.time} · {p.league}
        </span>
        {p.tier && <span className={`tier tier-${p.tier}`}>{SHOW_LABEL[p.tier]}</span>}
      </div>
      <div className="sk-teams">
        {p.home} <span className="vs">vs</span> {p.away}
      </div>
      <div className="sk-pick">
        <b>{p.label}</b>
        <span className="oddpill">{p.odd.toFixed(2)}</span>
        <span className={`small ${p.prob * 100 >= STRONG_PROB ? "pos" : ""}`}>kazanma %{Math.round(p.prob * 100)}</span>
        {p.extra && <span className="muted small">{p.extra}</span>}
        {st ? (
          <span className={`mp-badge ${st}`}>
            {st === "won" ? "✓" : st === "lost" ? "✗" : "—"} {p.result!.hg}-{p.result!.ag}
          </span>
        ) : started ? (
          <span className="muted small">sonuç bekleniyor</span>
        ) : null}
      </div>
    </Link>
  );
}

const SECTION_MIN = 5;

function Section({ title, sub, picks: all, now }: { title: string; sub: string; picks: Pick[]; now: number }) {
  // Şartı geçenler; azsa sistemin en olası tercihleriyle en az 5'e tamamlanır (Aday)
  const sel = selectShown(all, (p) => ({ odd: p.odd, prob: p.prob }), SECTION_MIN);
  const picks = sel.shown.map((p) => ({ ...p, tier: sel.tier(p) }));
  const decided = picks.filter((p) => p.result && (p.result.won === true || p.result.won === false));
  const hits = decided.filter((p) => p.result!.won).length;
  const strong = picks.filter((p) => p.tier === "guclu");
  const mid = picks.filter((p) => p.tier === "orta");
  const cand = picks.filter((p) => p.tier === "aday");
  return (
    <section className="sk-sec">
      <div className="sk-head">
        <h2>{title}</h2>
        {decided.length > 0 && (
          <span className="small">
            <b className={hits / decided.length >= 0.5 ? "pos" : "neg"}>
              {hits}/{decided.length} tuttu
            </b>{" "}
            <span className="muted">(%{Math.round((hits / decided.length) * 100)})</span>
          </span>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        {sub}
      </p>
      {!picks.length && <div className="card pad empty small">Bu gün için tercih yok.</div>}
      {strong.length > 0 && <h3 className="sk-tier">Güçlü · kazanma %{STRONG_PROB}+</h3>}
      <div className="sk-list">
        {strong.map((p) => (
          <PickRow key={p.key} p={p} now={now} />
        ))}
      </div>
      {mid.length > 0 && (
        <h3 className="sk-tier">
          Orta · kazanma %{SHOW_MIN_PROB}–{STRONG_PROB - 1}
        </h3>
      )}
      <div className="sk-list">
        {mid.map((p) => (
          <PickRow key={p.key} p={p} now={now} />
        ))}
      </div>
      {cand.length > 0 && <h3 className="sk-tier">Aday · şartın altında ama bu sistemin en olası tercihleri</h3>}
      <div className="sk-list">
        {cand.map((p) => (
          <PickRow key={p.key} p={p} now={now} />
        ))}
      </div>
    </section>
  );
}

const byTime = (a: Pick, b: Pick) => a.kickoff.localeCompare(b.kickoff) || b.prob - a.prob;

export default async function SeckiPage({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams;
  const day: DayKey = gun === "dun" ? "dun" : "bugun";
  const now = Date.now();
  const date = trDate(now + DAYS[day] * 86400_000);
  const tracking = !!getStore();

  if (tracking) inBackground(() => Promise.all([settleDay(date, now, 8000), settleLive(date, now, 8000)]));
  const [{ analyses }, snaps, liveRecs, odds] = await Promise.all([
    loadAnalyses(),
    tracking ? loadDay(date).catch(() => [] as SnapEntry[]) : Promise.resolve([] as SnapEntry[]),
    tracking ? loadLiveDay(date).catch(() => [] as LiveRecord[]) : Promise.resolve([] as LiveRecord[]),
    computeOddsPicks(),
  ]);
  const snapById = new Map(snaps.map((s) => [s.id, s]));
  const todays = analyses.filter((a) => trDate(new Date(a.match.kickoff).getTime()) === date);

  // ---- Maçlar sistemi: maç başına tek tercih (başlamışsa kayıttaki)
  const mac = new Map<string, Pick>();
  const addMac = (id: string, e: { kickoff: string; league: string; home: string; away: string }, p: { market: string; selection: string; odd: number; prob: number } | null, result?: SnapEntry["result"]) => {
    if (!p || p.odd < SHOW_MIN_ODD) return;
    const tier = tierOf(p.odd, p.prob);
    mac.set(id, {
      key: `m-${id}`,
      href: `/mac/${id}`,
      ...e,
      label: `${p.market} · ${p.selection}`,
      odd: p.odd,
      prob: p.prob,
      result: result ? { hg: result.hg, ag: result.ag, won: result.pickWon } : undefined,
      tier,
    });
  };
  for (const s of snaps) if (new Date(s.kickoff).getTime() <= now || !todays.some((a) => a.match.id === s.id)) addMac(s.id, s, s.pick, s.result);
  for (const a of todays) {
    if (new Date(a.match.kickoff).getTime() <= now && snapById.has(a.match.id)) continue;
    addMac(a.match.id, { kickoff: a.match.kickoff, league: a.match.league, home: a.match.home.name, away: a.match.away.name }, mainPick(a), snapById.get(a.match.id)?.result);
  }

  // ---- Oranlar sistemi
  const oran = new Map<string, Pick>();
  for (const s of snaps) {
    const o = s.oddsPick;
    if (!o || o.odd < SHOW_MIN_ODD) continue;
    const tier = tierOf(o.odd, odds.winOf(o.rate));
    if (new Date(s.kickoff).getTime() > now && odds.rows.some((r) => r.a.match.id === s.id)) continue; // başlamamışsa güncel hesap
    oran.set(s.id, {
      key: `o-${s.id}`,
      href: `/mac/${s.id}`,
      kickoff: s.kickoff,
      league: s.league,
      home: s.home,
      away: s.away,
      label: `${o.market} · ${o.selection}`,
      odd: o.odd,
      prob: odds.winOf(o.rate),
      result: s.result ? { hg: s.result.hg, ag: s.result.ag, won: s.result.oddsWon } : undefined,
      tier,
    });
  }
  for (const { a, pick } of odds.rows) {
    if (trDate(new Date(a.match.kickoff).getTime()) !== date || oran.has(a.match.id)) continue;
    if (!pick || pick.odd < SHOW_MIN_ODD) continue;
    const tier = tierOf(pick.odd, odds.winOf(pick.rate));
    oran.set(a.match.id, {
      key: `o-${a.match.id}`,
      href: `/oran-analizi/${a.match.id}`,
      kickoff: a.match.kickoff,
      league: a.match.league,
      home: a.match.home.name,
      away: a.match.away.name,
      label: `${pick.market} · ${pick.selection}`,
      odd: pick.odd,
      prob: odds.winOf(pick.rate),
      tier,
    });
  }

  // ---- Canlı sistemi: o gün yapılan canlı öneriler (öneri anındaki oran ve güvenle)
  const canli: Pick[] = [];
  for (const r of liveRecs) {
    if (!analyzedRec(r) || !r.odd || r.odd < SHOW_MIN_ODD) continue;
    const tier = tierOf(r.odd, r.prob);
    canli.push({
      key: `c-${r.fotmobId}-${r.label}`,
      href: "/canli",
      kickoff: r.at,
      league: r.league,
      home: r.home,
      away: r.away,
      label: r.label,
      odd: r.odd!,
      prob: r.prob,
      extra: `${r.minute} ${r.hg}-${r.ag} iken`,
      result: r.result ? { hg: r.result.hg, ag: r.result.ag, won: r.result.won } : undefined,
      tier,
    });
  }

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>Seçki</h1>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Üç sistemin şartı geçen tercihleri: oran {SHOW_MIN_ODD.toFixed(2)} ve üstü, kazanma olasılığı %{SHOW_MIN_PROB} ve üstü (%{STRONG_PROB}+
        Güçlü). Her sistem olasılığı kendi yöntemiyle hesaplar ve kendi sonuçlarına göre düzeltir ("%70 diyorsa %70"); aynı maça farklı olasılık vermeleri normaldir.
      </p>
      <div className="daytabs sk-tabs" role="tablist">
        {(Object.keys(DAYS) as DayKey[]).map((k) => (
          <Link key={k} href={k === "bugun" ? "/secki" : `/secki?gun=${k}`} className={k === day ? "on" : ""} role="tab" aria-selected={k === day}>
            {k === "bugun" ? "Bugün" : "Dün"}
            <small>{kickoffParts(new Date(now + DAYS[k] * 86400_000).toISOString()).date}</small>
          </Link>
        ))}
      </div>

      <Section
        title="⚽ Maçlar sistemi"
        sub="Maç öncesi model (piyasa + istatistik)."
        picks={[...mac.values()].sort(byTime)}
        now={now}
      />
      <Section
        title="🔴 Canlı sistemi"
        sub="Canlı model (tempo, skor, kalan süre, maç öncesi analiz). Öneri anındaki iddaa canlı oranı ve olasılık."
        picks={canli.sort(byTime)}
        now={now}
      />
      <Section
        title="📊 Oranlar sistemi"
        sub="Geçmişte aynı oranlı maçlardaki tutma oranı (kendi sonuçlarına göre düzeltilmiş)."
        picks={[...oran.values()].sort(byTime)}
        now={now}
      />
    </div>
  );
}
