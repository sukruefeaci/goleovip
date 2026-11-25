import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAnalyses } from "@/lib/data";
import { loadHistory, resultLabel, sampleLabel, TOLERANCE, TOLERANCE_LABEL, type ToleranceKey } from "@/lib/history";
import { analyzeOdds } from "@/lib/oddsAnalysis";
import { kickoffParts, signedPct } from "@/lib/format";

export const dynamic = "force-dynamic";

const pc = (x: number) => `%${(x * 100).toFixed(1)}`;
const fmtDate = (d: string) => d.split("-").reverse().join(".");

export default async function OddsAnalysisDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ h?: string }> }) {
  const { id } = await params;
  const { h } = await searchParams;
  const tol: ToleranceKey = h && h in TOLERANCE ? (h as ToleranceKey) : "normal";
  const [{ analyses }, hist] = await Promise.all([loadAnalyses(), loadHistory()]);
  const a = analyses.find((x) => x.match.id === id);
  if (!a) notFound();
  const { iddaa1x2, target, targetSource, similar, goalSimilar, targetOver, stats } = analyzeOdds(a, hist.matches, tol);
  const k = kickoffParts(a.match.kickoff);
  const sl = sampleLabel(similar.length);
  const fair = target.map((p) => (1 / p).toFixed(2));
  const bestRoi = stats.filter((s) => s.roi !== undefined && s.n >= 20).sort((x, y) => (y.roi ?? 0) - (x.roi ?? 0))[0];

  return (
    <div className="page-narrow">
      <Link href={`/oran-analizi?h=${tol}`} className="back">
        ‹ Oran analizi
      </Link>

      <section className="card pad">
        <span className="muted small">
          {k.date} · {k.time} · {a.match.league}
        </span>
        <h1 className="oa-title">
          {a.match.home.name} <span className="vs">vs</span> {a.match.away.name}
        </h1>
        <div className="oa-odds">
          <span className="muted small">iddaa MS</span>
          {iddaa1x2 ? iddaa1x2.map((o, i) => <span key={i} className="oddpill">{o.toFixed(2)}</span>) : <span className="muted small">yok</span>}
          <span className="muted small">
            · adil ({targetSource === "iddaa" ? "kesinti çıkarılmış" : "model"}): {fair.join(" – ")}
          </span>
        </div>
        <div className="seg tol-seg">
          {(Object.keys(TOLERANCE) as ToleranceKey[]).map((t) => (
            <Link key={t} href={`/oran-analizi/${id}?h=${t}`} className={t === tol ? "on" : ""}>
              {TOLERANCE_LABEL[t]}
            </Link>
          ))}
        </div>
        <p className="small" style={{ marginBottom: 0 }}>
          Son 3 sezonda aynı oranlarla oynanmış <b>{similar.length}</b> maç bulundu · <span className={sl.cls}>{sl.text}</span>
        </p>
        {targetOver !== null && goalSimilar !== similar && (
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Gol pazarları (alt/üst, KG) için 2.5 Üst olasılığı da benzer olan (iddaa %{Math.round(targetOver * 100)}) {goalSimilar.length} maç kullanıldı.
          </p>
        )}
      </section>

      {similar.length > 0 && (
        <section className="card pad" style={{ marginTop: 14 }}>
          <h3 className="card-title">Bu oranlarla oynanan maçlarda hangi tercih kazandı?</h3>
          <div className="tablewrap oa-table">
            <table>
              <thead>
                <tr>
                  <th>Tercih</th>
                  <th>Geçmişte kazandı</th>
                  <th>iddaa oranı</th>
                  <th>Geçmişe göre getiri</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.key} className={bestRoi && s.key === bestRoi.key ? "oa-best" : ""}>
                    <td>
                      <b>{s.label}</b>
                    </td>
                    <td>
                      <b>{pc(s.rate)}</b>{" "}
                      <span className="muted small">
                        ({s.hits}/{s.n})
                      </span>
                      <span className="wc-mini">
                        <i className="wc-fill" style={{ width: `${s.rate * 100}%` }} />
                      </span>
                    </td>
                    <td>{s.odd ? <span className="oddpill">{s.odd.toFixed(2)}</span> : <span className="muted">—</span>}</td>
                    <td>{s.roi !== undefined ? <span className={s.roi >= 0 ? "pos" : "neg"}>{signedPct(s.roi)}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="coupon-note">
            <b>Geçmişe göre getiri</b>: geçmişteki kazanma oranı × bugünkü iddaa oranı − 1. Örneğin %70 kazanan bir tercih 1.50 oranla
            oynansaydı her 100 TL için +5 TL getirirdi. Örnek sayısı azsa (20'nin altı) sonuçlar şansa çok bağlıdır.
            {bestRoi && (bestRoi.roi ?? 0) > 0 && (
              <>
                {" "}
                Bu maçta geçmişe göre en iyi görünen: <b>{bestRoi.label}</b> ({signedPct(bestRoi.roi!)}).
              </>
            )}
          </p>
        </section>
      )}

      {similar.length > 0 && (
        <section className="card pad" style={{ marginTop: 14 }}>
          <h3 className="card-title">Eşleşen geçmiş maçlar (en yakın {Math.min(40, similar.length)})</h3>
          <div className="oa-hist">
            {similar.slice(0, 40).map((m, i) => {
              const r = resultLabel(m);
              return (
                <div key={`${m.date}-${m.home}-${i}`} className="oa-h">
                  <div className="oa-h-top">
                    <span className="muted small">
                      {fmtDate(m.date)} · {m.league}
                    </span>
                    <span className="muted small">
                      İY {m.hht ?? "?"}-{m.aht ?? "?"}
                    </span>
                  </div>
                  <div className="oa-h-match">
                    {m.home} <b className="score">{m.hg}-{m.ag}</b> {m.away}
                  </div>
                  <div className="oa-h-odds">
                    {(["1", "X", "2"] as const).map((lab, j) => (
                      <span key={lab} className={`hodd ${r === lab ? "won" : ""}`}>
                        {lab} {m.odds[j].toFixed(2)}
                      </span>
                    ))}
                    <span className="muted small">→ kazanan {r} @{m.odds[r === "1" ? 0 : r === "X" ? 1 : 2].toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Geçmiş maçların oranları maç öncesi piyasa ortalamasıdır (Football-Data.co.uk); iddaa'nın geçmiş oranları bu arşivde yok.
          </p>
        </section>
      )}
    </div>
  );
}
