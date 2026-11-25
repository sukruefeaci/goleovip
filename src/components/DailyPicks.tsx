import Link from "next/link";
import type { Daily } from "@/lib/daily";
import { kickoffParts, signedPct } from "@/lib/format";
import { confLevel, winLevel } from "./WinConfidence";

export default function DailyPicks({ daily }: { daily: Daily }) {
  const total = daily.slots.reduce((n, s) => n + s.picks.length, 0);
  const dayName = new Date(`${daily.date}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

  return (
    <section className="card pad daily">
      <div className="daily-head">
        <div>
          <h2>Günün seçkisi</h2>
          <span className="muted small">
            {daily.isToday ? "Bugün" : "Yarın"} · {dayName} · 13:00–18:59 arası, her saatten en iyi 2 maç
          </span>
        </div>
        <span className="chip">{total} maç</span>
      </div>

      <div className="daily-slots">
        {daily.slots.map((slot) => (
          <div key={slot.hour} className="slot">
            <div className="slot-hour">{String(slot.hour).padStart(2, "0")}:00</div>
            <div className="slot-picks">
              {slot.picks.length === 0 && <div className="slot-empty muted small">Bu saatte başlayan uygun maç yok</div>}
              {slot.picks.map(({ analysis: a, row: r }) => {
                const k = kickoffParts(a.match.kickoff);
                const wl = winLevel(r.prob);
                const cl = confLevel(r.confidence);
                return (
                  <Link key={a.match.id} href={`/mac/${a.match.id}`} className="dp">
                    <div className="dp-top">
                      <span className="dp-time">{k.time}</span>
                      <span className="chip">{a.match.league}</span>
                    </div>
                    <div className="dp-match">
                      {a.match.home.name} <span className="vs">vs</span> {a.match.away.name}
                    </div>
                    <div className="dp-pick">
                      <span className="muted">{r.market}:</span> <b>{r.selection}</b> <span className="oddpill">{r.odd.toFixed(2)}</span>
                    </div>
                    <div className="dp-stats">
                      <span>
                        Kazanma <b className={wl.cls}>%{(r.prob * 100).toFixed(0)}</b>
                      </span>
                      <span>
                        Güven <b className={cl.cls}>%{r.confidence}</b>
                      </span>
                      <span>
                        Getiri <b className={r.ev >= 0 ? "pos" : "neg"}>{signedPct(r.ev)}</b>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="muted small daily-note">
          Bu saatlerde başlayan maç yok. Hafta içi maçlar genelde akşam oynanır; öğleden sonra maçları çoğunlukla hafta sonu
          (Süper Lig, Premier Lig, Serie A) olur.
        </p>
      )}
    </section>
  );
}
