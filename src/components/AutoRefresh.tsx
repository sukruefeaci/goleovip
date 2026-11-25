"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Sayfa görünürken her `seconds` saniyede sunucudan yeniler */
export default function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setLeft((s) => {
        if (s <= 1) {
          router.refresh();
          return seconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <span className="muted small">{left} sn sonra yenilenecek</span>;
}
