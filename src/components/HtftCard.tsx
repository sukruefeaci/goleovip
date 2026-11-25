import type { Analysis, TeamInput } from "@/lib/types";
import { pct, signedPct } from "@/lib/format";

const RES = ["1", "X", "2"] as const;
const RES_LABEL = { "1": "Ev önde", X: "Berabere", "2": "Dep. önde" } as const;
const FT_LABEL = { "1": "Ev kazanır", X: "Berabere", "2": "Dep. kazanır" } as const;

/** Takımın son maçlarındaki İY/MS sayımı (takımın gözünden: G/G = İY önde, maçı kazandı) */
function History({ team }: { team: TeamInput }) {
  const h = team.htftHistory ?? [];
  if (!h.length) return null;
  const counts = Object.entries(
    h.reduce<Record<string, number>>((acc, x) => ((acc[x] = (acc[x] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <div className="htft-hist">
      <b>{team.name}</b> <span className="muted small">son {h.length} maç</span>
      <div className="htft-chips">
        {counts.map(([k, v]) => (
          <span key={k} className={`hchip h-${k.replace("/", "")}`}>
            {k} <i>×{v}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HtftCard({ analysis }: { analysis: Analysis }) {
  const { htft, rows, match, halfShare } = analysis;
  const byOutcome = new Map(htft.map((h) => [h.outcome, h.prob]));
  const rowFor = new Map(rows.filter((r) => r.category === "İY/MS").map((r) => [r.selection, r]));
  const sorted = [...htft].sort((a, b) => b.prob - a.prob);
  const best = sorted[0];
  const max = best.prob;
  const valueRow = [...rowFor.values()].filter((r) => r.ev > 0).sort((a, b) => b.ev - a.ev)[0];
  const bestRow = rowFor.get(best.outcome);

  return (
    <section className="card pad htft">
      <div className="htft-head">
        <h3 className="card-title">İlk yarı / Maç sonucu</h3>
        <span className="muted small">
          İlk yarı gol payı: {match.home.short} %{Math.round(halfShare.home * 100)} · {match.away.short} %{Math.round(halfShare.away * 100)}
        </span>
      </div>

      <div className="htft-top">
        <div>
          <span className="muted small">En olası sonuç</span>
          <div className="htft-best">
            {best.outcome} <small>{pct(best.prob)}</small>
          </div>
          <span className="muted small">
            İY {RES_LABEL[best.outcome[0] as "1"]}, MS {FT_LABEL[best.outcome[2] as "1"]}
            {bestRow ? ` · iddaa ${bestRow.odd.toFixed(2)} (${signedPct(bestRow.ev)})` : ""}
          </span>
        </div>
        <div className="htft-runner">
          <span className="muted small">Sonraki</span>
          {sorted.slice(1, 3).map((h) => (
            <span key={h.outcome}>
              <b>{h.outcome}</b> {pct(h.prob)}
            </span>
          ))}
        </div>
      </div>

      <div className="htft-grid" role="table" aria-label="İY/MS olasılıkları">
        <span />
        {RES.map((ft) => (
          <span key={ft} className="htft-colh">
            MS {ft}
          </span>
        ))}
        {RES.map((ht) => (
          <div key={ht} className="htft-rowwrap" role="row">
            <span className="htft-rowh">İY {ht}</span>
            {RES.map((ft) => {
              const o = `${ht}/${ft}`;
              const p = byOutcome.get(o) ?? 0;
              const r = rowFor.get(o);
              const cls = [o === best.outcome ? "is-best" : "", r && r.ev > 0 ? "is-value" : ""].join(" ");
              return (
                <div key={o} className={`htft-cell ${cls}`} style={{ ["--a" as string]: (p / max).toFixed(3) }} role="cell">
                  <span className="o">{o}</span>
                  <b>{pct(p)}</b>
                  {r ? <span className={r.ev >= 0 ? "pos" : "neg"}>@{r.odd.toFixed(2)}</span> : <span className="muted">—</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {valueRow ? (
        <p className="htft-note">
          <b className="pos">Değer:</b> {valueRow.selection} @{valueRow.odd.toFixed(2)}, model {pct(valueRow.prob)} → getiri {signedPct(valueRow.ev)}
          {valueRow.evConservative <= 0 ? " (belirsizlik hesaba katılınca eksiye düşüyor)" : ""}.
        </p>
      ) : (
        <p className="htft-note muted">
          {rowFor.size
            ? "iddaa'nın İY/MS oranlarında artı getirili seçenek yok; bu pazarda marj genelde %25'in üstünde."
            : "Bu maç için iddaa İY/MS oranı yok; olasılıklar yalnız model tahminidir."}
        </p>
      )}

      <div className="htft-hists">
        <History team={match.home} />
        <History team={match.away} />
      </div>
      <p className="pick-note">
        En olası İY/MS sonucu bile genelde %25–40 ihtimallidir; yani çoğu maçta tutmaz. Geçmiş sayımları takımın gözündendir (G/G: ilk yarı
        önde, maçı kazandı).
      </p>
    </section>
  );
}
