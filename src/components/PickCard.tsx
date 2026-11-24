import { Suspense } from "react";
import type { Analysis } from "@/lib/types";
import type { Pick } from "@/lib/pick";
import { aiComment, aiEnabled } from "@/lib/aiComment";
import { pct, signedPct } from "@/lib/format";

const LEVEL_TEXT: Record<Pick["level"], string> = {
  güçlü: "Güçlü tercih",
  zayıf: "Zayıf tercih",
  "değer yok": "Değer yok — oynama",
};

async function AiText({ analysis, pick }: { analysis: Analysis; pick: Pick }) {
  const text = await aiComment(analysis, pick);
  if (!text) return <Reasons pick={pick} />;
  return <p className="pick-ai">{text}</p>;
}

function Reasons({ pick }: { pick: Pick }) {
  return (
    <ul className="pick-reasons">
      {pick.reasons.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
  );
}

export default function PickCard({ analysis, pick }: { analysis: Analysis; pick: Pick }) {
  const r = pick.row;
  const lvl = pick.level === "güçlü" ? "strong" : pick.level === "zayıf" ? "weak" : "none";
  return (
    <section className={`panel pick pick-${lvl}`}>
      <div className="pick-head">
        <span className="pick-label">🤖 Yapay zekanın tercihi</span>
        <span className={`pick-level pick-level-${lvl}`}>{LEVEL_TEXT[pick.level]}</span>
      </div>
      <div className="pick-main">
        <div className="pick-bet">
          <div className="pick-market">{r.market}</div>
          <div className="pick-selection">{r.selection}</div>
        </div>
        <div className="pick-odd">{r.odd.toFixed(2)}</div>
      </div>
      <div className="pick-stats">
        <div>
          <span>Tahmin</span>
          <b>{pct(r.prob)}</b>
        </div>
        <div>
          <span>Gereken</span>
          <b>{pct(r.required)}</b>
        </div>
        <div>
          <span>Getiri</span>
          <b className={r.ev >= 0 ? "pos" : "neg"}>{signedPct(r.ev)}</b>
        </div>
        <div>
          <span>Temkinli</span>
          <b className={r.evConservative >= 0 ? "pos" : "neg"}>{signedPct(r.evConservative)}</b>
        </div>
      </div>
      {aiEnabled() ? (
        <Suspense fallback={<p className="pick-ai muted">Yapay zeka yorum yazıyor…</p>}>
          <AiText analysis={analysis} pick={pick} />
        </Suspense>
      ) : (
        <Reasons pick={pick} />
      )}
      {pick.alternatives.length > 0 && (
        <div className="pick-alt">
          <span className="muted">Sonraki seçenekler:</span>{" "}
          {pick.alternatives.map((a) => (
            <span key={a.key} className="pick-alt-item">
              {a.market}: {a.selection} @{a.odd.toFixed(2)} <i className={a.ev >= 0 ? "pos" : "neg"}>{signedPct(a.ev)}</i>
            </span>
          ))}
        </div>
      )}
      <p className="pick-note">Bu bir olasılık tahminidir, kazanç garantisi değildir.</p>
    </section>
  );
}
