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

## Canlı maçlar (/canli)

FotMob'dan o an oynanan maçlar taranır (45 sn önbellek, sayfa 60 sn'de bir yenilenir). Her maç için (`src/lib/liveModel.ts`):
- **Maç öncesi bilgi:** sitenin kaydettiği gol beklentisi, takımların ilk yarı gol payı ve ikinci yarı tepkisi (`LivePrior`); yoksa lig ortalaması.
- **Tempo:** canlı xG (yoksa şut / isabetli şuttan tahmini xG) ile maç öncesi beklentinin, oynanan süreye göre ağırlıklı karşılaştırması.
- **İlk yarı:** kalan ilk yarı gol hızı takımın ilk yarı gol payından.
- **İkinci yarı:** skor durumuna göre genel etki (geride ×1.15–1.25, önde ×0.8–0.9) ve takımın geçmişte ilk yarıyı önde/berabere/geride bitirdiği maçlardaki ikinci yarı golleri (az veriyle genel değere çekilir).
- **Kırmızı kart:** eksik takım ×0.75, rakip ×1.2.
- Kalan goller Poisson; İY/MS alt-üst çizgileri, KG, maç sonucu, çifte şans, sıradaki gol. Öneriler: oran ≥ 1.45 (iddaa canlı oranı; yoksa olasılıktan adil oran) ve olasılık ≥ %55; olasılık × güven sırasıyla en iyi 3.
- **iddaa canlı oranları** (`src/lib/providers/iddaaLive.ts`): canlı program (`events?type=1`, `s=1` oynanan, `sc` canlı skor) ve maç başına `event/{id}`. Pazar kodları gol olan maçlarla doğrulandı: 4 maç sonucu, 129 çifte şans, 14 maç sonu alt/üst (ana çizgi), 63 ilk yarı alt/üst, 131 KG, 34 sıradaki gol (sov = kaçıncı gol). FotMob maçıyla başlama saati, isim ve aynı skor şartıyla eşleşir; öneriye oran ve getiri (olasılık × oran − 1) eklenir, öneri anındaki oran kayda geçer.
- **Takip ve öğrenme** (`src/lib/liveTracking.ts`): her öneri ilk yapıldığı an (dakika, skor, olasılık, güven) `live:YYYY-MM-DD` anahtarına kaydedilir; maç bitince FotMob'dan maç sonu ve ilk yarı skoru ile gol sırası alınıp ✓/✗ işaretlenir. Öneri türü başına (İY A/Ü, MS A/Ü, KG, Sonuç, Sıradaki gol) gerçek / beklenen isabetten çarpan öğrenilir (`learnLive:v1`, önsel 40, 0.85–1.15) ve sonraki canlı olasılıklara uygulanır.
- **Duruma göre öğrenme** (`learnLiveSit:v1`): her öneri yapıldığı andaki durumla (dakika aralığı, skor farkı, tempo, canlı veri türü, maç öncesi analiz) kaydedilir. Her tür × durum için ayrı karne tutulur; o durumdaki isabet türün genelinden farklıysa ek çarpan uygulanır (önsel 30, her durum ±%10, toplam ±%15). Öğrenme düzeltme öncesi ham model olasılığı (`raw`) üzerinden yapılır. Karne ilk çalışmada son 45 günün kayıtlarından kurulur.

## Maçlar sayfası, geçmiş ve kendini geliştirme

- **Dün / Bugün / Yarın** sekmeleri (Türkiye günü). Her maçın altında tek tercih (`mainPick`, `src/lib/tracking.ts`):
  maç sonucu / gol / ilk yarı / İY-MS pazarlarından, oran ≥ 1.40 ve kazanma olasılığı ≥ %55 olanlar içinde
  belirsizlik düşülmüş beklenen dönüşü en yüksek olan.
- **Kayıt:** başlamamış maçların tercihi `snap:YYYY-MM-DD` anahtarıyla veritabanına (Upstash; yerelde `.data/`) yazılır; maç başlayınca dondurulur.
- **Sonuçlandırma:** Dün/Bugün açıldığında bitmiş maçların skoru ve ilk yarı skoru FotMob'dan alınır, tercih ✓/✗ işaretlenir.
- **Öğrenme:** tercih türü başına gerçek isabet ve beklenen isabet biriktirilir (`learn:v1`). Olasılık çarpanı
  (isabet + 40) / (beklenen + 40), 0.85–1.15 arası; tüm seçeneklere uygulanır, getiri ve etiketler yeniden hesaplanır.
  Kayıt sitenin açıldığı günlerden itibaren birikir; veritabanı yoksa bu özellikler kapalıdır.

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

## Oran analizi (/oran-analizi)

Yaklaşan her maçın iddaa maç sonucu oranları, Football-Data arşivindeki (20 lig × son 3 sezon, ~17.000 maç) aynı oranlarla oynanmış maçlarla karşılaştırılır (`src/lib/history.ts`).
- Karşılaştırma marjı atılmış (adil) olasılıklarla yapılır; hassasiyet ±2 / ±3.5 / ±5 puan.
- **Tüm oranlar** (`src/lib/oddsMatch.ts`): iddaa'daki her seçenek (MS, çifte şans, alt/üst çizgileri, ev/dep alt/üst, KG, sonuç+alt/üst, alt/üst+KG, gol aralığı, İY, İY alt/üst, İY/MS) ayrı ayrı eşleştirilir. Geçmişte yalnız 1X2 ve Alt/Üst 2.5 oranları kayıtlı olduğundan, diğer pazarların geçmişteki adil olasılığı o maçın oranlarına oturtulan Poisson gol beklentisinden türetilir. Bugünkü seçeneğin marjsız olasılığına yakın geçmiş maçlarda seçeneğin gerçekte kaç kez kazandığı sayılır. Korner/kart için geçmiş oran olmadığından desteklenmez.
- Doğrulama: 40 maçın 1.791 seçeneğinde geçmiş kazanma oranı ile adil olasılık arasındaki ortalama fark 1.1 puan.
- Her seçenek için geçmişte kazanma oranı, bugünkü iddaa oranı ve "geçmişe göre getiri" (oran × kazanma oranı − 1); satır açılınca en yakın 10 geçmiş maç.
- Eşleşen geçmiş maçlar tarih, lig, skor, oranlar ve kazanan tercihle listelenir.
- Geçmiş oranlar piyasa ortalamasıdır; iddaa'nın geçmiş oranları arşivde yok.

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

## 100 TL ile kâr/zarar panosu

Maçlar, Oranlar ve Canlı sayfalarının en üstünde: her tahmine 100 TL yatırılsaydı **Bugün**, **Dün** ve **Başından beri** paylaşılan tahmin, sonuçlanan, tutan, yatırılan, dönen ve kâr/zarar (`src/lib/pnl.ts`, `src/components/ProfitBoard.tsx`).
- Maçlar: her maçın tek tercihi (`snap:` kaydındaki `pick`).
- Oranlar: Oran analizi sayfasının tercihi; sayfa açıldığında başlamamış maçlar için `snap:` kaydına `oddsPick` olarak eklenir, maç bitince `result.oddsWon` işaretlenir.
- Canlı: kaydedilen canlı öneriler; iddaa canlı oranı olmayanlar kâr hesabına katılmaz (sayısı ayrıca yazılır).
- Başından beri toplam `pnl:v1` anahtarında gün gün tutulur; her sonuçlandırmada güncellenir, ilk çalışmada son 60 günün kayıtlarından kurulur.


## Telegram kanalı (canlı tercihler)

Canlı bölümünde güveni **%70 ve üstü** ve **iddaa canlı oranı 1.45 ve üstü** olan yeni bir öneri çıkınca (oranı bulunamayan öneriler paylaşılmaz) görsel kart (`src/lib/telegram.ts`, `next/og` ile PNG) hazırlanıp Telegram kanalına gönderilir. Her maç + öneri bir kez gönderilir (`tg:` anahtarı); gönderim başarısız olursa sonraki yenilemede tekrar denenir.

Vercel → Settings → Environment Variables:
- `TELEGRAM_BOT_TOKEN` — BotFather'dan alınan bot anahtarı (gizli)
- `TELEGRAM_CHAT_ID` — kanal adı (`@kanaladi`) ya da sayısal kimlik; bot kanala yönetici olarak eklenmeli
- `TELEGRAM_MIN_CONF` — isteğe bağlı eşik (varsayılan 70)
- `TELEGRAM_COOLDOWN_MIN` — iki paylaşım arası en az süre, dakika (varsayılan 30). Bekleme bitince uygun öneriler arasından olasılık × güveni en yüksek olan tek öneri gönderilir.

`/kurulum` sayfası bot ve kanal erişimini denetler; giriş yaptıktan sonra `/api/telegram/test` kanala deneme kartı gönderir. Yazı tipi: Inter (`assets/fonts`, SIL OFL 1.1).

## Admin paneli (`/admin`)

Vercel'de `ADMIN_EMAILS` (virgülle ayrılmış e-postalar) tanımlı kullanıcılar görür; üst çubukta ⚙︎ düğmesi çıkar.
- **Telegram paylaşımı:** durdur / başlat (`tg:enabled`). Durdurulunca Canlı sekmesi açılsa bile kanala gönderilmez.
- **Kanal istatistiği:** kanalda paylaşılan canlı tahminlerin (`tg:shared:v1`) Bugün / Dün / Son 7 gün / Tümü karnesi: tutan/sonuçlanan, isabet, tutanların ortalama oranı, 100 TL ile kâr/zarar ve son 10 sonuç. Görsel önizlenir (`/api/admin/stats-image`), düğmeyle kanala gönderilir.
- `/api/telegram/test` admin tanımlıysa yalnız admin içindir.

## Canlı: yalnız analiz edilen maçlar

Canlı tercih yalnız maç öncesi analizi olan maçlara verilir (`liveData.ts`: `it.pre` yoksa öneri yok). Kayıt, Telegram, kâr/zarar ve öğrenme de yalnız bunlardan yapılır (`analyzedRec`). Geçişte bir kez (`learnLive:analyzedOnly:v1`) eski kayıtlar o günün maç öncesi kayıtlarıyla eşleştirilip işaretlenir; tür ve durum öğrenmesi yalnız analizli kayıtlardan yeniden kurulur.

## Gösterim kuralı ve Seçki

Üç sistemin (Maçlar, Canlı, Oranlar) hesabı ve takibi değişmeden, ekranda yalnız **oran ≥ 1.50 ve sistemin kendi güveni ≥ %60** olan tercihler öne çıkarılır; güveni **%70+** olanlar "Güçlü", %60–69 "Orta" (`src/lib/showRule.ts`). Şartı geçmeyenler her sekmede altta katlanmış bölümde durur. Canlıda gerçek iddaa canlı oranı gerekir.
- Maçlar güveni: maç öncesi modelin güven puanı.
- Canlı güveni: canlı modelin güven puanı.
- Oranlar güveni (`oddsConfidence`): geçmişte aynı oranlı maçlardaki tutma oranının bugünkü adil olasılığı ne kadar kesin aştığı, 50 + 10·z (1–95).
- **Seçki** sekmesi (`/secki`): üç sistemin şartı geçen tercihleri ayrı bölümlerde (Güçlü / Orta), Bugün ve Dün, sonuçlarla.

## Üçlü onay (`/uclu`)

Aynı seçenek için üç sistemin de kendi güveniyle **≥ %65** verdiği tercihler (`src/lib/consensus.ts`). Canlı tercih maç öncesi pazar anahtarına çevrilir (`specKey`: MS Üst/Alt → `ou:`, İY Üst/Alt → `htou:`, KG → `btts:`, MS 1/X/2 → `1x2:`, çifte şans → `dc:`); Maçlar güveni o seçeneğin `BetRow.confidence` değeri, Oranlar güveni aynı seçeneğin geçmiş eşleştirmesinden `oddsConfidence` (en az 150 maç). Canlı sistemi yalnız maç oynanırken güven verdiği için üçlü onay maç sırasında oluşur; `loadLive` her çalışmada hesaplar ve ilk onay anını `uclu:YYYY-MM-DD` anahtarına kaydeder, kesinleşince ✓/✗ işaretlenir. Bugün başlayacak maçlarda Maçlar + Oranlar ≥ %65 olanlar "canlı onayını bekleyenler" bölümünde durur.

## Yapay zeka sekmesi ve "%70 diyorsa %70" kalibrasyonu

`src/lib/calibration.ts`: her sistem (Maçlar, Canlı, Oranlar) için tercihler söylenen olasılığa göre aralıklara bölünür (%50 altı, %50–55 … %90+); aralık başına gerçek isabetten düzeltme çarpanı (K = 30 önsel, 0.80–1.20, aralıklar arası yumuşak ve sıralamayı koruyan) çıkarılır ve yeni tahminlere uygulanır. Öğrenme düzeltme öncesi olasılık (`preBand`) üzerinden yapılır; Maçlar tür öğrenmesi de artık ham model olasılığı (`raw`) üzerinden (düzeltme kendini silmesin). Karne `calib:v1`, en geç 6 saatte bir kayıtlardan (60 gün maç öncesi, 45 gün canlı) arka planda yeniden kurulur.

Gösterim filtreleri artık **kazanma olasılığına** göre: oran ≥ 1.50, olasılık ≥ %60 (≥ %70 Güçlü); Üçlü onay her sistemde olasılık ≥ %65; Telegram olasılık ≥ %70 (`TELEGRAM_MIN_PROB`). Oranlar sisteminin olasılığı: geçmiş tutma oranının kendi sonuçlarıyla düzeltilmiş hali.

`/ai` (üst çubukta 🧠): günlük not (dünün sonuçları, karnede değişen düzeltmeler), her sistemin "dediği ↔ tuttuğu" tablosu, kendini geliştirme önerileri (iyimser/temkinli aralıklar, kötü ligler, veri azlığı; `src/lib/aiInsights.ts`), tür/durum/lig öğrenmeleri. Admin "Karneyi şimdi yeniden hesapla" düğmesi.

## Kapsam ve gösterim (26.11.2026)

- **Yalnız iddaa maçları:** Football-Data ve ClubElo ile eşleşmeyen iddaa bülteni maçları da analiz edilir (`iddaaMatch`, `source: "iddaa"`): 1X2 ve Alt/Üst 2.5 olasılıkları iddaa'nın marjı atılmış oranlarından; belirsizlik payı daha yüksek, "Avantajlı" verilmez, Banko'ya girmez. Lig adı FotMob'dan (yoksa "Diğer ligler"). Günlük kapsam ~20–40'tan ~80+'ya çıktı.
- **Ana tercih (Maçlar):** oran ≥ 1.50 seçenekler içinde kazanma olasılığı en yüksek (`mainPick`). Oranlar tercihi: oran ≥ 1.50, en az 150 benzer maç, geçmiş tutma oranı en yüksek (`bestOddsPick`). Banko en az oran 1.50.
- **Günde en az 10 maç:** `selectShown` — şartı geçenler (Güçlü %70+, Orta %60–69) azsa oranı ≥ 1.50 olanlardan en olasılarla "Aday" olarak tamamlanır (Maçlar ve Oranlar 10, Seçki bölümleri 5).
- **Sayfa düzeni:** "Günün seçkisi" kaldırıldı; kâr/zarar panosu tek satırlık katlanır özet; Canlı'daki öğrenme tabloları AI sekmesine taşındı; maç sayfasında tüm seçenekler katlanır; Bilgi sayfası güncellendi.
- **Hız:** Oran eşleştirmesi maç başına önbellekli ve Oranlar/Üçlü arasında paylaşımlı (`selectionsFor`); ilk hesap olay döngüsünü bloklamadan parça parça, sayfa en fazla ~2 sn bekler.

## Otomatik zamanlayıcı (`/api/cron/tick`)

Kimse siteye bakmasa da öğrenmenin sürmesi için. `CRON_SECRET` (≥ 16 karakter) ile korunur: `https://SITE/api/cron/tick?key=CRON_SECRET` (ya da `Authorization: Bearer`). cron-job.org gibi bir servisle **her 5 dakikada** çağrılır. Hemen `{"ok":true}` döner, iş arka planda (`after`, en çok 60 sn) biter; `?bekle=1` ile sonuç beklenir.
Adımlar: maç öncesi analizleri yeniler ve tercihleri kaydeder · canlı maçları tarar (öneri kaydı, Telegram, üçlü onay) · Oranlar tercihlerini kaydeder · bugün/dün biten maçları sonuçlandırır (maç öncesi, Oranlar, canlı, üçlü) · kalibrasyon karnesini gerekirse yeniler. Son çalışma `cron:last` anahtarında, /kurulum sayfasında görünür (20 dk'dan eskiyse uyarı).
Yük sınırları: yalnız-iddaa maçları 48 saat ileriye kadar analiz edilir; tahmin kaydı 36 saat içindeki maçlar için; Oranlar hesabı dün–yarın arası maçlar için.

## Boyutlara göre öğrenme: yön, lig, oran aralığı, kaynak

Kalibrasyon karnesi (`calib:v1`) her sistem için ayrıca dört boyutta tutulur (`fitDims`): **Yön** (Üst, Alt, İY Üst/Alt, KG Var/Yok, Ev/Beraberlik/Deplasman, Çifte şans…; `segOfKey`, `segOfSpec`), **Lig**, **Oran** aralığı (1.50–1.69, 1.70–1.99, 2.00+), **Kaynak** (Avrupa, ClubElo, iddaa). Her değer için adet, tutan, söylenen ve 1 birimle getiri saklanır. Düzeltme: o değerdeki (tutan + 30)/(söylenen + 30) oranının sistemin genel oranına bölümü, her boyut ±%8, toplam ±%15; aralık düzeltmesinden sonra uygulanır (`makeMapper`). Canlıda oran boyutu kullanılmaz (öneri anında oran henüz eklenmemiş). AI sekmesinde "Alt mı, üst mü?" kartı ve sistem başına boyut karneleri; öneriler `dimSuggestions`.

## Telegram: admin ayarları ve sonuç mesajları

Admin panelinde **Paylaşım ayarları** (`tg:settings`): en az kazanma olasılığı (%), en düşük canlı oran, iki paylaşım arası bekleme (dk) ve sonuç mesajları aç/kapa. Ortam değişkenleri yalnız varsayılan. **Sonuç mesajları** (`postSharedResults`, zamanlayıcıda her 5 dk): kanalda paylaşılan tahmin kesinleşince (maç sırasında ya da sonunda) "✅ KAZANDI / ❌ KAYBETTİ" görsel kart + metin, her tahmin için bir kez (`resultSentAt`); son 24 saatin paylaşımları, bir çalışmada en fazla 3 mesaj; admin panelinde "Bekleyen sonuçları şimdi gönder"; paylaşım durdurulduysa gönderilmez.

## Üçlü sekmesinde arama

`/uclu?ara=1&p=65&s=mac&s=oran&s=canli&o=1.50`: olasılık eşiği (%), sistem kutucukları (Maçlar, Oranlar, Canlı) ve en düşük oran. İşaretlenen **her** sistemin kazanma olasılığı eşiği geçen tercihler listelenir (`searchConsensus`). Canlı işaretliyse oynanan analizli maçlar (canlı olasılık + aynı seçeneğin maç öncesi Maçlar/Oranlar olasılıkları), değilse önümüzdeki 36 saatin başlamamış maçları (tüm seçenekler; Oranlar en az 150 benzer geçmiş maç). Maç öncesi tablolar 5 dk önbellekte, ilk hesap arka planda. Otomatik kayıt (üç sistem %65+) ayrıca sürer.

## Telegram: maç önü paylaşımı

`src/lib/tgPre.ts`: Maçlar sisteminin ana tercihi, maça en çok N saat kala (varsayılan 6), kazanma olasılığı ≥ eşik (varsayılan %65) ve oran ≥ en düşük oran (1.50) ise görsel kartla kanala gider (her maç bir kez, kendi bekleme süresi). Maç bitince paylaşılan tercih anahtarıyla sonuç değerlendirilir ve "kazandı / kaybetti" kartı gönderilir (`postPrematchResults`, çalışma başına en fazla 3). Admin, başlamamış her maçın sayfasında "Kanalda paylaş" düğmesiyle eşik ve bekleme süresine bakmadan elle paylaşabilir (`sharePrematchNow`). Kayıt `tg:preShared:v1`. Zamanlayıcıda her 5 dk çalışır. Admin panelinde ayrı ayarlar (aç/kapa, olasılık, oran, bekleme, kaç saat kala, sonuçlar) ve kanal istatistiğinde Canlı / Maç önü seçimi. Yazı tipleri tüm sunucu fonksiyonlarına dahil (`next.config.mjs`), böylece zamanlayıcıdan giden kartlar da çizilir.

Canlı sekmesinde admin her canlı tercihin yanındaki 📤 düğmesiyle eşik ve bekleme süresine bakmadan elle paylaşabilir (`shareLiveNow`; şartı geçen tercih yoksa sistemin kendi önerileri gösterilir). Aynı tercih bir kez; sonucu otomatik gider.

