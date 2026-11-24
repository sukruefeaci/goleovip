import Link from "next/link";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/providers";
import { analyze } from "@/lib/model";
import { initials, kickoffParts, pct } from "@/lib/format";
import type { TeamInput } from "@/lib/types";
import BetTable from "@/components/BetTable";
import PickCard from "@/components/PickCard";
import { choosePick } from "@/lib/pick";

export const dynamic = "force-dynamic";

function Form({ team }: { team: TeamInput }) {
  return (
    <div className="form">
      {team.form.map((f, i) => (
        <span key={i} className={f}>
          {f}
        </span>
      ))}
    </div>
  );
}

function Bar({ label, right, values, colors }: { label: string; right: string; values: number[]; colors: string[] }) {
  return (
    <div className="barrow">
      <div className="lbl">
        <b>{label}</b>
        <span className="muted">{right}</span>
      </div>
      <div className="bar">
        {values.map((v, i) => (
          <div key={i} style={{ width: `${v * 100}%`, background: colors[i] }}>
            {v > 0.07 ? pct(v) : ""}
          </div>
        ))}
      </div>
    </div>
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
      <div className="toolbar">
        <Link href="/" className="muted">
          ← Maçlar
        </Link>
        <span className="muted small">Güncellendi: {new Date(match.updatedAt).toLocaleTimeString("tr-TR")}</span>
      </div>

      <section className="panel hero">
        <div className="hero-league muted">{match.league}</div>
        <div className="side">
          <div className="avatar">{initials(home.name)}</div>
          <div>
            <h1>{home.name}</h1>
            <Form team={home} />
            <div className="muted small">
              Puan durumu: <b>{home.rank}.</b> · {home.points} p
            </div>
          </div>
        </div>
        <div className="center">
          <div className="muted hide-sm">{match.league}</div>
          <div className="time">{k.time}</div>
          <div className="muted">{k.date}</div>
          <div style={{ marginTop: 8 }} className="hide-sm">
            <span className="chip">Avrupa + istatistik</span>
          </div>
        </div>
        <div className="side away">
          <div>
            <h1>{away.name}</h1>
            <Form team={away} />
            <div className="muted small">
              Puan durumu: <b>{away.rank}.</b> · {away.points} p
            </div>
          </div>
          <div className="avatar">{initials(away.name)}</div>
        </div>
      </section>

      {pick && <PickCard analysis={a} pick={pick} />}

      {match.warnings.length > 0 && <div className="warn">⚠ {match.warnings.join(" · ")}</div>}

      <div className="layout">
        <div className="side-col">
          <aside className="panel side-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>AVRUPA PİYASASI</h3>
              <span className="chip">✓ {match.euro.bookmakers} şirket</span>
            </div>
            <div className="muted small" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1 · {home.short}</span>
              <span>X</span>
              <span>{away.short} · 2</span>
            </div>
            <Bar
              label="Avrupa adil"
              right={`${match.euro.reference} ${match.euro.h2h.map((o) => o.toFixed(2)).join(" / ")}`}
              values={a.euroFair}
              colors={["var(--green)", "var(--grey)", "var(--blue)"]}
            />
            {a.iddaaFair && a.iddaaOdds && (
              <Bar
                label="iddaa (marjsız)"
                right={a.iddaaOdds.map((o) => o.toFixed(2)).join(" / ")}
                values={a.iddaaFair}
                colors={["var(--yellow)", "#7c6a1a", "#a08a12"]}
              />
            )}
            <Bar
              label="Model (harman)"
              right={`λ ${a.lambda.home.toFixed(2)} – ${a.lambda.away.toFixed(2)}`}
              values={a.model1x2}
              colors={["var(--green-dim)", "var(--grey)", "#0369a1"]}
            />
            <div className="tiles">
              <div className="tile">
                <span className="muted small">iddaa marjı</span>
                <b style={{ color: "var(--yellow)" }}>{a.iddaaMargin !== null ? pct(a.iddaaMargin) : "—"}</b>
              </div>
              <div className="tile">
                <span className="muted small">Avrupa marjı</span>
                <b style={{ color: "var(--green)" }}>{pct(a.euroMargin)}</b>
              </div>
            </div>
            <div className="small">
              Avrupa 2.5 üst: <b>{pct(a.euroOver25)}</b>
              <br />
              <span className="muted">
                λ piyasa {a.lambdaMarket.home.toFixed(2)}–{a.lambdaMarket.away.toFixed(2)} · istatistik{" "}
                {a.lambdaStats.home.toFixed(2)}–{a.lambdaStats.away.toFixed(2)}
              </span>
            </div>
          </aside>

          <aside className="panel side-panel">
            <h3>KADRO · SAKAT / CEZALI</h3>
            <div>
              {a.attackPenalty.home > 0 && <span className="badge">{home.short} hücum −%{(a.attackPenalty.home * 100).toFixed(0)}</span>}
              {a.attackPenalty.away > 0 && <span className="badge">{away.short} hücum −%{(a.attackPenalty.away * 100).toFixed(0)}</span>}
            </div>
            {[home, away].map((t) => (
              <div key={t.short} className="small">
                <b>{t.name}:</b>{" "}
                <span className="muted">{t.missing.length ? t.missing.map((m) => `${m.name} (${m.role})`).join(", ") : "eksik yok"}</span>
              </div>
            ))}
            <h3 style={{ marginTop: 6 }}>ARALARINDAKİ MAÇLAR</h3>
            <div className="small muted">{match.headToHead.length ? match.headToHead.map((s) => `${s.home}-${s.away}`).join(" · ") : "Son iki sezonda karşılaşma yok"}</div>
          </aside>
        </div>

        <BetTable rows={a.rows} homeName={home.name} awayName={away.name} homeShort={home.short} awayShort={away.short} fileName={`${match.id}.csv`} />
      </div>
    </>
  );
}
