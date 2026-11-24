# Veri kaynağı araştırması (24 Kasım 2026)

GitHub repo aramasıyla bulundu; yıldız sayıları ve tarihler arama anındaki değerlerdir.
Repo içerikleri henüz incelenmedi — kullanmadan önce kod ve lisans kontrol edilmeli.

## 1. Avrupa piyasası oranları (Pinnacle / çoklu şirket)

| Kaynak | Ne verir | Not |
|---|---|---|
| **The Odds API** (`the-odds-api/samples-nodejs`, `samples-python`) | 40+ şirketin 1X2, alt/üst oranı; Pinnacle dahil | Resmi örnek kodlar. Ücretsiz katman aylık sınırlı istek. **İlk tercih.** |
| `Pinnodds/pinnodds-sdk` (46★, Python+Node) | Gerçek zamanlı Pinnacle oranları | Ücretli servis SDK'sı |
| `Mg30/odds-portal-scraper` (Node, Playwright) | OddsPortal'dan güncel ve geçmiş oranlar | Kazıyıcı; site koşullarına dikkat |
| `S1M0N38/soccerapi` (182★) | Birkaç şirketten oran kazıyıcı | 2022'den beri güncellenmiyor |

## 2. İstatistik (form, son maçlar, korner, kart, sakatlar, puan durumu)

| Kaynak | Ne verir | Not |
|---|---|---|
| **API-Football** (api-sports.io) | Fikstür, puan durumu, sakat/cezalı, maç istatistiği, korner/kart | Ücretsiz katman günlük 100 istek. Süper Lig dahil. **İlk tercih.** |
| `probberechts/soccerdata` (2149★, Python, aktif) | FBref, Understat (xG), Sofascore, ClubElo, Football-Data.co.uk | Python; ayrı bir veri toplama servisi olarak çalıştırılabilir |
| `manucabral/EasySoccerData` (53★, Python) | Sofascore, FotMob vb. canlı skor, istatistik, puan durumu | |
| `tunjayoff/sofascore_scraper` (54★) | Kendi sunucunda Sofascore veri platformu | |
| `pseudo-r/Public-FotMob-API`, `maxencelobry/fotmob` (JS) | FotMob resmi olmayan uç noktaları | Resmi olmayan; değişebilir |
| `felipeall/transfermarkt-api` (473★) | Kadro, sakat, piyasa değeri | |
| football-data.org | Fikstür, puan durumu (ücretsiz katmanda 12 lig) | Süper Lig ücretsiz katmanda yok |

## 3. iddaa / Nesine oranları

| Kaynak | Not |
|---|---|
| `ozgurozansen/LaAlbiceleste2026` | Nesine maç öncesi bülten API'sini proxy'leyip ayrıştırıyor |
| `AnlasEkonomi/Iddaa` (28★, Python) | iddaa verisi |
| `alibingul-dev/iddaa-scanner` | "iddaa oran ve marj tarayıcısı — saatlik" (çok yeni) |
| `mertkahyaoglu/iddaa-oran`, `boardsofcanada/mackolik` | Eski (2017–2019), muhtemelen çalışmıyor |

iddaa için resmi, herkese açık bir API yok. Bu repolar sitelerin iç uç noktalarını kullanıyor ve
kullanım koşullarına takılabilir. Prototipte önce **elle giriş / CSV yükleme** ile başlanması önerilir.

## 4. Geriye dönük test (İsabet sayfası için)

- **Football-Data.co.uk** CSV'leri: geçmiş sezon sonuçları + Pinnacle kapanış oranları (Türkiye dahil). Ücretsiz.
- `openfootball/football.json`: açık lisanslı sonuçlar.

## Önerilen ilk kurulum

1. `providers/theOddsApi.ts`: Avrupa 1X2 + alt/üst (anahtar: `ODDS_API_KEY`)
2. `providers/apiFootball.ts`: form, son 10 maç, korner/kart, sakatlar (anahtar: `API_FOOTBALL_KEY`)
3. iddaa oranları: elle giriş / CSV yükleme ekranı
4. Önbellek + zaman damgası (kaynak hata verirse son veriyi göster)
