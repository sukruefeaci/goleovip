import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAnalyses } from "@/lib/data";
import { findSnapshot, type SnapEntry } from "@/lib/tracking";
import { kickoffParts, pct } from "@/lib/format";
import type { TeamInput } from "@/lib/types";
import BetTable from "@/components/BetTable";
import PickCard from "@/components/PickCard";
import MatchSummary from "@/components/MatchSummary";
import HtftCard from "@/components/HtftCard";
import { choosePick } from "@/lib/pick";

export const dynamic = "force-dynamic";

const FORM_TITLE = { G: "Galibiyet", B: "Beraberlik", M: "Mağlubiyet" } as const;

function Form({ team }: { team: TeamInput }) {
  return (
    <div className="dots" aria-label="Son 5 maç">
      {team.form.map((f, i) => (
        <i key={i} className={`dot dot-${f}`} title={FORM_TITLE[f]} />
      ))}
    </div>
  );
}

function ProbRow({ label, sub, values, highlight }: { label: string; sub: string; values: number[]; highlight?: boolean }) {
  const max = Math.max(...values);
  return (
    <tr className={highlight ? "hl" : ""}>
      <th>
        {label}
        <small>{sub}</small>
      </th>
      {values.map((v, i) => (
        <td key={i} className={v === max ? "max" : ""}>
          <b>{pct(v)}</b>
          <span className="minibar">
            <i style={{ width: `${v * 100}%` }} />
          </span>
        </td>
      ))}
    </tr>
  );
}

/** Bitmiş / bültenden kalkmış maç: kayıttaki tahmin ve sonuç */
function SnapshotView({ e }: { e: SnapEntry }) {
  const k = kickoffParts(e.kickoff);
  const r = e.result;
  const won = r?.pickWon;
  return (
    <>
      <Link href="/" className="back">
        ‹ Tüm maçlar
      </Link>
      <section className="board">
        <span className="chip">{e.league}</span>
        <div className="board-row">
          <div className="team">
            <h1>{e.home}</h1>
          </div>
          <div className="kick">
            <b>{r ? `${r.hg} - ${r.ag}` : k.time}</b>
            <span>{r ? `İY ${r.hht ?? "?"}-${r.aht ?? "?"} · ${k.date}` : `${k.date} · sonuç bekleniyor`}</span>
          </div>
          <div className="team right">
            <h1>{e.away}</h1>
          </div>
        </div>
      </section>
      <section className="card pad" style={{ marginTop: 14 }}>
        <h3 className="card-title">Maç öncesi tahmin</h3>
        {e.pick ? (
          <div className={`mp mp-${r ? (won === true ? "won" : won === false ? "lost" : "void") : "open"}`}>
            <div className="mp-main">
              <span className="muted small">{e.pick.market}</span>
              <b>{e.pick.selection}</b>
            </div>
            <span className="oddpill">{e.pick.odd.toFixed(2)}</span>
            <div className="mp-stat">
              <span>Kazanma</span>
              <b>%{Math.round(e.pick.prob * 100)}</b>
            </div>
            <div className="mp-stat">
              <span>Güven</span>
              <b>%{e.pick.confidence}</b>
            </div>
            {r && <span className={`mp-badge ${won === true ? "won" : won === false ? "lost" : "void"}`}>{won === true ? "✓ Tuttu" : won === false ? "✗ Tutmadı" : "—"}</span>}
          </div>
        ) : (
          <p className="muted">Bu maç için tercih yoktu.</p>
        )}
        <p className="small" style={{ marginBottom: 0 }}>
          Model: 1 %{Math.round(e.summary.p1x2[0] * 100)} · X %{Math.round(e.summary.p1x2[1] * 100)} · 2 %{Math.round(e.summary.p1x2[2] * 100)} · 2.5 Üst %
          {Math.round(e.summary.over25 * 100)} · KG Var %{Math.round(e.summary.btts * 100)} · en olası skor {e.summary.topScore}
          {r && (
            <>
              {" "}
              → gerçek skor <b>{r.hg}-{r.ag}</b>
            </>
          )}
        </p>
      </section>
    </>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = (await loadAnalyses()).analyses.find((x) => x.match.id === id);
  if (!found) {
    const snap = await findSnapshot(id).catch(() => null);
    if (!snap) notFound();
    return <SnapshotView e={snap} />;
  }
  const a = found;
  const match = a.match;
  const { home, away } = match;
  const k = kickoffParts(match.kickoff);
  const pick = choosePick(a);

  return (
    <>
      <Link href="/" className="back">
        ‹ Tüm maçlar
      </Link>

      <section className="board">
        <span className="chip">{match.league}</span>
        <div className="board-row">
          <div className="team">
            <h1>{home.name}</h1>
            <Form team={home} />
            <span className="muted small">
              {home.rank ? `${home.rank}. sıra · ${home.points} puan` : "Ev sahibi"}
            </span>
          </div>
          <div className="kick">
            <b>{k.time}</b>
            <span>{k.date}</span>
          </div>
          <div className="team right">
            <h1>{away.name}</h1>
            <Form team={away} />
            <span className="muted small">
              {away.rank ? `${away.rank}. sıra · ${away.points} puan` : "Deplasman"}
            </span>
          </div>
        </div>
        <div className="xg">
          <span>Gol beklentisi</span>
          <b>{a.lambda.home.toFixed(2)}</b>
          <span className="xg-bar">
            <i style={{ flex: a.lambda.home }} />
            <i style={{ flex: a.lambda.away }} />
          </span>
          <b>{a.lambda.away.toFixed(2)}</b>
        </div>
      </section>

      <MatchSummary analysis={a} />

      {pick && <PickCard analysis={a} pick={pick} />}

      <HtftCard analysis={a} />

      {match.warnings.length > 0 && (
        <div className="notice subtle">
          {match.warnings.map((w) => (
            <span key={w}>ⓘ {w}</span>
          ))}
        </div>
      )}

      <div className="detail-grid">
        <details className="rest bt-all">
          <summary>Tüm seçenekler ve hesaplar ({a.rows.length})</summary>
          <BetTable rows={a.rows} homeName={home.name} awayName={away.name} homeShort={home.short} awayShort={away.short} fileName={`${match.id}.csv`} />
        </details>

        <aside className="side-col">
          <section className="card pad">
            <h3 className="card-title">Olasılık karşılaştırması</h3>
            <table className="probtable">
              <thead>
                <tr>
                  <th />
                  <th>1</th>
                  <th>X</th>
                  <th>2</th>
                </tr>
              </thead>
              <tbody>
                <ProbRow
                  label={match.source === "elo" || match.source === "iddaa" ? "Referans" : "Avrupa"}
                  sub={match.source === "elo" ? "ClubElo + iddaa ort." : match.source === "iddaa" ? "iddaa, marjsız" : match.euro.reference}
                  values={a.euroFair}
                />
                {a.iddaaFair && <ProbRow label="iddaa" sub="marjı atılmış" values={a.iddaaFair} />}
                <ProbRow label="Model" sub="harman" values={a.model1x2} highlight />
              </tbody>
            </table>
            {a.iddaaOdds && (
              <p className="muted small">
                iddaa oranları {a.iddaaOdds.map((o) => o.toFixed(2)).join(" · ")}
                {match.source !== "elo" && match.source !== "iddaa" && <> · Avrupa {match.euro.h2h.map((o) => o.toFixed(2)).join(" · ")}</>}
              </p>
            )}
            <div className="margins">
              <div>
                <span>iddaa marjı</span>
                <b className="neg">{a.iddaaMargin !== null ? pct(a.iddaaMargin) : "—"}</b>
              </div>
              <div>
                <span>Avrupa marjı</span>
                <b className="pos">{match.source === "elo" || match.source === "iddaa" ? "—" : pct(a.euroMargin)}</b>
              </div>
              <div>
                <span>2.5 Üst ({match.source === "elo" || match.source === "iddaa" ? "iddaa, marjsız" : "Avrupa"})</span>
                <b>{pct(a.euroOver25)}</b>
              </div>
            </div>
          </section>

          <section className="card pad">
            <h3 className="card-title">Eksik oyuncular</h3>
            {match.fotmob ? (
              [home, away].map((t) => (
                <div key={t.short} className="teaminfo">
                  <b>
                    {t.name} <span className="muted small">({t.missing.length})</span>
                  </b>
                  {t.missing.length ? (
                    <ul className="missing">
                      {t.missing.map((m) => (
                        <li key={m.name}>
                          <span>{m.name}</span>
                          <span className={`mtag ${m.reason === "cezalı" ? "susp" : m.reason === "sakat" ? "inj" : ""}`}>{m.reason ?? m.role}</span>
                          {m.returnText && <span className="muted small">dönüş: {m.returnText}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted small">FotMob'da eksik oyuncu bildirilmemiş</span>
                  )}
                </div>
              ))
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Bu maç için sakat/cezalı bilgisi bulunamadı.
              </p>
            )}
            {match.fotmob && <p className="muted small" style={{ marginBottom: 0 }}>Kaynak: FotMob{match.fotmob.predicted ? " (tahmini kadro)" : ""}</p>}
          </section>

          <section className="card pad">
            <h3 className="card-title">Takım bilgisi</h3>
            {(match.source === "elo" || match.source === "iddaa") && (
              <p className="muted small" style={{ marginTop: 0 }}>
                Bu maç Football-Data kapsamında değil; olasılıklar {match.source === "elo" ? "ClubElo güç puanı ve iddaa oranlarından" : "iddaa'nın marjı atılmış oranlarından"}. Takım istatistiği, korner ve kart tahmini yok.
              </p>
            )}
            {[home, away].filter((t) => t.goalsFor10.length > 0).map((t) => (
              <div key={t.short} className="teaminfo">
                <b>{t.name}</b>
                <span className="muted small">
                  Son {t.goalsFor10.length} maç: {t.goalsFor10.reduce((x, y) => x + y, 0)} attı, {t.goalsAgainst10.reduce((x, y) => x + y, 0)} yedi ·
                  korner ort. {t.cornersFor.toFixed(1)}
                </span>
              </div>
            ))}
            <div className="teaminfo">
              <b>Aralarındaki son maçlar</b>
              <span className="muted small">
                {match.headToHead.length ? match.headToHead.map((s) => `${s.home}-${s.away}`).join(" · ") : "Son iki sezonda karşılaşma yok"}
              </span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
