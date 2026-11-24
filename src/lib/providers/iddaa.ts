import type { OddsLine } from "../types";
import type { NesineEvent as OddsEvent } from "./nesine";

/**
 * iddaa'nın kendi bülteni (sportsbookv2.iddaa.com). Adres github.com/alibingul-dev/iddaa-scanner'dan.
 * Yanıt: { isSuccess, data: { events: [...] } }
 *   olay:   i (id), hn/an (takımlar), d (başlama, unix sn), sid (1=futbol), m[] (pazarlar)
 *   pazar:  st (tip), sov (çizgi, metin), o[] → { n (seçenek adı), odd }
 * Pazar tipleri 24.11.2026 bülteninden çıkarıldı; belirsiz olanlar (ilk yarı/ikinci yarı,
 * ev/deplasman) oranlara Poisson modeli oturtularak ayırt edildi:
 *   1 MS · 4 Toplam gol aralığı · 7 MS + Alt/Üst · 48 Korner Alt/Üst · 60 İlk yarı Alt/Üst
 *   88 İlk yarı sonucu · 89 Karşılıklı gol · 92 Çifte şans · 101 Alt/Üst
 *   603 Ev sahibi Alt/Üst · 604 Deplasman Alt/Üst · 700 Alt/Üst + KG
 *   (atlananlar: 36 2. yarı sonucu, 49 ilk yarı korner, 720 ilk yarı KG, 722/723 ilk yarı takım A/Ü …)
 * Resmi, belgelenmiş bir API değildir; kodlar habersiz değişebilir.
 */

export const IDDAA_URL = "https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0";

interface RawOutcome {
  n?: string;
  odd?: number;
}
interface RawMarket {
  mbc?: number;
  st?: number;
  sov?: string | null;
  o?: RawOutcome[];
}
interface RawEvent {
  i?: number;
  hn?: string;
  an?: string;
  d?: number;
  sid?: number;
  m?: RawMarket[];
}
export interface IddaaRaw {
  isSuccess?: boolean;
  data?: { events?: RawEvent[] };
}

const R = (s: string) => (s === "0" ? "X" : s); // iddaa beraberliği "0" yazar
const ou = (s: string) => (s.startsWith("Alt") ? "u" : s.startsWith("Üst") ? "o" : null);
const yn = (s: string) => (s === "Var" ? "y" : s === "Yok" ? "n" : null);
const DC: Record<string, string> = { "1 ve 0": "1X", "1 ve 2": "12", "0 ve 2": "X2" };
const TG: Record<string, string> = { "0-1 gol": "0-1", "2-3 gol": "2-3", "4-5 gol": "4-5", "6+ gol": "6+" };

/** Tek bir seçeneği bizim anahtar formatına çevirir; tanınmazsa null */
export function outcomeKey(st: number, sov: number | null, name: string): string | null {
  const L = sov;
  const half = L !== null && L % 1 === 0.5;
  switch (st) {
    case 1:
      return ["1", "0", "2"].includes(name) ? `1x2:${R(name)}` : null;
    case 88:
      return ["1", "0", "2"].includes(name) ? `ht1x2:${R(name)}` : null;
    case 92:
      return DC[name] ? `dc:${DC[name]}` : null;
    case 89:
      return yn(name) ? `btts:${yn(name)}` : null;
    case 4:
      return TG[name] ? `tg:${TG[name]}` : null;
    case 101:
    case 60:
    case 603:
    case 604:
    case 48: {
      const side = ou(name);
      if (!half || !side) return null;
      const prefix = { 101: "ou", 60: "htou", 603: "hou", 604: "aou", 48: "cor" }[st];
      return `${prefix}:${L}:${side}`;
    }
    case 7: {
      const m = name.match(/^([102]) ve (Alt|Üst)$/);
      return half && m ? `res_ou:${R(m[1])}:${L}:${ou(m[2])}` : null;
    }
    case 700: {
      const m = name.match(/^(Alt|Üst) ve (Var|Yok)$/);
      return half && m ? `ou_btts:${L}:${ou(m[1])}:${yn(m[2])}` : null;
    }
  }
  return null;
}

export function parseIddaa(raw: IddaaRaw): OddsEvent[] {
  const out: OddsEvent[] = [];
  for (const ev of raw.data?.events ?? []) {
    if (ev.sid !== 1 || !ev.hn || !ev.an || !ev.d) continue;
    const lines: OddsLine[] = [];
    const seen = new Set<string>();
    let unmapped = 0;
    for (const m of ev.m ?? []) {
      const sov = m.sov != null && m.sov !== "" ? Number(m.sov) : null;
      let any = false;
      for (const o of m.o ?? []) {
        const key = outcomeKey(m.st ?? -1, sov, o.n ?? "");
        if (!key) continue;
        any = true;
        // 1.00 = kapalı seçenek
        if (!o.odd || o.odd <= 1.01 || seen.has(key)) continue;
        seen.add(key);
        lines.push({ key, odd: o.odd, mbc: m.mbc ?? 1 });
      }
      if (!any) unmapped++;
    }
    out.push({ code: ev.i ?? 0, home: ev.hn, away: ev.an, kickoff: new Date(ev.d * 1000), league: "", lines, unmapped });
  }
  return out;
}
