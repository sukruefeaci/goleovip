import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseFotmobMatches, parseUnavailable } = await import("../src/lib/providers/fotmob.ts");
const read = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("FotMob maç listesi (gerçek örnek)", () => {
  const ms = parseFotmobMatches(read("fotmob-matches-sample.json"));
  assert.equal(ms.length, 2);
  assert.equal(ms[0].home, "Sabah FK");
  assert.equal(ms[0].away, "Barcelona");
  assert.equal(ms[0].kickoff.toISOString(), "2026-11-25T17:45:00.000Z");
});

test("FotMob sakat/cezalı listesi (gerçek örnek)", () => {
  const u = parseUnavailable(read("fotmob-details-sample.json"))!;
  assert.equal(u.home.length, 1);
  assert.equal(u.home[0].name, "Aden McCarthy");
  assert.equal(u.home[0].reason, "cezalı");
  assert.equal(u.away.length, 3);
  assert.ok(u.away.some((p) => p.reason === "sakat"));
  assert.ok(u.away.every((p) => p.role === "belirsiz"));
  assert.equal(u.predicted, true);
});

test("beklenmeyen yanıt: null / boş, hata fırlatmaz", () => {
  assert.equal(parseUnavailable({}), null);
  assert.deepEqual(parseFotmobMatches({ error: "x" }), []);
});
