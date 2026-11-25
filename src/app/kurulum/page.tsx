import { authSecret } from "@/lib/auth/session";
import { getStore, upstashCredentials } from "@/lib/auth/store";
import { telegramConfig } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Kurulum kontrolü: yalnız ayar İSİMLERİNİ gösterir, değerleri asla göstermez. */
export default async function SetupPage() {
  const secretOk = Boolean(authSecret());
  const creds = upstashCredentials();
  const storeOk = Boolean(getStore());
  let pingOk: boolean | null = null;
  let pingError = "";
  if (creds) {
    try {
      const res = await fetch(creds.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
        cache: "no-store",
      });
      pingOk = res.ok;
      if (!res.ok) pingError = `HTTP ${res.status}`;
    } catch (e) {
      pingOk = false;
      pingError = (e as Error).message;
    }
  }
  // Telegram (isteğe bağlı): bot geçerli mi, kanala erişebiliyor mu (adlar/değerler gösterilmez)
  const tg = telegramConfig();
  let tgBot: boolean | null = null,
    tgChat: boolean | null = null,
    tgErr = "";
  if (tg) {
    try {
      const me = await fetch(`https://api.telegram.org/bot${tg.token}/getMe`, { cache: "no-store", signal: AbortSignal.timeout(5000) }).then((r) => r.json());
      tgBot = !!me.ok;
      if (tgBot) {
        const ch = await fetch(`https://api.telegram.org/bot${tg.token}/getChat?chat_id=${encodeURIComponent(tg.chat)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }).then((r) => r.json());
        tgChat = !!ch.ok;
        if (!ch.ok) tgErr = String(ch.description ?? "");
      }
    } catch (e) {
      tgBot = false;
      tgErr = (e as Error).message;
    }
  }
  const names = Object.keys(process.env)
    .filter((n) => /KV|REDIS|UPSTASH|REST_API|STORAGE/i.test(n))
    .sort();

  const Row = ({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) => (
    <li style={{ margin: "8px 0" }}>
      <b className={ok ? "pos" : "neg"}>{ok ? "✓" : "✗"}</b> {label}
      {hint && <div className="muted small">{hint}</div>}
    </li>
  );

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 style={{ marginTop: 0 }}>Kurulum kontrolü</h1>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <Row ok={secretOk} label="AUTH_SECRET" hint={secretOk ? undefined : "Settings → Environment Variables'a ekleyip Redeploy yapın."} />
          <Row
            ok={Boolean(creds)}
            label="Upstash bağlantı bilgileri"
            hint={creds ? undefined : "Upstash entegrasyonu bu projeye bağlı değil ya da bağlandıktan sonra Redeploy yapılmadı."}
          />
          {creds && <Row ok={pingOk} label="Veritabanına erişim" hint={pingOk ? undefined : `Bağlanılamadı: ${pingError}`} />}
          <Row ok={storeOk && secretOk && pingOk !== false} label="Kayıt / giriş kullanılabilir" />
        </ul>
        <h3 style={{ marginBottom: 4 }}>Telegram (isteğe bağlı)</h3>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 0 }}>
          <Row ok={!!tg} label="TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID" hint={tg ? `Eşik: güven ≥ %${tg.minConf}` : "Canlı tercihleri kanala göndermek için ikisini de ekleyip Redeploy yapın."} />
          {tg && <Row ok={tgBot} label="Bot anahtarı geçerli" hint={tgBot ? undefined : "Anahtar hatalı; BotFather'dan aldığın anahtarı kontrol et."} />}
          {tg && tgBot && (
            <Row ok={tgChat} label="Bot kanala erişebiliyor" hint={tgChat ? "Giriş yaptıktan sonra /api/telegram/test adresini açarak deneme kartı gönderebilirsin." : `Botu kanala yönetici olarak ekle. (${tgErr})`} />
          )}
        </ul>
        <p className="muted small">Bulunan ilgili ayar isimleri (değerler gösterilmez):</p>
        <code className="small" style={{ display: "block", whiteSpace: "pre-wrap" }}>
          {names.length ? names.join("\n") : "— hiç yok —"}
        </code>
      </div>
    </div>
  );
}
