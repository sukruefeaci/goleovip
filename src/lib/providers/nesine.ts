import type { OddsLine } from "../types";

/**
 * Nesine maç öncesi bülteni (iddaa oranları).
 * Format, github.com/ozgurozansen/LaAlbiceleste2026 (server.py) incelenerek çıkarıldı:
 *   raw.sg.EA[]  → maçlar: C (kod), HN/AN (takımlar), ESD (başlama, ms), LC (lig), TYPE (1=futbol), LE (canlı), MA[]
 *   MA[]         → pazarlar: MTID (tip), SOV (çizgi), MN (ad), OCA[]
 *   OCA[]        → seçenekler: N (sıra), O (oran), ON (ad, opsiyonel)
 *   raw.sg.LA[]  → ligler: LID, N
 * Resmi bir API değildir; format habersiz değişebilir.
 */

export const NESINE_URL = "https://bulten.nesine.com/api/bulten/getprebultenfull";

interface RawOutcome {
  N?: number;
  O?: number;
  ON?: string;
}
interface RawMarket {
  MTID?: number;
  SOV?: number;
  MN?: string;
  OCA?: RawOutcome[];
}
interface RawEvent {
  C?: number;
  HN?: string;
  AN?: string;
  ESD?: number;
  D?: string;
  T?: string;
  LC?: number;
  TYPE?: number;
  LE?: number;
  MA?: RawMarket[];
}
export interface NesineRaw {
  sg?: { EA?: RawEvent[]; LA?: { LID?: number; N?: string }[] };
}

export interface NesineEvent {
  code: number;
  home: string;
  away: string;
  kickoff: Date;
  league: string;
  lines: OddsLine[];
  unmapped: number; // tanınmayan pazar sayısı
}

const lower = (s: string) => s.toLocaleLowerCase("tr-TR");

function lineOf(m: RawMarket): number | null {
  if (m.SOV && m.SOV > 0) return m.SOV;
  const match = (m.MN ?? "").match(/(\d+)[.,](5)/);
  return match ? Number(`${match[1]}.${match[2]}`) : null;
}

/** Alt/Üst seçeneği: ON ("Alt"/"Üst") varsa ondan, yoksa N=1 Alt, N=2 Üst */
function ouSide(o: RawOutcome): "o" | "u" | null {
  if (o.ON) {
    const n = lower(o.ON);
    if (n.startsWith("alt")) return "u";
    if (n.startsWith("üst") || n.startsWith("ust")) return "o";
  }
  return o.N === 1 ? "u" : o.N === 2 ? "o" : null;
}

const RES = ["1", "X", "2"];

export function mapMarket(m: RawMarket): OddsLine[] | null {
  const outs = (m.OCA ?? []).filter((o) => typeof o.O === "number" && o.O > 1);
  const byN = (n: number) => outs.find((o) => o.N === n)?.O;
  const lines: OddsLine[] = [];
  const push = (key: string, odd?: number) => {
    if (odd && odd > 1) lines.push({ key, odd });
  };
  const name = lower(m.MN ?? "");

  switch (m.MTID) {
    case 1: // Maç Sonucu
      RES.forEach((r, i) => push(`1x2:${r}`, byN(i + 1)));
      return lines;
    case 3: // Çifte Şans
      ["1X", "12", "X2"].forEach((r, i) => push(`dc:${r}`, byN(i + 1)));
      return lines;
    case 5: // İlk Yarı / Maç Sonucu: N 1..9 = 1/1, 1/X, 1/2, X/1, X/X, X/2, 2/1, 2/X, 2/2
      ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"].forEach((r, i) => push(`htft:${r}`, byN(i + 1)));
      return lines;
    case 7: // İlk Yarı Sonucu
      RES.forEach((r, i) => push(`ht1x2:${r}`, byN(i + 1)));
      return lines;
    case 38: // Karşılıklı Gol
      push("btts:y", byN(1));
      push("btts:n", byN(2));
      return lines;
    case 43: // Toplam Gol Aralığı
      ["0-1", "2-3", "4-5", "6+"].forEach((r, i) => push(`tg:${r}`, byN(i + 1)));
      return lines;
    case 272: {
      // Sonuç + Alt/Üst: N 1..3 = 1/X/2 + Alt, 4..6 = 1/X/2 + Üst
      const L = lineOf(m) ?? 2.5;
      if (L % 1 !== 0.5) return null;
      for (let n = 1; n <= 6; n++) push(`res_ou:${RES[(n - 1) % 3]}:${L}:${n <= 3 ? "u" : "o"}`, byN(n));
      return lines;
    }
  }

  // Alt/Üst ailesi: ada göre ayırt et
  if (!name.includes("alt") || !name.includes("üst")) return null;
  const L = lineOf(m);
  if (L === null || L % 1 !== 0.5) return null;
  let prefix: string | null = null;
  if (name.includes("korner")) {
    if (name.includes("yarı")) return null;
    prefix = name.includes("ev sahibi") ? "hcor" : name.includes("deplasman") ? "acor" : "cor";
  } else if (name.includes("kart")) {
    if (name.includes("puan") || name.includes("yarı")) return null;
    prefix = "card";
  } else if (name.includes("yarı")) {
    if (name.includes("2.") || name.includes("ikinci")) return null;
    prefix = "htou";
  } else if (name.includes("ev sahibi")) prefix = "hou";
  else if (name.includes("deplasman")) prefix = "aou";
  else if (name.includes("gol") || name === "alt/üst" || /^\d[.,]5 alt\/üst$/.test(name)) prefix = "ou";
  if (!prefix) return null;
  for (const o of outs) {
    const side = ouSide(o);
    if (side) push(`${prefix}:${L}:${side}`, o.O);
  }
  return lines;
}

export function parseNesine(raw: NesineRaw): NesineEvent[] {
  const leagues = new Map((raw.sg?.LA ?? []).map((l) => [l.LID, l.N ?? ""]));
  const out: NesineEvent[] = [];
  for (const ev of raw.sg?.EA ?? []) {
    if (ev.TYPE !== 1 || ev.LE === 1 || !ev.HN || !ev.AN || !ev.ESD) continue;
    const seen = new Set<string>();
    const lines: OddsLine[] = [];
    let unmapped = 0;
    for (const m of ev.MA ?? []) {
      const mapped = mapMarket(m);
      if (!mapped) {
        unmapped++;
        continue;
      }
      for (const l of mapped) {
        if (seen.has(l.key)) continue;
        seen.add(l.key);
        lines.push(l);
      }
    }
    out.push({
      code: ev.C ?? 0,
      home: ev.HN,
      away: ev.AN,
      kickoff: new Date(ev.ESD),
      league: leagues.get(ev.LC) ?? "",
      lines,
      unmapped,
    });
  }
  return out;
}
