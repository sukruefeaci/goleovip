import { getStore } from "@/lib/auth/store";
import { currentUser } from "@/lib/auth/current";
import { isAdmin } from "@/lib/admin";
import { bandMapper, getCalibration, SYSTEMS, type DimKey, type SystemKey } from "@/lib/calibration";
import { dailyNote, dimRows, dimSuggestions, leagueRows, overUnder, suggestions, summarize, type DayResult, type DimRow } from "@/lib/aiInsights";
import { calibrationFactors, getLearning, loadDay, trDate } from "@/lib/tracking";
import { getLiveLearning, getLiveSituations, liveFactors, loadLiveDay, situationRows } from "@/lib/liveTracking";
import { analyzedRec } from "@/lib/pnl";
import { loadConsensusDay } from "@/lib/consensus";
import { rebuildCalibration } from "./actions";

export const dynamic = "force-dynamic";

const pc = (x: number | null) => (x === null ? "—" : `%${Math.round(x * 100)}`);
const roiTxt = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : "−"}%${Math.abs(Math.round(r * 100))}`);

function OuCell({ label, r }: { label: string; r: DimRow | null }) {
  return (
    <div className="ou-cell">
      <span className="muted small">{label}</span>
      {r ? (
        <>
          <b className={r.actual >= r.said - 0.03 ? "pos" : "neg"}>{pc(r.actual)}</b>
          <small className="muted">
            {r.hits}/{r.n} · dediği {pc(r.said)}
          </small>
          <small className={r.roi === null ? "muted" : r.roi >= 0 ? "pos" : "neg"}>100 TL: {roiTxt(r.roi)}</small>
        </>
      ) : (
        <small className="muted">veri yok</small>
      )}
    </div>
  );
}

function DimTable({ title, rows }: { title: string; rows: DimRow[] }) {
  if (!rows.length) return null;
  return (
    <>
      <h3 className="sk-tier">{title}</h3>
      <div className="ai-dim">
        <div className="ai-dim-row ai-rel-hd">
          <span />
          <span>Adet</span>
          <span>Dediği</span>
          <span>Tuttu</span>
          <span>100 TL</span>
          <span>Düz.</span>
        </div>
        {rows.slice(0, 12).map((r) => (
          <div key={r.value} className="ai-dim-row">
            <b className="ai-dim-name">{r.value}</b>
            <span className="muted">{r.n}</span>
            <span>{pc(r.said)}</span>
            <b className={r.actual >= r.said - 0.03 ? "pos" : "neg"}>{pc(r.actual)}</b>
            <span className={r.roi === null ? "muted" : r.roi >= 0 ? "pos" : "neg"}>{roiTxt(r.roi)}</span>
            <span className={r.factor < 0.995 ? "neg" : r.factor > 1.005 ? "pos" : "muted"}>×{r.factor.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default async function AiPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const tracking = !!getStore();
  const now = Date.now();
  const yesterday = trDate(now - 86400_000);
  const [c, user, macL, liveL, sit, ySnap, yLive, yUclu] = await Promise.all([
    getCalibration(),
    currentUser(),
    getLearning().catch(() => ({})),
    getLiveLearning().catch(() => ({})),
    getLiveSituations().catch(() => ({ v: 1 as const, b: {} })),
    tracking ? loadDay(yesterday).catch(() => []) : Promise.resolve([]),
    tracking ? loadLiveDay(yesterday).catch(() => []) : Promise.resolve([]),
    tracking ? loadConsensusDay(yesterday).catch(() => []) : Promise.resolve([]),
  ]);
  const systems = summarize(c);
  const oranMap = bandMapper(c?.sys.oran);
  const dr = (name: string, list: { said: number; won: boolean | null | undefined }[]): DayResult => {
    const d = list.filter((x) => typeof x.won === "boolean");
    return { name, n: d.length, hits: d.filter((x) => x.won).length, said: d.reduce((s, x) => s + x.said, 0) };
  };
  const yRes: DayResult[] = [
    dr("Maçlar", ySnap.filter((e) => e.pick).map((e) => ({ said: e.pick!.prob, won: e.result?.pickWon }))),
    dr("Oranlar", ySnap.filter((e) => e.oddsPick).map((e) => ({ said: oranMap(e.oddsPick!.rate), won: e.result?.oddsWon }))),
    dr("Canlı", yLive.filter(analyzedRec).map((r) => ({ said: r.prob, won: r.result?.won }))),
    dr("Üçlü onay", yUclu.map((r) => ({ said: Math.min(r.mac, r.oran, r.canli) / 100, won: r.result?.won }))),
  ];
  const note = dailyNote(c, yRes);
  const sugg = [...suggestions(c, systems), ...dimSuggestions(c)];
  const ou = overUnder(c);
  const DIM_TITLES: [DimKey, string][] = [
    ["Yön", "Tercih yönüne göre (Alt / Üst / KG / Sonuç…)"],
    ["Oran", "Oran aralığına göre"],
    ["Kaynak", "Veri kaynağına göre"],
    ["Lig", "Lige göre"],
  ];
  const leagues = leagueRows(c);
  const macF = calibrationFactors(macL);
  const liveF = liveFactors(liveL);
  const sitRows = situationRows(liveL, sit).slice(0, 8);
  const admin = isAdmin(user);

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>🧠 Yapay zeka</h1>
        {c && <span className="muted small">karne: {new Date(c.builtAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Sistemin şimdiye kadar öğrendikleri. Amaç: <b>%70 diyorsa gerçekten %70 tutsun.</b> Her sistem tercihlerini söylediği olasılığa göre aralıklara böler,
        her aralığın gerçekte ne kadar tuttuğuna bakar ve olasılıklarını buna göre kendiliğinden düzeltir (az veriyle küçük, en fazla ±%20). Karne en
        geç 6 saatte bir kendini yeniler.
      </p>
      {ok && <div className="notice subtle">✓ {ok}</div>}
      {!tracking && <div className="notice">Öğrenme için veritabanı (Upstash) bağlı olmalı.</div>}
      {tracking && !c && <div className="notice subtle">Karne ilk kez hazırlanıyor; bir dakika sonra sayfayı yenile.</div>}

      <section className="card pad ai-note">
        <h2 className="card-title">Bugünün notu</h2>
        <ul>
          {note.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>

      <h2 className="lc-h">Alt mı, üst mü?</h2>
      <section className="card pad">
        <p className="muted small" style={{ marginTop: 0 }}>
          Her sistemin Alt ve Üst tercihleri ayrı ayrı: gerçekte tutma oranı, söylediği olasılık ve her tercihe 100 TL ile getiri. Sistem iki yönü
          ayrı öğrenir; hangi yön beklentisinden iyi gidiyorsa onun olasılıklarını biraz yükseltir.
        </p>
        {ou.map((x) => (
          <div key={x.sys} className="ou-row">
            <b className="ou-name">{x.name}</b>
            <OuCell label="Üst" r={x.over} />
            <OuCell label="Alt" r={x.under} />
            <OuCell label="İY Üst" r={x.htOver} />
            <OuCell label="İY Alt" r={x.htUnder} />
          </div>
        ))}
      </section>

      <h2 className="lc-h">Ne kadar dürüst? (dediği ↔ tuttuğu)</h2>
      {systems.map((s) => (
        <section key={s.key} className="card pad ai-sys">
          <div className="ai-sys-head">
            <h3>{s.name}</h3>
            <span className="small">
              {s.n ? (
                <>
                  {s.hits}/{s.n} tuttu · dediği ort. <b>{pc(s.said)}</b> · tuttuğu <b className={s.actual! >= s.said! - 0.03 ? "pos" : "neg"}>{pc(s.actual)}</b>
                  {s.gap !== null && <span className="muted"> · sapma {s.gap.toFixed(1)} puan</span>}
                </>
              ) : (
                <span className="muted">henüz sonuçlanmış tercih yok</span>
              )}
            </span>
          </div>
          {s.n > 0 && (
            <div className="ai-rel">
              <div className="ai-rel-row ai-rel-hd">
                <span>Dediği</span>
                <span />
                <span>Tuttuğu</span>
                <span>Adet</span>
                <span>Düzeltme</span>
              </div>
              {s.rows
                .filter((r) => r.n > 0)
                .map((r) => (
                  <div key={r.i} className="ai-rel-row">
                    <span>{r.label}</span>
                    <span className="ai-bar" aria-hidden>
                      <i className="said" style={{ width: `${Math.round(r.said * 100)}%` }} />
                      <i className={`act ${r.actual !== null && r.actual < r.said - 0.05 ? "low" : ""}`} style={{ width: `${Math.round((r.actual ?? 0) * 100)}%` }} />
                    </span>
                    <b className={r.actual !== null && Math.abs(r.actual - r.said) <= 0.05 ? "pos" : r.actual !== null && r.actual < r.said ? "neg" : ""}>{pc(r.actual)}</b>
                    <span className="muted">{r.n}</span>
                    <span className={r.factor < 0.995 ? "neg" : r.factor > 1.005 ? "pos" : "muted"}>×{r.factor.toFixed(2)}</span>
                  </div>
                ))}
              <p className="muted small" style={{ margin: "6px 0 0" }}>
                Mor çubuk: söylenen olasılık · yeşil: gerçekte tutma. Düzeltme, o aralıktaki yeni tahminlere uygulanan çarpan.
              </p>
            </div>
          )}
        </section>
      ))}

      <section className="card pad ai-sugg">
        <h2 className="card-title">Kendini geliştirme önerileri</h2>
        {!sugg.length && <p className="muted small">Şu an dikkat çeken bir şey yok.</p>}
        {sugg.map((g, i) => (
          <div key={i} className={`ai-sg ai-sg-${g.level}`}>
            <span>{g.level === "iyi" ? "✅" : g.level === "dikkat" ? "⚠️" : "💡"}</span>
            <span>{g.text}</span>
          </div>
        ))}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Olasılık düzeltmeleri kendiliğinden uygulanır. Lig çıkarma, yeni veri kaynağı gibi kod değişikliği gerektiren öneriler senin kararınla yapılır.
        </p>
      </section>

      {(Object.keys(SYSTEMS) as SystemKey[]).map((sys) => {
        const has = DIM_TITLES.some(([d]) => dimRows(c, sys, d).length);
        if (!has) return null;
        return (
          <details key={sys} className="card pad ai-dims">
            <summary>
              <b>{SYSTEMS[sys]}</b> · yön, oran, kaynak ve lige göre karne
            </summary>
            <p className="muted small">
              Her boyutta sistemin söylediği ile gerçekte tutan karşılaştırılır; sistemin genelinden iyi/kötü giden değerlerde olasılık her boyut için en
              fazla ±%8, toplamda ±%15 düzeltilir (en az birkaç düzine sonuçla belirginleşir).
            </p>
            {DIM_TITLES.map(([d, t]) => (
              <DimTable key={d} title={t} rows={dimRows(c, sys, d)} />
            ))}
          </details>
        );
      })}

      <section className="card pad ai-score">
        <h2 className="card-title">🎯 Skor tahmini karnesi (maç önü)</h2>
        {c?.scores && c.scores.n > 0 ? (
          (() => {
            const sc = c.scores;
            const pct = (x: number) => `%${Math.round((x / sc.n) * 100)}`;
            return (
              <>
                <div className="learn-row">
                  <span>Tam skor tuttu</span>
                  <b>
                    {sc.exact} / {sc.n} · {pct(sc.exact)}
                  </b>
                </div>
                <div className="learn-row">
                  <span>Kazanan / beraberlik doğru</span>
                  <b>
                    {sc.outcome} / {sc.n} · {pct(sc.outcome)}
                  </b>
                </div>
                <div className="learn-row">
                  <span>Toplam gol sayısı doğru</span>
                  <b>
                    {sc.totalGoals} / {sc.n} · {pct(sc.totalGoals)}
                  </b>
                </div>
                <div className="learn-row">
                  <span>İki takımda da en çok 1 gol fark</span>
                  <b>
                    {sc.goalDiffOne} / {sc.n} · {pct(sc.goalDiffOne)}
                  </b>
                </div>
                {sc.recent.length > 0 && (
                  <details open>
                    <summary className="small">✓ Tam tutan son skorlar</summary>
                    {sc.recent.map((r, i) => (
                      <div key={i} className="learn-row small">
                        <span>
                          {r.date} · {r.home} – {r.away}
                        </span>
                        <b className="pos">{r.real}</b>
                      </div>
                    ))}
                  </details>
                )}
                <p className="muted small">
                  Son 60 günde sonuçlanan maçlar; tahmin, maç sayfasındaki en olası skor. Tam skor zor bir pazardır: iyi modellerde bile genelde %10–13 civarı
                  tutar.
                </p>
              </>
            );
          })()
        ) : (
          <p className="muted small">Henüz hesaplanmadı. Karne her 6 saatte yenilenir; admin isen aşağıdaki &quot;yeniden hesapla&quot; ile hemen görebilirsin.</p>
        )}
      </section>

      <section className="card pad ai-score">
        <h2 className="card-title">⏱️ İlk yarı / maç sonucu karnesi (maç önü)</h2>
        {c?.htft && c.htft.n > 0 ? (
          (() => {
            const h = c.htft;
            const pct = (x: number) => `%${Math.round((x / h.n) * 100)}`;
            const rows: [string, number][] = [
              ["En olası İY/MS tam tuttu", h.exact],
              ["Gerçek sonuç en olası 3 içinde", h.top3],
              ["İlk yarı sonucu doğru", h.ht],
              ["Maç sonucu doğru", h.ft],
            ];
            return (
              <>
                {rows.map(([t, v]) => (
                  <div key={t} className="learn-row">
                    <span>{t}</span>
                    <b>
                      {v} / {h.n} · {pct(v)}
                    </b>
                  </div>
                ))}
                {h.recent.length > 0 && (
                  <details open>
                    <summary className="small">✓ Tam tutan son İY/MS tahminleri</summary>
                    {h.recent.map((r, i) => (
                      <div key={i} className="learn-row small">
                        <span>
                          {r.date} · {r.home} – {r.away}
                        </span>
                        <b className="pos">{r.real}</b>
                      </div>
                    ))}
                  </details>
                )}
                <p className="muted small">
                  Maç sayfasındaki &quot;En olası sonuç&quot; ile gerçek ilk yarı / maç sonucu karşılaştırılır. En olası İY/MS bile genelde %25–40 ihtimallidir;
                  tam tutma oranının %25–30 civarı olması normaldir.
                </p>
              </>
            );
          })()
        ) : (
          <p className="muted small">
            İY/MS tahminleri bugünden itibaren kaydediliyor (önceden kaydedilmiyordu). Maçlar bitip karne yenilendikçe burada rakamlar birikecek.
          </p>
        )}
      </section>

      <section className="card pad">
        <h2 className="card-title">Tercih türüne göre öğrendikleri</h2>
        <h3 className="sk-tier">⚽ Maçlar</h3>
        {Object.entries(macL).map(([k, v]) => (
          <div key={k} className="learn-row">
            <b>{k}</b>
            <span className="small">
              {v!.hits}/{v!.n} tuttu ({pc(v!.hits / v!.n)}) · model {pc(v!.pred / v!.n)} demişti
            </span>
            <span className="small">
              düzeltme <b>×{(macF[k as keyof typeof macF] ?? 1).toFixed(2)}</b>
            </span>
          </div>
        ))}
        {!Object.keys(macL).length && <p className="muted small">Henüz veri yok.</p>}
        <h3 className="sk-tier">🔴 Canlı</h3>
        {Object.entries(liveL).map(([k, v]) => (
          <div key={k} className="learn-row">
            <b>{k}</b>
            <span className="small">
              {v!.hits}/{v!.n} tuttu ({pc(v!.hits / v!.n)}) · model {pc(v!.pred / v!.n)} demişti
            </span>
            <span className="small">
              düzeltme <b>×{(liveF[k as keyof typeof liveF] ?? 1).toFixed(2)}</b>
            </span>
          </div>
        ))}
        {sitRows.length > 0 && <h3 className="sk-tier">🔴 Canlı · duruma göre (en belirgin)</h3>}
        {sitRows.map((r) => (
          <div key={`${r.kind}|${r.dim}|${r.val}`} className="learn-row">
            <b>
              {r.kind} · {r.dim}: {r.val}
            </b>
            <span className="small">
              {r.hits}/{r.n} tuttu ({pc(r.hits / r.n)}) · beklenen {pc(r.pred / r.n)}
            </span>
            <span className={`small ${r.adj > 1.005 ? "pos" : r.adj < 0.995 ? "neg" : ""}`}>×{r.adj.toFixed(2)}</span>
          </div>
        ))}
      </section>

      {leagues.length > 0 && (
        <section className="card pad">
          <h2 className="card-title">Liglere göre (Maçlar sistemi)</h2>
          {leagues.slice(0, 20).map((l) => (
            <div key={l.name} className="learn-row">
              <b>{l.name}</b>
              <span className="small">
                {l.hits}/{l.n} tuttu · dediği {pc(l.said)} · tuttuğu{" "}
                <b className={l.actual >= l.said - 0.03 ? "pos" : "neg"}>{pc(l.actual)}</b>
              </span>
            </div>
          ))}
        </section>
      )}

      {admin && tracking && (
        <form action={rebuildCalibration} style={{ marginTop: 16 }}>
          <button className="btn block">🔄 Karneyi şimdi yeniden hesapla</button>
        </form>
      )}
      <p className="muted small">Sistemler: {(Object.keys(SYSTEMS) as SystemKey[]).map((k) => SYSTEMS[k]).join(", ")} ve üçlü onay.</p>
    </div>
  );
}
