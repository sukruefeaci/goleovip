"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, type BetRow, type Category } from "@/lib/types";
import { pct, signedPct } from "@/lib/format";

type SortKey = "market" | "odd" | "required" | "prob" | "ev" | "evConservative";

const MIN_ODDS: (number | null)[] = [null, 1.4, 1.5, 1.8, 2.0, 3.0];

interface Props {
  rows: BetRow[];
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  fileName: string;
}

function EvBar({ ev }: { ev: number }) {
  const w = Math.min(30, Math.abs(ev) * 100);
  return (
    <div className="evbar">
      <i
        style={{
          left: ev >= 0 ? "50%" : `${50 - w}%`,
          width: `${w}%`,
          background: ev >= 0 ? "var(--green)" : "#b91c1c",
        }}
      />
    </div>
  );
}

export default function BetTable({ rows, homeName, awayName, homeShort, awayShort, fileName }: Props) {
  const [minOdd, setMinOdd] = useState<number | null>(1.4);
  const [showBad, setShowBad] = useState(true);
  const [onlyGood, setOnlyGood] = useState(false);
  const [cat, setCat] = useState<Category | "Tümü">("Tümü");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "evConservative", dir: -1 });
  const [help, setHelp] = useState(false);
  const [showDep, setShowDep] = useState(false);

  const base = useMemo(
    () =>
      rows.filter(
        (r) =>
          (minOdd === null || r.odd >= minOdd) &&
          (showBad || r.rating !== "Dezavantajlı") &&
          (!onlyGood || r.rating === "Avantajlı"),
      ),
    [rows, minOdd, showBad, onlyGood],
  );
  const badCount = rows.filter((r) => (minOdd === null || r.odd >= minOdd) && r.rating === "Dezavantajlı").length;
  const goodCount = rows.filter((r) => (minOdd === null || r.odd >= minOdd) && r.rating === "Avantajlı").length;

  const shown = useMemo(() => {
    const list = base.filter((r) => cat === "Tümü" || r.category === cat);
    const v = (r: BetRow) => (sort.key === "market" ? `${r.market} ${r.selection}` : r[sort.key]);
    return [...list].sort((a, b) => {
      const x = v(a),
        y = v(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [base, cat, sort]);

  // Korelasyon uyarısı: artı getirili seçeneklerden aynı tarafın galibiyetine bağlı olanlar
  const positive = base.filter((r) => r.ev > 0);
  const depHome = positive.filter((r) => r.dependsOn === "home");
  const depAway = positive.filter((r) => r.dependsOn === "away");
  const dep = depHome.length >= depAway.length ? { side: homeShort, list: depHome } : { side: awayShort, list: depAway };

  const th = (key: SortKey, label: string) => (
    <th
      className={sort.key === key ? "sorted" : ""}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}
    >
      {label} {sort.key === key ? (sort.dir === -1 ? "▼" : "▲") : "↕"}
    </th>
  );

  function downloadCsv() {
    const head = ["Kategori", "Bahis", "Seçim", "Oran", "Gereken", "Tahmin", "Sigma", "Getiri", "Temkinli getiri", "Avantaj ihtimali", "Değerlendirme", "Dayanak"];
    const lines = shown.map((r) =>
      [r.category, r.market, r.selection, r.odd, r.required.toFixed(4), r.prob.toFixed(4), r.sigma.toFixed(4), r.ev.toFixed(4), r.evConservative.toFixed(4), r.edgeChance.toFixed(3), r.rating, r.basis]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel table-panel">
      <div className="filters">
        <span className="muted">Min. oran</span>
        <div className="seg">
          {MIN_ODDS.map((m) => (
            <button key={String(m)} className={minOdd === m ? "on" : ""} onClick={() => setMinOdd(m)}>
              {m === null ? "Sınırsız" : m.toFixed(2)}
            </button>
          ))}
        </div>
        <input
          className="num"
          type="number"
          step="0.05"
          min="1"
          value={minOdd ?? ""}
          placeholder="—"
          onChange={(e) => setMinOdd(e.target.value ? Number(e.target.value) : null)}
        />
        <label>
          <input type="checkbox" checked={showBad} onChange={(e) => setShowBad(e.target.checked)} /> Dezavantajlıları da göster{" "}
          <span className="muted">({badCount})</span>
        </label>
        <label>
          <input type="checkbox" checked={onlyGood} onChange={(e) => setOnlyGood(e.target.checked)} /> Yalnız avantajlı{" "}
          <span className="muted">({goodCount})</span>
        </label>
        <button className="btn" onClick={() => setHelp((h) => !h)}>
          ⓘ Sütunlar ne anlama geliyor?
        </button>
        <button className="btn primary" onClick={downloadCsv} style={{ marginLeft: "auto" }}>
          ⭳ CSV indir
        </button>
      </div>

      {help && (
        <div className="help">
          <b>Oran:</b> iddaa oranı. <b>Gereken:</b> bu oranın başa baş noktası (1/oran). <b>Tahmin:</b> modelin olasılığı
          (Avrupa piyasasından çıkarılan λ ile son maç istatistiklerinin harmanı); ± belirsizlik payıdır.{" "}
          <b>Getiri:</b> beklenen değer = tahmin × oran − 1. <b>Temkinli getiri:</b> tahminin kötümser ucu (tahmin − ±) ile
          hesaplanan getiri; ayrıca gerçek olasılığın gerekeni aşma ihtimali (avantaj ihtimali). <b>Değerlendirme:</b>{" "}
          temkinli getiri &gt; 0 ise Avantajlı, yalnız getiri &gt; 0 ise Sınırda, aksi halde Dezavantajlı. Bu bir tahmin
          aracıdır; kazanç garantisi vermez.
        </div>
      )}

      <div className="tabs">
        {(["Tümü", ...CATEGORIES] as const).map((c) => (
          <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
            {c}
            <small>{c === "Tümü" ? base.length : base.filter((r) => r.category === c).length}</small>
          </button>
        ))}
      </div>

      {dep.list.length >= 2 && (
        <>
          <div className="dep">
            <span>
              ⚠ Bu <b>{dep.list.length}</b> artı getirili seçenek <b>{dep.side} galibiyetine</b> bağlı — birlikte oynamak riski
              çeşitlendirmez.
            </span>
            <button className="btn" onClick={() => setShowDep((s) => !s)}>
              {showDep ? "Gizle" : "Göster"}
            </button>
          </div>
          {showDep && (
            <div className="help">
              {dep.list.map((r) => (
                <div key={r.key}>
                  {r.market}: {r.selection} @{r.odd.toFixed(2)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {th("market", "Bahis")}
              {th("odd", "Oran")}
              {th("required", "Gereken")}
              {th("prob", "Tahmin")}
              {th("ev", "Getiri")}
              {th("evConservative", "Temkinli getiri")}
              <th>Dayanak</th>
              <th>Değerlendirme</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                <td>
                  <b>
                    {r.market}: {r.selection}
                  </b>
                  <span className="sub">{r.category}</span>
                </td>
                <td className="odd">{r.odd.toFixed(2)}</td>
                <td className="muted">{pct(r.required)}</td>
                <td>
                  <b>{pct(r.prob)}</b>
                  <span className="sub">±{(r.sigma * 100).toFixed(1)}</span>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <EvBar ev={r.ev} />
                    <span className={r.ev >= 0 ? "pos" : "neg"}>{signedPct(r.ev)}</span>
                  </div>
                </td>
                <td>
                  <span className={r.evConservative >= 0 ? "pos" : "neg"}>{signedPct(r.evConservative)}</span>
                  <span className="sub">avantaj iht. {pct(r.edgeChance, 0)}</span>
                </td>
                <td className="basis">{r.basis}</td>
                <td>
                  <span className={`rating ${r.rating}`}>
                    {r.rating === "Avantajlı" ? "✓ " : r.rating === "Sınırda" ? "~ " : "✕ "}
                    {r.rating}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Bu filtrelerle seçenek yok.</div>}
      </div>
      <div className="muted small" style={{ padding: "10px 16px" }}>
        {homeName} – {awayName} · {rows.length} seçenek değerlendirildi
      </div>
    </section>
  );
}
