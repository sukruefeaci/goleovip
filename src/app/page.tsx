import { inBackground } from "@/lib/background";
import Link from "next/link";
import { kickoffParts } from "@/lib/format";
import { loadAnalyses } from "@/lib/data";
import type { Analysis } from "@/lib/types";
import { loadDay, mainPick, settleDay, trDate, type SnapEntry, type SnapPick } from "@/lib/tracking";
import { getStore } from "@/lib/auth/store";
import { winLevel } from "@/components/WinConfidence";
import ProfitBoard from "@/components/ProfitBoard";
import { MIN_DAILY, selectShown, SHOW_LABEL, SHOW_MIN_ODD, SHOW_MIN_PROB, STRONG_PROB, type ShowTier } from "@/lib/showRule";
import { dayPnl, macItems, totalPnl } from "@/lib/pnl";

export const dynamic = "force-dynamic";

const DAYS = { dun: -1, bugun: 0, yarin: 1 } as const;
type DayKey = keyof typeof DAYS;
const LABEL: Record<DayKey, string> = { dun: "Dün", bugun: "Bugün", yarin: "Yarın" };

type Item = { id: string; kickoff: string; league: string; home: string; away: string; pick: SnapPick | null; result?: SnapEntry["result"]; live: boolean };

function fromAnalysis(a: Analysis, snap?: SnapEntry): Item {
  const p = mainPick(a);
  return {
    id: a.match.id,
    kickoff: a.match.kickoff,
    league: a.match.league,
    home: a.match.home.name,
    away: a.match.away.name,
    pick: p && { key: p.key, category: p.category, market: p.market, selection: p.selection, odd: p.odd, prob: p.prob, confidence: p.confidence },
    result: snap?.result,
    live: true,
  };
}

function PickLine({ p, result }: { p: SnapPick; result?: SnapEntry["result"] }) {
  const wl = winLevel(p.prob);
  const state = result ? (result.pickWon === true ? "won" : result.pickWon === false ? "lost" : "void") : "open";
  return (
    <div className={`mp mp-${state}`}>
      <div className="mp-main">
        <span className="muted small">{p.market}</span>
        <b>{p.selection}</b>
      </div>
      <span className="oddpill">{p.odd.toFixed(2)}</span>
      <div className="mp-stat">
        <span>Kazanma</span>
        <b className={wl.cls}>%{Math.round(p.prob * 100)}</b>
      </div>
      {state !== "open" && <span className={`mp-badge ${state}`}>{state === "won" ? "✓ Tuttu" : state === "lost" ? "✗ Tutmadı" : "—"}</span>}
    </div>
  );
}

function MatchRow({ it, now, tier }: { it: Item; now: number; tier: ShowTier | null }) {
  const k = kickoffParts(it.kickoff);
  const started = new Date(it.kickoff).getTime() <= now;
  return (
    <Link href={`/mac/${it.id}`} className="card mrow">
      <div className="mrow-top">
        <span className="mrow-time">{k.time}</span>
        <span className="chip">{it.league}</span>
        {tier && <span className={`tier tier-${tier}`}>{SHOW_LABEL[tier]}</span>}
        <span className="mrow-status">
          {it.result ? (
            <b className="mrow-score">
              {it.result.hg} - {it.result.ag}
            </b>
          ) : started ? (
            <span className="muted small">sonuç bekleniyor</span>
          ) : null}
        </span>
      </div>
      <div className="mrow-teams">
        {it.home} <span className="vs">vs</span> {it.away}
      </div>
      {it.pick ? <PickLine p={it.pick} result={it.result} /> : <div className="muted small">Oranı 1.50 ve üstü tercih yok</div>}
    </Link>
  );
}

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams;
  const day: DayKey = gun && gun in DAYS ? (gun as DayKey) : "bugun";
  const now = Date.now();
  const date = trDate(now + DAYS[day] * 86400_000);
  const tracking = !!getStore();

  const today = trDate(now),
    yesterday = trDate(now - 86400_000);
  // Bitmiş maçların sonuçlandırılması sayfayı bekletmez (arka planda; sonuç bir sonraki açılışta görünür)
  if (tracking) inBackground(() => Promise.all([settleDay(today, now, 8000), settleDay(yesterday, now, 8000)]));
  const loadSnaps = (d: string) => (tracking ? loadDay(d).catch(() => [] as SnapEntry[]) : Promise.resolve([] as SnapEntry[]));
  const [{ analyses, banner }, todaySnaps, ydaySnaps, otherSnaps] = await Promise.all([
    loadAnalyses(),
    loadSnaps(today),
    loadSnaps(yesterday),
    date !== today && date !== yesterday ? loadSnaps(date) : Promise.resolve([] as SnapEntry[]),
  ]);
  const snaps = date === today ? todaySnaps : date === yesterday ? ydaySnaps : otherSnaps;
  const pTodayM = dayPnl(macItems(todaySnaps)),
    pYdayM = dayPnl(macItems(ydaySnaps));
  const totalM = tracking ? await totalPnl("mac", { [today]: pTodayM, [yesterday]: pYdayM }).catch(() => null) : null;

  const snapById = new Map(snaps.map((s) => [s.id, s]));
  const live = analyses.filter((a) => trDate(new Date(a.match.kickoff).getTime()) === date);
  const liveIds = new Set(live.map((a) => a.match.id));
  const items: Item[] = [
    ...live.map((a) => fromAnalysis(a, snapById.get(a.match.id))),
    ...snaps.filter((s) => !liveIds.has(s.id)).map((s) => ({ ...s, pick: s.pick, result: s.result, live: false })),
  ].sort((x, y) => x.kickoff.localeCompare(y.kickoff));

  // Gösterim: oran ≥ 1.50 ve kazanma olasılığı ≥ %60; günde en az 10 maç (azsa en olasılarla tamamlanır)
  const { shown, rest, tier } = selectShown(items, (i) => i.pick && { odd: i.pick.odd, prob: i.pick.prob });
  const decided = shown.filter((i) => i.result && i.result.pickWon !== null && i.result.pickWon !== undefined);
  const hits = decided.filter((i) => i.result!.pickWon).length;

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}

      <div className="page-head">
        <h1>Maçlar</h1>
        <span className="muted small">{items.length} maç analiz edildi</span>
      </div>

      <div className="daytabs" role="tablist">
        {(Object.keys(DAYS) as DayKey[]).map((k) => (
          <Link key={k} href={k === "bugun" ? "/" : `/?gun=${k}`} className={k === day ? "on" : ""} role="tab" aria-selected={k === day}>
            {LABEL[k]}
            <small>{kickoffParts(new Date(now + DAYS[k] * 86400_000).toISOString()).date}</small>
          </Link>
        ))}
      </div>

      {tracking && <ProfitBoard title="100 TL ile kâr/zarar" today={pTodayM} yesterday={pYdayM} total={totalM} />}

      {decided.length > 0 && (
        <div className="daystat card">
          <span>
            Gösterilenler: <b>{hits}</b> / {decided.length} tuttu
          </span>
          <b className={hits / decided.length >= 0.55 ? "pos" : "neg"}>%{Math.round((hits / decided.length) * 100)}</b>
          <span className="muted small">beklenen ≈ %{Math.round((decided.reduce((s, i) => s + (i.pick?.prob ?? 0), 0) / decided.length) * 100)}</span>
        </div>
      )}

      <p className="muted small rule-note">
        Oran {SHOW_MIN_ODD.toFixed(2)}+ ve kazanma olasılığı %{SHOW_MIN_PROB}+ olan tercihler (%{STRONG_PROB}+ <b>Güçlü</b>). Günde en az {MIN_DAILY} maç
        gösterilir; şartı geçen azsa en olası tercihlerle tamamlanır (<b>Aday</b>).
      </p>

      {!tracking && day === "dun" && (
        <div className="notice subtle">Geçmiş maçların kaydı için veritabanı (Upstash) bağlı olmalı; /kurulum sayfasından kontrol edebilirsin.</div>
      )}

      <div className="match-list">
        {shown.map((it) => (
          <MatchRow key={it.id} it={it} now={now} tier={tier(it)} />
        ))}
        {!items.length && (
          <div className="card pad empty">
            {day === "dun"
              ? tracking
                ? "Dün için kayıtlı maç yok. Kayıt, sitenin açıldığı günlerden itibaren birikir."
                : "Kayıt yok."
              : "Bu gün için analiz edilmiş maç yok."}
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <details className="rest">
          <summary>Diğer maçlar ({rest.length})</summary>
          <div className="match-list">
            {rest.map((it) => (
              <MatchRow key={it.id} it={it} now={now} tier={null} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
