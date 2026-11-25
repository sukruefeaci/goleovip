import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAnalyses } from "@/lib/data";
import { loadHistory, resultLabel, sampleLabel, TOLERANCE, TOLERANCE_LABEL, type ToleranceKey } from "@/lib/history";
import { analyzeOdds } from "@/lib/oddsAnalysis";
import { kickoffParts, signedPct } from "@/lib/format";
import { matchAllSelections } from "@/lib/oddsMatch";
import SelectionTable from "@/components/SelectionTable";

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
  const { iddaa1x2, target, targetSource, similar } = analyzeOdds(a, hist.matches, tol);
  const sel = matchAllSelections(a.match.iddaa, hist.matches, TOLERANCE[tol], a.match.home.name, a.match.away.name);
  const k = kickoffParts(a.match.kickoff);
  const sl = sampleLabel(similar.length);
  const fair = target.map((p) => (1 / p).toFixed(2));
  const best = sel.filter((s) => s.roi !== null && s.n >= 60).sort((x, y) => (y.roi ?? 0) - (x.roi ?? 0))[0];
  const supported = sel.filter((s) => s.supported).length;

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
          iddaa'daki <b>{sel.length}</b> seçeneğin <b>{supported}</b> tanesi, son 3 sezonun{" "}
          <b>{hist.matches.length.toLocaleString("tr-TR")}</b> maçında aynı orana sahip maçlarla karşılaştırıldı.
        </p>
      </section>

      <section className="card pad" style={{ marginTop: 14 }}>
        <h3 className="card-title">Tüm oranlar: geçmişte aynı oranlı maçlarda ne oldu?</h3>
        <SelectionTable rows={sel} />
        <p className="coupon-note">
          <b>Adil</b>: bugünkü iddaa oranının kesintisi çıkarılmış olasılığı. <b>Geçmişte</b>: bu seçeneğin adil oranı aynı olan geçmiş
          maçlarda gerçekte kazanma oranı (yeşil: adil olasılıktan yüksek). <b>Getiri</b>: geçmişteki kazanma oranı × bugünkü iddaa oranı − 1.
          Maç sonucu ve 2.5 alt/üst için geçmişteki gerçek oranlar, diğer pazarlar için o maçların oranlarından hesaplanan adil oranlar
          kullanılır. Satıra dokununca en yakın geçmiş maçlar açılır.
          {best && (best.roi ?? 0) > 0 && (
            <>
              {" "}
              Geçmişe göre en iyi görünen: <b>
                {best.market}: {best.selection}
              </b>{" "}
              ({signedPct(best.roi!)}, {best.n} maç).
            </>
          )}
        </p>
      </section>

      {similar.length > 0 && (
        <section className="card pad" style={{ marginTop: 14 }}>
          <h3 className="card-title">Maç sonucu oranları en yakın geçmiş maçlar ({Math.min(40, similar.length)} / {similar.length})</h3>
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
