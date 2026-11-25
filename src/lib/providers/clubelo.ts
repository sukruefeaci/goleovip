/**
 * ClubElo (clubelo.com) — ücretsiz, anahtarsız. Takımların Elo güç puanlarından hesaplanmış
 * yaklaşan maç olasılıkları (1 / X / 2). Avrupa kupaları (Şampiyonlar Ligi vb.) ve
 * Football-Data'nın kapsamadığı ligler dahil.
 *
 * Not: ClubElo'nun CSV API'si (api.clubelo.com) yalnız şifresiz HTTP veriyor; HTTPS üzerinden
 * erişilebilen https://clubelo.com/Fixtures sayfası okunuyor. Sayfa yapısı değişirse ayrıştırıcı
 * boş liste döner ve site ClubElo olmadan çalışmaya devam eder.
 */

export const CLUBELO_FIXTURES_URL = "https://clubelo.com/Fixtures";

export interface EloFixture {
  kickoff: Date;
  competition: string;
  home: string;
  away: string;
  p: [number, number, number]; // ev / beraberlik / deplasman (0–1)
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

// Takım bağlantısı: <a href="/X"><span class="max640">KISA</span><span class="min641">Ad</span><span class="min1081">devamı</span></a>
const TEAM_RE = /<a href="\/[^"]+"><span class="max640">[^<]*<\/span><span class="min641">([^<]*)<\/span><span class="min1081">([^<]*)<\/span><\/a>/g;
// Yüzde hücresi: <span class="min1081">39.3</span><span class="max1080">
const PCT_RE = /<span class="min1081">(\d+(?:\.\d+)?)<\/span><span class="max1080">/g;
const GAME_RE = /data-live-status-game-id="[^"]*"/g;

export function parseClubEloFixtures(html: string): EloFixture[] {
  const out: EloFixture[] = [];
  const starts = [...html.matchAll(GAME_RE)].map((m) => m.index!);
  // Bölüm başlıkları (<i>UCL League Stage</i> gibi); her maç kendinden önceki son başlığa aittir
  const labels = [...html.matchAll(/<i>\s*([^<]+?)\s*<\/i>/g)].map((m) => ({ at: m.index!, text: decode(m[1]) }));
  for (let i = 0; i < starts.length; i++) {
    const chunk = html.slice(starts[i], starts[i + 1] ?? starts[i] + 6000);
    const time = chunk.match(/data-utc-time='([^']+)'/)?.[1];
    if (!time) continue;
    const kickoff = new Date(time.replace(/Z$/, ":00Z"));
    if (Number.isNaN(kickoff.getTime())) continue;

    const teams = [...chunk.matchAll(TEAM_RE)].slice(0, 2);
    if (teams.length < 2) continue;
    const homeName = decode(teams[0][1] + teams[0][2]);
    const awayName = decode(teams[1][1] + teams[1][2]);

    const awayAt = teams[1].index!;
    const homePcts = [...chunk.slice(0, awayAt).matchAll(PCT_RE)].map((m) => Number(m[1]));
    const awayPcts = [...chunk.slice(awayAt).matchAll(PCT_RE)].map((m) => Number(m[1]));
    if (homePcts.length < 2 || awayPcts.length < 1) continue;
    const p: [number, number, number] = [homePcts[0] / 100, homePcts[1] / 100, awayPcts[0] / 100];
    const sum = p[0] + p[1] + p[2];
    if (sum < 0.95 || sum > 1.05) continue; // beklenmeyen yapı: güvenli tarafta kal

    let competition = "";
    for (const l of labels) {
      if (l.at > starts[i]) break;
      competition = l.text;
    }

    out.push({ kickoff, competition, home: homeName, away: awayName, p: [p[0] / sum, p[1] / sum, p[2] / sum] });
  }
  return out;
}
