import { cachedFetch } from "./providers/cache";
import { nameSimilarity } from "./providers/teamNames";
import { loadAnalyses } from "./data";
import { getStore } from "./auth/store";
import { calibrateLive, liveModel, liveRecommendations, type LiveBet, type LiveOutput, type LiveState, type LiveStats } from "./liveModel";
import { getLiveLearning, liveFactors, recordLive } from "./liveTracking";
import { fetchLiveOdds, fetchLiveProgram, matchIddaaLive } from "./providers/iddaaLive";
import { loadDay, parseHalfTime, priorOf, trDate, type LivePrior, type SnapEntry } from "./tracking";

/**
 * Canlı maçlar: FotMob günlük listeden oynanan maçlar + maç ayrıntısından canlı istatistik.
 * Maç öncesi bilgi (gol beklentisi, ilk yarı payı, ikinci yarı tepkisi) sitenin kayıtlarından ya da bellekteki analizlerden.
 */

const BASE = "https://www.fotmob.com/api/data";
const TTL = 45_000;
const MAX_DETAILS = 30;
const BIG = new Set(["INT", "ENG", "ESP", "ITA", "GER", "FRA", "TUR", "NED", "POR", "BEL", "SCO", "GRE"]);

interface RawLive {
  id: number;
  league: string;
  ccode: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  kickoff: Date;
  minuteLabel: string;
  minute: number;
  phase: LiveState["phase"];
}

export interface LiveItem {
  id: number;
  kickoff: string;
  league: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  hht?: number;
  aht?: number;
  minuteLabel: string;
  phase: LiveState["phase"];
  stats: LiveStats;
  hasStats: boolean;
  pre: { matchId?: string; summary?: SnapEntry["summary"]; pick?: SnapEntry["pick"] } | null;
  hasOdds: boolean;
  model: LiveOutput;
  recs: LiveBet[];
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

export function parseLiveList(json: unknown): RawLive[] {
  const out: RawLive[] = [];
  for (const l of (json as { leagues?: { name?: string; ccode?: string; matches?: unknown[] }[] })?.leagues ?? [])
    for (const m of (l.matches ?? []) as {
      id?: number;
      home?: { name?: string; score?: number };
      away?: { name?: string; score?: number };
      status?: {
        utcTime?: string;
        started?: boolean;
        finished?: boolean;
        cancelled?: boolean;
        ongoing?: boolean;
        halfs?: { secondHalfStarted?: string };
        liveTime?: { short?: string; longKey?: string };
      };
    }[]) {
      const s = m.status;
      if (!m.id || !s || !m.home?.name || !m.away?.name || s.cancelled || s.finished || !(s.ongoing || s.started)) continue;
      const short = (s.liveTime?.short ?? "").replace(/[\u200e\u200f]/g, "").replace(/’/g, "'");
      const isHT = short === "HT" || s.liveTime?.longKey === "pause_match";
      const mm = short.match(/^(\d+)(?:\+(\d+))?/);
      const minute = mm ? Number(mm[1]) + Number(mm[2] ?? 0) : isHT ? 45 : 0;
      const phase: LiveState["phase"] = isHT ? "HT" : s.halfs?.secondHalfStarted || minute > 46 ? "2H" : "1H";
      out.push({
        id: m.id,
        league: l.name ?? "",
        ccode: l.ccode ?? "",
        home: m.home.name,
        away: m.away.name,
        hg: Number(m.home.score ?? 0),
        ag: Number(m.away.score ?? 0),
        kickoff: new Date(s.utcTime ?? Date.now()),
        minuteLabel: isHT ? "İY" : short || "başladı",
        minute,
        phase,
      });
    }
  return out;
}

/** matchDetails → canlı istatistik (anahtarlar: expected_goals, total_shots, ShotsOnTarget, corners, BallPossesion, red_cards) */
export function parseLiveStats(json: unknown): LiveStats {
  const groups =
    (json as { content?: { stats?: { Periods?: { All?: { stats?: { stats?: { key?: string; stats?: unknown[] }[] }[] } } } } })?.content?.stats?.Periods?.All
      ?.stats ?? [];
  const get = (key: string): [number, number] | undefined => {
    for (const g of groups)
      for (const x of g.stats ?? []) {
        if (x.key !== key || !Array.isArray(x.stats)) continue;
        const a = num(x.stats[0]),
          b = num(x.stats[1]);
        if (a !== null && b !== null) return [a, b];
      }
    return undefined;
  };
  return { xg: get("expected_goals"), shots: get("total_shots"), sot: get("ShotsOnTarget"), corners: get("corners"), poss: get("BallPossesion"), red: get("red_cards") };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function priorsSources() {
  const now = Date.now();
  const snaps: SnapEntry[] = getStore()
    ? (await Promise.all([trDate(now), trDate(now - 86400_000)].map((d) => loadDay(d).catch(() => [])))).flat()
    : [];
  const { analyses } = await loadAnalyses().catch(() => ({ analyses: [] }));
  return { snaps, analyses };
}

function findPre(r: RawLive, src: Awaited<ReturnType<typeof priorsSources>>): { prior: LivePrior | null; pre: LiveItem["pre"] } {
  const close = (ko: string, home: string, away: string) =>
    Math.abs(new Date(ko).getTime() - r.kickoff.getTime()) < 90 * 60_000 && nameSimilarity(home, r.home) >= 0.6 && nameSimilarity(away, r.away) >= 0.6;
  const s = src.snaps.find((e) => e.fotmobId === r.id) ?? src.snaps.find((e) => close(e.kickoff, e.home, e.away));
  if (s?.prior) return { prior: s.prior, pre: { matchId: s.id, summary: s.summary, pick: s.pick } };
  const a = src.analyses.find((x) => x.match.fotmob?.matchId === r.id) ?? src.analyses.find((x) => close(x.match.kickoff, x.match.home.name, x.match.away.name));
  if (a)
    return {
      prior: priorOf(a),
      pre: { matchId: a.match.id, summary: { over25: a.summary.over25, btts: a.summary.btts, topScore: a.summary.topScores[0]?.score ?? "", p1x2: a.model1x2 } },
    };
  return { prior: null, pre: null };
}

let memo: { at: number; items: LiveItem[]; total: number } | null = null;

export async function loadLive(): Promise<{ items: LiveItem[]; total: number; at: number }> {
  if (memo && Date.now() - memo.at < 30_000) return memo;
  const now = new Date();
  const days = [ymd(now), ymd(new Date(now.getTime() - 86400_000))];
  const lists = await Promise.all(
    days.map(async (d) => {
      try {
        const f = await cachedFetch(`fotmob-live-${d}.json`, "FotMob canlı", `${BASE}/matches?date=${d}`, TTL);
        return parseLiveList(JSON.parse(f.text));
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<number>();
  const raw = lists.flat().filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const src = await priorsSources();
  const withPre = raw.map((r) => ({ r, ...findPre(r, src) }));
  // Ayrıntı önceliği: maç öncesi analizi olanlar, sonra büyük ligler
  withPre.sort((x, y) => Number(!!y.prior) - Number(!!x.prior) || Number(BIG.has(y.r.ccode)) - Number(BIG.has(x.r.ccode)));

  const details = new Map<number, { stats: LiveStats; ht: { hht: number; aht: number } | null }>();
  const targets = withPre.slice(0, MAX_DETAILS);
  let i = 0;
  const work = Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < targets.length) {
        const { r } = targets[i++];
        try {
          const f = await cachedFetch(`fotmob-live-det-${r.id}.json`, "FotMob canlı ayrıntı", `${BASE}/matchDetails?matchId=${r.id}`, TTL);
          const j = JSON.parse(f.text);
          details.set(r.id, { stats: parseLiveStats(j), ht: parseHalfTime(j) });
        } catch {
          /* bu maç için ayrıntı yok */
        }
      }
    }),
  );
  await Promise.race([work, new Promise((res) => setTimeout(res, 6000).unref?.())]);

  const factors = liveFactors(await getLiveLearning().catch(() => ({})));
  const items: LiveItem[] = withPre.map(({ r, prior, pre }) => {
    const d = details.get(r.id);
    const stats = d?.stats ?? {};
    const hasStats = !!(stats.xg || stats.shots);
    const state: LiveState = { minute: r.minute, phase: r.phase, hg: r.hg, ag: r.ag, hht: d?.ht?.hht, aht: d?.ht?.aht, stats };
    const model = calibrateLive(liveModel(state, prior, hasStats), factors);
    return {
      id: r.id,
      kickoff: r.kickoff.toISOString(),
      league: r.league,
      home: r.home,
      away: r.away,
      hg: r.hg,
      ag: r.ag,
      hht: d?.ht?.hht,
      aht: d?.ht?.aht,
      minuteLabel: r.minuteLabel,
      phase: r.phase,
      stats,
      hasStats,
      pre,
      model,
      hasOdds: false,
      recs: liveRecommendations(model),
    };
  });

  // iddaa canlı oranları: eşleşen maçların önerilerine oran ve getiri ekle (süre sınırlı)
  try {
    const program = await Promise.race([fetchLiveProgram(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("süre")), 4000).unref?.())]);
    const pairs = items
      .map((it) => ({ it, ev: matchIddaaLive({ home: it.home, away: it.away, kickoff: new Date(it.kickoff), hg: it.hg, ag: it.ag }, program) }))
      .filter((p) => p.ev);
    let k = 0;
    const job = Promise.all(
      Array.from({ length: 6 }, async () => {
        while (k < pairs.length) {
          const { it, ev } = pairs[k++];
          try {
            const odds = await fetchLiveOdds(ev!.id, it.hg + it.ag);
            if (!Object.keys(odds).length) continue;
            it.hasOdds = true;
            for (const b of it.model.probs) {
              const o = odds[b.label];
              if (o) {
                b.odd = o;
                b.ev = b.prob * o - 1;
              }
            }
          } catch {
            /* bu maç için canlı oran yok */
          }
        }
      }),
    );
    await Promise.race([job, new Promise((res) => setTimeout(res, 4000).unref?.())]);
  } catch {
    /* canlı oran kaynağına ulaşılamadı */
  }
  // Yeni önerileri takip için kaydet (ilk öneri anı esas alınır)
  await recordLive(
    items
      .filter((it) => it.recs.length)
      .map((it) => ({
        fotmobId: it.id,
        home: it.home,
        away: it.away,
        league: it.league,
        kickoff: new Date(it.kickoff),
        minute: it.minuteLabel,
        hg: it.hg,
        ag: it.ag,
        recs: it.recs,
      })),
  ).catch(() => 0);
  memo = { at: Date.now(), items, total: raw.length };
  return memo;
}
