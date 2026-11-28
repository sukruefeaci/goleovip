import { currentUser } from "@/lib/auth/current";
import { adminEmails, isAdmin } from "@/lib/admin";
import { getStore } from "@/lib/auth/store";
import { isTelegramEnabled, telegramConfig, telegramSettings } from "@/lib/telegram";
import { KIND_LABEL, parseKind, SCOPE_LABEL, sharedStats, type StatsKind, type StatsScope } from "@/lib/tgStats";
import { gapLastResult } from "@/lib/tgGap";
import { sendGapResultsNow, saveGapSettings, savePreSettings, saveSettings, sendPreResultsNow, sendResultsNow, shareStats, toggleTelegram } from "./actions";

export const dynamic = "force-dynamic";

const SCOPES = Object.keys(SCOPE_LABEL) as StatsScope[];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; d?: string; t?: string }> }) {
  const user = await currentUser();
  if (!isAdmin(user)) {
    return (
      <div className="page-narrow">
        <h1>Admin paneli</h1>
        <div className="card pad">
          {adminEmails().length === 0 ? (
            <>
              <p style={{ marginTop: 0 }}>Admin henüz tanımlı değil.</p>
              <p className="muted small">
                Vercel → Settings → Environment Variables bölümüne <code>ADMIN_EMAILS</code> adında bir ayar ekleyip değerine siteye giriş yaptığın
                e-posta adresini yaz, sonra Redeploy yap.
              </p>
            </>
          ) : (
            <p style={{ margin: 0 }}>Bu sayfayı yalnız admin görebilir.</p>
          )}
        </div>
      </div>
    );
  }

  const { ok, err, d, t } = await searchParams;
  const kind: StatsKind = parseKind(t);
  const scope: StatsScope = d && d in SCOPE_LABEL ? (d as StatsScope) : "bugun";
  const cfg = telegramConfig();
  const tracking = !!getStore();
  const gapLast = await gapLastResult();
  const [enabled, st, set] = await Promise.all([isTelegramEnabled(), tracking ? sharedStats(scope, Date.now(), kind).catch((e) => (console.error("Admin istatistik:", e), null)) : Promise.resolve(null), telegramSettings()]);
  const p = st?.pnl;

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>Admin paneli</h1>
      </div>
      {ok && <div className="notice subtle">✓ {ok}</div>}
      {err && <div className="notice">⚠ {err}</div>}

      <section className="card pad adm">
        <h2 className="card-title">Telegram paylaşımı</h2>
        {!cfg ? (
          <p className="muted small">Telegram ayarlı değil (TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID). /kurulum sayfasından kontrol edebilirsin.</p>
        ) : (
          <>
            <div className="adm-status">
              <span className={`adm-dot ${enabled ? "on" : "off"}`} aria-hidden />
              <b>{enabled ? "Açık" : "Durduruldu"}</b>
              <span className="muted small">
                {enabled
                  ? `Kazanma olasılığı ≥ %${set.minProb}, oran ≥ ${set.minOdd.toFixed(2)}; iki paylaşım arası en az ${set.cooldownMin} dk.${set.results ? " Sonuçlar da paylaşılır." : ""}`
                  : "Canlı sekmesi açılsa bile kanala hiçbir tahmin gönderilmez."}
              </span>
            </div>
            <form action={toggleTelegram}>
              <input type="hidden" name="on" value={enabled ? "0" : "1"} />
              <button className={`btn ${enabled ? "danger" : "primary"} block`}>{enabled ? "⏸ Paylaşımı durdur" : "▶ Paylaşımı başlat"}</button>
            </form>

            <form action={saveSettings} className="adm-form">
              <h3 className="sk-tier">Paylaşım ayarları</h3>
              <label>
                <span>En az kazanma olasılığı (%)</span>
                <input name="minProb" type="number" inputMode="numeric" min={50} max={95} step={1} defaultValue={set.minProb} required />
              </label>
              <label>
                <span>En düşük canlı oran</span>
                <input name="minOdd" type="number" inputMode="decimal" min={1.01} max={10} step={0.01} defaultValue={set.minOdd.toFixed(2)} required />
              </label>
              <label>
                <span>İki paylaşım arası en az (dakika)</span>
                <input name="cooldownMin" type="number" inputMode="numeric" min={0} max={600} step={1} defaultValue={set.cooldownMin} required />
              </label>
              <label className="adm-check">
                <input name="results" type="checkbox" defaultChecked={set.results} />
                <span>Paylaşılan tahminin sonucunu (✅ kazandı / ❌ kaybetti) görsel ve metinle kanala gönder</span>
              </label>
              <button className="btn primary block">💾 Ayarları kaydet</button>
              <p className="muted small" style={{ margin: 0 }}>
                Not: 1.50 ve üstü oranlarda %70+ olasılık nadirdir; eşiği düşürürsen kanal daha sık paylaşır. Değişiklik bir sonraki taramada (en geç 5
                dk) geçerli olur.
              </p>
            </form>
            <form action={sendResultsNow} style={{ marginTop: 10 }}>
              <button className="btn block">📨 Bekleyen canlı sonuçları şimdi gönder</button>
            </form>
          </>
        )}
      </section>

      {cfg && (
        <section className="card pad adm">
          <h2 className="card-title">⚽ Maç önü paylaşımı</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Maçlar sisteminin tercihi, maça belirlediğin süre kala ve şartları geçerse görsel kartla kanala gider; maç bitince sonucu da paylaşılır.
            Yukarıdaki "Paylaşımı durdur" bunu da durdurur.
          </p>
          <form action={savePreSettings} className="adm-form" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
            <label className="adm-check">
              <input name="enabled" type="checkbox" defaultChecked={set.pre.enabled} />
              <span>Maç önü tahminleri kanalda paylaş</span>
            </label>
            <label>
              <span>En az kazanma olasılığı (%)</span>
              <input name="minProb" type="number" inputMode="numeric" min={50} max={95} step={1} defaultValue={set.pre.minProb} required />
            </label>
            <label>
              <span>En düşük oran</span>
              <input name="minOdd" type="number" inputMode="decimal" min={1.01} max={10} step={0.01} defaultValue={set.pre.minOdd.toFixed(2)} required />
            </label>
            <label>
              <span>İki paylaşım arası en az (dakika)</span>
              <input name="cooldownMin" type="number" inputMode="numeric" min={0} max={600} step={1} defaultValue={set.pre.cooldownMin} required />
            </label>
            <label>
              <span>Maça en çok kaç saat kala</span>
              <input name="hoursBefore" type="number" inputMode="numeric" min={1} max={36} step={1} defaultValue={set.pre.hoursBefore} required />
            </label>
            <label className="adm-check">
              <input name="results" type="checkbox" defaultChecked={set.pre.results} />
              <span>Maç bitince sonucu (✅ kazandı / ❌ kaybetti) görsel ve metinle gönder</span>
            </label>
            <button className="btn primary block">💾 Maç önü ayarlarını kaydet</button>
          </form>
          <form action={sendPreResultsNow} style={{ marginTop: 10 }}>
            <button className="btn block">📨 Bekleyen maç önü sonuçlarını şimdi gönder</button>
          </form>
        </section>
      )}

      {cfg && (
        <section className="card pad adm">
          <h2 className="card-title">🔍 Oran açığı paylaşımı</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            iddaa oranı yurt dışının (Pinnacle) adil oranının üstüne çıkınca &quot;ORAN AÇIĞI YAKALANDI&quot; görseli kanala gider. Her maç-seçenek bir kez,
            en büyük açık önce. Yukarıdaki &quot;Paylaşımı durdur&quot; bunu da durdurur.
          </p>
          <form action={saveGapSettings} className="adm-form" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
            <label className="adm-check">
              <input name="enabled" type="checkbox" defaultChecked={set.gap.enabled} />
              <span>Oran açıklarını kanalda paylaş</span>
            </label>
            <label>
              <span>Yurt dışına göre tutma ihtimali en az (%) · bunun üstü paylaşılır</span>
              <input name="minProb" type="number" inputMode="numeric" min={0} max={95} step={1} defaultValue={set.gap.minProb} required />
            </label>
            <label>
              <span>En az açık (%) · 0 = artıya geçen her açık</span>
              <input name="minGap" type="number" inputMode="decimal" min={0} max={50} step={0.1} defaultValue={set.gap.minGap} required />
            </label>
            <label>
              <span>En düşük oran</span>
              <input name="minOdd" type="number" inputMode="decimal" min={1.01} max={20} step={0.01} defaultValue={set.gap.minOdd.toFixed(2)} required />
            </label>
            <label>
              <span>İki paylaşım arası en az (dakika)</span>
              <input name="cooldownMin" type="number" inputMode="numeric" min={0} max={600} step={1} defaultValue={set.gap.cooldownMin} required />
            </label>
            <label>
              <span>Maça en çok kaç saat kala</span>
              <input name="hoursBefore" type="number" inputMode="numeric" min={1} max={48} step={1} defaultValue={set.gap.hoursBefore} required />
            </label>
            <label className="adm-check">
              <input name="results" type="checkbox" defaultChecked={set.gap.results !== false} />
              <span>Maç bitince sonucu (✅ kazandı / ❌ kaybetti) görsel ve metinle gönder</span>
            </label>
            <button className="btn primary block">💾 Oran açığı ayarlarını kaydet</button>
          </form>
          <form action={sendGapResultsNow} style={{ marginTop: 10 }}>
            <button className="btn block">📨 Sonuçlanan oran açıklarını şimdi gönder</button>
          </form>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Paylaşılanları ve sonuçlarını aşağıdaki <b>Kanal istatistiği → 🔍 Oran açığı</b> sekmesinde görebilir, karne görselini kanalda paylaşabilirsin.
          </p>
          {gapLast && (
            <p className="muted small" style={{ marginBottom: 0 }}>
              Son kontrol {new Date(gapLast.at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}:{" "}
              {gapLast.r === 1 ? "1 açık paylaşıldı ✅" : gapLast.r === 0 ? "paylaşılacak açık yok" : String(gapLast.r)}
            </p>
          )}
        </section>
      )}

      <section className="card pad adm">
        <h2 className="card-title">Kanal istatistiği</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Kanalda paylaşılan tahminlerin kaçta kaçının tuttuğu ve tutanların oranları. (100 TL hesabı yalnız burada görünür, kanal görselinde yer almaz.) Dönemi seç, görseli
          kontrol et, sonra kanalda paylaş.
        </p>
        <div className="daytabs sk-tabs" role="tablist">
          {(["canli", "mac", "acik"] as StatsKind[]).map((k) => (
            <a key={k} href={`/admin?d=${scope}&t=${k}`} className={k === kind ? "on" : ""} role="tab" aria-selected={k === kind}>
              {k === "canli" ? "🔴" : k === "mac" ? "⚽" : "🔍"} {KIND_LABEL[k]}
            </a>
          ))}
        </div>
        <div className="daytabs adm-tabs" role="tablist">
          {SCOPES.map((k) => (
            <a key={k} href={`/admin?d=${k}&t=${kind}`} className={k === scope ? "on" : ""} role="tab" aria-selected={k === scope}>
              {k === "tum" ? "Tümü" : SCOPE_LABEL[k]}
            </a>
          ))}
        </div>

        {st && p ? (
          <>
            <div className="adm-nums">
              <div>
                <span className="muted small">Paylaşılan</span>
                <b>{p.shared}</b>
              </div>
              <div>
                <span className="muted small">Tuttu</span>
                <b className="pos">
                  {p.hits}/{p.settled}
                </b>
              </div>
              <div>
                <span className="muted small">İsabet</span>
                <b>{p.settled ? `%${Math.round((p.hits / p.settled) * 100)}` : "—"}</b>
              </div>
              <div>
                <span className="muted small">Tutan ort. oran</span>
                <b>{st.avgWinOdd ? st.avgWinOdd.toFixed(2) : "—"}</b>
              </div>
              <div>
                <span className="muted small">100 TL ile</span>
                <b className={p.profit >= 0 ? "pos" : "neg"}>{p.counted ? `${p.profit >= 0 ? "+" : "−"}${Math.abs(Math.round(p.profit))} TL` : "—"}</b>
              </div>
            </div>
            {p.settled > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="adm-preview" src={`/api/admin/stats-image?d=${scope}&t=${kind}`} alt="Kanalda paylaşılacak istatistik görseli" />
                <form action={shareStats}>
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="kind" value={kind} />
                  <button className="btn primary block" disabled={!cfg}>
                    📤 {KIND_LABEL[kind]} · {SCOPE_LABEL[scope]} istatistiğini kanalda paylaş
                  </button>
                </form>
              </>
            ) : (
              <p className="muted small">
                Bu dönemde sonuçlanmış paylaşım yok{p.shared ? ` (${p.shared} tahmin sonuç bekliyor)` : ""}. Paylaşım kaydı bu özellikle başladı; daha önce
                kanala gidenler sayılmaz.
              </p>
            )}
            {st.rows.length > 0 && (
              <div className="adm-list">
                {st.rows.slice(0, 30).map((r) => (
                  <div key={r.id + r.at} className="learn-row">
                    <b className={r.won === true ? "pos" : r.won === false ? "neg" : "muted"}>{r.won === true ? "✓" : r.won === false ? "✗" : "…"}</b>
                    <span className="small">
                      {r.home} – {r.away} · {kind === "acik" ? `açık ${r.minute}` : kind === "mac" ? "maç önü" : `${r.minute} ${r.hg}-${r.ag}`}
                    </span>
                    <span className="small">
                      <b>{r.label}</b> @ {r.odd ? r.odd.toFixed(2) : "oransız"}
                      {r.fhg !== undefined ? ` · ${r.early ? "maç sürüyor" : "son"} ${r.fhg}-${r.fag}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted small">Veritabanı bağlı değil.</p>
        )}
      </section>
    </div>
  );
}
