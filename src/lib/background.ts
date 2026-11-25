import { after } from "next/server";

/**
 * Yanıtı bekletmeden arka planda iş çalıştırır (Vercel'de yanıt gönderildikten sonra fonksiyon işi bitirene kadar açık kalır).
 * İstek dışında (betik, test) çağrılırsa doğrudan başlatır.
 */
export function inBackground(fn: () => Promise<unknown>): void {
  try {
    after(() => fn().catch(() => {}));
  } catch {
    void fn().catch(() => {});
  }
}
