import Link from "next/link";
import { loadLive, type LiveItem } from "@/lib/liveData";
import AutoRefresh from "@/components/AutoRefresh";
import { confLevel, winLevel } from "@/components/WinConfidence";

export const dynamic = "force-dynamic";

const pc = (x: number) => `%${Math.round(x * 100)}`;

function Stat({ label, v, fmt = (x: number) => String(x) }: { label: string; v?: [number, number]; fmt?: (x: number) => string }) {
  if (!v) return null;
  const tot = v[0] + v[1] || 1;
  return (
    <div className="ls">
      <span className="ls-v">{fmt(v[0])}</span>
      <div className="ls-mid">
        <span>{label}</span>
        <div className="ls-bar">
          <i style={{ width: `${(v[0] / tot) * 100}%` }} />
        </div>
      </div>
      <span className="ls-v">{fmt(v[1])}</span>
    </div>
  );
}

function LiveCard({ it }: { it: LiveItem }) {
  const m = it.model;
  const tempoCls = m.tempo.label === "Yüksek" ? "lv-high" : m.tempo.label === "Düşük" ? "lv-low" : "lv-mid";
  const phaseNote =
    it.phase === "1H"
      ? "İlk yarı oynanıyor: takımların ilk yarı gol eğilimi ve tempo kullanılıyor"
      : it.phase === "HT"
        ? "Devre arası: ikinci yarı için skor durumuna göre takım tepkisi kullanılıyor"
        : "İkinci yarı: skor durumuna göre takımların ikinci yarı tepkisi kullanılıyor";
  return (
    <section className="card lc">
      <div className="lc-top">
        <span className="live-dot" aria-hidden />
        <b className="lc-min">{it.minuteLabel}</b>
        <span className="chip">{it.league}</span>
        {it.pre?.matchId && (
          <Link href={`/mac/${it.pre.matchId}`} className="muted small lc-pre">
            maç öncesi analiz ›
          </Link>
        )}
      </div>
      <div className="lc-score">
        <span className="lc-team">{it.home}</span>
        <b>
          {it.hg} - {it.ag}
        </b>
        <span className="lc-team right">{it.away}</span>
      </div>
      {it.phase !== "1H" && it.hht !== undefined && (
        <div className="muted small" style={{ textAlign: "center" }}>
          İlk yarı {it.hht}-{it.aht}
        </div>
      )}

      {it.hasStats && (
        <div className="lc-stats">
          <Stat label="xG" v={it.stats.xg} fmt={(x) => x.toFixed(2)} />
          <Stat label="Şut" v={it.stats.shots} />
          <Stat label="İsabetli şut" v={it.stats.sot} />
          <Stat label="Korner" v={it.stats.corners} />
          <Stat label="Topa sahip olma %" v={it.stats.poss} />
        </div>
      )}

      <div className="lc-info small">
        <span>
          Tempo: <b className={tempoCls}>{m.tempo.label}</b> <span className="muted">({m.tempo.basis})</span>
        </span>
        <span className="muted">{phaseNote}</span>
        {m.reaction && <span className="muted">{m.reaction.note}</span>}
        {it.pre?.summary && (
          <span className="muted">
            Maç öncesi: 2.5 Üst {pc(it.pre.summary.over25)} · KG Var {pc(it.pre.summary.btts)} · en olası skor {it.pre.summary.topScore}
          </span>
        )}
        {m.notes.map((n) => (
          <span key={n} className="muted">
            ⓘ {n}
          </span>
        ))}
      </div>

      <div className="lc-recs">
        <span className="lc-recs-title">
          <span className="ai">AI</span> Canlı öneri
        </span>
        {it.recs.length ? (
          it.recs.map((r) => (
            <div key={r.label} className="lc-rec">
              <b>{r.label}</b>
              <span className={winLevel(r.prob).cls}>{pc(r.prob)}</span>
              <span className={`small ${confLevel(r.confidence).cls}`}>güven %{r.confidence}</span>
            </div>
          ))
        ) : (
          <span className="muted small">Şu an %60 üstü güçlü bir öneri yok.</span>
        )}
      </div>
    </section>
  );
}

export default async function LivePage() {
  const { items, total, at } = await loadLive();
  const analyzed = items.filter((i) => i.pre);
  const others = items.filter((i) => !i.pre);
  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>
          <span className="live-dot big" aria-hidden /> Canlı maçlar
        </h1>
        <AutoRefresh seconds={60} />
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        {total} maç oynanıyor · {analyzed.length} tanesi maç öncesi analiz edildi · son güncelleme{" "}
        {new Date(at).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}. Öneriler kalan süre, tempo,
        skor durumu ve maç öncesi analize göre olasılık tahminidir; canlı iddaa oranı olmadığı için değerli olup olmadıkları hesaplanamaz.
      </p>

      {analyzed.length > 0 && <h2 className="lc-h">Analiz ettiğimiz maçlar</h2>}
      <div className="lc-list">
        {analyzed.map((it) => (
          <LiveCard key={it.id} it={it} />
        ))}
      </div>

      {others.length > 0 && (
        <>
          <h2 className="lc-h">Diğer canlı maçlar</h2>
          <p className="muted small">Bu maçlar için maç öncesi analiz yok; lig ortalaması ve canlı istatistik (varsa) kullanılır, güven daha düşüktür.</p>
          <div className="lc-list">
            {others.map((it) => (
              <LiveCard key={it.id} it={it} />
            ))}
          </div>
        </>
      )}
      {!items.length && <div className="card pad empty">Şu an oynanan maç yok.</div>}
    </div>
  );
}
