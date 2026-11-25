import Link from "next/link";
import { loadAnalyses } from "@/lib/data";
import { loadHistory, TOLERANCE } from "@/lib/history";
import { bestOddsPick, matchAllSelections, ODDS_PICK_MIN } from "@/lib/oddsMatch";
import { kickoffParts, signedPct } from "@/lib/format";
import type { Analysis } from "@/lib/types";

export const dynamic = "force-dynamic";

// Aynı analiz ve arşiv için sonucu yeniden hesaplama (analizler ~3 dk'da bir yenilenir)
let cache: { key: unknown; hist: unknown; rows: { a: Analysis; pick: ReturnType<typeof bestOddsPick> }[] } | null = null;

export default async function OddsAnalysisPage() {
  const [{ analyses, banner }, hist] = await Promise.all([loadAnalyses(), loadHistory()]);
  if (!cache || cache.key !== analyses || cache.hist !== hist.matches) {
    cache = {
      key: analyses,
      hist: hist.matches,
      rows: analyses.map((a) => ({
        a,
        pick: bestOddsPick(matchAllSelections(a.match.iddaa, hist.matches, TOLERANCE.normal, a.match.home.name, a.match.away.name, ODDS_PICK_MIN)),
      })),
    };
  }
  const rows = cache.rows.filter(({ a }) => new Date(a.match.kickoff).getTime() > Date.now());

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}
      <div className="page-head">
        <h1>Oran analizi</h1>
        <span className="muted small">{ODDS_PICK_MIN.toFixed(2)} ve üstü · {hist.matches.length.toLocaleString("tr-TR")} geçmiş maç</span>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Her maç için, geçmişte aynı oranla oynanmış maçlarda en güvenilir sonucu veren tek tercih. Ayrıntı için maça dokun.
      </p>

      <div className="oa-list">
        {rows.map(({ a, pick }) => {
          const k = kickoffParts(a.match.kickoff);
          return (
            <Link key={a.match.id} href={`/oran-analizi/${a.match.id}`} className="card oa-row">
              <div className="oa-top">
                <span className="muted small">
                  {k.date} · {k.time} · {a.match.league}
                </span>
              </div>
              <div className="oa-match">
                {a.match.home.name} <span className="vs">vs</span> {a.match.away.name}
              </div>
              {pick ? (
                <div className="oa-pick">
                  <div className="oa-pick-main">
                    <span className="muted small">{pick.market}</span>
                    <b>{pick.selection}</b>
                  </div>
                  <span className="oddpill">{pick.odd.toFixed(2)}</span>
                  <div className="oa-pick-stat">
                    <span>Geçmişte</span>
                    <b className={pick.rate >= 0.5 ? "pos" : ""}>%{Math.round(pick.rate * 100)}</b>
                    <small className="muted">{pick.n.toLocaleString("tr-TR")} maç</small>
                  </div>
                  <div className="oa-pick-stat">
                    <span>Getiri</span>
                    <b className={(pick.roi ?? 0) >= 0 ? "pos" : "neg"}>{signedPct(pick.roi ?? 0)}</b>
                  </div>
                </div>
              ) : (
                <div className="muted small">{ODDS_PICK_MIN.toFixed(2)} üstünde yeterli geçmiş veriye sahip tercih yok.</div>
              )}
            </Link>
          );
        })}
        {!rows.length && <div className="card pad empty">Analiz edilecek maç yok.</div>}
      </div>
    </div>
  );
}
