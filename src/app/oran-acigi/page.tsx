import Link from "next/link";
import { loadAnalyses } from "@/lib/data";
import { kickoffParts } from "@/lib/format";
import { isLineGap, lineGapSize, scanGaps, type GapRow } from "@/lib/oddsGap";
import { afKey, findAfOdds, loadAfDay } from "@/lib/providers/apiFootball";
import { loadOpDay } from "@/lib/providers/oddsPapi";

export const dynamic = "force-dynamic";

const MINS = [0, 3, 5, 10] as const;
const pc = (x: number) => `%${Math.round(x * 100)}`;
const fmtLine = (x: number) => x.toFixed(1).replace(".", ",");

function GapLine({ r }: { r: GapRow }) {
  const lg = isLineGap(r);
  return (
    <div className={`gp-row ${lg ? "gp-line" : ""}`}>
      <div className="gp-main">
        <span className="muted small">
          {r.market} {r.direct ? <span className="gp-tag">doğrudan</span> : <span className="gp-tag t">türetilmiş</span>}
        </span>
        <b>{r.selection}</b>
        {lg && r.line && (
          <span className="small gp-why">
            📏 Çizgi açığı: iddaa <b>{fmtLine(r.line.line)}</b> {r.line.side}&apos;e {r.odd.toFixed(2)} veriyor; yurt dışı bu oranı{" "}
            <b>{fmtLine(r.line.equivLine!)}</b> {r.line.side}&apos;te verirdi ({lineGapSize(r)} çizgi fark · beklenen {r.line.what}{" "}
            {r.line.expected.toFixed(2).replace(".", ",")})
          </span>
        )}
      </div>
      <div className="gp-odds">
        <div>
          <small>iddaa</small>
          <b className="gold">{r.odd.toFixed(2)}</b>
        </div>
        <div>
          <small>Yurt dışı adil</small>
          <b>{r.fairOdd.toFixed(2)}</b>
        </div>
        <div>
          <small>Açık</small>
          <b className={r.gap >= 0 ? "pos" : "neg"}>
            {r.gap >= 0 ? "+" : "−"}%{Math.abs(r.gap * 100).toFixed(1)}
          </b>
        </div>
      </div>
      <div className="muted small">Yurt dışına göre tutma ihtimali {pc(r.pForeign)}</div>
    </div>
  );
}

export default async function OddsGapPage({ searchParams }: { searchParams: Promise<{ min?: string; cizgi?: string }> }) {
  const q = await searchParams;
  const min = MINS.includes(Number(q.min) as (typeof MINS)[number]) ? Number(q.min) : 3;
  const onlyLine = q.cizgi === "1";
  const { analyses, banner } = await loadAnalyses();
  // Yurt dışı oranlar: API-Football (bugün, yarın, öbür gün UTC) — varsa; yoksa Football-Data
  const dates = [0, 1, 2].map((i) => new Date(Date.now() + i * 86400_000).toISOString().slice(0, 10));
  // Önce OddsPapi (Pinnacle), sonra API-Football
  const [opDay, afDays] = await Promise.all([loadOpDay(), afKey() ? Promise.all(dates.map((d) => loadAfDay(d))) : Promise.resolve([])]);
  const afFor = (a: (typeof analyses)[number]) => {
    const m = { home: a.match.home.name, away: a.match.away.name, kickoff: a.match.kickoff };
    return findAfOdds([opDay], m)?.odds ?? findAfOdds(afDays, m)?.odds ?? null;
  };
  const upcoming = analyses.filter((a) => new Date(a.match.kickoff).getTime() > Date.now());
  const withForeign = upcoming.filter((a) => (a.match.source ?? "market") === "market" || afFor(a)).length;
  const all = scanGaps(analyses, min / 100, Date.now(), afFor);
  const matches = all
    .map((g) => ({ ...g, rows: onlyLine ? g.rows.filter(isLineGap) : g.rows }))
    .filter((g) => g.rows.length);
  const lineCount = all.reduce((n, g) => n + g.rows.filter(isLineGap).length, 0);
  // Açık yoksa: iddaa'nın yurt dışına en yakın (en az marjlı) verdiği seçenekler
  const nearest = matches.length
    ? []
    : scanGaps(analyses, -0.08, Date.now(), afFor)
        .map((g) => ({ ...g, rows: g.rows.slice(0, 2) }))
        .slice(0, 10);
  const href = (m: number, c: boolean) => `/oran-acigi?min=${m}${c ? "&cizgi=1" : ""}`;

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}
      <div className="seg oa-switch">
        <Link href="/oran-analizi">📊 Oran analizi</Link>
        <Link href="/oran-acigi" className="on">
          🔍 Oran açığı
        </Link>
      </div>
      <div className="page-head">
        <h1>Oran açığı</h1>
        <span className="muted small">{withForeign} maçta yurt dışı oranı var</span>
      </div>
      <p className="muted small rule-note">
        iddaa&apos;nın oranı ya da çizgisi ile yurt dışı bahis şirketlerinin (Pinnacle, Betfair, Bet365… marjı atılmış) beklentisi arasındaki fark.{" "}
        <b>Açık</b> = iddaa oranı × yurt dışı ihtimali − 1; artıysa iddaa yurt dışının adil oranından yüksek veriyor. <b>📏 Çizgi açığı</b>: iddaa aynı
        oranı yurt dışının vereceğinden daha kolay bir çizgide veriyor. <b>Doğrudan</b>: yurt dışında aynı çizgi/seçenek birebir var;{" "}
        <b>türetilmiş</b>: yurt dışının başka çizgilerinden hesaplandı (gol, korner, kart dağılımı).
      </p>

      <div className="daytabs gp-tabs" role="tablist">
        {MINS.map((m) => (
          <Link key={m} href={href(m, onlyLine)} className={m === min ? "on" : ""} role="tab" aria-selected={m === min}>
            Açık ≥ %{m}
          </Link>
        ))}
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <Link href={href(min, false)} className={!onlyLine ? "on" : ""}>
          Tüm açıklar
        </Link>
        <Link href={href(min, true)} className={onlyLine ? "on" : ""}>
          📏 Yalnız çizgi açığı ({lineCount})
        </Link>
      </div>

      <div className="oa-list">
        {matches.map((g) => {
          const k = kickoffParts(g.a.match.kickoff);
          return (
            <section key={g.a.match.id} className="card oa-row">
              <div className="oa-top">
                <span className="muted small">
                  {k.date} · {k.time} · {g.a.match.league}
                </span>
                <span className="muted small">{g.reference}</span>
              </div>
              <Link href={`/mac/${g.a.match.id}`} className="oa-match">
                {g.a.match.home.name} <span className="vs">vs</span> {g.a.match.away.name}
              </Link>
              {Number.isFinite(g.expectedGoals) && (
                <div className="muted small">Yurt dışına göre beklenen toplam gol {g.expectedGoals.toFixed(2).replace(".", ",")}</div>
              )}
              {g.rows.slice(0, 6).map((r) => (
                <GapLine key={r.key} r={r} />
              ))}
            </section>
          );
        })}
        {nearest.length > 0 && (
          <>
            <div className="notice subtle">
              Şu an bu eşikte açık yok: iddaa yurt dışından düşük oran veriyor (marjı genelde %10–15). Aşağıda iddaa&apos;nın yurt dışına <b>en yakın</b>{" "}
              verdiği seçenekler var; bunlar artı değil, sadece en az kayıplı olanlar.
            </div>
            {nearest.map((g) => {
              const k = kickoffParts(g.a.match.kickoff);
              return (
                <section key={g.a.match.id} className="card oa-row">
                  <div className="oa-top">
                    <span className="muted small">
                      {k.date} · {k.time} · {g.a.match.league}
                    </span>
                    <span className="muted small">{g.reference}</span>
                  </div>
                  <Link href={`/mac/${g.a.match.id}`} className="oa-match">
                    {g.a.match.home.name} <span className="vs">vs</span> {g.a.match.away.name}
                  </Link>
                  {g.rows.map((r) => (
                    <GapLine key={r.key} r={r} />
                  ))}
                </section>
              );
            })}
          </>
        )}
        {!matches.length && !nearest.length && (
          <div className="card pad empty">
            {withForeign === 0
              ? "Şu an yurt dışı oranı olan yaklaşan maç yok. Yurt dışı oranlar zamanlayıcıyla kademeli çekilir; biraz sonra tekrar bak."
              : "Bu ölçütte açık yok. Eşiği düşürmeyi dene."}
          </div>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 16 }}>
        Kaynak: OddsPapi (Pinnacle: gol, ilk yarı, takım golleri, korner), API-Football ve Football-Data. Taç pazarı yurt dışı kaynakta yok. Yurt dışı oranlar zamanlayıcıyla birkaç saatte bir
        güncellenir (ücretsiz plan günlük istek sınırı).
      </p>
    </div>
  );
}
