import Link from "next/link";
import { loadLive, type LiveItem } from "@/lib/liveData";
import AutoRefresh from "@/components/AutoRefresh";
import ProfitBoard from "@/components/ProfitBoard";
import { canliItems, dayPnl, totalPnl } from "@/lib/pnl";
import { confLevel, winLevel } from "@/components/WinConfidence";
import { getLiveLearning, getLiveSituations, liveFactors, loadLiveDay, settleLive, situationRows, type LiveLearning, type LiveRecord, type LiveSituations } from "@/lib/liveTracking";
import { trDate } from "@/lib/tracking";
import { getStore } from "@/lib/auth/store";

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
          {it.hasOdds && <span className="muted small">· iddaa canlı oranlarıyla</span>}
        </span>
        {it.recs.length ? (
          it.recs.map((r) => (
            <div key={r.label} className={`lc-rec ${r.ev !== undefined && r.ev > 0 ? "value" : ""}`}>
              <b>{r.label}</b>
              {r.odd ? <span className="oddpill">{r.odd.toFixed(2)}</span> : <span className="muted small">oran yok</span>}
              <span className={winLevel(r.prob).cls}>{pc(r.prob)}</span>
              <span className={`small ${confLevel(r.confidence).cls}`}>güven %{r.confidence}</span>
              {r.ev !== undefined && (
                <span className={`small lc-ev ${r.ev >= 0 ? "pos" : "neg"}`}>
                  getiri {r.ev >= 0 ? "+" : "−"}%{Math.abs(Math.round(r.ev * 100))}
                </span>
              )}
            </div>
          ))
        ) : (
          <span className="muted small">Şu an oranı 1.45 ve üstü, olasılığı %55 üstü bir öneri yok.</span>
        )}
      </div>
    </section>
  );
}

function History({ recs, day }: { recs: LiveRecord[]; day: "bugun" | "dun" }) {
  const decided = recs.filter((r) => r.result && r.result.won !== null);
  const hits = decided.filter((r) => r.result!.won).length;
  const exp = decided.reduce((s, r) => s + r.prob, 0);
  return (
    <section className="card pad lh">
      <div className="lh-head">
        <h3 className="card-title" style={{ margin: 0 }}>
          Canlı öneri takibi
        </h3>
        <div className="seg">
          <Link href="/canli" className={day === "bugun" ? "on" : ""}>
            Bugün
          </Link>
          <Link href="/canli?gun=dun" className={day === "dun" ? "on" : ""}>
            Dün
          </Link>
        </div>
      </div>
      {decided.length > 0 && (
        <p className="small" style={{ margin: "8px 0" }}>
          <b>
            {hits}/{decided.length}
          </b>{" "}
          tuttu{" "}
          <b className={hits / decided.length >= exp / decided.length ? "pos" : "neg"}>(%{Math.round((hits / decided.length) * 100)})</b>
          <span className="muted"> · beklenen %{Math.round((exp / decided.length) * 100)}</span>
        </p>
      )}
      {recs.length === 0 ? (
        <p className="muted small" style={{ marginBottom: 0 }}>
          Henüz kayıtlı canlı öneri yok.
        </p>
      ) : (
        <div className="lh-list">
          {recs.map((r) => {
            const st = r.result ? (r.result.won === true ? "won" : r.result.won === false ? "lost" : "void") : "open";
            return (
              <div key={`${r.fotmobId}|${r.label}`} className={`lh-row mp-${st}`}>
                <div className="lh-main">
                  <b>{r.label}</b>
                  <span className="muted small">
                    {r.home} – {r.away} · {r.minute}, {r.hg}-{r.ag} iken
                  </span>
                </div>
                {r.odd && <span className="oddpill">{r.odd.toFixed(2)}</span>}
                <span className="small">
                  %{Math.round(r.prob * 100)} · güven %{r.confidence}
                </span>
                <span className={`mp-badge ${st}`}>
                  {st === "won" ? `✓ ${r.result!.hg}-${r.result!.ag}` : st === "lost" ? `✗ ${r.result!.hg}-${r.result!.ag}` : st === "void" ? "—" : "bekliyor"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Learn({ l, s }: { l: LiveLearning; s: LiveSituations }) {
  const f = liveFactors(l);
  const sit = situationRows(l, s);
  const rows = Object.entries(l) as [keyof LiveLearning, { n: number; hits: number; pred: number }][];
  if (!rows.length) return null;
  return (
    <section className="card pad learn">
      <h3 className="card-title">Canlı model ne öğrendi?</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Her canlı öneri maç bitince değerlendirilir. Bir öneri türü beklenenden sık tutuyorsa olasılıkları biraz yükseltilir, seyrek tutuyorsa
        düşürülür (az veriyle küçük, en fazla ±%15).
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="learn-row">
          <b>{k}</b>
          <span className="small">
            {v.hits}/{v.n} tuttu (%{Math.round((v.hits / Math.max(1, v.n)) * 100)}) · beklenen %{Math.round((v.pred / Math.max(1, v.n)) * 100)}
          </span>
          <span className="small">
            düzeltme <b>×{(f[k] ?? 1).toFixed(2)}</b>
          </span>
        </div>
      ))}
      <h3 className="card-title" style={{ marginTop: 18 }}>
        Duruma göre ne öğrendi?
      </h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Her öneri yapıldığı andaki durumla kaydedilir: dakika, skor farkı, tempo, canlı veri ve maç öncesi analiz. Bir tercih türü belli bir durumda
        türün genelinden daha iyi ya da kötü tutuyorsa o durumda olasılık ayrıca ayarlanır (her durum en fazla ±%10, toplam ±%15). En az 8 sonuçlanmış
        öneri olan durumlar gösterilir.
      </p>
      {sit.length === 0 && <p className="small muted">Henüz yeterli örnek yok; öneriler sonuçlandıkça burada görünecek.</p>}
      {sit.slice(0, 14).map((r) => (
        <div key={`${r.kind}|${r.dim}|${r.val}`} className="learn-row">
          <b>
            {r.kind} · {r.dim}: {r.val}
          </b>
          <span className="small">
            {r.hits}/{r.n} tuttu (%{Math.round((r.hits / r.n) * 100)}) · beklenen %{Math.round((r.pred / r.n) * 100)}
          </span>
          <span className="small">
            ek düzeltme{" "}
            <b className={r.adj > 1.005 ? "pos" : r.adj < 0.995 ? "neg" : undefined}>×{r.adj.toFixed(2)}</b>
          </span>
        </div>
      ))}
    </section>
  );
}

export default async function LivePage({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams;
  const histDay: "bugun" | "dun" = gun === "dun" ? "dun" : "bugun";
  const tracking = !!getStore();
  const now = Date.now();
  const today = trDate(now),
    yesterday = trDate(now - 86400_000);
  const histDate = histDay === "dun" ? yesterday : today;
  if (tracking) await Promise.all([settleLive(today, now, 3000).catch(() => 0), settleLive(yesterday, now, 3000).catch(() => 0)]);
  // Önce canlı öneriler hesaplanıp kaydedilir, sonra geçmiş okunur
  const { items, total, at } = await loadLive();
  const loadRecs = (d: string) => (tracking ? loadLiveDay(d).catch(() => [] as LiveRecord[]) : Promise.resolve([] as LiveRecord[]));
  const [todayRecs, ydayRecs, learning, situations] = await Promise.all([
    loadRecs(today),
    loadRecs(yesterday),
    tracking ? getLiveLearning() : Promise.resolve({} as LiveLearning),
    tracking ? getLiveSituations() : Promise.resolve({ v: 1, b: {} } as LiveSituations),
  ]);
  const hist = histDay === "dun" ? ydayRecs : todayRecs;
  const pT = dayPnl(canliItems(todayRecs)),
    pY = dayPnl(canliItems(ydayRecs));
  const totalC = tracking ? await totalPnl("canli", { [today]: pT, [yesterday]: pY }).catch(() => null) : null;
  const analyzed = items.filter((i) => i.pre);
  const others = items.filter((i) => !i.pre);
  return (
    <div className="page-narrow">
      {tracking && <ProfitBoard title="Canlı tahminler · 100 TL ile kâr/zarar" today={pT} yesterday={pY} total={totalC} />}
      <div className="page-head">
        <h1>
          <span className="live-dot big" aria-hidden /> Canlı maçlar
        </h1>
        <AutoRefresh seconds={60} />
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        {total} maç oynanıyor · {analyzed.length} tanesi maç öncesi analiz edildi · son güncelleme{" "}
        {new Date(at).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}. Öneriler kalan süre, tempo,
        skor durumu ve maç öncesi analize göre olasılık tahminidir. Yalnız oranı 1.45 ve üstü olan tercihler önerilir (iddaa canlı oranı; yoksa olasılıktan
        hesaplanan adil oran). Oranı olan önerilerde getiri (olasılık × oran − 1) de gösterilir; yeşil kenarlı öneriler artı getirili.
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

      {tracking ? (
        <>
          <History recs={hist} day={histDay} />
          <Learn l={learning} s={situations} />
        </>
      ) : (
        <div className="notice subtle" style={{ marginTop: 16 }}>
          Canlı önerilerin takibi için veritabanı (Upstash) bağlı olmalı; /kurulum sayfasından kontrol edebilirsin.
        </div>
      )}
    </div>
  );
}
