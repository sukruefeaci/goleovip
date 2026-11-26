export default function HowItWorks() {
  return (
    <div className="prose">
      <h2>Nasıl çalışır?</h2>
      <p>
        Site üç ayrı sistemle tahmin yapar. Her biri kazanma olasılığını kendi yöntemiyle hesaplar ve kendi sonuçlarına bakarak
        düzeltir: <b>%70 diyorsa gerçekte %70 tutsun</b> diye.
      </p>

      <h3>Sekmeler</h3>
      <ul>
        <li>
          <b>⚽ Maçlar:</b> maç öncesi model. Her maç için oranı 1.50 ve üstü seçenekler içinden kazanma olasılığı en yüksek tek tercih.
        </li>
        <li>
          <b>⭐ Seçki:</b> üç sistemin şartı geçen tercihleri, ayrı ayrı.
        </li>
        <li>
          <b>🤝 Üçlü:</b> aynı tercihe üç sistemin de %65+ olasılık verdiği anlar (maç oynanırken oluşur).
        </li>
        <li>
          <b>🔴 Canlı:</b> oynanan maçlarda tempo, skor, kalan süre ve maç öncesi analize göre canlı tercih.
        </li>
        <li>
          <b>📊 Oranlar:</b> geçmişte aynı oranlarla oynanmış binlerce maçta en çok tutan tercih.
        </li>
        <li>
          <b>🎟️ Kupon / 🎯 Banko:</b> yüksek olasılıklı tercihlerden kupon ve günün en sağlam iki tercihi.
        </li>
        <li>
          <b>🧠 Yapay zeka (üst çubuk):</b> sistemlerin ne öğrendiği, ne kadar dürüst olduğu ve kendini geliştirme önerileri.
        </li>
      </ul>

      <h3>Etiketler</h3>
      <ul>
        <li>
          <b>Güçlü:</b> oran 1.50+ ve kazanma olasılığı %70+.
        </li>
        <li>
          <b>Orta:</b> oran 1.50+ ve kazanma olasılığı %60–69.
        </li>
        <li>
          <b>Aday:</b> şartın altında ama o günün en olası tercihleri. Her gün en az 10 maç görünsün diye eklenir.
        </li>
      </ul>

      <h3>Veriler</h3>
      <ul>
        <li>
          <b>Avrupa piyasası</b> (Football-Data): büyük liglerde düşük marjlı oranlar, en güvenilir referans.
        </li>
        <li>
          <b>ClubElo:</b> Avrupa kupaları ve diğer liglerde takım güç puanı.
        </li>
        <li>
          <b>iddaa:</b> tüm bülten; başka referansı olmayan maçlarda iddaa'nın marjı atılmış oranları kullanılır.
        </li>
        <li>
          <b>FotMob:</b> sakat/cezalı oyuncular, canlı istatistik (xG, şut) ve maç sonuçları.
        </li>
      </ul>

      <h3>Model</h3>
      <p>
        Oranlardan marj atılarak adil olasılık bulunur, bunlara uyan gol beklentileri (Poisson) hesaplanır. Takım istatistiği olan
        maçlarda %70 piyasa, %30 istatistik harmanlanır. Tüm seçenekler (Alt/Üst, KG, İlk Yarı, İY/MS…) skor dağılımından çıkar.
        Sonuçlandıkça her sistem tercih türüne, duruma ve olasılık aralığına göre kendini düzeltir.
      </p>
      <p className="muted">
        Önemli: iddaa oranı zaten bir olasılık söyler. Oran 1.50 ise iddaa'ya göre olasılık ~%62 civarıdır. Bu yüzden 1.50 ve üstü
        oranlarda dürüst %70+ olasılık nadirdir; sistem bunu yapay olarak şişirmez. Site bilgi amaçlıdır, kazanç garantisi vermez.
      </p>
    </div>
  );
}
