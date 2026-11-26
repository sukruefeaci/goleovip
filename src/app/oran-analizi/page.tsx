import { inBackground } from "@/lib/background";
import Link from "next/link";
import { ODDS_PICK_MIN } from "@/lib/oddsMatch";
import { kickoffParts } from "@/lib/format";
import { getStore } from "@/lib/auth/store";
import { loadDay, recordOddsPicks, settleDay, trDate, type SnapEntry } from "@/lib/tracking";
import { dayPnl, oranItems, totalPnl } from "@/lib/pnl";
import { computeOddsPicks, oddsAttrs } from "@/lib/oddsPicks";
import { MIN_DAILY, selectShown, SHOW_LABEL, SHOW_MIN_ODD, SHOW_MIN_PROB, STRONG_PROB, type ShowTier } from "@/lib/showRule";
import ProfitBoard from "@/components/ProfitBoard";

export const dynamic = "force-dynamic";

const DAYS = { dun: -1, bugun: 0, yarin: 1 } as const;
type DayKey = keyof typeof DAYS;
const LABEL: Record<DayKey, string> = { dun: "Dün", bugun: "Bugün", yarin: "Yarın" };

type Row = {
  id: string;
  kickoff: string;
  league: string;
  home: string;
  away: string;
  href: string;
  pick: { market: string; selection: string; odd: number; rate: number; n: number; roi: number | null; confidence?: number; win: number } | null;
  result?: { hg: number; ag: number; won: boolean | null | undefined };
};

function OddsRowCard({ r, now, tier }: { r: Row; now: number; tier: ShowTier | null }) {
  const k = kickoffParts(r.kickoff);
  const started = new Date(r.kickoff).getTime() <= now;
  const st = r.result ? (r.result.won === true ? "won" : r.result.won === false ? "lost" : "void") : null;
  return (
    <Link href={r.href} className={`card oa-row${st ? ` oa-${st}` : ""}`}>
      <div className="oa-top">
        <span className="muted small">
          {k.date} · {k.time} · {r.league}
        </span>
        {tier && <span className={`tier tier-${tier}`}>{SHOW_LABEL[tier]}</span>}
        {r.result ? (
          <b className="mrow-score">
            {r.result.hg} - {r.result.ag}
          </b>
        ) : started ? (
          <span className="muted small">başladı / sonuç bekleniyor</span>
        ) : null}
      </div>
      <div className="oa-match">
        {r.home} <span className="vs">vs</span> {r.away}
      </div>
      {r.pick ? (
        <div className="oa-pick">
          <div className="oa-pick-main">
            <span className="muted small">{r.pick.market}</span>
            <b>{r.pick.selection}</b>
          </div>
          <span className="oddpill">{r.pick.odd.toFixed(2)}</span>
          <div className="oa-pick-stat">
            <span>Geçmişte</span>
            <b className={r.pick.rate >= 0.5 ? "pos" : ""}>%{Math.round(r.pick.rate * 100)}</b>
            <small className="muted">{r.pick.n.toLocaleString("tr-TR")} maç</small>
          </div>
          <div className="oa-pick-stat">
            <span>Kazanma</span>
            <b className={r.pick.win * 100 >= STRONG_PROB ? "pos" : ""}>%{Math.round(r.pick.win * 100)}</b>
          </div>
          {st && <span className={`mp-badge ${st}`}>{st === "won" ? "✓ Tuttu" : st === "lost" ? "✗ Tutmadı" : "—"}</span>}
        </div>
      ) : (
        <div className="muted small">{ODDS_PICK_MIN.toFixed(2)} üstünde yeterli geçmiş veriye sahip tercih yok.</div>
      )}
    </Link>
  );
}

export default async function OddsAnalysisPage({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams;
  const day: DayKey = gun && gun in DAYS ? (gun as DayKey) : "bugun";
  const { rows: computed, banner, histCount, loading, winOf } = await computeOddsPicks();

  // Takip: tercihleri günlük kayda ekle, bitmiş maçları sonuçlandır, 100 TL kâr/zarar
  const tracking = !!getStore();
  const now = Date.now();
  const today = trDate(now),
    yesterday = trDate(now - 86400_000);
  const snapsByDate = new Map<string, SnapEntry[]>();
  let board: { t: ReturnType<typeof dayPnl>; y: ReturnType<typeof dayPnl>; total: Awaited<ReturnType<typeof totalPnl>> } | null = null;
  if (tracking) {
    // Kayıt ve sonuçlandırma sayfayı bekletmez (arka planda)
    if (!loading) {
      const toRecord = computed.map(({ a, pick }) => ({
        id: a.match.id,
        kickoff: a.match.kickoff,
        pick: pick && { key: pick.key, market: pick.market, selection: pick.selection, odd: pick.odd, rate: pick.rate, n: pick.n, confidence: pick.confidence },
      }));
      // aynı günlük kayda sırayla yazılsın (önce tercih kaydı, sonra sonuçlandırma)
      inBackground(async () => {
        await recordOddsPicks(toRecord, now).catch(() => {});
        await Promise.all([settleDay(today, now, 8000), settleDay(yesterday, now, 8000)]);
      });
    } else inBackground(() => Promise.all([settleDay(today, now, 8000), settleDay(yesterday, now, 8000)]));
    const [ts, ys] = await Promise.all([loadDay(today).catch(() => [] as SnapEntry[]), loadDay(yesterday).catch(() => [] as SnapEntry[])]);
    snapsByDate.set(today, ts);
    snapsByDate.set(yesterday, ys);
    const t = dayPnl(oranItems(ts)),
      y = dayPnl(oranItems(ys));
    board = { t, y, total: await totalPnl("oran", { [today]: t, [yesterday]: y }).catch(() => null) };
  }

  // Seçilen günün maçları: başlamamışlar güncel hesaptan, başlamış / bitmişler kayıttan (sonuçla)
  const date = trDate(now + DAYS[day] * 86400_000);
  const snaps = snapsByDate.get(date) ?? (tracking ? await loadDay(date).catch(() => [] as SnapEntry[]) : []);
  const byId = new Map<string, Row>();
  for (const e of snaps) {
    if (!e.oddsPick) continue;
    const o = e.oddsPick;
    byId.set(e.id, {
      id: e.id,
      kickoff: e.kickoff,
      league: e.league,
      home: e.home,
      away: e.away,
      href: `/mac/${e.id}`,
      pick: { market: o.market, selection: o.selection, odd: o.odd, rate: o.rate, n: o.n, roi: o.rate * o.odd - 1, confidence: o.confidence, win: winOf(o.rate, oddsAttrs(o, e)) },
      result: e.result ? { hg: e.result.hg, ag: e.result.ag, won: e.result.oddsWon } : undefined,
    });
  }
  for (const { a, pick } of computed) {
    if (trDate(new Date(a.match.kickoff).getTime()) !== date) continue;
    const started = new Date(a.match.kickoff).getTime() <= now;
    if (started && byId.has(a.match.id)) continue; // başlamışsa kayıttaki tercih geçerli
    byId.set(a.match.id, {
      id: a.match.id,
      kickoff: a.match.kickoff,
      league: a.match.league,
      home: a.match.home.name,
      away: a.match.away.name,
      href: `/oran-analizi/${a.match.id}`,
      pick: pick && { market: pick.market, selection: pick.selection, odd: pick.odd, rate: pick.rate, n: pick.n, roi: pick.roi, confidence: pick.confidence, win: winOf(pick.rate, oddsAttrs(pick, { id: a.match.id, league: a.match.league })) },
      result: byId.get(a.match.id)?.result,
    });
  }
  const rows = [...byId.values()].sort((x, y) => x.kickoff.localeCompare(y.kickoff));
  const { shown, rest, tier } = selectShown(rows, (r) => r.pick && { odd: r.pick.odd, prob: r.pick.win });
  const decided = shown.filter((r) => r.result && (r.result.won === true || r.result.won === false));
  const hits = decided.filter((r) => r.result!.won).length;

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}
      <div className="seg oa-switch">
        <Link href="/oran-analizi" className="on">
          📊 Oran analizi
        </Link>
        <Link href="/oran-acigi">🔍 Oran açığı</Link>
      </div>
      <div className="page-head">
        <h1>Oran analizi</h1>
        <span className="muted small">{histCount.toLocaleString("tr-TR")} geçmiş maç</span>
      </div>

      <div className="daytabs" role="tablist">
        {(Object.keys(DAYS) as DayKey[]).map((k) => (
          <Link key={k} href={k === "bugun" ? "/oran-analizi" : `/oran-analizi?gun=${k}`} className={k === day ? "on" : ""} role="tab" aria-selected={k === day}>
            {LABEL[k]}
            <small>{kickoffParts(new Date(now + DAYS[k] * 86400_000).toISOString()).date}</small>
          </Link>
        ))}
      </div>

      {board && <ProfitBoard title="100 TL ile kâr/zarar" today={board.t} yesterday={board.y} total={board.total} />}
      {loading && <div className="notice subtle">Geçmiş maç arşivi yükleniyor; birkaç saniye sonra sayfayı yenile.</div>}

      {decided.length > 0 && (
        <div className="daystat card">
          <span>
            Gösterilenler: <b>{hits}</b> / {decided.length} tuttu
          </span>
          <b className={hits / decided.length >= 0.5 ? "pos" : "neg"}>%{Math.round((hits / decided.length) * 100)}</b>
        </div>
      )}

      <p className="muted small rule-note">
        Geçmişte aynı oranla oynanmış maçlarda en çok tutan tercih. Oran {SHOW_MIN_ODD.toFixed(2)}+ ve kazanma olasılığı %{SHOW_MIN_PROB}+ (%{STRONG_PROB}+{" "}
        <b>Güçlü</b>); günde en az {MIN_DAILY} maç, azsa en olasılarla tamamlanır (<b>Aday</b>). Kazanma: geçmiş tutma oranı, bu sistemin kendi sonuçlarıyla
        düzeltilmiş hali.
      </p>

      <div className="oa-list">
        {shown.map((r) => (
          <OddsRowCard key={r.id} r={r} now={now} tier={tier(r)} />
        ))}
        {!rows.length && <div className="card pad empty">Bu gün için maç yok.</div>}
      </div>

      {rest.length > 0 && (
        <details className="rest">
          <summary>Diğer maçlar ({rest.length})</summary>
          <div className="oa-list">
            {rest.map((r) => (
              <OddsRowCard key={r.id} r={r} now={now} tier={null} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
