import type { FormResult, TeamInput } from "../types";

/**
 * Football-Data.co.uk (ücretsiz, anahtarsız CSV):
 *  - fixtures.csv: yaklaşan maçlar + Betfair Borsası (BFE), Bet365, ortalama… oranları (2026 itibarıyla Pinnacle yok)
 *  - mmz4281/{sezon}/{lig}.csv: oynanmış maçlar; skor, korner (HC/AC), kart (HY/AY/HR/AR)
 * Avrupa oranlarını buradan alma fikri github.com/alibingul-dev/iddaa-scanner'dan.
 * Not: Avrupa kupaları (Şampiyonlar Ligi vb.) bu kaynakta yok; yalnız ulusal ligler.
 */

export const FIXTURES_URL = "https://football-data.co.uk/fixtures.csv";
export const seasonUrl = (season: string, div: string) => `https://football-data.co.uk/mmz4281/${season}/${div}.csv`;

export const LEAGUES: Record<string, string> = {
  E0: "Premier League",
  E1: "Championship",
  SC0: "İskoçya Premiership",
  D1: "Bundesliga",
  D2: "2. Bundesliga",
  I1: "Serie A",
  I2: "Serie B",
  SP1: "La Liga",
  SP2: "La Liga 2",
  F1: "Ligue 1",
  F2: "Ligue 2",
  N1: "Eredivisie",
  B1: "Belçika Pro Lig",
  P1: "Portekiz Ligi",
  T1: "Süper Lig",
  G1: "Yunanistan Süper Lig",
};

export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    const r: Row = {};
    head.forEach((h, i) => (r[h] = (cells[i] ?? "").trim()));
    return r;
  });
}

const num = (s: string | undefined) => {
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** dd/mm/yy(yy) → Date (UTC gece yarısı) */
export function parseDate(s: string): Date | null {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
}

/** İngiltere saati → UTC (BST: Mart'ın son pazarı – Ekim'in son pazarı) */
export function ukToUtc(date: Date, time: string): Date {
  const [hh, mm] = (time || "15:00").split(":").map(Number);
  const y = date.getUTCFullYear();
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(y, month + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  };
  const t = date.getTime();
  const bst = t >= lastSunday(2) && t < lastSunday(9);
  return new Date(t + ((hh - (bst ? 1 : 0)) * 60 + mm) * 60_000);
}

export function seasonCode(d: Date): string {
  const y = d.getUTCFullYear() % 100;
  return d.getUTCMonth() >= 6 ? `${String(y).padStart(2, "0")}${String(y + 1).padStart(2, "0")}` : `${String(y - 1).padStart(2, "0")}${String(y).padStart(2, "0")}`;
}

export interface Fixture {
  div: string;
  kickoff: Date;
  home: string;
  away: string;
  h2h: [number, number, number];
  ou25: [number, number] | null;
  reference: string;
  bookmakers: number;
}

const BOOK_PREFIXES = ["B365", "BFD", "BV", "BW", "PP", "SKB", "BFE", "IW", "PS", "WH", "VC", "1XB", "CL", "LB"];

export function parseFixtures(text: string): Fixture[] {
  const out: Fixture[] = [];
  for (const r of parseCsv(text)) {
    if (!LEAGUES[r.Div]) continue;
    const d = parseDate(r.Date);
    if (!d) continue;
    // Öncelik: Pinnacle (PS) → Betfair Borsası (BFE, düşük marjlı) → piyasa ortalaması
    const sources: [string, string, string, string][] = [
      ["PS", "Pinnacle", "P", "P"],
      ["BFE", "Betfair Borsası", "BFE", "BFE"],
      ["Avg", "Piyasa ort.", "Avg", "Avg"],
    ];
    let h2h: [number, number, number] | null = null;
    let reference = "";
    for (const [pre, label] of sources) {
      const o = [num(r[`${pre}H`]), num(r[`${pre}D`]), num(r[`${pre}A`])];
      if (o.every((x) => x !== null)) {
        h2h = o as [number, number, number];
        reference = label;
        break;
      }
    }
    if (!h2h) continue;
    let ou: [number, number] | null = null;
    for (const [, , ouPre] of sources) {
      const o = [num(r[`${ouPre}>2.5`]), num(r[`${ouPre}<2.5`])];
      if (o.every((x) => x !== null)) {
        ou = o as [number, number];
        break;
      }
    }
    const bookmakers = BOOK_PREFIXES.filter((p) => num(r[`${p}H`]) !== null).length;
    out.push({
      div: r.Div,
      kickoff: ukToUtc(d, r.Time),
      home: r.HomeTeam,
      away: r.AwayTeam,
      h2h,
      ou25: ou,
      reference,
      bookmakers,
    });
  }
  return out;
}

export interface PlayedMatch {
  date: Date;
  home: string;
  away: string;
  hg: number;
  ag: number;
  hc: number | null;
  ac: number | null;
  hCards: number | null;
  aCards: number | null;
}

export function parseResults(text: string): PlayedMatch[] {
  const out: PlayedMatch[] = [];
  for (const r of parseCsv(text)) {
    const d = parseDate(r.Date);
    if (!d || r.FTHG === "" || r.FTAG === "" || r.FTHG === undefined) continue;
    const n = (s?: string) => (s === undefined || s === "" ? null : Number(s));
    const cards = (y?: string, red?: string) => (n(y) === null ? null : (n(y) ?? 0) + (n(red) ?? 0));
    out.push({
      date: d,
      home: r.HomeTeam,
      away: r.AwayTeam,
      hg: Number(r.FTHG),
      ag: Number(r.FTAG),
      hc: n(r.HC),
      ac: n(r.AC),
      hCards: cards(r.HY, r.HR),
      aCards: cards(r.AY, r.AR),
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function standings(results: PlayedMatch[]) {
  const t = new Map<string, { pts: number; gd: number; gf: number }>();
  const get = (n: string) => t.get(n) ?? (t.set(n, { pts: 0, gd: 0, gf: 0 }), t.get(n)!);
  for (const m of results) {
    const h = get(m.home),
      a = get(m.away);
    h.gf += m.hg;
    a.gf += m.ag;
    h.gd += m.hg - m.ag;
    a.gd += m.ag - m.hg;
    if (m.hg > m.ag) h.pts += 3;
    else if (m.hg < m.ag) a.pts += 3;
    else {
      h.pts++;
      a.pts++;
    }
  }
  const sorted = [...t.entries()].sort((x, y) => y[1].pts - x[1].pts || y[1].gd - x[1].gd || y[1].gf - x[1].gf);
  return new Map(sorted.map(([name, s], i) => [name, { rank: i + 1, points: s.pts }]));
}

/** Son maçlardan TeamInput üretir (sakat/cezalı bilgisi bu kaynakta yok) */
export function teamFromResults(name: string, short: string, results: PlayedMatch[], table: ReturnType<typeof standings>): TeamInput {
  const games = results.filter((m) => m.home === name || m.away === name);
  const last10 = games.slice(-10);
  const last6 = games.slice(-6);
  const view = (m: PlayedMatch) => {
    const home = m.home === name;
    return {
      gf: home ? m.hg : m.ag,
      ga: home ? m.ag : m.hg,
      cf: home ? m.hc : m.ac,
      ca: home ? m.ac : m.hc,
      cards: home ? m.hCards : m.aCards,
    };
  };
  const form: FormResult[] = games.slice(-5).map((m) => {
    const v = view(m);
    return v.gf > v.ga ? "G" : v.gf === v.ga ? "B" : "M";
  });
  const v6 = last6.map(view);
  const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
  const st = table.get(name);
  return {
    name,
    short,
    rank: st?.rank ?? 0,
    points: st?.points ?? 0,
    form,
    goalsFor10: last10.map((m) => view(m).gf),
    goalsAgainst10: last10.map((m) => view(m).ga),
    cornersFor: avg(nums(v6.map((x) => x.cf))) || 5,
    cornersAgainst: avg(nums(v6.map((x) => x.ca))) || 5,
    cards: avg(nums(v6.map((x) => x.cards))) || 2,
    missing: [],
  };
}

export function headToHead(home: string, away: string, results: PlayedMatch[]) {
  return results
    .filter((m) => (m.home === home && m.away === away) || (m.home === away && m.away === home))
    .slice(-4)
    .map((m) => (m.home === home ? { home: m.hg, away: m.ag } : { home: m.ag, away: m.hg }));
}
