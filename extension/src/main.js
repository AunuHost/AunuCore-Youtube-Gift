/**
 * AunuCore youtube gift (phase test #3)
 * ============================================================
 * ATURAN PENAMAAN PERCOBAAN:
 * - Setiap percobaan WAJIB ganti nama dengan menaikkan angka di
 *   PHASE_TEST_NUMBER saja. Jangan edit string lain.
 *   #1 -> "AunuCore youtube gift (phase test #1)"
 *   #2 -> "AunuCore youtube gift (phase test #2)"
 *   #3 -> "AunuCore youtube gift (phase test #3)" dst.
 * - BUILD_NAME terbentuk otomatis dari angka itu, dan dipakai di:
 *   console prefix, window.__AUNUCORE_YT_GIFT__, dan log interceptor.
 *   Nama ini TIDAK disuntikkan ke payload YouTube (field asing di
 *   payload berisiko memicu 400 INVALID_ARGUMENT lagi).
 *
 * CATATAN ISSUE #93 (diperbarui di phase test #4):
 * - Sejak 14 Okt 2026, `tenorId` di /comment/create_comment sering
 *   ditolak 400 INVALID_ARGUMENT — tetapi TIDAK selalu: pengukuran
 *   ekstensi referensi desktop_gifs (rayytor), yang source-nya
 *   dipelajari untuk phase ini, menunjukkan penolakan itu tidak
 *   konsisten dan bergantung wilayah koneksi.
 * - Jalur lama phase #1–#3 (buang tenorId + isi
 *   imageAttachment.encryptedBlobId dari upload WebP) DIBUANG:
 *   tidak ada implementasi referensi yang memakainya, dan
 *   encryptedBlobId tidak bisa dibuat/ditebak di client.
 * - Phase #4 memakai jalur yang terbukti: pasang tenorId dari GIF
 *   terpilih, lalu coba ulang request yang ditolak "blocked"
 *   sampai 12x (~30 detik). Request yang ditolak tidak memposting
 *   apa pun, jadi retry tidak bisa memposting dobel.
 * - Semua GIF dari pencarian kita berating G (contentfilter=high
 *   di service worker) — syarat agar retry layak dilakukan.
 * ============================================================
 */

import { initGifPicker, pickerState } from "./picker.js";

// ---------------------------------------------------------------------------
// 1. Identitas build / penamaan percobaan
// ---------------------------------------------------------------------------

export const PHASE_TEST_NUMBER = 5;
export const BUILD_NAME_BASE = "AunuCore youtube gift";

export function makePhaseTestName(phase = PHASE_TEST_NUMBER) {
  const n = Number.isInteger(phase) && phase > 0 ? phase : 1;
  return `${BUILD_NAME_BASE} (phase test #${n})`;
}

export function nextPhaseTestName(currentPhase = PHASE_TEST_NUMBER) {
  return makePhaseTestName(currentPhase + 1);
}

export const BUILD_NAME = makePhaseTestName(PHASE_TEST_NUMBER);
export const LOG_PREFIX = `[${BUILD_NAME}]`;

// ---------------------------------------------------------------------------
// 2. Deteksi request create_comment
// ---------------------------------------------------------------------------

const CREATE_COMMENT_PATH = "/comment/create_comment";

export function isCreateCommentRequest(url) {
  if (!url) return false;
  try {
    const parsed = new URL(String(url), "https://www.youtube.com");
    return parsed.pathname.includes(CREATE_COMMENT_PATH);
  } catch {
    return false;
  }
}

function getRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}

function getRequestMethod(input, init = {}) {
  return String(init.method || input?.method || "GET").toUpperCase();
}

// ---------------------------------------------------------------------------
// 3. Transformer payload (PURE - aman diuji dengan node --test)
// ---------------------------------------------------------------------------

export function extractTenorId(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  if (typeof payload.tenorId === "string" && payload.tenorId) return payload.tenorId;
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const found = extractTenorId(value);
      if (found) return found;
    }
  }
  return undefined;
}

/** ID GIF Tenor yang sah untuk tenorId: string digit (id post Tenor). */
export function isTenorPostId(id) {
  return typeof id === "string" && /^\d{1,20}$/.test(id);
}

/**
 * Pasang GIF terpilih ke payload sebagai tenorId (phase test #4).
 * Mengembalikan { payload, armed } — armed=false bila GIF bukan dari
 * Tenor (mis. mode tempel URL langsung): GIF seperti itu tidak punya
 * id Tenor dan tidak bisa dilampirkan lewat jalur ini.
 * Payload asli tidak dimutasi.
 */
export function applyGifToPayload(payload, gif) {
  if (!payload || typeof payload !== "object") return { payload, armed: false };
  const next =
    typeof structuredClone === "function"
      ? structuredClone(payload)
      : JSON.parse(JSON.stringify(payload));
  if (!isTenorPostId(gif?.id)) return { payload: next, armed: false };
  next.tenorId = String(gif.id);
  return { payload: next, armed: true };
}

/** Alias transformasi phase #4 (nama lama dipertahankan untuk test lama). */
export function transformCreateCommentPayload(payload, { pendingGif } = {}) {
  return applyGifToPayload(payload, pendingGif).payload;
}

/** Contoh payload SEBELUM GIF dipilih — komentar teks biasa. */
export function mockPayloadBefore() {
  return {
    context: { client: { clientName: "WEB", clientVersion: "2.20261014" } },
    commentText: "test gif",
    createCommentParams: "Eg0SCw...",
  };
}

/** Contoh payload SESUDAH GIF Tenor dipilih — tenorId terpasang. */
export function mockPayloadAfter() {
  return {
    context: { client: { clientName: "WEB", clientVersion: "2.20261014" } },
    commentText: "test gif",
    createCommentParams: "Eg0SCw...",
    tenorId: "13710736021070431175",
  };
}

// ---------------------------------------------------------------------------
// 3b. Pending GIF — GIF yang dipilih dari picker (phase test #2)
// ---------------------------------------------------------------------------

/** Pending GIF kedaluwarsa 3 menit agar tidak menempel ke komentar lain. */
export const PENDING_TTL_MS = 3 * 60 * 1000;

let pendingGif = null;
let pendingArmedAt = 0;

export function setPendingGif(gif, nowMs = Date.now()) {
  pendingGif = gif?.gifUrl ? gif : null;
  pendingArmedAt = pendingGif ? nowMs : 0;
  return pendingGif;
}

export function getPendingGif(nowMs = Date.now()) {
  if (pendingGif && nowMs - pendingArmedAt > PENDING_TTL_MS) {
    pendingGif = null;
    pendingArmedAt = 0;
  }
  return pendingGif;
}

// ---------------------------------------------------------------------------
// 4. Penilaian respons create_comment + jadwal retry (PURE, untuk test)
// ---------------------------------------------------------------------------
// kind:
//   posted    komentar benar-benar terbit (actionResult STATUS_SUCCEEDED)
//   blocked   400 INVALID_ARGUMENT — GIF diterima bentuknya, komentar
//             ditolak; satu-satunya kind yang layak di-retry
//   gif       HTTP 200 tetapi ada showErrorAction: YouTube memeriksa
//             GIF-nya dan menolaknya (id tak dikenal / bukan rating G)
//   rejected  penolakan lain; tidak ada yang terbit
//   uncertain tidak ada konfirmasi yang bisa dibaca

export const RETRY_DELAYS_MS = [1000, 1500, 2000, 2000, 2500, 2500, 3000, 3000, 3000, 3000, 3000];
export const MAX_TRIES = RETRY_DELAYS_MS.length + 1;

function textOfValue(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (typeof value.content === "string") return value.content;
  if (Array.isArray(value.runs)) {
    return value.runs.map((r) => (typeof r?.text === "string" ? r.text : "")).join("");
  }
  return "";
}

/** Kumpulkan pesan dari semua showErrorAction (termasuk yang bersarang). */
export function collectShowErrorMessages(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectShowErrorMessages(item, out, depth + 1);
    return out;
  }
  if (node.showErrorAction) {
    const err = node.showErrorAction.errorMessage;
    const text = textOfValue(err?.messageRenderer?.text) || textOfValue(err);
    if (text) out.push(text);
  }
  for (const value of Object.values(node)) collectShowErrorMessages(value, out, depth + 1);
  return out;
}

export function classifyCommentResponse({ httpStatus, json } = {}) {
  const apiStatus = typeof json?.error?.status === "string" ? json.error.status : null;
  const actionStatus = typeof json?.actionResult?.status === "string" ? json.actionResult.status : null;
  const errors = json ? collectShowErrorMessages(json) : [];
  const message = [...new Set([
    textOfValue(json?.error?.message),
    ...errors,
    textOfValue(json?.actionResult?.feedbackText),
  ].filter(Boolean))].join(" ");

  const kind =
    httpStatus >= 200 && httpStatus < 300 && actionStatus === "STATUS_SUCCEEDED" && errors.length === 0
      ? "posted"
      : httpStatus === 400 && apiStatus === "INVALID_ARGUMENT"
        ? "blocked"
        : errors.length > 0
          ? "gif"
          : httpStatus >= 400
            ? "rejected"
            : "uncertain";

  return { kind, httpStatus, apiStatus, actionStatus, message };
}

export async function judgeCommentResponse(response) {
  let json = null;
  try {
    json = await response.clone().json();
  } catch {
    /* respons tidak terbaca -> tidak mengonfirmasi apa pun */
  }
  return classifyCommentResponse({ httpStatus: response?.status ?? 0, json });
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 5. Fetch interceptor (side-effect browser saja)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5b. Hook persisten pada window.fetch (phase test #5)
// ---------------------------------------------------------------------------
// Wrapper dipasang SEKALI pada window.fetch dan mendelegasikan ke
// handler terbaru (slot.current). Salinan bundle yang lebih baru
// mempensiunkan handler lama lewat teardown-nya — satu halaman tidak
// pernah punya dua interceptor bertumpuk dengan state terpisah.
//
// Kenapa perlu: di phase test #4 terbukti request create_comment
// lolos sebagai fetch 200 biasa dari script YouTube (200.js) tanpa
// pernah menyentuh wrapper — bundle tiba (lewat putaran service
// worker) SETELAH modul YouTube memegang referensi fetch asli.
// Karena itu bundle kini didaftarkan sebagai content script
// MAIN world di document_start dari manifest: terpasang sebelum
// kode YouTube mana pun. Slot ini menjaga jalur fallback untuk
// tab yang sudah terbuka saat ekstensi di-install/update.
//
// slot.live: true bila terpasang saat document_start (readyState
// "loading"), atau setelah ada request /youtubei/v1/ yang terbukti
// melewati wrapper. Di luar itu hook dianggap belum live.

export const HOOK_KEY = Symbol.for("aunucore.ytgift.hook");
const YOUTUBEI_RE = /\/youtubei\/v1\//;

export function ensureHookSlot(win, fetchImpl) {
  if (!win || (typeof win !== "object" && typeof win !== "function")) return null;
  const existing = win[HOOK_KEY];
  if (existing) return existing;
  const originalFetch =
    fetchImpl ?? (typeof win.fetch === "function" ? win.fetch.bind(win) : undefined);
  if (typeof originalFetch !== "function") return null;
  const slot = {
    current: null,
    live: win.document?.readyState === "loading",
    originalFetch,
  };
  Object.defineProperty(win, HOOK_KEY, { value: slot });
  win.fetch = function (...args) {
    const s = win[HOOK_KEY];
    try {
      if (YOUTUBEI_RE.test(getRequestUrl(args[0]))) s.live = true;
    } catch { /* abaikan */ }
    return s.current ? s.current.fetch(...args) : s.originalFetch(...args);
  };
  return slot;
}

export function getHookLive(win) {
  return Boolean(win?.[HOOK_KEY]?.live);
}

/**
 * @param {object} deps
 * @param {object}   [deps.win]           window target (default: window global)
 * @param {Function} [deps.fetchImpl]     fetch asli (untuk test/injeksi)
 * @param {object}   [deps.logger]        default: console
 * @param {Function} [deps.sleep]         penunda antar-retry (test: instan)
 * @param {number[]} [deps.retryDelaysMs] jadwal retry (default RETRY_DELAYS_MS)
 * @param {Function} [deps.onResult]      callback hasil akhir komentar GIF
 * @param {Function} [deps.teardown]      dipanggil bila salinan yang
 *   lebih baru mengambil alih hook (membersihkan listener/observer
 *   milik salinan ini)
 * @returns {Function} uninstall()
 */
export function installFetchInterceptor(deps = {}) {
  const win = deps.win ?? (typeof window !== "undefined" ? window : globalThis);
  const slot = ensureHookSlot(win, deps.fetchImpl);
  if (!slot) return () => {};
  const originalFetch = slot.originalFetch;

  const logger = deps.logger ?? console;
  const sleep = deps.sleep ?? defaultSleep;
  const delays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;

  const emitResult = (detail) => {
    if (typeof deps.onResult === "function") {
      try { deps.onResult(detail); } catch { /* abaikan */ }
    }
    if (win && typeof win.dispatchEvent === "function" && typeof win.CustomEvent === "function") {
      try {
        win.dispatchEvent(new win.CustomEvent("aunucore:gif-post-result", { detail }));
      } catch { /* abaikan */ }
    }
    if (detail.kind !== "posted") {
      // Cukup untuk membedakan kasus di laporan bug — tanpa teks
      // komentar, header, atau kredensial apa pun.
      logger.warn?.(`${LOG_PREFIX} komentar GIF tidak terkonfirmasi`, JSON.stringify(detail));
    }
  };

  const interceptedFetch = async (input, init = {}) => {
    const url = getRequestUrl(input);
    const method = getRequestMethod(input, init);

    if (!isCreateCommentRequest(url) || method !== "POST") {
      return originalFetch(input, init);
    }

    // Ambil body JSON: dari init.body, atau dari Request yang di-clone.
    let rawBody = typeof init.body === "string" ? init.body : undefined;
    let requestClone = null;

    if (rawBody === undefined && input && typeof input.clone === "function") {
      try {
        requestClone = input.clone();
        rawBody = await requestClone.text();
      } catch {
        rawBody = undefined;
      }
    }

    if (typeof rawBody !== "string" || !rawBody) {
      return originalFetch(input, init);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return originalFetch(input, init); // bukan JSON -> jangan sentuh
    }

    const pending = getPendingGif();
    const ownTenorId = extractTenorId(parsed);
    if (!pending && !ownTenorId) {
      return originalFetch(input, init); // bukan komentar GIF -> lolos apa adanya
    }

    const { payload: nextPayload, armed } = applyGifToPayload(parsed, pending);
    if (pending && !armed) {
      // GIF dari mode tempel URL langsung: tidak punya id Tenor.
      logger.info?.(`${LOG_PREFIX} GIF non-Tenor tidak bisa dilampirkan; komentar dikirim sebagai teks`);
      return originalFetch(input, init);
    }

    const nextBody = JSON.stringify(nextPayload);
    const isRequestInput = Boolean(
      requestClone || (input && typeof input.clone === "function" && typeof init.body !== "string"),
    );
    const sendOnce = () =>
      isRequestInput
        ? originalFetch(new Request(input, { ...init, body: nextBody, method: "POST" }))
        : originalFetch(input, { ...init, body: nextBody });

    const tries = delays.length + 1;
    let attempt = 0;
    let response;
    let verdict;

    for (;;) {
      attempt++;
      try {
        response = await sendOnce();
      } catch (err) {
        emitResult({ ok: false, kind: "network", tries: attempt, tenorId: nextPayload.tenorId ?? null });
        throw err;
      }
      verdict = await judgeCommentResponse(response);
      if (verdict.kind !== "blocked" || attempt === tries) break;
      logger.info?.(`${LOG_PREFIX} YouTube menolak (blocked), mencoba lagi ${attempt + 1}/${tries}…`);
      await sleep(delays[attempt - 1]);
    }

    emitResult({
      ok: verdict.kind === "posted",
      kind: verdict.kind,
      tries: attempt,
      httpStatus: verdict.httpStatus,
      apiStatus: verdict.apiStatus,
      message: verdict.message,
      tenorId: nextPayload.tenorId ?? null,
    });

    // Pending dibersihkan hanya bila GIF-nya selesai urusannya:
    // terkirim, atau GIF-nya sendiri yang ditolak. Bila "blocked",
    // pending dipertahankan (dalam TTL) agar user bisa mencoba lagi.
    if (pending && (verdict.kind === "posted" || verdict.kind === "gif")) {
      setPendingGif(null);
      if (win && typeof win.dispatchEvent === "function" && typeof win.CustomEvent === "function") {
        win.dispatchEvent(new win.CustomEvent("aunucore:gif-cleared", { detail: null }));
      }
    }
    return response;
  };

  // Pensiunkan handler salinan sebelumnya, lalu daftarkan diri
  // sebagai handler aktif pada slot bersama.
  try { slot.current?.teardown?.(); } catch { /* abaikan */ }
  const handler = { fetch: interceptedFetch, teardown: deps.teardown };
  slot.current = handler;

  return function uninstall() {
    if (slot.current === handler) slot.current = null;
  };
}

// ---------------------------------------------------------------------------
// 6. Auto-install (browser saja, tidak jalan saat di-import oleh Node test)
// ---------------------------------------------------------------------------

if (typeof window !== "undefined" && typeof window.fetch === "function") {
  window.__AUNUCORE_YT_GIFT__ = {
    buildName: BUILD_NAME,
    phaseTestNumber: PHASE_TEST_NUMBER,
    // SENGAJA tidak ada field nama phase berikutnya di sini: field
    // seperti itu pernah membuat console seolah build berjalan adalah
    // phase lain. Objek ini hanya menyebut phase yang sedang aktif.
    pickerState,
    getPendingGif,
    get hookLive() { return getHookLive(window); },
  };

  // Picker (picker.js) mengumumkan GIF terpilih lewat CustomEvent.
  const onGifSelected = (e) => setPendingGif(e.detail);
  const onGifCleared = () => setPendingGif(null);
  window.addEventListener("aunucore:gif-selected", onGifSelected);
  window.addEventListener("aunucore:gif-cleared", onGifCleared);

  let teardownPicker = () => {};
  try {
    teardownPicker = initGifPicker({}) || (() => {});
  } catch (err) {
    console.warn(`${LOG_PREFIX} picker gagal dipasang:`, err);
  }

  // Phase test #5: interceptor kini tinggal di slot hook persisten
  // (lihat ensureHookSlot). Bila salinan bundle yang lebih baru
  // masuk ke halaman yang sama, teardown ini membersihkan listener
  // dan observer milik salinan ini.
  installFetchInterceptor({
    win: window,
    teardown: () => {
      window.removeEventListener("aunucore:gif-selected", onGifSelected);
      window.removeEventListener("aunucore:gif-cleared", onGifCleared);
      teardownPicker();
    },
  });

  const live = getHookLive(window);
  console.info(
    `${LOG_PREFIX} interceptor aktif di`,
    location.href,
    live ? "(hook live)" : "(hook BELUM live)",
  );
  if (!live) {
    console.warn(
      `${LOG_PREFIX} hook terpasang setelah halaman termuat — refresh tab ini agar pengiriman GIF bekerja`,
    );
  }
}
