/**
 * AunuCore youtube gift (phase test #3) — Tenor service worker
 * ============================================================
 * Satu-satunya bagian ekstensi yang bicara ke Tenor, meniru pola
 * yang dipakai ekstensi desktop_gifs (rayytor):
 *
 * - Pengguna TIDAK mengisi API key. Key diambil dari halaman
 *   tenor.com sendiri: setiap halaman Tenor menyematkan key untuk
 *   script situsnya (API_V2_KEY + API_V2_CLIENT_KEY) di elemen
 *   <script id="data" type="text/x-cache"> (JSON ter-base64).
 * - Key disimpan (chrome.storage.local / memori) agar pencarian
 *   tetap jalan tanpa mengambil tenor.com setiap kali.
 * - Pencarian memakai API resmi tenor.googleapis.com/v2 dengan
 *   contentfilter=high (rating G — satu-satunya yang diterima
 *   YouTube) dan media_filter=tinygif,tinywebp,gif.
 * - Key simpanan yang ditolak API (400/401/403) dibuang, key segar
 *   diambil ulang dari tenor.com, panggilan diulang sekali.
 * - Bila API tetap gagal, fallback ke data hasil yang disematkan
 *   Tenor di halamannya sendiri (<script id="store-cache">).
 *
 * Risiko yang diterima sadar (keputusan Aunu, 21 Okt 2026): jalur
 * ini bergantung pada format halaman tenor.com; bila Tenor mengubah
 * formatnya, fallback & pesan error di picker yang menanggungnya.
 * ============================================================
 */

export const TENOR_ORIGIN = "https://tenor.com";
export const TENOR_API_BASE = "https://tenor.googleapis.com/v2";
export const MAX_RESULTS = 24;

// ---------------------------------------------------------------------------
// Storage (chrome.storage.local di browser; memori untuk test/fallback)
// ---------------------------------------------------------------------------

export function createMemoryStorage() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? { [key]: map.get(key) } : {}; },
    async set(obj) { for (const [k, v] of Object.entries(obj)) map.set(k, v); },
    async remove(key) { map.delete(key); },
  };
}

const memoryStorage = createMemoryStorage();

export function defaultStorage() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) return chrome.storage.local;
  } catch { /* bukan konteks ekstensi */ }
  return memoryStorage;
}

// ---------------------------------------------------------------------------
// Parsing halaman tenor.com (murni — teruji)
// ---------------------------------------------------------------------------

export function readKeysFromHtml(html) {
  const m = String(html ?? "").match(/<script id="data" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const data = JSON.parse(atob(m[1].trim()));
    if (typeof data.API_V2_KEY === "string" && typeof data.API_V2_CLIENT_KEY === "string") {
      return { key: data.API_V2_KEY, client_key: data.API_V2_CLIENT_KEY };
    }
  } catch { /* format berubah / bukan JSON */ }
  return null;
}

export function extractStoreCache(html) {
  const m = String(html ?? "").match(/<script id="store-cache" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Normalisasi hasil (bentuk sama dengan yang dipakai picker)
// ---------------------------------------------------------------------------

export const ratedG = (r) => typeof r?.content_rating !== "string" || r.content_rating === "G";

export function toGif(item) {
  if (!item || !/^\d{1,20}$/.test(String(item.id)) || !item.media_formats) return null;
  const flags = item.flags || [];
  if (flags.includes("sticker") || flags.includes("static")) return null;
  const formats = item.media_formats;
  const full = formats.gif;
  const preview = formats.tinygif || formats.tinywebp || formats.gif;
  if (!preview?.url) return null;
  const dims = Array.isArray(preview.dims) ? preview.dims : [];
  return {
    id: String(item.id),
    title: String(item.title ?? item.content_description ?? item.h1_title ?? "GIF").slice(0, 200),
    gifUrl: full?.url ?? preview.url,
    previewUrl: preview.url,
    width: dims[0] ?? null,
    height: dims[1] ?? null,
    source: "tenor",
    contentRating: typeof item.content_rating === "string" ? item.content_rating : null,
  };
}

export const toGifs = (results) => (Array.isArray(results) ? results : []).map(toGif).filter(Boolean).slice(0, MAX_RESULTS);

// ---------------------------------------------------------------------------
// Tenor client (fetch + storage di-inject agar bisa dites)
// ---------------------------------------------------------------------------

export function createTenorClient({ fetchImpl, storage } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const store = storage ?? defaultStorage();
  if (typeof doFetch !== "function") throw new Error("fetch tidak tersedia");

  async function storedKeys() {
    try {
      const { tenorKeys } = await store.get("tenorKeys");
      if (tenorKeys && typeof tenorKeys.key === "string" && typeof tenorKeys.client_key === "string") return tenorKeys;
    } catch { /* abaikan: ambil dari tenor.com */ }
    return null;
  }

  async function fetchPage(url) {
    const res = await doFetch(url, { credentials: "omit", redirect: "follow" });
    if (!res?.ok) throw new Error(`Tenor returned HTTP ${res?.status ?? "?"}`);
    const html = await res.text();
    const keys = readKeysFromHtml(html);
    if (keys) { try { await store.set({ tenorKeys: keys }); } catch { /* non-fatal */ } }
    return { store: extractStoreCache(html), keys };
  }

  async function callApi(keys, path, params = {}) {
    const query = new URLSearchParams({
      key: keys.key,
      client_key: keys.client_key,
      contentfilter: "high",
      media_filter: "tinygif,tinywebp,gif",
      limit: String(MAX_RESULTS),
      ...params,
    });
    const res = await doFetch(`${TENOR_API_BASE}${path}?${query.toString()}`, { credentials: "omit" });
    if (!res?.ok) {
      const err = new Error(`Tenor API returned HTTP ${res?.status ?? "?"}`);
      err.badKey = [400, 401, 403].includes(res?.status);
      throw err;
    }
    const json = await res.json();
    if (!Array.isArray(json?.results)) throw new Error("Tenor API sent an unreadable answer");
    return json.results;
  }

  async function fetchApi(path, params) {
    const stored = await storedKeys();
    if (stored) {
      try { return await callApi(stored, path, params); }
      catch (err) {
        if (!err.badKey) throw err;
        try { await store.remove("tenorKeys"); } catch { /* abaikan */ }
      }
    }
    const { keys } = await fetchPage(`${TENOR_ORIGIN}/`);
    if (!keys) throw new Error("Tenor changed its page format; keys are unavailable");
    return callApi(keys, path, params);
  }

  async function featured() {
    try {
      return toGifs((await fetchApi("/featured", {})).filter(ratedG));
    } catch { /* fallback ke data halaman */ }
    const { store: page } = await fetchPage(`${TENOR_ORIGIN}/`);
    return toGifs(page?.gifs?.featured?.results);
  }

  async function search(q) {
    const query = String(q ?? "").trim();
    if (!query) return featured();
    try {
      return toGifs((await fetchApi("/search", { q: query })).filter(ratedG));
    } catch { /* fallback ke data halaman pencarian */ }
    const slug = query.toLowerCase().split(/\s+/).filter(Boolean).map(encodeURIComponent).join("-");
    const { store: page } = await fetchPage(`${TENOR_ORIGIN}/search/${slug}-gifs`);
    const searches = Object.values(page?.universal?.search ?? {});
    return toGifs(searches[0]?.results);
  }

  return { featured, search, fetchApi, fetchPage, callApi };
}

// ---------------------------------------------------------------------------
// Protokol pesan: content-bridge -> service worker -> picker
// ---------------------------------------------------------------------------

export async function handleTenorMessage(msg, client) {
  if (!msg || typeof msg !== "object") throw new Error("Bad request");
  if (msg.type === "aunucore:featured") return client.featured();
  if (msg.type === "aunucore:search") return client.search(msg.query ?? "");
  throw new Error(`Unknown message type: ${String(msg.type)}`);
}

// Wiring browser (tidak jalan di Node test).
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  const client = createTenorClient({});
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("aunucore:")) return false;
    if (sender.id !== chrome.runtime.id) return false;
    handleTenorMessage(msg, client).then(
      (gifs) => sendResponse({ ok: true, gifs }),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
    );
    return true;
  });
}
