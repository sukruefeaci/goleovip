import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Kullanıcı deposu.
 *  - Upstash Redis (Vercel Marketplace → Upstash, ücretsiz): KV_REST_API_URL/TOKEN veya UPSTASH_REDIS_REST_URL/TOKEN
 *  - Yoksa ve geliştirme ortamındaysa (veya AUTH_FILE_STORE=1 ise): .data/store.json (yerel dosya)
 *  - Üretimde ikisi de yoksa: null (kayıt/giriş yapılamaz, sayfa nasıl kurulacağını söyler)
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  setNX(key: string, value: string): Promise<boolean>;
  incr(key: string, ttlSec: number): Promise<number>;
  reset(key: string): Promise<void>;
  /** Önekle başlayan anahtarlar (az sayıda anahtar için; bakım işlerinde kullanılır) */
  keys(prefix: string): Promise<string[]>;
}

/**
 * Upstash bağlantı bilgileri. Vercel entegrasyonu isimlere bir ön ek koyar (varsayılan KV_, ya da
 * kurulumda yazılan ön ek: STORAGE_KV_REST_API_URL, GOLEO_REST_API_URL …); hepsi kabul edilir.
 */
export function upstashCredentials(): { url: string; token: string } | null {
  const env = process.env;
  const direct = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  for (const [u, t] of direct) if (env[u] && env[t]) return { url: env[u]!, token: env[t]! };
  for (const name of Object.keys(env)) {
    const m = name.match(/^(.*)_REST_API_URL$/) ?? name.match(/^(.*)_REDIS_REST_URL$/);
    if (!m) continue;
    const token = env[`${m[1]}_REST_API_TOKEN`] ?? env[`${m[1]}_REDIS_REST_TOKEN`];
    if (env[name] && token) return { url: env[name]!, token };
  }
  return null;
}

function upstash(): KV | null {
  const creds = upstashCredentials();
  if (!creds) return null;
  const { url, token } = creds;
  if (!url || !token) return null;
  const cmd = async (...args: (string | number)[]) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || json.error) throw new Error(`Veritabanı hatası: ${json.error ?? res.status}`);
    return json.result;
  };
  return {
    get: async (k) => ((await cmd("GET", k)) as string | null) ?? null,
    set: async (k, v) => {
      await cmd("SET", k, v);
    },
    setNX: async (k, v) => (await cmd("SET", k, v, "NX")) === "OK",
    incr: async (k, ttl) => {
      const n = (await cmd("INCR", k)) as number;
      if (n === 1) await cmd("EXPIRE", k, ttl);
      return n;
    },
    reset: async (k) => {
      await cmd("DEL", k);
    },
    keys: async (prefix) => {
      const out: string[] = [];
      let cursor = "0";
      for (let i = 0; i < 50; i++) {
        const [next, batch] = (await cmd("SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 500)) as [string, string[]];
        out.push(...batch);
        cursor = String(next);
        if (cursor === "0") break;
      }
      return [...new Set(out)];
    },
  };
}

function fileStore(): KV {
  const file = path.join(process.cwd(), ".data", "store.json");
  const counters = new Map<string, { n: number; until: number }>();
  const load = async (): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      return {};
    }
  };
  const save = async (d: Record<string, string>) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(d, null, 1));
  };
  return {
    get: async (k) => (await load())[k] ?? null,
    set: async (k, v) => {
      const d = await load();
      d[k] = v;
      await save(d);
    },
    setNX: async (k, v) => {
      const d = await load();
      if (k in d) return false;
      d[k] = v;
      await save(d);
      return true;
    },
    incr: async (k, ttl) => {
      const now = Date.now();
      const c = counters.get(k);
      const next = c && c.until > now ? { n: c.n + 1, until: c.until } : { n: 1, until: now + ttl * 1000 };
      counters.set(k, next);
      return next.n;
    },
    reset: async (k) => {
      counters.set(k, { n: 0, until: 0 });
      const d = await load();
      if (k in d) {
        delete d[k];
        await save(d);
      }
    },
    keys: async (prefix) => Object.keys(await load()).filter((k) => k.startsWith(prefix)),
  };
}

export function getStore(): KV | null {
  const allowFile = process.env.NODE_ENV !== "production" || process.env.AUTH_FILE_STORE === "1";
  return upstash() ?? (allowFile ? fileStore() : null);
}

const userKey = (email: string) => `user:${email.trim().toLowerCase()}`;

export async function findUser(email: string): Promise<UserRecord | null> {
  const store = getStore();
  if (!store) return null;
  const raw = await store.get(userKey(email));
  return raw ? (JSON.parse(raw) as UserRecord) : null;
}

/** false: e-posta zaten kayıtlı */
export async function createUser(u: UserRecord): Promise<boolean> {
  const store = getStore();
  if (!store) throw new Error("Veritabanı ayarlanmamış");
  return store.setNX(userKey(u.email), JSON.stringify(u));
}

/** Genel JSON okuma/yazma (tahmin kayıtları, öğrenme istatistikleri) */
export async function getJSON<T>(key: string): Promise<T | null> {
  const store = getStore();
  if (!store) return null;
  const raw = await store.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setJSON(key: string, value: unknown): Promise<boolean> {
  const store = getStore();
  if (!store) return false;
  await store.set(key, JSON.stringify(value));
  return true;
}
