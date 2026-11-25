import Link from "next/link";
import { kickoffParts } from "@/lib/format";
import { getStore } from "@/lib/auth/store";
import { loadLive } from "@/lib/liveData";
import { trDate } from "@/lib/tracking";
import { CONS_MIN, loadConsensusDay, settleConsensus, waitingConsensus, type ConsRecord, type SysScore } from "@/lib/consensus";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

function Trio({ mac, oran, canli }: { mac: number; oran?: number; canli?: number }) {
  const cell = (name: string, v?: number) => (
    <span className={`trio-c ${v === undefined ? "wait" : ""}`}>
      <small>{name}</small>
      <b>{v === undefined ? "bekliyor" : `%${v}`}</b>
    </span>
  );
  return (
    <div className="trio">
      {cell("⚽ Maçlar", mac)}
      {cell("📊 Oranlar", oran)}
      {cell("🔴 Canlı", canli)}
    </div>
  );
}

const oddOf = (s: { canli?: SysScore; mac: SysScore }) => s.canli?.odd ?? s.mac.odd;

function HistoryRow({ r }: { r: ConsRecord }) {
  const st = r.result ? (r.result.won === true ? "won" : r.result.won === false ? "lost" : "void") : null;
  return (
    <div className={`card sk-row${st ? ` oa-${st}` : ""}`}>
      <div className="sk-top">
        <span className="muted small">
          {r.league} · {r.minute} {r.hg}-{r.ag} iken
        </span>
        {st ? (
          <span className={`mp-badge ${st}`}>
            {st === "won" ? "✓" : st === "lost" ? "✗" : "—"} {r.result!.hg}-{r.result!.ag}
          </span>
        ) : (
          <span className="muted small">sonuç bekleniyor</span>
        )}
      </div>
      <div className="sk-teams">
        {r.home} <span className="vs">vs</span> {r.away}
      </div>
      <div className="sk-pick">
        <b>{r.label}</b>
        {r.odd && <span className="oddpill">{r.odd.toFixed(2)}</span>}
      </div>
      <Trio mac={r.mac} oran={r.oran} canli={r.canli} />
    </div>
  );
}

export default async function UcluPage() {
  const now = Date.now();
  const today = trDate(now);
  const tracking = !!getStore();
  if (tracking) await settleConsensus(today, now).catch(() => 0);
  const [{ consensus, at }, waiting, hist] = await Promise.all([
    loadLive(),
    waitingConsensus().catch(() => []),
    tracking ? loadConsensusDay(today) : Promise.resolve([] as ConsRecord[]),
  ]);
  const decided = hist.filter((r) => r.result && (r.result.won === true || r.result.won === false));
  const hits = decided.filter((r) => r.result!.won).length;

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>Üçlü onay</h1>
        <AutoRefresh seconds={60} />
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Aynı tercihe üç sistemin de (Maçlar, Oranlar, Canlı) kendi güveniyle en az %{CONS_MIN} verdiği tercihler. Canlı sistemi yalnız maç oynanırken
        güven verdiği için üçlü onay maç sırasında oluşur. Son güncelleme{" "}
        {new Date(at).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}.
      </p>

      <h2 className="lc-h">Şu an üç sistemin onayladıkları</h2>
      <div className="sk-list">
        {consensus.flatMap((m) =>
          m.sels.map((s) => {
            const odd = oddOf(s);
            return (
              <Link key={`${m.fotmobId}-${s.key}`} href="/canli" className="card sk-row uc-live">
                <div className="sk-top">
                  <span className="muted small">{m.league}</span>
                  <span className="live-min">
                    <span className="live-dot" aria-hidden /> {m.minute} · {m.hg}-{m.ag}
                  </span>
                </div>
                <div className="sk-teams">
                  {m.home} <span className="vs">vs</span> {m.away}
                </div>
                <div className="sk-pick">
                  <b>{s.label}</b>
                  {odd && <span className="oddpill">{odd.toFixed(2)}</span>}
                  {!s.canli.odd && <span className="muted small">maç öncesi oran</span>}
                </div>
                <Trio mac={s.mac.confidence} oran={s.oran.confidence} canli={s.canli.confidence} />
              </Link>
            );
          }),
        )}
        {!consensus.length && <div className="card pad empty">Şu an üç sistemin de %{CONS_MIN}+ güven verdiği bir tercih yok.</div>}
      </div>

      {tracking && hist.length > 0 && (
        <>
          <div className="sk-head" style={{ marginTop: 22 }}>
            <h2 className="lc-h" style={{ margin: 0 }}>
              Bugün üçlü onay alanlar
            </h2>
            {decided.length > 0 && (
              <span className="small">
                <b className={hits / decided.length >= 0.5 ? "pos" : "neg"}>
                  {hits}/{decided.length} tuttu
                </b>{" "}
                <span className="muted">(%{Math.round((hits / decided.length) * 100)})</span>
              </span>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>
            Üçlü onaya ilk girdiği andaki dakika, skor ve güvenlerle.
          </p>
          <div className="sk-list">
            {hist.map((r) => (
              <HistoryRow key={r.id} r={r} />
            ))}
          </div>
        </>
      )}

      <details className="rest" open={!consensus.length && waiting.length > 0}>
        <summary>Canlı onayını bekleyenler ({waiting.reduce((n, w) => n + w.sels.length, 0)}) — bugün başlayacak maçlarda Maçlar + Oranlar %{CONS_MIN}+</summary>
        <div className="sk-list">
          {waiting.flatMap(({ a, sels }) =>
            sels.map((s) => {
              const k = kickoffParts(a.match.kickoff);
              return (
                <Link key={`${a.match.id}-${s.key}`} href={`/mac/${a.match.id}`} className="card sk-row">
                  <div className="sk-top">
                    <span className="muted small">
                      {k.time} · {a.match.league}
                    </span>
                  </div>
                  <div className="sk-teams">
                    {a.match.home.name} <span className="vs">vs</span> {a.match.away.name}
                  </div>
                  <div className="sk-pick">
                    <b>{s.label}</b>
                    {s.mac.odd && <span className="oddpill">{s.mac.odd.toFixed(2)}</span>}
                  </div>
                  <Trio mac={s.mac.confidence} oran={s.oran.confidence} />
                </Link>
              );
            }),
          )}
          {!waiting.length && <div className="card pad empty small">Bugün başlayacak maçlarda iki sistemin %{CONS_MIN}+ verdiği tercih yok.</div>}
        </div>
      </details>
    </div>
  );
}
