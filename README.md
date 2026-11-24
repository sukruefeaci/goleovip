# Maç Değerleme (prototip)

iddaa oranlarını **Avrupa bahis piyasası** (Pinnacle vb.) ve **istatistik modeli** ile karşılaştırıp her seçeneğin beklenen getirisini hesaplayan Next.js uygulaması.

> Prototip şu an **sahte (mock) veriyle** çalışır. Kazanç garantisi vermez.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:3000
```

## Nasıl hesaplar?

1. Avrupa 1X2 ve Alt/Üst 2.5 oranlarından marj atılır → adil olasılık.
2. Bu olasılıklara en iyi uyan Poisson gol beklentisi (λ ev, λ deplasman) bulunur (`fitLambdas`).
3. Son 10 maç golleri + ev avantajı + eksik oyuncularla ikinci bir λ tahmini yapılır (`statLambdas`).
4. %70 piyasa + %30 istatistik harmanlanır; iki model ayrıştıkça belirsizlik (±) büyür.
5. Skor matrisinden tüm seçeneklerin olasılığı çıkar; korner/kart ayrı Poisson modeliyle.
6. Getiri = olasılık × oran − 1; temkinli getiri belirsizliğin kötü ucundan hesaplanır.

## Kod yapısı

| Dosya | Görev |
|---|---|
| `src/lib/types.ts` | Veri tipleri (`MatchInput`, `BetRow`, `Analysis`) |
| `src/lib/poisson.ts` | Poisson, skor matrisi, normal dağılım |
| `src/lib/markets.ts` | Seçenek anahtarları (`ou:2.5:o`, `btts:y`, …) ve olasılık hesabı |
| `src/lib/model.ts` | Analiz motoru, ayarlar (`CONFIG`) |
| `src/lib/providers/` | Veri sağlayıcıları — gerçek API'ler buraya eklenecek |
| `src/components/BetTable.tsx` | Filtrelenebilir/sıralanabilir tablo, CSV |
| `/api/matches`, `/api/matches/[id]` | JSON API |

## Gerçek veri bağlamak

`src/lib/providers/` altına `MatchProvider` arayüzünü uygulayan bir dosya ekleyip `index.ts`'e kaydedin, `DATA_PROVIDER=<isim>` ile seçin.
