import Anthropic from "@anthropic-ai/sdk";
import type { Analysis } from "./types";
import type { Pick } from "./pick";

/**
 * Claude ile seçilen tercihin kısa Türkçe gerekçesi.
 * Seçimi model yapar (pick.ts); Claude yalnız rakamları yorumlar, yeni rakam uydurmaz.
 * ANTHROPIC_API_KEY yoksa null döner ve sayfa şablon gerekçeyi gösterir.
 */

const MODEL = "claude-opus-5-5";
const cache = new Map<string, { at: number; text: string }>();
const TTL = 30 * 60_000;

const SYSTEM = `Sen bir futbol bahis analiz sitesinde, istatistik modelinin seçtiği tercihi kullanıcıya açıklayan yardımcısın.
Kurallar:
- Türkçe, sade, 3–4 cümle yaz. Başlık, madde işareti veya markdown kullanma.
- Yalnız sana verilen rakamları kullan; yeni olasılık, oran veya istatistik uydurma.
- Tercihi değiştirme; neden seçildiğini ve riskini açıkla.
- Seviye "değer yok" ise açıkça oynamamayı öner; "zayıf" ise küçük miktar veya pas geçmeyi öner.
- Kazanç garantisi verme; iddaa marjının uzun vadede aleyhe çalıştığını gerektiğinde hatırlat.`;

function prompt(a: Analysis, p: Pick): string {
  const r = p.row;
  const f = (x: number) => `%${(x * 100).toFixed(1)}`;
  const m = a.match;
  return [
    `Maç: ${m.home.name} – ${m.away.name} (${m.league})`,
    `Form: ${m.home.short} ${m.home.form.join("")}, ${m.away.short} ${m.away.form.join("")}; puan durumu ${m.home.rank}. ve ${m.away.rank}.`,
    `Gol beklentisi (λ): ${a.lambda.home.toFixed(2)} – ${a.lambda.away.toFixed(2)}`,
    `Avrupa adil 1/X/2: ${a.euroFair.map(f).join(" / ")} (${m.euro.reference}); iddaa marjı: ${a.iddaaMargin !== null ? f(a.iddaaMargin) : "bilinmiyor"}`,
    ``,
    `Modelin tercihi: ${r.market}: ${r.selection} @ ${r.odd.toFixed(2)}`,
    `Seviye: ${p.level}`,
    `Model olasılığı: ${f(r.prob)} ±${(r.sigma * 100).toFixed(1)}; gereken: ${f(r.required)}`,
    `Beklenen getiri: ${f(r.ev)}; temkinli getiri: ${f(r.evConservative)}; avantaj ihtimali: ${f(r.edgeChance)}`,
    `Dayanak: ${r.basis}`,
    r.dependsOn ? `Not: seçenek büyük ölçüde ${r.dependsOn === "home" ? m.home.name : m.away.name} galibiyetine bağlı.` : "",
    r.category === "Korner" ? "Not: korner için Avrupa oranı yok, yalnız istatistik." : "",
    `Eksik oyuncular: ${[...m.home.missing, ...m.away.missing].map((x) => x.name).join(", ") || "bilgi yok"}`,
    ``,
    `Bu tercihi kullanıcıya açıkla.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function aiComment(a: Analysis, p: Pick): Promise<string | null> {
  if (!aiEnabled()) return null;
  const key = `${a.match.id}|${p.row.key}|${p.row.odd}|${p.level}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.text;

  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt(a, p) }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return null;
    cache.set(key, { at: Date.now(), text });
    return text;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error("Yapay zeka yorumu: API anahtarı geçersiz");
    else if (error instanceof Anthropic.RateLimitError) console.error("Yapay zeka yorumu: istek sınırı aşıldı");
    else if (error instanceof Anthropic.APIError) console.error(`Yapay zeka yorumu: API hatası ${error.status}`);
    else console.error("Yapay zeka yorumu alınamadı:", (error as Error).message);
    return null;
  }
}

/** Skor önerisi + maç özeti için kısa yorum (Claude). Anahtar yoksa null. */
export async function aiSummaryComment(a: Analysis): Promise<string | null> {
  if (!aiEnabled()) return null;
  const m = a.match;
  const sm = a.summary;
  const key = `sum|${m.id}|${sm.topScores.map((x) => x.score).join(",")}|${sm.over25.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.text;
  const f = (x: number) => `%${(x * 100).toFixed(1)}`;
  const content = [
    `Maç: ${m.home.name} – ${m.away.name} (${m.league})`,
    `Gol beklentisi: ${a.lambda.home.toFixed(2)} – ${a.lambda.away.toFixed(2)}`,
    `Maç sonucu olasılıkları 1/X/2: ${a.model1x2.map(f).join(" / ")}`,
    `En olası skorlar: ${sm.topScores.map((x) => `${x.score} (${f(x.prob)})`).join(", ")}`,
    `2.5 Üst: ${f(sm.over25)} · KG Var: ${f(sm.btts)}`,
    sm.corners ? `Korner beklentisi ${sm.corners.expected.toFixed(1)}, ${sm.corners.line} Üst ${f(sm.corners.over)}` : "Korner verisi yok",
    `Eksik oyuncu sayısı: ${m.home.short} ${m.home.missing.length}, ${m.away.short} ${m.away.missing.length}`,
    ``,
    `Bu maç için en olası skoru öner ve maçın genel gidişatını 2–3 cümlede yorumla.`,
  ].join("\n");
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text) return null;
    cache.set(key, { at: Date.now(), text });
    return text;
  } catch {
    return null;
  }
}
