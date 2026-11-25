import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseClubEloFixtures } = await import("../src/lib/providers/clubelo.ts");
const { nameSimilarity } = await import("../src/lib/providers/teamNames.ts");

const html = readFileSync(new URL("./fixtures/clubelo-sample.html", import.meta.url), "utf8");

test("gerçek ClubElo sayfa parçası ayrıştırılır", () => {
  const f = parseClubEloFixtures(html);
  assert.equal(f.length, 2);
  assert.equal(f[0].home, "Slavia Praha");
  assert.equal(f[0].away, "Villarreal");
  assert.equal(f[0].competition, "UCL League Stage");
  assert.equal(f[0].kickoff.toISOString(), "2026-11-25T17:45:00.000Z");
  assert.ok(Math.abs(f[0].p[0] - 0.393) < 0.002 && Math.abs(f[0].p[1] - 0.293) < 0.002 && Math.abs(f[0].p[2] - 0.313) < 0.002);
  assert.ok(Math.abs(f[0].p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("bozuk/değişmiş sayfa boş liste döner (site çökmez)", () => {
  assert.deepEqual(parseClubEloFixtures("<html>bakım</html>"), []);
  assert.deepEqual(parseClubEloFixtures(html.replace(/min1081/g, "x")), []);
});

test("ClubElo ↔ iddaa takım adları", () => {
  assert.ok(nameSimilarity("Bayern München", "Bayern Münih") >= 0.95);
  assert.ok(nameSimilarity("Internazionale", "Inter") >= 0.95);
  assert.ok(nameSimilarity("Man United", "Manchester United") >= 0.95);
});
