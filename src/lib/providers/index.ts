import type { MatchInput } from "../types";
import { mockProvider } from "./mock";
import { liveProvider } from "./live";

/**
 * Veri sağlayıcı arayüzü. DATA_PROVIDER ile seçilir:
 *   auto (varsayılan) — canlı veriyi dener, ulaşılamazsa uyarıyla sahte veriye düşer
 *   live              — yalnız canlı (Nesine + Football-Data.co.uk)
 *   mock              — yalnız sahte veri
 */
export interface MatchProvider {
  name: string;
  listMatches(): Promise<MatchInput[]>;
  getMatch(id: string): Promise<MatchInput | null>;
}

const withWarning = (m: MatchInput, w: string): MatchInput => ({ ...m, warnings: [w, ...m.warnings] });

const autoProvider: MatchProvider = {
  name: "otomatik",
  async listMatches() {
    try {
      const live = await liveProvider.listMatches();
      if (live.length) return live;
      const mock = await mockProvider.listMatches();
      return mock.map((m) => withWarning(m, "Canlı kaynaklarda eşleşen maç bulunamadı — örnek veri gösteriliyor."));
    } catch (e) {
      const mock = await mockProvider.listMatches();
      return mock.map((m) => withWarning(m, `Canlı veri alınamadı (${(e as Error).message}) — örnek veri gösteriliyor.`));
    }
  },
  async getMatch(id) {
    return (await this.listMatches()).find((m) => m.id === id) ?? null;
  },
};

const providers: Record<string, MatchProvider> = { auto: autoProvider, live: liveProvider, mock: mockProvider };

export function getProvider(): MatchProvider {
  return providers[process.env.DATA_PROVIDER ?? "auto"] ?? autoProvider;
}
