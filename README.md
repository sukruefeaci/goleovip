# goleo VIP — maç değerleme

iddaa oranlarını **Avrupa bahis piyasası** (Pinnacle vb.) ve **istatistik modeli** ile karşılaştırıp her seçeneğin beklenen getirisini hesaplayan Next.js uygulaması.

> Kazanç garantisi vermez. Yalnız bilgi amaçlıdır.

## Veri kaynakları (anahtarsız, ücretsiz)

| Veri | Kaynak |
|---|---|
| iddaa oranları | **iddaa.com bülteni** (`sportsbookv2.iddaa.com`, yurt dışından da çalışır) — adres [iddaa-scanner](https://github.com/alibingul-dev/iddaa-scanner)'dan; pazar kodları gerçek bültenden istatistikle çıkarıldı. Yedek: Nesine bülteni — format [LaAlbiceleste2026](https://github.com/ozgurozansen/LaAlbiceleste2026) |
| Avrupa oranları (Betfair Borsası, ~%1.4 marj; yoksa piyasa ortalaması) | Football-Data.co.uk `fixtures.csv` — fikir [iddaa-scanner](https://github.com/alibingul-dev/iddaa-scanner) |
| Form, son 10 maç, korner, kart, puan durumu | Football-Data.co.uk sezon CSV'leri |
| Avrupa kupaları ve diğer ligler için maç olasılıkları | **ClubElo** (`clubelo.com/Fixtures`, ücretsiz, anahtarsız) |
| Sakat / cezalı / milli takımdaki oyuncular | **FotMob** (resmi olmayan açık JSON; yalnız kişisel kullanım) |

**FotMob:** önümüzdeki 3 gündeki maçlar için `api/data/matches` + `api/data/matchDetails` (eksik oyuncu listesi). En fazla 6 eşzamanlı istek, 2 saat önbellek, 12 sn süre sınırı; hata olursa site FotMob'suz çalışır. Mevki bilinmediği için her eksik oyuncu istatistik modelinde kendi gol beklentisini %1.5 düşürür, rakibinkini %1 artırır (sınırlı). FotMob resmi olmayan kullanıma karşı çıkıyor; yalnız kişisel kullanım için eklendi.

**ClubElo maçları:** Football-Data'da Avrupa oranı olmayan iddaa maçları (Şampiyonlar Ligi, Avrupa Ligi, diğer ligler) ClubElo'nun Elo tabanlı 1/X/2 olasılığı ile iddaa'nın marjsız olasılığının ortalamasıyla analiz edilir; gol beklentisi iddaa'nın Alt/Üst 2.5 oranından (marjsız). Takım istatistiği olmadığından korner/kart gösterilmez, belirsizlik payı ClubElo–iddaa farkıyla büyür, güven puanı düşüktür, banko seçimine girmez; iddaa 1X2 oranı yoksa hiçbir seçenek "Değerli" olmaz. ClubElo'nun CSV API'si yalnız HTTP verdiği için HTTPS sayfası ayrıştırılır; sayfa değişirse site ClubElo'suz çalışmaya devam eder.

`DATA_PROVIDER`: `auto` (varsayılan; canlıyı dener, olmazsa örnek veri), `live`, `mock`.
Kapsam: Football-Data.co.uk'nin ulusal ligleri (Süper Lig, Premier Lig, La Liga, Serie A, Bundesliga…). Avrupa kupaları, kart oranları ve sakat/cezalı bilgisi bu kaynaklarda yok. Korner için Avrupa oranı olmadığından korner tahminleri yalnız istatistiğe dayanır (daha geniş ±).
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

## Üyelik (giriş / kayıt)

Maçlar, kupon oluşturucu ve `/api/*` yalnız giriş yapmış kullanıcılara açıktır (`src/middleware.ts`).
Şifreler scrypt ile saklanır; oturum, imzalı (HMAC-SHA256) httpOnly çerezdir. 5 hatalı girişte 15 dk kilit.

Vercel'de gerekenler:
1. **AUTH_SECRET**: en az 32 karakterlik rastgele bir metin (Settings → Environment Variables).
2. **Kullanıcı veritabanı**: Vercel → Storage / Marketplace → **Upstash Redis** (ücretsiz) projeye bağlanır; `KV_REST_API_URL` ve `KV_REST_API_TOKEN` kendiliğinden eklenir.

Yerelde (`npm run dev`) ikisine de gerek yok: kullanıcılar `.data/store.json` dosyasına yazılır.
Kendi sunucunuzda `npm start` ile Upstash'siz çalıştırmak için `AUTH_FILE_STORE=1` ve `AUTH_SECRET` verin.

## Kupon oluşturucu

Ana sayfada maç sayısı, tutar, maç başı minimum oran ve strateji (Güvenli / Dengeli) seçilir (`src/lib/coupon.ts`).
Her maçtan en fazla bir seçenek alınır; Güvenli strateji belirsizliği düşülmüş olasılığı en yüksek seçenekleri seçer.
iddaa'nın MBS kuralına uyar (MBS 3 olan seçenek ancak 3+ maçlık kupona girer). Başlamış maçlar alınmaz.
Tutma olasılığı = seçenek olasılıklarının çarpımı (maçlar bağımsız varsayılır); beklenen dönüş de gösterilir.

## Yapay zekanın tercihi

Her maç sayfasının üstünde modelin tercihi gösterilir (`src/lib/pick.ts`): 1.30–6.00 oran aralığında temkinli getirisi en yüksek seçenek.
- **Güçlü**: belirsizliğin kötü ucunda bile artı getiri
- **Zayıf**: beklenen getiri artı ama belirsizlikle eksiye düşüyor
- **Değer yok**: hiçbir seçenek başa baş noktasını geçmiyor → oynamamak önerilir

`ANTHROPIC_API_KEY` ortam değişkeni tanımlıysa Claude (`claude-opus-5-5`, düşük effort) tercihin kısa Türkçe gerekçesini yazar (`src/lib/aiComment.ts`); seçimi değiştirmez, yalnız verilen rakamları yorumlar. Yorumlar maç başına 30 dk önbelleğe alınır. Anahtar yoksa şablon gerekçe gösterilir.

## İlk yarı / maç sonucu (İY/MS)

Her maç sayfasında 9 İY/MS sonucunun (1/1, X/1, 2/2 …) olasılığı 3×3 tabloda gösterilir; en olası sonuç ve iddaa oranı varsa getirisi işaretlenir.
- İki yarı ayrı Poisson: ilk yarı λ = λ × ilk yarı payı. Pay, takımın son 20 maçında ilk yarıda attığı / rakibin ilk yarıda yediği gollerden hesaplanır ve lig ortalamasına (%45) doğru büzülür (Football-Data `HTHG`/`HTAG`).
- Takımların son 10 maçının İY/MS sonuçları (G/G, B/G, M/M …) da gösterilir.
- iddaa (pazar 90) ve Nesine (pazar 5) İY/MS oranları eşlenir; iddaa'nın bu pazardaki marjı genelde %25–30'dur.

## Korner ve kart modeli

Korner ve kart sayıları Poisson'dan daha oynak olduğu için **negatif binom** dağılımı kullanılır.
Değerler 9 lig × 2 sezon Football-Data verisiyle ölçüldü (2025/26 ayar, 2026/27 test):
- Takımın son 6 maç korner ortalaması %30 ağırlıkla, ligin bu sezonki ortalaması %70 ağırlıkla birleştirilir (6 maçlık ortalama gürültülü).
- Ev sahibi ×1.12, deplasman ×0.89 (ev sahipleri belirgin şekilde daha çok korner kullanıyor).
- Dağılım: takım korneri k=12, toplam korner k=30, toplam kart k=14.
- Görülmemiş sezonda kalibrasyon: model %74 dediğinde gerçek %73, %36 dediğinde %36. Brier skoru 0.2395 → 0.2334.

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
