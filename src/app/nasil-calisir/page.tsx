export default function HowItWorks() {
  return (
    <div className="prose">
      <h2>Nasıl çalışır?</h2>
      <ol>
        <li>
          <b>Avrupa piyasası:</b> Pinnacle gibi düşük marjlı şirketlerin 1X2 ve Alt/Üst 2.5 oranlarından marj atılarak
          adil olasılık bulunur.
        </li>
        <li>
          <b>Piyasa λ:</b> Bu olasılıklara en iyi uyan Poisson gol beklentileri (ev λ, deplasman λ) ızgara aramasıyla
          hesaplanır.
        </li>
        <li>
          <b>İstatistik λ:</b> Son 10 maçın attığı/yediği goller, ev avantajı ve eksik hücum/defans oyuncuları ile ikinci
          bir λ tahmini yapılır.
        </li>
        <li>
          <b>Harman:</b> Olasılıklar %70 piyasa + %30 istatistik olarak birleştirilir. İki model ne kadar ayrışırsa
          belirsizlik (±) o kadar büyür.
        </li>
        <li>
          <b>Skor matrisi:</b> λ değerlerinden her skorun olasılığı çıkar; Alt/Üst, Karşılıklı Gol, İlk Yarı, Maç Sonucu
          + Alt/Üst gibi tüm seçenekler buradan hesaplanır. Korner ve kart ayrı Poisson modelleriyle.
        </li>
        <li>
          <b>Değerlendirme:</b> Getiri = tahmin × oran − 1. Temkinli getiri belirsizliğin kötü ucundan hesaplanır.
        </li>
      </ol>
      <p className="muted">
        Not: iddaa marjı genellikle %15 civarında, Avrupa piyasası %3–6. Bu fark yüzünden seçeneklerin büyük çoğunluğu
        dezavantajlı çıkar — bu bir hata değil, aracın asıl gösterdiği şeydir. Bu prototip sahte veriyle çalışır; kazanç
        garantisi vermez.
      </p>
    </div>
  );
}
