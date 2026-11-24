export const pct = (x: number, d = 1) => `%${(x * 100).toFixed(d)}`;
export const signedPct = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}%${Math.abs(x * 100).toFixed(d)}`;

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** Türkiye saati (UTC+3) */
export function kickoffParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return { time: `${hh}:${mm}`, date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${DAYS[d.getUTCDay()]}` };
}

export function initials(name: string) {
  const parts = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  return parts.length === 1 ? parts[0][0] : parts.map((p) => p[0]).join("").slice(0, 2);
}
