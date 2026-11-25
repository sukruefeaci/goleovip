import Link from "next/link";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/providers";
import { analyze } from "@/lib/model";
import { kickoffParts, pct } from "@/lib/format";
import type { TeamInput } from "@/lib/types";
import BetTable from "@/components/BetTable";
import PickCard from "@/components/PickCard";
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

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getProvider().getMatch(id);
  if (!match) notFound();
  const a = analyze(match);
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
        <BetTable rows={a.rows} homeName={home.name} awayName={away.name} homeShort={home.short} awayShort={away.short} fileName={`${match.id}.csv`} />

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
                <ProbRow label="Avrupa" sub={`${match.euro.reference}`} values={a.euroFair} />
                {a.iddaaFair && <ProbRow label="iddaa" sub="marjı atılmış" values={a.iddaaFair} />}
                <ProbRow label="Model" sub="harman" values={a.model1x2} highlight />
              </tbody>
            </table>
            {a.iddaaOdds && (
              <p className="muted small">
                iddaa oranları {a.iddaaOdds.map((o) => o.toFixed(2)).join(" · ")} · Avrupa {match.euro.h2h.map((o) => o.toFixed(2)).join(" · ")}
              </p>
            )}
            <div className="margins">
              <div>
                <span>iddaa marjı</span>
                <b className="neg">{a.iddaaMargin !== null ? pct(a.iddaaMargin) : "—"}</b>
              </div>
              <div>
                <span>Avrupa marjı</span>
                <b className="pos">{pct(a.euroMargin)}</b>
              </div>
              <div>
                <span>2.5 Üst (Avrupa)</span>
                <b>{pct(a.euroOver25)}</b>
              </div>
            </div>
          </section>

          <section className="card pad">
            <h3 className="card-title">Takım bilgisi</h3>
            {[home, away].map((t) => (
              <div key={t.short} className="teaminfo">
                <b>{t.name}</b>
                <span className="muted small">
                  Son {t.goalsFor10.length} maç: {t.goalsFor10.reduce((x, y) => x + y, 0)} attı, {t.goalsAgainst10.reduce((x, y) => x + y, 0)} yedi ·
                  korner ort. {t.cornersFor.toFixed(1)}
                </span>
                <span className="small">
                  Eksikler:{" "}
                  <span className="muted">{t.missing.length ? t.missing.map((m) => `${m.name} (${m.role})`).join(", ") : "bilgi yok"}</span>
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
