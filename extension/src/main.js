/**
 * AunuCore youtube gift (phase test #2)
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
 * CATATAN ISSUE #93:
 * - Sejak 14 Okt 2026, `tenorId` di /comment/create_comment -> 400.
 * - File ini menghapus tenorId secara rekursif, lalu mengisi
 *   `imageAttachment.encryptedBlobId` HANYA jika blob id itu berasal
 *   dari response upload gambar YouTube yang nyata.
 * - encryptedBlobId TIDAK bisa dibuat/ditebak di client. Mengisi
 *   nilai palsu/mock ke request live tetap akan ditolak server.
 * - Mock hanya dipakai di unit test (main.test.js).
 * ============================================================
 */

import { initGifPicker, pickerState } from "./picker.js";

// ---------------------------------------------------------------------------
// 1. Identitas build / penamaan percobaan
// ---------------------------------------------------------------------------

export const PHASE_TEST_NUMBER = 2;
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

export function stripTenorDeep(node) {
  if (Array.isArray(node)) {
    for (const item of node) stripTenorDeep(item);
    return node;
  }
  if (node && typeof node === "object") {
    delete node.tenorId;
    delete node.tenorAttachment;
    delete node.tenor_attachment;
    for (const value of Object.values(node)) stripTenorDeep(value);
  }
  return node;
}

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

export function buildImageAttachment({ encryptedBlobId } = {}) {
  if (!encryptedBlobId || typeof encryptedBlobId !== "string") return null;
  return { encryptedBlobId };
}

/** Contoh payload SEBELUM (yang diblokir) — untuk dokumentasi/test. */
export function mockPayloadBefore() {
  return {
    context: { client: { clientName: "WEB", clientVersion: "2.20261014" } },
    commentText: "test gif",
    createCommentParams: "Eg0SCw...",
    tenorId: "15160261",
  };
}

/** Contoh payload SESUDAH (mock) — encryptedBlobId mock HANYA untuk test. */
export function mockPayloadAfter() {
  return {
    context: { client: { clientName: "WEB", clientVersion: "2.20261014" } },
    commentText: "test gif",
    createCommentParams: "Eg0SCw...",
    imageAttachment: {
      encryptedBlobId: "MOCK_BLOB_ID_FROM_REAL_UPLOAD_RESPONSE",
    },
  };
}

/**
 * Transformasi utama:
 * 1) clone payload (payload asli tidak dimutasi)
 * 2) hapus tenorId di semua level nesting
 * 3) isi imageAttachment hanya bila encryptedBlobId valid tersedia
 */
export function transformCreateCommentPayload(payload, { encryptedBlobId } = {}) {
  if (!payload || typeof payload !== "object") return payload;

  const next =
    typeof structuredClone === "function"
      ? structuredClone(payload)
      : JSON.parse(JSON.stringify(payload));

  stripTenorDeep(next);

  const attachment = buildImageAttachment({ encryptedBlobId });
  if (attachment) next.imageAttachment = attachment;

  return next;
}

// ---------------------------------------------------------------------------
// 3b. Pending GIF — GIF yang dipilih dari picker (phase test #2)
// ---------------------------------------------------------------------------

let pendingGif = null;

export function setPendingGif(gif) {
  pendingGif = gif?.gifUrl ? gif : null;
  return pendingGif;
}

export function getPendingGif() {
  return pendingGif;
}

// ---------------------------------------------------------------------------
// 4. Ambil GIF Tenor -> animated WebP (encoder di-inject, bukan rename ekstensi)
// ---------------------------------------------------------------------------

export async function fetchTenorAsWebpBlob(
  tenorUrl,
  { fetchImpl, convertGifToAnimatedWebp } = {},
) {
  if (!tenorUrl) throw new Error(`${LOG_PREFIX} tenorUrl kosong`);
  if (typeof convertGifToAnimatedWebp !== "function") {
    throw new Error(
      `${LOG_PREFIX} convertGifToAnimatedWebp belum dipasang ` +
        `(perlu encoder animated WebP asli, mis. libwebp WASM — ` +
        `mengganti ekstensi/type saja akan gagal validasi server)`,
    );
  }
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new Error(`${LOG_PREFIX} fetch tidak tersedia`);

  const res = await doFetch(tenorUrl);
  if (!res?.ok) throw new Error(`${LOG_PREFIX} Tenor fetch gagal: HTTP ${res?.status ?? "?"}`);

  const gifBlob = await res.blob();
  const webpBlob = await convertGifToAnimatedWebp(gifBlob);
  if (!webpBlob) throw new Error(`${LOG_PREFIX} konversi ke animated WebP menghasilkan blob kosong`);
  return webpBlob;
}

// ---------------------------------------------------------------------------
// 5. Fetch interceptor (side-effect browser saja)
// ---------------------------------------------------------------------------

/**
 * @param {object} deps
 * @param {Function} [deps.resolveEncryptedBlobId]
 *   Fungsi milikmu yang WAJIB melakukan flow nyata:
 *   fetch Tenor -> encode animated WebP -> upload via flow upload
 *   gambar YouTube -> kembalikan encryptedBlobId dari response upload.
 *   Jika mengembalikan undefined, request dikirim sebagai komentar
 *   teks biasa (tanpa tenorId, tanpa attachment palsu).
 * @param {Function} [deps.fetchImpl]  fetch asli (untuk test/injeksi)
 * @param {object}   [deps.logger]     default: console
 * @returns {Function} uninstall()
 */
export function installFetchInterceptor(deps = {}) {
  const target = deps.target ?? globalThis;
  const originalFetch = deps.fetchImpl ?? target.fetch?.bind(target);
  if (typeof originalFetch !== "function") return () => {};

  const logger = deps.logger ?? console;
  const resolveEncryptedBlobId = deps.resolveEncryptedBlobId;

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

    const tenorId = extractTenorId(parsed);
    const pending = getPendingGif();
    if (!tenorId && !pending && !("imageAttachment" in parsed)) {
      return originalFetch(input, init); // bukan komentar GIF -> lolos apa adanya
    }

    let encryptedBlobId;
    if ((tenorId || pending) && typeof resolveEncryptedBlobId === "function") {
      try {
        encryptedBlobId = await resolveEncryptedBlobId({
          tenorId,
          pendingGif: pending,
          buildName: BUILD_NAME,
          originalPayload: parsed,
        });
      } catch (err) {
        logger.warn?.(`${LOG_PREFIX} resolver gagal, kirim tanpa attachment:`, err);
      }
    }

    const nextPayload = transformCreateCommentPayload(parsed, { encryptedBlobId });
    const nextBody = JSON.stringify(nextPayload);
    logger.debug?.(`${LOG_PREFIX} payload ditransformasi`, {
      tenorIdRemoved: tenorId !== undefined,
      hasImageAttachment: Boolean(nextPayload.imageAttachment),
      pendingGifUrl: pending?.gifUrl ?? null,
    });

    // Kasus input berupa Request: buat Request baru dengan body baru.
    let response;
    if (requestClone || (input && typeof input.clone === "function" && typeof init.body !== "string")) {
      const newRequest = new Request(input, { ...init, body: nextBody, method: "POST" });
      response = await originalFetch(newRequest);
    } else {
      response = await originalFetch(input, { ...init, body: nextBody });
    }

    // Pending GIF terpakai untuk komentar ini — bersihkan bila terkirim.
    if (response?.ok && pending) {
      setPendingGif(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new window.CustomEvent("aunucore:gif-cleared", { detail: null }));
      }
    }
    return response;
  };

  if (target === globalThis && typeof globalThis.fetch === "function") {
    globalThis.fetch = interceptedFetch;
  }

  return function uninstall() {
    if (globalThis.fetch === interceptedFetch) globalThis.fetch = originalFetch;
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
  };

  // Picker (picker.js) mengumumkan GIF terpilih lewat CustomEvent.
  window.addEventListener("aunucore:gif-selected", (e) => setPendingGif(e.detail));
  window.addEventListener("aunucore:gif-cleared", () => setPendingGif(null));

  try {
    initGifPicker({});
  } catch (err) {
    console.warn(`${LOG_PREFIX} picker gagal dipasang:`, err);
  }

  installFetchInterceptor({
    // TODO(phase test #3): ganti resolver ini dengan flow upload nyata.
    // Di phase test #2 ia tetap mengembalikan undefined: yang baru di
    // phase ini adalah tombol GIF + picker (picker.js) dan pending GIF.
    // Attachment gambarnya sendiri belum dikirim sampai phase #3.
    resolveEncryptedBlobId: async () => undefined,
  });

  console.info(`${LOG_PREFIX} interceptor aktif di`, location.href);
}
