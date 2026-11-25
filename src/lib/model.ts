import type { Analysis, BetRow, ConfidencePart, MatchInput, Rating, TeamInput } from "./types";
import { buildContext, describe, HALF_TIME_SHARE, HTFT_OUTCOMES, probability, type MarketDef } from "./markets";
import { lambdaForOver, normCdf, pmfVector, probWhere, scoreMatrix } from "./poisson";

/** Model ayarları — Ayarlar sayfasına taşınabilir */
export const CONFIG = {
  marketWeight: 0.7, // harmanda piyasa modelinin ağırlığı (kalan: istatistik)
  cornerMarketWeight: 0.6,
  homeAdvantage: 1.06,
  attackPenaltyPerPlayer: 0.04,
  attackPenaltyMax: 0.15,
  defencePenaltyPerPlayer: 0.03,
  defencePenaltyMax: 0.1,
  dependencyThreshold: 0.85, // seçeneğin %85+ ihtimalle bir tarafın galibiyetiyle gelmesi
  halfShrinkGoals: 15, // ilk yarı payını lig ortalamasına çeken "sanal gol" sayısı
  eloExtraSigma: 0.04, // ClubElo kaynaklı maçlarda ek belirsizlik
  unknownAttackPerPlayer: 0.015, // mevkii bilinmeyen her eksik: kendi gol beklentisi −%1.5
  unknownDefencePerPlayer: 0.01, // ve rakibin gol beklentisi +%1
  // Korner: 9 lig × 2 sezon geçmiş maçla ayarlandı (2025/26 ayar, 2026/27 test)
  cornerTeamWeight: 0.3, // takımın son 6 maç ortalamasının ağırlığı; kalanı lig ortalaması
  cornerHomeFactor: 1.12, // ev sahipleri formülün tahmininden ~%12 fazla korner kullanıyor
  cornerAwayFactor: 0.89,
  cornerLeagueDefault: { home: 5.5, away: 4.5 },
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Oranlardan marjsız (adil) olasılık — orantısal yöntem */
export function devig(odds: number[]): { fair: number[]; margin: number } {
  const inv = odds.map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  return { fair: inv.map((x) => x / s), margin: s - 1 };
}

/** Avrupa 1X2 + Ü2.5 olasılıklarına en iyi uyan Poisson λ çiftini ızgara aramasıyla bulur */
export function fitLambdas(p: [number, number, number], pOver25: number) {
  const step = 0.02;
  const values: number[] = [];
  for (let l = 0.2; l <= 4.2; l += step) values.push(Number(l.toFixed(2)));
  const vecs = values.map((l) => pmfVector(l));
  let best = { home: 1.4, away: 1.1, err: Infinity };
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      const ph = vecs[i];
      const pa = vecs[j];
      let p1 = 0,
        pX = 0,
        pO = 0;
      for (let h = 0; h < ph.length; h++)
        for (let a = 0; a < pa.length; a++) {
          const v = ph[h] * pa[a];
          if (h > a) p1 += v;
          else if (h === a) pX += v;
          if (h + a > 2.5) pO += v;
        }
      const p2 = 1 - p1 - pX;
      const err = (p1 - p[0]) ** 2 + (pX - p[1]) ** 2 + (p2 - p[2]) ** 2 + (pO - pOver25) ** 2;
      if (err < best.err) best = { home: values[i], away: values[j], err };
    }
  }
  return { home: best.home, away: best.away };
}

function penalty(team: TeamInput, role: "hücum" | "defans", per: number, max: number) {
  const n = team.missing.filter((m) => m.role === role).length;
  // Mevkii bilinmeyen eksikler (FotMob): genel ve küçük etki
  const generic = team.missing.filter((m) => m.role === "belirsiz").length;
  const genericPer = role === "hücum" ? CONFIG.unknownAttackPerPlayer : CONFIG.unknownDefencePerPlayer;
  return Math.min(max, n * per + generic * genericPer);
}

/** Son 10 maç + eksik oyunculardan λ tahmini */
export function statLambdas(home: TeamInput, away: TeamInput) {
  const atkH = penalty(home, "hücum", CONFIG.attackPenaltyPerPlayer, CONFIG.attackPenaltyMax);
  const atkA = penalty(away, "hücum", CONFIG.attackPenaltyPerPlayer, CONFIG.attackPenaltyMax);
  const defH = penalty(home, "defans", CONFIG.defencePenaltyPerPlayer, CONFIG.defencePenaltyMax);
  const defA = penalty(away, "defans", CONFIG.defencePenaltyPerPlayer, CONFIG.defencePenaltyMax);
  const lh = ((avg(home.goalsFor10) + avg(away.goalsAgainst10)) / 2) * CONFIG.homeAdvantage * (1 - atkH) * (1 + defA);
  const la = ((avg(away.goalsFor10) + avg(home.goalsAgainst10)) / 2) / CONFIG.homeAdvantage * (1 - atkA) * (1 + defH);
  return { home: Math.max(0.15, lh), away: Math.max(0.15, la), attackPenalty: { home: atkH, away: atkA } };
}

function sigmaFor(def: MarketDef, pM: number, pS: number, hasCornerMarket: boolean): number {
  const disagreement = Math.abs(pM - pS);
  switch (def.kind) {
    case "ft":
      return 0.025 + 0.5 * disagreement;
    case "ht":
      return 0.035 + 0.5 * disagreement;
    case "htft":
      // 9 seçenekli pazar: olasılıklar küçük, yarı dağılımı varsayımı ek belirsizlik getirir
      return 0.02 + 0.5 * disagreement + 0.08 * Math.sqrt(Math.max(pM, pS));
    case "cards":
      return 0.07 + 0.3 * disagreement;
    default:
      // korner: piyasa oranı yoksa yalnız istatistik → daha geniş belirsizlik
      // korner: piyasa oranı yoksa yalnız istatistik → biraz daha geniş belirsizlik
      return (hasCornerMarket ? 0.04 : 0.06) + 0.4 * disagreement;
  }
}

/**
 * Güven puanı (0–100): kazanma olasılığından ayrı olarak, bu tahminin ne kadar sağlam olduğunu ölçer.
 * Beş bileşenin ağırlıklı ortalaması.
 */
export function confidenceFor(input: {
  kind: MarketDef["kind"];
  /** ClubElo kaynaklı maç (Avrupa piyasa oranı yok) */
  elo?: boolean;
  hasOu25: boolean;
  hasCornerMarket: boolean;
  pMarket: number;
  pStats: number;
  sigma: number;
  edgeChance: number;
  games: number; // iki takımın hesaba giren toplam geçmiş maç sayısı
}): { score: number; parts: ConfidencePart[] } {
  const { kind } = input;
  const eloSource =
    kind === "ft"
      ? { s: 0.6, n: "ClubElo güç puanı + iddaa alt/üst (Avrupa piyasa oranı yok)" }
      : kind === "ht"
        ? { s: 0.45, n: "ClubElo'dan türetiliyor, ilk yarı için dolaylı" }
        : { s: 0.35, n: "ClubElo'dan türetiliyor, 9 seçenekli pazar çok belirsiz" };
  const source = input.elo
    ? eloSource
    : kind === "ft"
      ? input.hasOu25
        ? { s: 0.95, n: "Avrupa piyasasıyla doğrudan doğrulanıyor" }
        : { s: 0.7, n: "Avrupa maç sonucu oranı var, alt/üst oranı yok" }
      : kind === "ht"
        ? { s: 0.75, n: "Piyasadan türetiliyor, ilk yarı için dolaylı" }
        : kind === "htft"
          ? { s: 0.6, n: "Piyasadan türetiliyor, 9 seçenekli pazar daha belirsiz" }
          : kind === "cards"
            ? { s: 0.35, n: "Yalnız istatistik, piyasa oranı yok" }
            : input.hasCornerMarket
              ? { s: 0.7, n: "İstatistik + piyasa oranı" }
              : { s: 0.45, n: "Yalnız istatistik, piyasa oranı yok" };
  const diff = Math.abs(input.pMarket - input.pStats);
  const twoSources = !input.elo && (kind === "ft" || kind === "ht" || kind === "htft");
  const agreement = twoSources ? Math.max(0, 1 - diff / 0.15) : input.elo ? 0.4 : 0.6;
  const precision = Math.max(0, 1 - input.sigma / 0.12);
  const sample = Math.min(1, input.games / 20);
  const parts: ConfidencePart[] = [
    { label: "Veri kaynağı", score: source.s, weight: 0.3, note: source.n },
    {
      label: "Kaynak uyumu",
      score: agreement,
      weight: 0.2,
      note: twoSources
        ? `Piyasa %${(input.pMarket * 100).toFixed(0)}, istatistik %${(input.pStats * 100).toFixed(0)} diyor`
        : input.elo
          ? "Takım istatistiği yok; ClubElo tek kaynak"
          : "Karşılaştırılacak ikinci kaynak yok",
    },
    { label: "Kesinlik", score: precision, weight: 0.15, note: `Belirsizlik payı ±${(input.sigma * 100).toFixed(1)} puan` },
    { label: "Veri miktarı", score: sample, weight: 0.1, note: `${input.games} geçmiş maç kullanıldı` },
    {
      label: "Değer kesinliği",
      score: input.edgeChance,
      weight: 0.25,
      note: `Oranın gerçekten değerli olma ihtimali %${(input.edgeChance * 100).toFixed(0)}`,
    },
  ];
  const score = Math.round(100 * parts.reduce((a, p) => a + p.score * p.weight, 0));
  return { score, parts };
}

const pct = (x: number, d = 1) => `%${(x * 100).toFixed(d)}`;
const f2 = (x: number) => x.toFixed(2);

export function analyze(match: MatchInput): Analysis {
  const { home, away, euro } = match;

  // 1) Avrupa piyasası → adil olasılıklar
  const e1x2 = devig(euro.h2h);
  const euroFair = e1x2.fair as [number, number, number];
  const euroOver25 = devig(euro.ou25).fair[0];

  // 2) iddaa 1X2 marjı
  const odd = (k: string) => match.iddaa.find((o) => o.key === k)?.odd;
  const i1 = odd("1x2:1"),
    iX = odd("1x2:X"),
    i2 = odd("1x2:2");
  const iddaaOdds = i1 && iX && i2 ? ([i1, iX, i2] as [number, number, number]) : null;
  const iddaaDv = iddaaOdds ? devig(iddaaOdds) : null;

  // 3) λ: piyasadan ve istatistikten
  const lambdaMarket = fitLambdas(euroFair, euroOver25);
  // Takım geçmişi yoksa (ClubElo maçları) istatistik modeli yok sayılır, yalnız referans olasılıklar kullanılır
  const hasHistory = home.goalsFor10.length >= 3 && away.goalsFor10.length >= 3;
  const elo = match.source === "elo";
  const st = hasHistory ? statLambdas(home, away) : { ...lambdaMarket, attackPenalty: { home: 0, away: 0 } };
  const lambdaStats = { home: st.home, away: st.away };
  const w = hasHistory ? CONFIG.marketWeight : 1;
  const lambda = {
    home: w * lambdaMarket.home + (1 - w) * lambdaStats.home,
    away: w * lambdaMarket.away + (1 - w) * lambdaStats.away,
  };

  // 4) Korner λ: son 6 maç ortalaması ev/deplasman farkıyla düzeltilir ve lig ortalamasına çekilir
  //    (6 maçlık ortalama gürültülü; ağırlıklar geçmiş sezonlarda ölçüldü, bkz. CONFIG.corner*)
  const league = match.leagueCorners ?? CONFIG.cornerLeagueDefault;
  const wc = CONFIG.cornerTeamWeight;
  const cornerStats = {
    home: wc * ((home.cornersFor + away.cornersAgainst) / 2) * CONFIG.cornerHomeFactor + (1 - wc) * league.home,
    away: wc * ((away.cornersFor + home.cornersAgainst) / 2) * CONFIG.cornerAwayFactor + (1 - wc) * league.away,
  };
  let cornerLambdaMarket: { home: number; away: number } | null = null;
  if (euro.corners) {
    const pOver = devig([euro.corners.over, euro.corners.under]).fair[0];
    const total = lambdaForOver(euro.corners.line, pOver);
    const share = cornerStats.home / (cornerStats.home + cornerStats.away);
    cornerLambdaMarket = { home: total * share, away: total * (1 - share) };
  }
  const cw = cornerLambdaMarket ? CONFIG.cornerMarketWeight : 0;
  const cornerLambda = {
    home: cw * (cornerLambdaMarket?.home ?? 0) + (1 - cw) * cornerStats.home,
    away: cw * (cornerLambdaMarket?.away ?? 0) + (1 - cw) * cornerStats.away,
  };
  const cards = home.cards + away.cards;

  // İlk yarı gol payı: takımın ilk yarıda attığı ve rakibin ilk yarıda yediği gol payı,
  // az veriyle aşırı uç değerler çıkmasın diye lig ortalamasına (≈%45) doğru büzülür
  const shrink = (x: { share: number; goals: number } | undefined) =>
    x ? (x.share * x.goals + HALF_TIME_SHARE * CONFIG.halfShrinkGoals) / (x.goals + CONFIG.halfShrinkGoals) : HALF_TIME_SHARE;
  const clamp = (x: number) => Math.min(0.6, Math.max(0.3, x));
  const halfShare = {
    home: clamp((shrink(home.halfShareFor) + shrink(away.halfShareAgainst)) / 2),
    away: clamp((shrink(away.halfShareFor) + shrink(home.halfShareAgainst)) / 2),
  };

  const ctxMarket = buildContext(lambdaMarket.home, lambdaMarket.away, cornerLambda.home, cornerLambda.away, cards, halfShare);
  const ctxStats = buildContext(lambdaStats.home, lambdaStats.away, cornerStats.home, cornerStats.away, cards, halfShare);
  const htft = HTFT_OUTCOMES.map((outcome) => ({
    outcome,
    prob: w * ctxMarket.htft[outcome] + (1 - w) * ctxStats.htft[outcome],
  }));
  const ftBlend = scoreMatrix(lambda.home, lambda.away);

  const model1x2 = [
    w * euroFair[0] + (1 - w) * probWhere(ctxStats.ft, (h, a) => h > a),
    w * euroFair[1] + (1 - w) * probWhere(ctxStats.ft, (h, a) => h === a),
    w * euroFair[2] + (1 - w) * probWhere(ctxStats.ft, (h, a) => h < a),
  ] as [number, number, number];

  // 5) Dayanak metinleri
  const formStr = (t: TeamInput) => `${t.form.filter((f) => f === "G").length}/${t.form.length}`;
  const gStr = (t: TeamInput) => `${avg(t.goalsFor10).toFixed(1)}/${avg(t.goalsAgainst10).toFixed(1)}`;
  const missingAtk = [...home.missing, ...away.missing].filter((m) => m.role === "hücum").map((m) => m.name);
  const missingCount = home.missing.length + away.missing.length;
  const ref = elo ? "ClubElo" : "Avrupa";
  const goalBasis =
    `${elo ? "iddaa Ü2.5 (marjsız)" : "Avrupa Ü2.5"} ${pct(euroOver25)} · λ ${f2(lambda.home)}–${f2(lambda.away)}` +
    (hasHistory ? ` · Son10 gol ${home.short} ${gStr(home)} · ${away.short} ${gStr(away)}` : "");
  const resultBasis =
    `${ref} ${pct(euroFair[0])}/${pct(euroFair[1])}/${pct(euroFair[2])}` +
    (hasHistory ? ` · Form ${home.short} ${formStr(home)}, ${away.short} ${formStr(away)}` : " · takım istatistiği yok") +
    (missingAtk.length
      ? ` · Eksik: ${missingAtk.join(", ")}`
      : missingCount
        ? ` · Eksik: ${home.short} ${home.missing.length}, ${away.short} ${away.missing.length} oyuncu`
        : "");
  const cornerBasis =
    `Beklenen korner: ${home.short} ${cornerStats.home.toFixed(1)} – ${away.short} ${cornerStats.away.toFixed(1)} ` +
    `(toplam ≈${(cornerStats.home + cornerStats.away).toFixed(1)}) · son 6 maç + lig ortalaması` +
    (cornerLambdaMarket ? ` · piyasa ${f2(cornerLambdaMarket.home + cornerLambdaMarket.away)}` : " · piyasa oranı yok");
  const histStr = (t: TeamInput) => {
    const h = t.htftHistory ?? [];
    const lead = h.filter((x) => x.startsWith("G/")).length;
    return h.length ? `${t.short} son ${h.length}: İY önde ${lead}, İY önde→kazandı ${h.filter((x) => x === "G/G").length}` : "";
  };
  const htftBasis = [
    `İlk yarı gol payı ${home.short} %${Math.round(halfShare.home * 100)} · ${away.short} %${Math.round(halfShare.away * 100)}`,
    `λ ${f2(lambda.home)}–${f2(lambda.away)}`,
    histStr(home),
    histStr(away),
  ]
    .filter(Boolean)
    .join(" · ");
  const cardBasis = `Kart ort. ${home.short} ${home.cards.toFixed(1)} · ${away.short} ${away.cards.toFixed(1)} · λ ${f2(cards)}`;

  // 6) Her iddaa seçeneği
  const rows: BetRow[] = [];
  for (const line of match.iddaa) {
    let def: MarketDef;
    try {
      def = describe(line.key, home.name, away.name);
    } catch {
      continue;
    }
    const pM = probability(def, ctxMarket);
    const pS = probability(def, ctxStats);
    const usesMarket = def.kind === "ft" || def.kind === "ht" || def.kind === "htft";
    const p = usesMarket ? w * pM + (1 - w) * pS : pM; // korner/kart: ctxMarket zaten harman λ kullanıyor
    // ClubElo olasılıkları piyasa kadar keskin değil (sakatlık, kadro bilgisi yok): daha geniş belirsizlik
    //    ClubElo ile iddaa ayrıştıkça belirsizlik büyür; iddaa 1X2 yoksa sabit geniş pay.
    const eloSigma = !elo ? 0 : match.eloDisagreement == null ? 0.08 : CONFIG.eloExtraSigma + 0.6 * match.eloDisagreement;
    const sigma = sigmaFor(def, pM, pS, cornerLambdaMarket !== null) + eloSigma;
    const required = 1 / line.odd;
    const ev = p * line.odd - 1;
    const evConservative = Math.max(0, p - sigma) * line.odd - 1;
    const edgeChance = normCdf((p - required) / sigma);
    let rating: Rating = evConservative > 0 ? "Avantajlı" : ev > 0 ? "Sınırda" : "Dezavantajlı";
    // ClubElo'yu doğrulayacak iddaa 1X2 oranı yoksa "Değerli" demeyiz
    if (elo && match.eloDisagreement == null && rating === "Avantajlı") rating = "Sınırda";

    let dependsOn: BetRow["dependsOn"] = null;
    if (def.kind === "ft" && def.pred) {
      const pSel = probWhere(ftBlend, def.pred);
      if (pSel > 0) {
        const hw = probWhere(ftBlend, (h, a) => def.pred!(h, a) && h > a) / pSel;
        const aw = probWhere(ftBlend, (h, a) => def.pred!(h, a) && h < a) / pSel;
        if (hw >= CONFIG.dependencyThreshold) dependsOn = "home";
        else if (aw >= CONFIG.dependencyThreshold) dependsOn = "away";
      }
    }

    rows.push({
      key: line.key,
      category: def.category,
      market: def.market,
      selection: def.selection,
      odd: line.odd,
      required,
      prob: p,
      sigma,
      ev,
      evConservative,
      edgeChance,
      basis:
        def.kind === "cards"
          ? cardBasis
          : def.kind.startsWith("corners")
            ? cornerBasis
            : def.kind === "htft"
              ? htftBasis
              : def.category === "Sonuç"
                ? resultBasis
                : goalBasis,
      rating,
      dependsOn,
      mbc: line.mbc ?? 1,
      ...(() => {
        const c = confidenceFor({
          kind: def.kind,
          elo,
          hasOu25: !match.warnings.some((w) => w.includes("Alt/Üst 2.5 oranı yok")),
          hasCornerMarket: cornerLambdaMarket !== null,
          pMarket: pM,
          pStats: pS,
          sigma,
          edgeChance,
          games: home.goalsFor10.length + away.goalsFor10.length,
        });
        return { confidence: c.score, confidenceParts: c.parts };
      })(),
    });
  }

  return {
    match,
    euroFair,
    euroMargin: e1x2.margin,
    iddaaOdds,
    iddaaFair: iddaaDv ? (iddaaDv.fair as [number, number, number]) : null,
    iddaaMargin: iddaaDv ? iddaaDv.margin : null,
    model1x2,
    lambda,
    lambdaMarket,
    lambdaStats,
    cornerLambda: cornerStats,
    cornerLambdaMarket,
    euroOver25,
    attackPenalty: st.attackPenalty,
    halfShare,
    htft,
    rows,
  };
}
