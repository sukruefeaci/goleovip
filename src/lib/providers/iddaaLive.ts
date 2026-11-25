import { cachedFetch } from "./cache";
import { nameSimilarity } from "./teamNames";

/**
 * iddaa canlı oranları (resmi olmayan, herkese açık JSON).
 *   /sportsbook/events?st=1&type=1&version=0 → canlı program; s=1 oynanıyor; data.sc[id] = { min, ht.c, at.c } canlı skor
 *   /sportsbook/event/{id}                     → maçın canlı pazarları
 * Canlı pazar kodları (2026-11, gol olan maçlarla doğrulandı):
 *   4 maç sonucu · 129 çifte şans · 14 maç sonu toplam alt/üst (ana çizgi) · 63 ilk yarı alt/üst
 *   131 karşılıklı gol · 34 sıradaki gol (sov = kaçıncı gol; "Olmaz" = gol yok)
 *   (203 ev sahibi gol alt/üst, 23 kalan süre sonucu — kullanılmıyor)
 * Oran 1.00 = kapalı seçenek.
 */

const BASE = "https://sportsbookv2.iddaa.com/sportsbook";
const TTL = 30_000;

export interface IddaaLiveEvent {
  id: number;
  home: string;
  away: string;
  kickoff: Date;
  hg: number | null;
  ag: number | null;
}

interface RawEvent {
  i?: number;
  hn?: string;
  an?: string;
  d?: number;
  sid?: number;
  s?: number;
}

export function parseLiveProgram(json: unknown): IddaaLiveEvent[] {
  const data = (json as { data?: { events?: RawEvent[]; sc?: Record<string, { ht?: { c?: number }; at?: { c?: number } }> } })?.data;
  const sc = data?.sc ?? {};
  return (data?.events ?? [])
    .filter((e) => e.sid === 1 && e.s === 1 && e.i && e.hn && e.an && e.d)
    .map((e) => {
      const s = sc[String(e.i)];
      return {
        id: e.i!,
        home: e.hn!,
        away: e.an!,
        kickoff: new Date(e.d! * 1000),
        hg: typeof s?.ht?.c === "number" ? s.ht.c : null,
        ag: typeof s?.at?.c === "number" ? s.at.c : null,
      };
    });
}

/** Canlı pazarlardan bizim öneri etiketlerimize oran (etiket → oran) */
export function mapLiveOdds(json: unknown, goals: number): Record<string, number> {
  const markets = (json as { data?: { m?: { st?: number; sov?: string | number | null; o?: { n?: string; odd?: number }[] }[] } })?.data?.m ?? [];
  const out: Record<string, number> = {};
  const put = (label: string, odd?: number) => {
    if (odd && odd > 1.01) out[label] = odd;
  };
  for (const m of markets) {
    const o = (name: string) => m.o?.find((x) => x.n === name)?.odd;
    const line = m.sov == null ? null : Number(m.sov);
    switch (m.st) {
      case 4:
        put("MS 1", o("1"));
        put("MS X", o("0"));
        put("MS 2", o("2"));
        break;
      case 129:
        put("Çifte şans 1X", o("1 ve 0"));
        put("Çifte şans X2", o("0 ve 2"));
        break;
      case 14:
        if (line !== null && line % 1 === 0.5) {
          put(`MS ${line} Üst`, o("Üst"));
          put(`MS ${line} Alt`, o("Alt"));
        }
        break;
      case 63:
        if (line !== null && line % 1 === 0.5) {
          put(`İY ${line} Üst`, o("Üst"));
          put(`İY ${line} Alt`, o("Alt"));
        }
        break;
      case 131:
        put("KG Var", o("Var"));
        put("KG Yok", o("Yok"));
        break;
      case 34:
        if (line === goals + 1) {
          put("Sıradaki golü ev sahibi atar", o("1"));
          put("Sıradaki golü deplasman atar", o("2"));
        }
        break;
    }
  }
  return out;
}

export async function fetchLiveProgram(): Promise<IddaaLiveEvent[]> {
  const f = await cachedFetch("iddaa-live-program.json", "iddaa canlı program", `${BASE}/events?st=1&type=1&version=0`, TTL);
  return parseLiveProgram(JSON.parse(f.text));
}

export async function fetchLiveOdds(id: number, goals: number): Promise<Record<string, number>> {
  const f = await cachedFetch(`iddaa-live-${id}.json`, "iddaa canlı oran", `${BASE}/event/${id}`, TTL);
  return mapLiveOdds(JSON.parse(f.text), goals);
}

/** FotMob maçını iddaa canlı maçıyla eşleştir (başlama saati + isim; skor da tutmalı) */
export function matchIddaaLive(
  fm: { home: string; away: string; kickoff: Date; hg: number; ag: number },
  events: IddaaLiveEvent[],
): IddaaLiveEvent | null {
  let best: { e: IddaaLiveEvent; s: number } | null = null;
  for (const e of events) {
    if (Math.abs(e.kickoff.getTime() - fm.kickoff.getTime()) > 20 * 60_000) continue;
    const h = nameSimilarity(e.home, fm.home),
      a = nameSimilarity(e.away, fm.away);
    if (Math.min(h, a) < 0.5 || h + a < 1.3) continue;
    if (e.hg !== null && e.ag !== null && (e.hg !== fm.hg || e.ag !== fm.ag)) continue; // skor farklıysa güvenme
    if (!best || h + a > best.s) best = { e, s: h + a };
  }
  return best?.e ?? null;
}
