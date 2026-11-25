import { Suspense } from "react";
import type { Analysis, TeamInput } from "@/lib/types";
import { aiEnabled, aiSummaryComment } from "@/lib/aiComment";

const pc = (x: number) => `%${Math.round(x * 100)}`;
const c1 = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toFixed(1));

function templateComment(a: Analysis): string {
  const [s1, s2, s3] = a.summary.topScores;
  const [p1, px, p2] = a.model1x2;
  const fav = p1 > p2 + 0.1 ? `${a.match.home.name} biraz daha önde` : p2 > p1 + 0.1 ? `${a.match.away.name} biraz daha önde` : "iki taraf dengeli";
  const goals = a.summary.over25 >= 0.55 ? "gollü geçmesi bekleniyor" : a.summary.over25 <= 0.45 ? "az gollü geçmesi bekleniyor" : "gol sayısı açısından ortada";
  return (
    `Model en olası skoru ${s1.score} (${pc(s1.prob)}) olarak görüyor; ardından ${s2.score} (${pc(s2.prob)}) ve ${s3.score} (${pc(s3.prob)}) geliyor. ` +
    `Maç sonucu olasılıkları 1 ${pc(p1)} · X ${pc(px)} · 2 ${pc(p2)}; ${fav}. Maçın ${goals} (2.5 Üst ${pc(a.summary.over25)}). ` +
    `Not: tek bir skorun gelme ihtimali her zaman düşüktür.`
  );
}

async function AiText({ a }: { a: Analysis }) {
  const text = await aiSummaryComment(a);
  return <p className="ms-comment">{text ?? templateComment(a)}</p>;
}

function CornerRow({ t }: { t: TeamInput }) {
  const c = t.cornerSplit;
  return (
    <tr>
      <th>{t.name}</th>
      <td>{c1(c?.home)}</td>
      <td>{c1(c?.away)}</td>
      <td>
        <b>{c1(c?.overall)}</b>
      </td>
    </tr>
  );
}

export default function MatchSummary({ analysis: a }: { analysis: Analysis }) {
  const sm = a.summary;
  const hasCornerData = !!(a.match.home.cornerSplit || a.match.away.cornerSplit);
  return (
    <section className="card pad ms">
      <div className="ms-tiles">
        <div className="ms-tile">
          <span>2.5 Üst</span>
          <b className={sm.over25 >= 0.55 ? "lv-high" : sm.over25 <= 0.45 ? "lv-low" : "lv-mid"}>{pc(sm.over25)}</b>
          <small className="muted">2.5 Alt {pc(1 - sm.over25)}</small>
        </div>
        <div className="ms-tile">
          <span>KG Var</span>
          <b className={sm.btts >= 0.55 ? "lv-high" : sm.btts <= 0.45 ? "lv-low" : "lv-mid"}>{pc(sm.btts)}</b>
          <small className="muted">KG Yok {pc(1 - sm.btts)}</small>
        </div>
        <div className="ms-tile">
          <span>Korner</span>
          {sm.corners ? (
            <>
              <b className={sm.corners.over >= 0.55 ? "lv-high" : sm.corners.over <= 0.45 ? "lv-low" : "lv-mid"}>{pc(sm.corners.over)}</b>
              <small className="muted">
                {sm.corners.line} Üst · beklenen ≈{sm.corners.expected.toFixed(1)}
              </small>
            </>
          ) : (
            <>
              <b className="muted">—</b>
              <small className="muted">veri yok</small>
            </>
          )}
        </div>
      </div>

      {hasCornerData && (
        <table className="ms-corners">
          <thead>
            <tr>
              <th>Maç başı korner</th>
              <th>Evinde</th>
              <th>Deplasmanda</th>
              <th>Genel</th>
            </tr>
          </thead>
          <tbody>
            <CornerRow t={a.match.home} />
            <CornerRow t={a.match.away} />
          </tbody>
        </table>
      )}

      <div className="ms-score">
        <div className="ms-score-head">
          <span className="ai">AI</span> <b>Skor önerisi</b>
        </div>
        <div className="ms-scores">
          {sm.topScores.map((s, i) => (
            <div key={s.score} className={`ms-sc ${i === 0 ? "top" : ""}`}>
              <b>{s.score}</b>
              <span>{pc(s.prob)}</span>
            </div>
          ))}
        </div>
        {aiEnabled() ? (
          <Suspense fallback={<p className="ms-comment muted">Yapay zeka yorum yazıyor…</p>}>
            <AiText a={a} />
          </Suspense>
        ) : (
          <p className="ms-comment">{templateComment(a)}</p>
        )}
      </div>
    </section>
  );
}
