import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseIddaa } = await import("../src/lib/providers/iddaa.ts");
const { iddaaMatch } = await import("../src/lib/providers/live.ts");
const { analyze } = await import("../src/lib/model.ts");
const { mainPick } = await import("../src/lib/tracking.ts");

test("yalnız iddaa bülteninde olan maçlar da analiz edilir (marjsız iddaa oranlarıyla)", () => {
  const events = parseIddaa(JSON.parse(readFileSync(new URL("./fixtures/iddaa-sample.json", import.meta.url), "utf8")));
  const ms = events.map((e) => iddaaMatch(e, new Date().toISOString(), "iddaa.com")).filter(Boolean);
  assert.ok(ms.length >= 1, `analiz edilebilen maç: ${ms.length}`);
  let picks = 0;
  for (const m of ms) {
    const a = analyze(m!);
    assert.equal(a.match.source, "iddaa");
    const s = a.model1x2[0] + a.model1x2[1] + a.model1x2[2];
    assert.ok(Math.abs(s - 1) < 1e-6);
    for (const r of a.rows) assert.ok(r.prob > 0 && r.prob < 1 && Number.isFinite(r.confidence));
    const p = mainPick(a);
    if (p) {
      picks++;
      assert.ok(p.odd >= 1.5);
    }
  }
  assert.ok(picks > 0);
});
