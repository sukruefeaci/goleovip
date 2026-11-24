"use client";

import { useMemo, useState } from "react";
import { buildCoupon, couponText, type CouponMatch, type CouponMode } from "@/lib/coupon";

const money = (x: number) => x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => `%${(x * 100).toFixed(x < 0.1 ? 1 : 0)}`;

function time(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function CouponBuilder({ matches }: { matches: CouponMatch[] }) {
  const [legs, setLegs] = useState(3);
  const [stake, setStake] = useState(100);
  const [mode, setMode] = useState<CouponMode>("guvenli");
  const [minOdd, setMinOdd] = useState(1.2);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => buildCoupon(matches, { legs, stake: Math.max(1, stake || 0), mode, minOdd, excluded }),
    [matches, legs, stake, mode, minOdd, excluded],
  );
  const c = result.coupon;

  async function copy() {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(couponText(c, stake));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano izni yoksa sessiz geç */
    }
  }

  const probClass = !c ? "" : c.winProb >= 0.5 ? "good" : c.winProb >= 0.25 ? "mid" : "low";

  return (
    <section className="coupon card">
      <div className="coupon-head">
        <div>
          <h2>Kupon oluşturucu</h2>
          <p className="muted small">Maç sayısını ve tutarı gir; model tutma olasılığı en yüksek seçeneklerden kuponu kursun.</p>
        </div>
      </div>

      <div className="coupon-form">
        <label>
          <span>Maç sayısı</span>
          <div className="stepper">
            <button type="button" onClick={() => setLegs((n) => Math.max(1, n - 1))} aria-label="Azalt">
              −
            </button>
            <b>{legs}</b>
            <button type="button" onClick={() => setLegs((n) => Math.min(12, n + 1))} aria-label="Artır">
              +
            </button>
          </div>
        </label>
        <label>
          <span>Tutar (TL)</span>
          <input type="number" inputMode="decimal" min={1} step={10} value={stake} onChange={(e) => setStake(Number(e.target.value))} />
        </label>
        <label>
          <span>Maç başı min. oran</span>
          <select value={minOdd} onChange={(e) => setMinOdd(Number(e.target.value))}>
            {[1.1, 1.2, 1.3, 1.4, 1.5, 1.7].map((o) => (
              <option key={o} value={o}>
                {o.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
        <div className="mode">
          <span>Strateji</span>
          <div className="toggle">
            <button type="button" className={mode === "guvenli" ? "on" : ""} onClick={() => setMode("guvenli")}>
              Güvenli
            </button>
            <button type="button" className={mode === "dengeli" ? "on" : ""} onClick={() => setMode("dengeli")}>
              Dengeli
            </button>
          </div>
        </div>
      </div>

      {!c ? (
        <div className="coupon-empty">{result.message}</div>
      ) : (
        <>
          <ol className="legs">
            {c.legs.map((l) => (
              <li key={l.match.id}>
                <div className="leg-main">
                  <span className="leg-match">
                    {l.match.home} – {l.match.away}
                  </span>
                  <span className="leg-meta">
                    {time(l.match.kickoff)} · {l.match.league}
                    {l.pick.mbc > 1 ? ` · MBS ${l.pick.mbc}` : ""}
                  </span>
                  <span className="leg-pick">
                    {l.pick.market}: <b>{l.pick.selection}</b>
                  </span>
                </div>
                <div className="leg-side">
                  <span className="leg-odd">{l.pick.odd.toFixed(2)}</span>
                  <span className="leg-prob">{pct(l.pick.prob)}</span>
                  <button
                    type="button"
                    className="leg-swap"
                    title="Bu maçı çıkar, yerine başka maç gelsin"
                    onClick={() => setExcluded((x) => [...x, l.match.id])}
                  >
                    Değiştir
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <div className="coupon-totals">
            <div>
              <span>Toplam oran</span>
              <b>{c.totalOdd.toFixed(2)}</b>
            </div>
            <div>
              <span>Tutma olasılığı</span>
              <b className={`prob-${probClass}`}>{pct(c.winProb)}</b>
            </div>
            <div>
              <span>Olası kazanç</span>
              <b>{money(c.payout)} TL</b>
            </div>
          </div>
          <div className="probbar" aria-hidden>
            <i style={{ width: `${Math.min(100, c.winProb * 100)}%` }} />
          </div>

          <p className="coupon-note">
            Model bu kuponun <b>{pct(c.winProb)}</b> ihtimalle tutacağını tahmin ediyor. Uzun vadede {money(stake)} TL'lik kuponun
            ortalama dönüşü ≈ <b>{money(c.expectedReturn)} TL</b> ({c.ev >= 0 ? "+" : "−"}%{Math.abs(c.ev * 100).toFixed(1)}); iddaa
            marjı her maçta aleyhe çalışır. Maç sayısı arttıkça tutma olasılığı hızla düşer.
          </p>

          <div className="coupon-actions">
            <button type="button" className="btn" onClick={copy}>
              {copied ? "Kopyalandı ✓" : "Kuponu kopyala"}
            </button>
            {excluded.length > 0 && (
              <button type="button" className="btn ghost" onClick={() => setExcluded([])}>
                Değişiklikleri sıfırla
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
