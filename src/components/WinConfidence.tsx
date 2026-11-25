import type { ConfidencePart } from "@/lib/types";

/** Sunucu ve istemci bileşenlerinde kullanılabilir (hook yok). */

export function winLevel(p: number) {
  return p >= 0.65 ? { label: "Yüksek", cls: "lv-high" } : p >= 0.45 ? { label: "Orta", cls: "lv-mid" } : p >= 0.25 ? { label: "Düşük", cls: "lv-low" } : { label: "Çok düşük", cls: "lv-vlow" };
}

export function confLevel(c: number) {
  return c >= 75 ? { label: "Yüksek", cls: "lv-high" } : c >= 55 ? { label: "Orta", cls: "lv-mid" } : { label: "Düşük", cls: "lv-low" };
}

const f1 = (x: number) => (x * 100).toFixed(1);

interface Props {
  prob: number;
  sigma: number;
  required?: number;
  confidence: number;
  parts: ConfidencePart[];
  compact?: boolean;
}

export default function WinConfidence({ prob, sigma, required, confidence, parts, compact }: Props) {
  const lo = Math.max(0, prob - sigma);
  const hi = Math.min(1, prob + sigma);
  const wl = winLevel(prob);
  const cl = confLevel(confidence);

  if (compact) {
    return (
      <div className="wc-compact">
        <span className={`wc-num ${wl.cls}`}>%{f1(prob)}</span>
        <span className="wc-mini">
          <i className="wc-band" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
          <i className="wc-fill" style={{ width: `${prob * 100}%` }} />
          {required !== undefined && <i className="wc-tick" style={{ left: `${required * 100}%` }} />}
        </span>
        <span className="sub">
          %{f1(lo)}–{f1(hi)}
        </span>
      </div>
    );
  }

  return (
    <div className="wc">
      <div className="wc-block">
        <div className="wc-head">
          <span>Kazanma olasılığı</span>
          <em className={wl.cls}>{wl.label}</em>
        </div>
        <b className={`wc-big ${wl.cls}`}>%{f1(prob)}</b>
        <div className="wc-bar" aria-hidden>
          <i className="wc-band" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
          <i className="wc-fill" style={{ width: `${prob * 100}%` }} />
          {required !== undefined && <i className="wc-tick" style={{ left: `${required * 100}%` }} title="Başa baş" />}
        </div>
        <span className="wc-sub">
          Olası aralık %{f1(lo)}–{f1(hi)}
          {required !== undefined && <> · başa baş %{f1(required)}</>}
        </span>
      </div>

      <details className="wc-block wc-conf">
        <summary>
          <div className="wc-head">
            <span>Güven puanı</span>
            <em className={cl.cls}>{cl.label}</em>
          </div>
          <b className={`wc-big ${cl.cls}`}>%{confidence}</b>
          <div className="wc-bar" aria-hidden>
            <i className={`wc-fill conf ${cl.cls}`} style={{ width: `${confidence}%` }} />
          </div>
          <span className="wc-sub wc-why">Neden %{confidence}? ▾</span>
        </summary>
        <ul className="wc-parts">
          {parts.map((p) => (
            <li key={p.label}>
              <div>
                <b>{p.label}</b> <span className="muted">(ağırlık %{Math.round(p.weight * 100)})</span>
                <div className="muted small">{p.note}</div>
              </div>
              <span className="wc-part-score">%{Math.round(p.score * 100)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
