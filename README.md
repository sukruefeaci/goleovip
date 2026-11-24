# Maç Değerleme (prototip)

iddaa oranlarını **Avrupa bahis piyasası** (Pinnacle vb.) ve **istatistik modeli** ile karşılaştırıp her seçeneğin beklenen getirisini hesaplayan Next.js uygulaması.

> Kazanç garantisi vermez. Yalnız bilgi amaçlıdır.

## Veri kaynakları (anahtarsız, ücretsiz)

| Veri | Kaynak |
|---|---|
| iddaa oranları | Nesine bülteni (`bulten.nesine.com`) — format [LaAlbiceleste2026](https://github.com/ozgurozansen/LaAlbiceleste2026) incelenerek çıkarıldı |
| Avrupa oranları (Betfair Borsası, ~%1.4 marj; yoksa piyasa ortalaması) | Football-Data.co.uk `fixtures.csv` — fikir [iddaa-scanner](https://github.com/alibingul-dev/iddaa-scanner) |
| Form, son 10 maç, korner, kart, puan durumu | Football-Data.co.uk sezon CSV'leri |

`DATA_PROVIDER`: `auto` (varsayılan; canlıyı dener, olmazsa örnek veri), `live`, `mock`.
Kapsam: Football-Data.co.uk'nin ulusal ligleri (Süper Lig, Premier Lig, La Liga, Serie A, Bundesliga…). Avrupa kupaları ve sakat/cezalı bilgisi bu kaynaklarda yok.
Nesine resmi bir API değildir; format habersiz değişebilir ve kullanım koşulları geçerlidir. Nesine yurt dışı/sunucu IP'lerinden gelen bağlantıları kesiyor; uygulamayı Türkiye'deki bir bilgisayarda çalıştırın.

## Tarayıcıda dene

[![Codespaces'te aç](https://github.com/codespaces/badge.svg)](https://codespaces.new/sukruefeaci/goleovip)

Açılınca kurulum 1–2 dakika sürer, ardından uygulama yeni sekmede açılır.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # ayrıştırıcı ve eşleştirme testleri
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
