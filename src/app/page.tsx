import Link from "next/link";
import { getProvider } from "@/lib/providers";
import { analyze } from "@/lib/model";
import { kickoffParts, pct, signedPct } from "@/lib/format";
import { choosePick } from "@/lib/pick";
import { currentUser } from "@/lib/auth/current";
import CouponBuilder from "@/components/CouponBuilder";
import type { CouponMatch } from "@/lib/coupon";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const matches = await getProvider().listMatches();
  const analyses = matches.map(analyze).sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));
  const banner = analyses[0]?.match.warnings.find((w) => w.startsWith("Canlı"));

  const valueCount = analyses.reduce((n, a) => n + a.rows.filter((r) => r.rating === "Avantajlı").length, 0);
  const margins = analyses.map((a) => a.iddaaMargin).filter((m): m is number => m !== null);
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;

  const couponMatches: CouponMatch[] = analyses.map((a) => ({
    id: a.match.id,
    home: a.match.home.name,
    away: a.match.away.name,
    league: a.match.league,
    kickoff: a.match.kickoff,
    options: a.rows.map((r) => ({
      key: r.key,
      market: r.market,
      selection: r.selection,
      category: r.category,
      odd: r.odd,
      prob: r.prob,
      sigma: r.sigma,
      ev: r.ev,
      mbc: r.mbc,
    })),
  }));

  const groups = new Map<string, typeof analyses>();
  for (const a of analyses) {
    const d = kickoffParts(a.match.kickoff).date;
    groups.set(d, [...(groups.get(d) ?? []), a]);
  }

  return (
    <>
      {banner && <div className="notice">⚠ {banner}</div>}

      <section className="welcome">
        <div>
          <h1>Merhaba{user ? `, ${user.name}` : ""} 👋</h1>
          <p className="muted">Bugünün maçları iddaa ve Avrupa piyasasıyla karşılaştırıldı.</p>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span>Maç</span>
            <b>{analyses.length}</b>
          </div>
          <div className="kpi">
            <span>Değerli seçenek</span>
            <b className={valueCount ? "pos" : ""}>{valueCount}</b>
          </div>
          <div className="kpi">
            <span>Ort. iddaa marjı</span>
            <b>{avgMargin !== null ? pct(avgMargin) : "—"}</b>
          </div>
        </div>
      </section>

      <div className="home-grid">
        <div className="home-coupon" id="kupon">
          <CouponBuilder matches={couponMatches} />
        </div>

        <div className="home-matches">
          <div className="section-title">
            <h2>Maçlar</h2>
            <span className="muted small">Kaynak: {getProvider().name}</span>
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
      </div>
    </>
  );
}
