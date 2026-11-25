import Link from "next/link";
import { loadAnalyses } from "@/lib/data";
import { loadHistory, sampleLabel, TOLERANCE, TOLERANCE_LABEL, type ToleranceKey } from "@/lib/history";
import { analyzeOdds } from "@/lib/oddsAnalysis";
import { kickoffParts } from "@/lib/format";

export const dynamic = "force-dynamic";

const pc = (x: number) => `%${Math.round(x * 100)}`;

export default async function OddsAnalysisPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const tol: ToleranceKey = h && h in TOLERANCE ? (h as ToleranceKey) : "normal";
  const [{ analyses, banner }, hist] = await Promise.all([loadAnalyses(), loadHistory()]);
  const rows = analyses.filter((a) => new Date(a.match.kickoff).getTime() > Date.now()).map((a) => analyzeOdds(a, hist.matches, tol));

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}
      <div className="page-head">
        <h1>Oran analizi</h1>
        <span className="muted small">{hist.matches.length.toLocaleString("tr-TR")} geçmiş maç arşivi</span>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Her maçın iddaa maç sonucu oranları, geçmişte aynı oranlarla oynanmış maçlarla karşılaştırılır; o maçlarda hangi tercihin ne sıklıkla
        kazandığı gösterilir. Karşılaştırma bahis şirketlerinin kesintisi çıkarılmış (adil) oranlarla yapılır.
      </p>
      <div className="seg tol-seg">
        {(Object.keys(TOLERANCE) as ToleranceKey[]).map((k) => (
          <Link key={k} href={`/oran-analizi?h=${k}`} className={k === tol ? "on" : ""}>
            {TOLERANCE_LABEL[k]}
          </Link>
        ))}
      </div>

      <div className="oa-list">
        {rows.map(({ analysis: a, iddaa1x2, similar, stats }) => {
          const k = kickoffParts(a.match.kickoff);
          const s = (key: string) => stats.find((x) => x.key === key)!;
          const sl = sampleLabel(similar.length);
          const top = [...stats].filter((x) => x.n >= 20).sort((x, y) => y.rate - x.rate)[0];
          return (
            <Link key={a.match.id} href={`/oran-analizi/${a.match.id}?h=${tol}`} className="card oa-row">
              <div className="oa-top">
                <span className="muted small">
                  {k.date} · {k.time} · {a.match.league}
                </span>
                <span className={`small ${sl.cls}`}>
                  {similar.length} benzer maç · {sl.text}
                </span>
              </div>
              <div className="oa-match">
                {a.match.home.name} <span className="vs">vs</span> {a.match.away.name}
              </div>
              <div className="oa-odds">
                <span className="muted small">iddaa MS</span>
                {iddaa1x2 ? (
                  iddaa1x2.map((o, i) => (
                    <span key={i} className="oddpill">
                      {o.toFixed(2)}
                    </span>
                  ))
                ) : (
                  <span className="muted small">oran yok (model olasılığı kullanıldı)</span>
                )}
              </div>
              {similar.length > 0 ? (
                <>
                  <div className="oa-bar">
                    <i className="t1" style={{ flex: s("1x2:1").rate || 0.001 }}>
                      1 {pc(s("1x2:1").rate)}
                    </i>
                    <i className="tx" style={{ flex: s("1x2:X").rate || 0.001 }}>
                      X {pc(s("1x2:X").rate)}
                    </i>
                    <i className="t2" style={{ flex: s("1x2:2").rate || 0.001 }}>
                      2 {pc(s("1x2:2").rate)}
                    </i>
                  </div>
                  <div className="oa-sub small">
                    <span>2.5 Üst {pc(s("ou:2.5:o").rate)}</span>
                    <span>KG Var {pc(s("btts:y").rate)}</span>
                    {top && (
                      <span>
                        En sık: <b>{top.label}</b> {pc(top.rate)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="muted small">Bu oranlarla oynanmış geçmiş maç bulunamadı. Hassasiyeti "Geniş" yapmayı deneyin.</div>
              )}
            </Link>
          );
        })}
        {!rows.length && <div className="card pad empty">Analiz edilecek maç yok.</div>}
      </div>
    </div>
  );
}
