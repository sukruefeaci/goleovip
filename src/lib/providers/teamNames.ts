/**
 * Nesine (Türkçe) ↔ Football-Data.co.uk (İngilizce kısa) takım adı eşleştirme.
 * Yaklaşım github.com/alibingul-dev/iddaa-scanner (fetch.py: norm/sim) uyarlamasıdır.
 * Eşleşmeyen takım olursa ALIAS'a ekleyin.
 */

const ALIAS: [RegExp, string][] = [
  [/\bb munih\b|\bbayern munih\b|\bmunih\b|\bmuenchen\b/, "bayern munich"],
  [/\bb dortmund\b|\bborussia dortmund\b/, "dortmund"],
  [/\bman city\b|\bmanchester city\b/, "man city"],
  [/\bman utd\b|\bman united\b|\bmanchester united\b/, "man united"],
  [/\bwolverhampton\b/, "wolves"],
  [/\bnottingham forest\b|\bnottingham\b/, "nott m forest"],
  [/\bnewcastle united\b/, "newcastle"],
  [/\btottenham hotspur\b/, "tottenham"],
  [/\bbrighton hove albion\b/, "brighton"],
  [/\bwest ham united\b/, "west ham"],
  [/\bborussia monchengladbach\b|\bmonchengladbach\b|\bm gladbach\b/, "m gladbach"],
  [/\bbayer leverkusen\b/, "leverkusen"],
  [/\beintracht frankfurt\b|\bfrankfurt\b/, "ein frankfurt"],
  [/\bparis saint germain\b|\bpsg\b|\bparis sg\b/, "paris sg"],
  [/\batletico madrid\b|\bat madrid\b/, "ath madrid"],
  [/\bathletic bilbao\b|\bathletic club\b/, "ath bilbao"],
  [/\breal sociedad\b/, "sociedad"],
  [/\bcelta vigo\b/, "celta"],
  [/\binter milan\b|\binternazionale\b/, "inter"],
  [/\bac milan\b/, "milan"],
  [/\bsporting lizbon\b|\bsporting cp\b|\bsporting lisbon\b/, "sp lisbon"],
  [/\bbenfica lizbon\b/, "benfica"],
  [/\bistanbul basaksehir\b|\brams basaksehir\b|\bbasaksehir\b/, "buyuksehyr"],
  [/\bgoztepe\b/, "goztep"],
  [/\bfatih karagumruk\b|\bkaragumruk\b/, "karagumruk"],
  [/\bcaykur rizespor\b/, "rizespor"],
  [/\bgenclerbirligi\b/, "genclerbirligi"],
];

const DROP = new Set(["fc", "sc", "ac", "cf", "afc", "sk", "fk", "as", "ss", "us", "cd", "ud", "sd", "rc", "vfb", "vfl", "tsg", "sv", "fsv", "1", "jk", "club", "de", "the", "a.s", "as."]);

export function normName(name: string): string {
  let s = (name ?? "").replace(/ı/g, "i").replace(/İ/g, "I").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, v] of ALIAS) s = s.replace(re, v);
  const toks = s.split(" ").filter((t) => t && !DROP.has(t));
  return toks.join(" ") || s;
}

/** Levenshtein tabanlı benzerlik (0–1) */
function ratio(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

export function nameSimilarity(a: string, b: string): number {
  const x = normName(a),
    y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  let r = ratio(x, y);
  const tx = new Set(x.split(" ")),
    ty = new Set(y.split(" "));
  const small = tx.size <= ty.size ? tx : ty;
  const big = small === tx ? ty : tx;
  const subset = [...small].every((t) => big.has(t));
  if (subset && Math.max(...[...small].map((t) => t.length)) >= 4) r = Math.max(r, 0.85);
  return r;
}

export function shortName(name: string): string {
  const n = normName(name).toUpperCase().split(" ");
  return n.length > 1 ? n.map((w) => w[0]).join("").slice(0, 3) : n[0].slice(0, 3);
}
