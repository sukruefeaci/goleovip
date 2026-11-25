import { test } from "node:test";
import assert from "node:assert/strict";

const { selectDaily } = await import("../src/lib/daily.ts");

// Türkiye saati → UTC (TR = UTC+3)
const tr = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+03:00`).toISOString();
const row = (prob: number, conf: number, odd = 1.6) => ({ key: `k${prob}${conf}`, odd, prob, confidence: conf, market: "M", selection: "S", ev: prob * odd - 1 });
const an = (id: string, kickoff: string, rows: any[]) => ({ match: { id, kickoff, home: { name: id }, away: { name: "B" }, league: "L" }, rows }) as any;

const now = Date.parse("2026-11-28T08:00:00Z"); // 11:00 TR, cumartesi
const list = [
  an("a", tr("2026-11-28", "13:30"), [row(0.6, 70)]),
  an("b", tr("2026-11-28", "13:00"), [row(0.55, 60)]),
  an("c", tr("2026-11-28", "13:45"), [row(0.7, 80)]),
  an("d", tr("2026-11-28", "17:00"), [row(0.5, 50), row(0.4, 90)]),
  an("e", tr("2026-11-28", "19:00"), [row(0.9, 90)]),
  an("f", tr("2026-11-29", "14:00"), [row(0.9, 90)]),
  an("g", tr("2026-11-28", "15:00"), [row(0.9, 95, 1.1)]),
];

test("her saat diliminden en iyi 2 maç, yalnız bugün ve 13–18 arası", () => {
  const d = selectDaily(list, now);
  assert.equal(d.date, "2026-11-28");
  assert.equal(d.isToday, true);
  const slot = (h: number) => d.slots.find((s) => s.hour === h)!.picks.map((p) => p.analysis.match.id);
  assert.deepEqual(slot(13), ["c", "a"], "13 diliminde 3 maç var, en güçlü 2'si");
  assert.deepEqual(slot(17), ["d"], "%45 altı tercih alınmaz, uygun olanı kalır");
  assert.deepEqual(slot(15), [], "1.30 altı oran alınmaz");
  assert.equal(d.slots.flatMap((s) => s.picks).some((p) => ["e", "f"].includes(p.analysis.match.id)), false, "19:00 ve yarın dahil değil");
});

test("19:00'dan sonra yarının seçkisi; başlamış maç alınmaz", () => {
  const evening = Date.parse("2026-11-28T16:30:00Z"); // 19:30 TR
  const d = selectDaily(list, evening);
  assert.equal(d.date, "2026-11-29");
  assert.equal(d.isToday, false);
  assert.deepEqual(d.slots.find((s) => s.hour === 14)!.picks.map((p) => p.analysis.match.id), ["f"]);
  const afternoon = Date.parse("2026-11-28T11:00:00Z"); // 14:00 TR
  assert.deepEqual(selectDaily(list, afternoon).slots.find((s) => s.hour === 13)!.picks, [], "başlamış 13:xx maçları düşer");
});
