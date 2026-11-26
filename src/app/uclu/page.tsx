import { inBackground } from "@/lib/background";
import Link from "next/link";
import { kickoffParts } from "@/lib/format";
import { getStore } from "@/lib/auth/store";
import { loadLive } from "@/lib/liveData";
import { trDate } from "@/lib/tracking";
import { CONS_MIN, loadConsensusDay, searchConsensus, settleConsensus, SYS_LABEL, type ConsRecord, type SearchHit, type SysSel } from "@/lib/consensus";

export const dynamic = "force-dynamic";

const ALL: SysSel[] = ["mac", "oran", "canli"];
const ICON: Record<SysSel, string> = { mac: "⚽", oran: "📊", canli: "🔴" };

/** Seçilen sistemlerin olasılıkları yan yana (seçilmeyenler sönük) */
function Trio({ vals }: { vals: Partial<Record<SysSel, number | undefined>> }) {
  return (
    <div className="trio">
      {ALL.map((k) => {
        const v = vals[k];
        return (
          <span key={k} className={`trio-c ${v === undefined ? "wait" : ""}`}>
            <small>
              {ICON[k]} {SYS_LABEL[k]}
            </small>
            <b>{v === undefined ? "—" : `%${v}`}</b>
          </span>
        );
      })}
    </div>
  );
}

const pct = (p?: number) => (p === undefined ? undefined : Math.round(p * 100));

function HitCard({ m, h }: { m: Awaited<ReturnType<typeof searchConsensus>>["matches"][number]; h: SearchHit }) {
  const k = kickoffParts(m.kickoff);
  return (
    <Link href={m.href} className={`card sk-row ${m.live ? "uc-live" : ""}`}>
      <div className="sk-top">
        <span className="muted small">
          {m.live ? "" : `${k.date} · ${k.time} · `}
          {m.league}
        </span>
        {m.live && (
          <span className="live-min">
            <span className="live-dot" aria-hidden /> {m.minute} · {m.hg}-{m.ag}
          </span>
        )}
      </div>
      <div className="sk-teams">
        {m.home} <span className="vs">vs</span> {m.away}
      </div>
      <div className="sk-pick">
        <b>{h.label}</b>
        {h.odd && <span className="oddpill">{h.odd.toFixed(2)}</span>}
      </div>
      <Trio vals={{ mac: pct(h.mac?.prob), oran: pct(h.oran?.prob), canli: pct(h.canli?.prob) }} />
    </Link>
  );
}

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
      <Trio vals={{ mac: r.mac, oran: r.oran, canli: r.canli }} />
    </div>
  );
}

export default async function UcluPage({ searchParams }: { searchParams: Promise<{ p?: string; s?: string | string[]; o?: string; ara?: string }> }) {
  const q = await searchParams;
  // Arama ölçütleri (varsayılan: üç sistem, %65, oran ≥ 1.50)
  const searched = q.ara === "1";
  const sel = searched ? ALL.filter((k) => [q.s].flat().includes(k)) : ALL;
  const min = Math.min(95, Math.max(40, Math.round(Number(q.p) || CONS_MIN)));
  const minOdd = Math.min(10, Math.max(1.01, Number(String(q.o ?? "").replace(",", ".")) || 1.5));

  const now = Date.now();
  const today = trDate(now);
  const tracking = !!getStore();
  if (tracking) inBackground(() => settleConsensus(today, now, 8000));
  const live = await loadLive();
  const [{ matches, loading }, hist] = await Promise.all([
    searchConsensus(sel, min, minOdd, live.items),
    tracking ? loadConsensusDay(today) : Promise.resolve([] as ConsRecord[]),
  ]);
  const total = matches.reduce((n, m) => n + m.hits.length, 0);
  const decided = hist.filter((r) => r.result && (r.result.won === true || r.result.won === false));
  const hits = decided.filter((r) => r.result!.won).length;
  const names = sel.map((k) => SYS_LABEL[k]).join(" + ");

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>🤝 Üçlü onay</h1>
      </div>

      <form className="card pad uc-form" method="get">
        <input type="hidden" name="ara" value="1" />
        <label className="uc-p">
          <span>Kazanma olasılığı en az</span>
          <span className="uc-num">
            %<input name="p" type="number" inputMode="numeric" min={40} max={95} step={1} defaultValue={min} />
          </span>
        </label>
        <div className="uc-sys">
          {ALL.map((k) => (
            <label key={k} className="uc-chk">
              <input type="checkbox" name="s" value={k} defaultChecked={sel.includes(k)} />
              <span>
                {ICON[k]} {SYS_LABEL[k]}
              </span>
            </label>
          ))}
        </div>
        <label className="uc-p">
          <span>Oran en az</span>
          <span className="uc-num">
            <input name="o" type="number" inputMode="decimal" min={1.01} max={10} step={0.01} defaultValue={minOdd.toFixed(2)} />
          </span>
        </label>
        <button className="btn primary block">🔎 Ara</button>
        <p className="muted small" style={{ margin: 0 }}>
          İşaretlediğin <b>her sistemin</b> bu olasılığı geçtiği tercihler listelenir. Canlı işaretliyse şu an oynanan maçlar, değilse önümüzdeki 36
          saatte başlayacak maçlar aranır.
        </p>
      </form>

      <h2 className="lc-h">
        {sel.length ? (
          <>
            {names} · %{min}+ · oran {minOdd.toFixed(2)}+ <span className="muted small">({total} tercih)</span>
          </>
        ) : (
          "En az bir sistem işaretle"
        )}
      </h2>
      {loading && <div className="notice subtle">Geçmiş maç arşivi hazırlanıyor; Oranlar sonuçları birkaç saniye sonra tamamlanır, sayfayı yenile.</div>}
      <div className="sk-list">
        {matches.flatMap((m) => m.hits.map((h) => <HitCard key={`${m.id}-${h.key}`} m={m} h={h} />))}
        {sel.length > 0 && !total && !loading && (
          <div className="card pad empty">
            Bu ölçütlerle tercih yok.{sel.includes("canli") && !live.items.some((i) => i.pre) ? " Şu an analiz ettiğimiz bir maç oynanmıyor." : " Olasılığı düşürmeyi dene."}
          </div>
        )}
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
            Otomatik kayıt: maç sırasında üç sistemin de %{CONS_MIN}+ verdiği tercihler, ilk onay anındaki dakika ve skorla.
          </p>
          <div className="sk-list">
            {hist.map((r) => (
              <HistoryRow key={r.id} r={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
