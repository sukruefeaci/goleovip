import type { SelectionMatch } from "@/lib/oddsMatch";
import { signedPct } from "@/lib/format";
import { sampleLabel } from "@/lib/history";

const ORDER = ["Sonuç", "Gol", "İlk Yarı", "İY/MS", "Korner", "Kart"];
const pc = (x: number) => `%${(x * 100).toFixed(1)}`;
const fmtDate = (d: string) => d.split("-").reverse().join(".");

export default function SelectionTable({ rows }: { rows: SelectionMatch[] }) {
  const groups = ORDER.map((c) => ({ cat: c, items: rows.filter((r) => r.category === c) })).filter((g) => g.items.length);
  return (
    <div className="sel">
      {groups.map((g) => (
        <div key={g.cat} className="sel-group">
          <h4>{g.cat}</h4>
          {g.items.map((r) => {
            const sl = sampleLabel(r.n);
            return (
              <details key={r.key} className="sel-row">
                <summary>
                  <div className="sel-name">
                    <b>
                      {r.market}: {r.selection}
                    </b>
                    <span className="muted small">
                      {r.supported ? (
                        <>
                          {r.n.toLocaleString("tr-TR")} benzer maç · <span className={sl.cls}>{sl.text}</span>
                        </>
                      ) : (
                        "geçmiş oran verisi yok"
                      )}
                    </span>
                  </div>
                  <span className="oddpill">{r.odd.toFixed(2)}</span>
                  <div className="sel-num">
                    <span className="muted small">adil</span>
                    <b>{pc(r.fair)}</b>
                  </div>
                  <div className="sel-num">
                    <span className="muted small">geçmişte</span>
                    <b className={r.supported ? (r.rate >= r.fair ? "pos" : "neg") : "muted"}>{r.supported ? pc(r.rate) : "—"}</b>
                  </div>
                  <div className="sel-num">
                    <span className="muted small">getiri</span>
                    <b className={r.roi === null ? "muted" : r.roi >= 0 ? "pos" : "neg"}>{r.roi === null ? "—" : signedPct(r.roi)}</b>
                  </div>
                </summary>
                {r.supported && r.examples.length > 0 && (
                  <div className="sel-ex">
                    <span className="muted small">
                      Bu seçeneğin adil oranı bugünküne en yakın geçmiş maçlar (adil oran → sonuç):
                    </span>
                    {r.examples.map(({ m, p, won }, i) => (
                      <div key={i} className="sel-ex-row">
                        <span className={`res ${won ? "w" : "l"}`}>{won ? "✓" : "✗"}</span>
                        <span className="muted small">{fmtDate(m.date)}</span>
                        <span className="sel-ex-match">
                          {m.home} <b>{m.hg}-{m.ag}</b> {m.away}
                        </span>
                        <span className="muted small">
                          İY {m.hht ?? "?"}-{m.aht ?? "?"} · adil {(1 / p).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      ))}
    </div>
  );
}
