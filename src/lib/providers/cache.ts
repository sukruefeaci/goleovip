import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * Basit önbellek: bellek + disk (.cache/). Kaynak hata verirse diskteki son veri
 * kullanılır ve bir uyarı döner ("kaynak hata verdi, önbellekteki son veri gösteriliyor").
 */

// Vercel gibi sunucusuz ortamlarda proje klasörü salt okunur; geçici klasör kullanılır
const CACHE_DIR = process.env.CACHE_DIR ?? (process.env.VERCEL ? path.join(tmpdir(), "goleovip-cache") : path.join(process.cwd(), ".cache"));
const memory = new Map<string, { at: number; text: string }>();

export interface Fetched {
  text: string;
  fetchedAt: Date;
  warning?: string;
}

const UA = { "User-Agent": "Mozilla/5.0 (goleovip)", Accept: "*/*" };

function fileFor(name: string) {
  return path.join(CACHE_DIR, name.replace(/[^a-z0-9._-]/gi, "_"));
}

function fmt(d: Date) {
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

export async function cachedFetch(name: string, label: string, url: string, ttlMs: number): Promise<Fetched> {
  const now = Date.now();
  const mem = memory.get(name);
  if (mem && now - mem.at < ttlMs) return { text: mem.text, fetchedAt: new Date(mem.at) };

  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    memory.set(name, { at: now, text });
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(fileFor(name), JSON.stringify({ at: now, text }));
    } catch {
      // disk önbelleği yazılamazsa bellek önbelleğiyle devam
    }
    return { text, fetchedAt: new Date(now) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (mem) return { text: mem.text, fetchedAt: new Date(mem.at), warning: `${label} (${fmt(new Date(mem.at))})` };
    try {
      const disk = JSON.parse(await readFile(fileFor(name), "utf8")) as { at: number; text: string };
      memory.set(name, disk);
      return { text: disk.text, fetchedAt: new Date(disk.at), warning: `${label} (${fmt(new Date(disk.at))})` };
    } catch {
      throw new Error(`${label} alınamadı ve önbellekte yok: ${reason}`);
    }
  }
}
