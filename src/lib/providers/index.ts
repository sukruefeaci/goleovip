import type { MatchInput } from "../types";
import { mockProvider } from "./mock";

/**
 * Veri sağlayıcı arayüzü. Gerçek API'ler (oran, istatistik) bu arayüzü
 * uygulayan yeni bir dosya olarak eklenir ve DATA_PROVIDER ile seçilir.
 */
export interface MatchProvider {
  name: string;
  listMatches(): Promise<MatchInput[]>;
  getMatch(id: string): Promise<MatchInput | null>;
}

const providers: Record<string, MatchProvider> = {
  mock: mockProvider,
};

export function getProvider(): MatchProvider {
  return providers[process.env.DATA_PROVIDER ?? "mock"] ?? mockProvider;
}
