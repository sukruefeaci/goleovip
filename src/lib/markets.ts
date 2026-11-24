import type { Category } from "./types";
import { poissonOver, probWhere, scoreMatrix } from "./poisson";

/**
 * Seçenek anahtarları (key) formatı:
 *  1x2:1|X|2            Maç sonucu
 *  dc:1X|12|X2          Çifte şans
 *  ou:L:o|u             Toplam gol alt/üst L
 *  hou:L:o|u / aou:...  Ev sahibi / deplasman gol alt/üst
 *  btts:y|n             Karşılıklı gol
 *  res_ou:R:L:o|u       Maç sonucu ve alt/üst (R = 1|X|2)
 *  ou_btts:L:o|u:y|n    Alt/üst ve karşılıklı gol
 *  tg:0-1|2-3|4-5|6+    Toplam gol aralığı
 *  ht1x2:1|X|2          İlk yarı sonucu
 *  htou:L:o|u           İlk yarı alt/üst
 *  cor:L:o|u            Toplam korner
 *  hcor / acor:L:o|u    Ev sahibi / deplasman korner
 *  card:L:o|u           Toplam kart
 */

export type MarketKind = "ft" | "ht" | "corners_total" | "corners_home" | "corners_away" | "cards";

export interface MarketDef {
  key: string;
  category: Category;
  market: string;
  selection: string;
  kind: MarketKind;
  pred?: (h: number, a: number) => boolean;
  line?: number;
  over?: boolean;
}

export interface ModelContext {
  ft: number[][];
  ht: number[][];
  cornersHome: number;
  cornersAway: number;
  cards: number;
}

export const HALF_TIME_SHARE = 0.45;

export function buildContext(
  lh: number,
  la: number,
  cornersHome: number,
  cornersAway: number,
  cards: number,
): ModelContext {
  return {
    ft: scoreMatrix(lh, la),
    ht: scoreMatrix(lh * HALF_TIME_SHARE, la * HALF_TIME_SHARE),
    cornersHome,
    cornersAway,
    cards,
  };
}

const RES: Record<string, (h: number, a: number) => boolean> = {
  "1": (h, a) => h > a,
  X: (h, a) => h === a,
  "2": (h, a) => h < a,
};
const DC: Record<string, (h: number, a: number) => boolean> = {
  "1X": (h, a) => h >= a,
  "12": (h, a) => h !== a,
  X2: (h, a) => h <= a,
};
const ou = (o: string) => (o === "o" ? "Üst" : "Alt");

export function describe(key: string, homeName = "Ev Sahibi", awayName = "Deplasman"): MarketDef {
  const p = key.split(":");
  const t = p[0];
  const L = Number(p[1]);
  switch (t) {
    case "1x2":
      return { key, category: "Sonuç", market: "Maç Sonucu", selection: p[1], kind: "ft", pred: RES[p[1]] };
    case "dc":
      return { key, category: "Sonuç", market: "Çifte Şans", selection: p[1], kind: "ft", pred: DC[p[1]] };
    case "ou":
      return {
        key,
        category: "Gol",
        market: `Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "ft",
        pred: (h, a) => (p[2] === "o" ? h + a > L : h + a < L),
      };
    case "hou":
      return {
        key,
        category: "Gol",
        market: `${homeName} Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "ft",
        pred: (h) => (p[2] === "o" ? h > L : h < L),
      };
    case "aou":
      return {
        key,
        category: "Gol",
        market: `${awayName} Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "ft",
        pred: (_h, a) => (p[2] === "o" ? a > L : a < L),
      };
    case "btts":
      return {
        key,
        category: "Gol",
        market: "Karşılıklı Gol",
        selection: p[1] === "y" ? "Var" : "Yok",
        kind: "ft",
        pred: (h, a) => (p[1] === "y" ? h > 0 && a > 0 : h === 0 || a === 0),
      };
    case "res_ou": {
      const r = RES[p[1]];
      const line = Number(p[2]);
      const over = p[3] === "o";
      return {
        key,
        category: "Sonuç",
        market: `Maç Sonucu ve Alt/Üst ${p[2]}`,
        selection: `${p[1]} ve ${ou(p[3])}`,
        kind: "ft",
        pred: (h, a) => r(h, a) && (over ? h + a > line : h + a < line),
      };
    }
    case "ou_btts": {
      const over = p[2] === "o";
      const yes = p[3] === "y";
      return {
        key,
        category: "Gol",
        market: `Alt/Üst ${p[1]} ve Karşılıklı Gol`,
        selection: `${ou(p[2])} ve ${yes ? "Var" : "Yok"}`,
        kind: "ft",
        pred: (h, a) => (over ? h + a > L : h + a < L) && (yes ? h > 0 && a > 0 : h === 0 || a === 0),
      };
    }
    case "tg": {
      const [lo, hi] = p[1] === "6+" ? [6, 99] : p[1].split("-").map(Number);
      return {
        key,
        category: "Gol",
        market: "Toplam Gol Aralığı",
        selection: p[1],
        kind: "ft",
        pred: (h, a) => h + a >= lo && h + a <= hi,
      };
    }
    case "ht1x2":
      return { key, category: "İlk Yarı", market: "İlk Yarı Sonucu", selection: p[1], kind: "ht", pred: RES[p[1]] };
    case "htou":
      return {
        key,
        category: "İlk Yarı",
        market: `1. Yarı Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "ht",
        pred: (h, a) => (p[2] === "o" ? h + a > L : h + a < L),
      };
    case "cor":
      return {
        key,
        category: "Korner",
        market: `Toplam Korner Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "corners_total",
        line: L,
        over: p[2] === "o",
      };
    case "hcor":
      return {
        key,
        category: "Korner",
        market: `${homeName} Korner Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "corners_home",
        line: L,
        over: p[2] === "o",
      };
    case "acor":
      return {
        key,
        category: "Korner",
        market: `${awayName} Korner Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "corners_away",
        line: L,
        over: p[2] === "o",
      };
    case "card":
      return {
        key,
        category: "Kart",
        market: `Toplam Kart Alt/Üst ${p[1]}`,
        selection: ou(p[2]),
        kind: "cards",
        line: L,
        over: p[2] === "o",
      };
  }
  throw new Error(`Bilinmeyen seçenek anahtarı: ${key}`);
}

export function probability(def: MarketDef, ctx: ModelContext): number {
  switch (def.kind) {
    case "ft":
      return probWhere(ctx.ft, def.pred!);
    case "ht":
      return probWhere(ctx.ht, def.pred!);
    default: {
      const lambda =
        def.kind === "corners_total"
          ? ctx.cornersHome + ctx.cornersAway
          : def.kind === "corners_home"
            ? ctx.cornersHome
            : def.kind === "corners_away"
              ? ctx.cornersAway
              : ctx.cards;
      const pOver = poissonOver(def.line!, lambda);
      return def.over ? pOver : 1 - pOver;
    }
  }
}

/** Prototipte iddaa'nın sunduğu varsayılan seçenek listesi */
export const DEFAULT_KEYS: string[] = (() => {
  const k: string[] = [];
  for (const r of ["1", "X", "2"]) k.push(`1x2:${r}`);
  for (const r of ["1X", "12", "X2"]) k.push(`dc:${r}`);
  for (const l of ["0.5", "1.5", "2.5", "3.5", "4.5"]) for (const s of ["o", "u"]) k.push(`ou:${l}:${s}`);
  for (const t of ["hou", "aou"]) for (const l of ["0.5", "1.5", "2.5"]) for (const s of ["o", "u"]) k.push(`${t}:${l}:${s}`);
  k.push("btts:y", "btts:n");
  for (const r of ["1", "X", "2"]) for (const l of ["1.5", "2.5", "3.5"]) for (const s of ["o", "u"]) k.push(`res_ou:${r}:${l}:${s}`);
  for (const s of ["o", "u"]) for (const b of ["y", "n"]) k.push(`ou_btts:2.5:${s}:${b}`);
  for (const r of ["0-1", "2-3", "4-5", "6+"]) k.push(`tg:${r}`);
  for (const r of ["1", "X", "2"]) k.push(`ht1x2:${r}`);
  for (const l of ["0.5", "1.5", "2.5"]) for (const s of ["o", "u"]) k.push(`htou:${l}:${s}`);
  for (const l of ["8.5", "9.5", "10.5", "11.5"]) for (const s of ["o", "u"]) k.push(`cor:${l}:${s}`);
  for (const l of ["3.5", "4.5", "5.5", "6.5"]) for (const s of ["o", "u"]) k.push(`hcor:${l}:${s}`);
  for (const l of ["2.5", "3.5", "4.5", "5.5"]) for (const s of ["o", "u"]) k.push(`acor:${l}:${s}`);
  for (const l of ["2.5", "3.5", "4.5", "5.5"]) for (const s of ["o", "u"]) k.push(`card:${l}:${s}`);
  return k;
})();
