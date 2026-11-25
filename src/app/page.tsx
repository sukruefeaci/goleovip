import Link from "next/link";
import { kickoffParts, pct, signedPct } from "@/lib/format";
import { choosePick } from "@/lib/pick";
import { loadAnalyses } from "@/lib/data";
import type { Analysis } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const { analyses, source, banner } = await loadAnalyses();

  const groups = new Map<string, Analysis[]>();
  for (const a of analyses) {
    const d = kickoffParts(a.match.kickoff).date;
    groups.set(d, [...(groups.get(d) ?? []), a]);
  }

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}

      <div className="page-head">
        <h1>Maçlar</h1>
        <span className="muted small">
          {analyses.length} maç · kaynak: {source}
        </span>
      </div>

      {[...groups.entries()].map(([day, list]) => (
        <div key={day} className="day">
          <div className="day-label">{day}</div>
          <div className="match-list">
            {list.map((a) => {
              const k = kickoffParts(a.match.kickoff);
              const pick = choosePick(a);
              const [p1, px, p2] = a.model1x2;
              const htftBest = [...a.htft].sort((x, y) => y.prob - x.prob)[0];
              return (
                <Link key={a.match.id} href={`/mac/${a.match.id}`} className="match-row">
                  <div className="mr-time">{k.time}</div>
                  <div className="mr-body">
                    <span className="chip">{a.match.league}</span>
                    <div className="mr-teams">
                      <span>{a.match.home.name}</span>
                      <span className="vs">vs</span>
                      <span>{a.match.away.name}</span>
                    </div>
                    <div className="tri" title="Model: ev / beraberlik / deplasman">
                      <i className="t1" style={{ flex: p1 }}>
                        {pct(p1, 0)}
                      </i>
                      <i className="tx" style={{ flex: px }}>
                        {pct(px, 0)}
                      </i>
                      <i className="t2" style={{ flex: p2 }}>
                        {pct(p2, 0)}
                      </i>
                    </div>
                    <div className="mr-htft">
                      İY/MS en olası: <b>{htftBest.outcome}</b> <span className="muted">{pct(htftBest.prob, 0)}</span>
                    </div>
                    {pick && (
                      <div className={`mr-pick lvl-${pick.level === "güçlü" ? "strong" : pick.level === "zayıf" ? "weak" : "none"}`}>
                        <span className="ai">AI</span>
                        {pick.level === "değer yok" ? (
                          <span>Değer yok — pas geç</span>
                        ) : (
                          <span>
                            {pick.row.market}: <b>{pick.row.selection}</b> <span className="oddpill">{pick.row.odd.toFixed(2)}</span>{" "}
                            <span className={pick.row.ev >= 0 ? "pos" : "neg"}>{signedPct(pick.row.ev)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mr-go" aria-hidden>
                    ›
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {!analyses.length && <div className="empty card">Şu an analiz edilecek maç yok.</div>}
    </div>
  );
}
