/**
 * AunuCore youtube gift (phase test #3) — GIF button + picker
 * ============================================================
 * File ini menambah UI yang tidak ada di phase test #1:
 * 1) Tombol "GIF" yang disisipkan ke kotak komentar YouTube desktop
 *    (ytd-comment-simplebox-renderer).
 * 2) Panel picker: cari GIF di Tenor TANPA API key pribadi — sejak
 *    phase #3 pencarian berjalan lewat service worker (sw.js) yang
 *    memakai key situs tenor.com sendiri, seperti ekstensi
 *    desktop_gifs. Alternatif: tempel URL GIF langsung.
 *    PICKER_CONFIG.tenorApiKey kini hanya override opsional developer.
 * 3) GIF terpilih disimpan di pickerState.selected dan diumumkan lewat
 *    CustomEvent "aunucore:gif-selected" — main.js mendengarkannya dan
 *    menyimpannya sebagai pendingGif untuk interceptor.
 *
 * BATAS SAAT INI: memilih GIF belum melampirkannya ke komentar.
 * Lampiran aktif setelah resolver upload (phase test #4) selesai.
 * ============================================================
 */

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

export const PICKER_CONFIG = {
  // Isi dengan Tenor API key milikmu (https://developers.google.com/tenor)
  // agar pencarian GIF di panel aktif. Kosong = pencarian Tenor nonaktif,
  // mode "tempel URL GIF langsung" tetap bisa dipakai.
  tenorApiKey: "",
  tenorClientKey: "aunucore_youtube_gift",
  resultLimit: 24,
};

export function resolveTenorApiKey(config = {}) {
  const fromWindow =
    typeof window !== "undefined"
      ? window.__AUNUCORE_YT_GIFT_CONFIG__?.tenorApiKey
      : undefined;
  return config.tenorApiKey || fromWindow || PICKER_CONFIG.tenorApiKey || "";
}

const TENOR_BASE = "https://tenor.googleapis.com/v2";

// ---------------------------------------------------------------------------
// Helper murni (aman diuji node --test)
// ---------------------------------------------------------------------------

export function buildTenorSearchUrl({ q, apiKey, limit = 24, pos = "" } = {}) {
  const params = new URLSearchParams({
    q: String(q ?? ""),
    key: String(apiKey ?? ""),
    client_key: PICKER_CONFIG.tenorClientKey,
    limit: String(limit),
    media_filter: "gif,tinygif,nanogif",
  });
  if (pos) params.set("pos", String(pos));
  return `${TENOR_BASE}/search?${params.toString()}`;
}

export function buildTenorFeaturedUrl({ apiKey, limit = 24, pos = "" } = {}) {
  const params = new URLSearchParams({
    key: String(apiKey ?? ""),
    client_key: PICKER_CONFIG.tenorClientKey,
    limit: String(limit),
    media_filter: "gif,tinygif,nanogif",
  });
  if (pos) params.set("pos", String(pos));
  return `${TENOR_BASE}/featured?${params.toString()}`;
}

export function normalizeTenorResults(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  const out = [];
  for (const item of results) {
    const formats = item?.media_formats ?? {};
    const gifUrl = formats.gif?.url;
    if (!gifUrl) continue;
    out.push({
      id: String(item.id ?? gifUrl),
      title: String(item.title ?? item.content_description ?? "GIF"),
      gifUrl,
      previewUrl: formats.tinygif?.url ?? formats.nanogif?.url ?? gifUrl,
      width: formats.gif?.dims?.[0] ?? null,
      height: formats.gif?.dims?.[1] ?? null,
      source: "tenor",
    });
  }
  return out;
}

export function isDirectGifUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!/^https?:$/.test(url.protocol)) return false;
    return /\.(gif|webp)(\?.*)?$/i.test(url.pathname + url.search) || /\.(gif|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function gifFromDirectUrl(value) {
  const url = String(value ?? "").trim();
  if (!isDirectGifUrl(url)) return null;
  return { id: url, title: "GIF dari URL langsung", gifUrl: url, previewUrl: url, width: null, height: null, source: "direct-url" };
}

// ---------------------------------------------------------------------------
// Pencarian lewat service worker (jalur utama sejak phase #3)
// ---------------------------------------------------------------------------

let bridgeSeq = 0;

export function requestViaBridge({ type, query = "", win, timeoutMs = 12000 } = {}) {
  const windowRef = win ?? (typeof window !== "undefined" ? window : null);
  if (!windowRef?.postMessage || !windowRef?.addEventListener) {
    return Promise.reject(new Error("Bridge tidak tersedia di konteks ini"));
  }
  const requestId = `ac-${Date.now()}-${++bridgeSeq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Service worker tidak menjawab (timeout) — coba reload ekstensi"));
    }, timeoutMs);
    const onMessage = (event) => {
      const data = event.data;
      if (!data || data.source !== "aunucore-bridge" || data.type !== "RESULT" || data.requestId !== requestId) return;
      cleanup();
      if (data.ok) resolve(Array.isArray(data.gifs) ? data.gifs : []);
      else reject(new Error(data.error ?? "Pencarian gagal"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      windowRef.removeEventListener("message", onMessage);
    };
    windowRef.addEventListener("message", onMessage);
    windowRef.postMessage(
      { source: "aunucore-main", type, requestId, query },
      windowRef.location?.origin ?? "*",
    );
  });
}

export async function browserBridgeSearch(query) {
  return requestViaBridge({ type: query ? "SEARCH" : "FEATURED", query });
}

/**
 * Pencarian GIF untuk UI. Urutan jalur:
 * 1) bridgeSearch yang di-inject (test / pemanggil khusus)
 * 2) API key pribadi bila developer mengisinya (override langsung)
 * 3) service worker via bridge (key situs tenor.com) — jalur normal
 */
export async function searchGifs({ q, apiKey, fetchImpl, bridgeSearch } = {}) {
  if (typeof bridgeSearch === "function") return bridgeSearch(q ?? "");
  const key = resolveTenorApiKey({ tenorApiKey: apiKey });
  if (key) return searchTenor({ q, apiKey: key, fetchImpl });
  return browserBridgeSearch(q ?? "");
}

// ---------------------------------------------------------------------------
// State pemilihan GIF
// ---------------------------------------------------------------------------

export function createPickerState() {
  return { selected: null, isOpen: false, lastQuery: "", results: [] };
}

export const pickerState = createPickerState();

export function selectGif(state, gif) {
  if (!gif?.gifUrl) return state;
  state.selected = gif;
  return state;
}

export function clearSelectedGif(state) {
  state.selected = null;
  return state;
}

export async function searchTenor({ q, apiKey, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new Error("fetch tidak tersedia");
  const key = resolveTenorApiKey({ tenorApiKey: apiKey });
  if (!key) {
    const err = new Error("TENOR_API_KEY kosong — isi PICKER_CONFIG.tenorApiKey di extension/src/picker.js");
    err.code = "NO_API_KEY";
    throw err;
  }
  const url = q
    ? buildTenorSearchUrl({ q, apiKey: key, limit: PICKER_CONFIG.resultLimit })
    : buildTenorFeaturedUrl({ apiKey: key, limit: PICKER_CONFIG.resultLimit });
  const res = await doFetch(url);
  if (!res?.ok) throw new Error(`Tenor API gagal: HTTP ${res?.status ?? "?"}`);
  return normalizeTenorResults(await res.json());
}

// ---------------------------------------------------------------------------
// UI (browser saja) — tombol GIF + panel picker
// ---------------------------------------------------------------------------

const BUTTON_MARK = "data-aunucore-gif-btn";
const PANEL_ID = "aunucore-gif-panel";
const STYLE_ID = "aunucore-gif-style";

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .aunucore-gif-btn{cursor:pointer;border:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.2));
      background:transparent;color:inherit;border-radius:12px;padding:2px 10px;margin:0 4px;
      font-size:12px;font-weight:700;letter-spacing:.5px;line-height:22px}
    .aunucore-gif-btn:hover{background:var(--yt-spec-10-percent-layer,rgba(0,0,0,.08))}
    #${PANEL_ID}{position:relative;z-index:50;margin:8px 0;padding:10px;border-radius:12px;
      border:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.2));
      background:var(--yt-spec-menu-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);
      max-width:560px;box-shadow:0 4px 16px rgba(0,0,0,.18)}
    #${PANEL_ID} .ac-head{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;margin-bottom:8px}
    #${PANEL_ID} .ac-row{display:flex;gap:6px;margin-bottom:8px}
    #${PANEL_ID} input{flex:1;padding:6px 8px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.25));background:transparent;color:inherit}
    #${PANEL_ID} button.ac-act{cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.25));background:transparent;color:inherit;font-weight:600}
    #${PANEL_ID} .ac-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:320px;overflow:auto}
    #${PANEL_ID} .ac-grid img{width:100%;height:88px;object-fit:cover;border-radius:8px;cursor:pointer}
    #${PANEL_ID} .ac-grid img:hover{outline:2px solid #3ea6ff}
    #${PANEL_ID} .ac-status{font-size:12px;opacity:.85;min-height:16px}
    #${PANEL_ID} .ac-selected{display:flex;gap:8px;align-items:center;font-size:12px;margin-top:8px}
    #${PANEL_ID} .ac-selected img{width:64px;height:48px;object-fit:cover;border-radius:6px}
  `;
  doc.head.appendChild(style);
}

function buildPanel(doc, win, logger) {
  // PENTING: panel dibangun 100% dengan DOM API, TANPA innerHTML.
  // YouTube memberlakukan Trusted Types ("require-trusted-types"),
  // sehingga assignment innerHTML dari halaman akan ditolak dengan
  // "This document requires 'TrustedHTML' assignment". createElement
  // + textContent tidak termasuk sink yang dibatasi.
  const el = (tag, cls, text) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const actBtn = (ac, text) => {
    const b = el("button", "ac-act", text);
    b.type = "button";
    b.setAttribute("data-ac", ac);
    return b;
  };
  const field = (ac, placeholder) => {
    const i = el("input");
    i.type = "text";
    i.setAttribute("data-ac", ac);
    i.placeholder = placeholder;
    return i;
  };
  const slot = (tag, cls, ac) => {
    const n = el(tag, cls);
    n.setAttribute("data-ac", ac);
    return n;
  };

  const panel = el("div");
  panel.id = PANEL_ID;

  const head = el("div", "ac-head");
  head.append(el("span", null, "GIF — AunuCore youtube gift (phase test #3)"), actBtn("close", "Tutup"));

  const rowSearch = el("div", "ac-row");
  rowSearch.append(field("query", "Cari GIF (Tenor)… lalu Enter"), actBtn("search", "Cari"));

  const rowDirect = el("div", "ac-row");
  rowDirect.append(field("direct", "atau tempel URL .gif/.webp langsung"), actBtn("use-direct", "Pakai URL"));

  panel.append(
    head,
    rowSearch,
    rowDirect,
    slot("div", "ac-status", "status"),
    slot("div", "ac-grid", "grid"),
    slot("div", "ac-selected", "selected"),
  );

  const status = panel.querySelector('[data-ac="status"]');
  const grid = panel.querySelector('[data-ac="grid"]');
  const selectedBox = panel.querySelector('[data-ac="selected"]');
  const queryInput = panel.querySelector('[data-ac="query"]');

  const renderSelected = () => {
    // DOM API saja (tanpa innerHTML) — alasan Trusted Types seperti
    // di buildPanel; juga judul GIF tidak lagi diinterpolasi mentah.
    selectedBox.replaceChildren();
    const gif = pickerState.selected;
    if (!gif) return;
    const img = doc.createElement("img");
    img.src = gif.previewUrl;
    img.alt = "";
    const label = doc.createElement("span");
    const bold = doc.createElement("b");
    bold.textContent = gif.title;
    label.append(
      doc.createTextNode("GIF terpilih: "),
      bold,
      doc.createTextNode(" — tercatat sebagai pending GIF. Lampiran aktif di phase test #4."),
    );
    const clearBtn = doc.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ac-act";
    clearBtn.setAttribute("data-ac", "clear");
    clearBtn.textContent = "Hapus";
    clearBtn.addEventListener("click", () => {
      clearSelectedGif(pickerState);
      win.dispatchEvent(new win.CustomEvent("aunucore:gif-cleared", { detail: null }));
      renderSelected();
    });
    selectedBox.append(img, label, clearBtn);
  };

  const pick = (gif) => {
    selectGif(pickerState, gif);
    win.dispatchEvent(new win.CustomEvent("aunucore:gif-selected", { detail: gif }));
    status.textContent = `Terpilih: ${gif.title}`;
    renderSelected();
    logger.info?.(`[AunuCore youtube gift (phase test #3)] GIF terpilih`, gif);
  };

  const renderResults = (gifs) => {
    grid.replaceChildren();
    for (const gif of gifs) {
      const img = doc.createElement("img");
      img.src = gif.previewUrl;
      img.alt = gif.title;
      img.title = gif.title;
      img.loading = "lazy";
      img.addEventListener("click", () => pick(gif));
      grid.appendChild(img);
    }
    status.textContent = gifs.length ? `${gifs.length} GIF — klik untuk memilih` : "Tidak ada hasil.";
  };

  const doSearch = async () => {
    status.textContent = "Mencari…";
    try {
      const gifs = await searchGifs({ q: queryInput.value.trim() });
      pickerState.results = gifs;
      renderResults(gifs);
    } catch (err) {
      status.textContent = `Gagal mencari: ${err.message} — mode tempel URL tetap bisa dipakai.`;
    }
  };

  panel.querySelector('[data-ac="search"]').addEventListener("click", doSearch);
  queryInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
  panel.querySelector('[data-ac="close"]').addEventListener("click", () => { panel.remove(); pickerState.isOpen = false; });
  panel.querySelector('[data-ac="use-direct"]').addEventListener("click", () => {
    const value = panel.querySelector('[data-ac="direct"]').value;
    const gif = gifFromDirectUrl(value);
    if (!gif) { status.textContent = "URL tidak valid — harus link langsung berakhiran .gif atau .webp (http/https)."; return; }
    pick(gif);
  });

  renderSelected();
  return panel;
}

function findToolbar(commentBox) {
  return (
    commentBox.querySelector("#footer") ||
    commentBox.querySelector(".footer") ||
    commentBox.querySelector("#buttons") ||
    commentBox.querySelector("#input-container")?.parentElement ||
    commentBox
  );
}

// Kotak komentar kanonis: #simple-box hidup DI DALAM renderer
// simplebox; memperlakukan keduanya sebagai box terpisah pernah
// menghasilkan dua tombol GIF dalam satu kotak komentar.
function canonicalCommentRoot(box) {
  return box?.closest?.("ytd-comment-simplebox-renderer, ytd-commentbox-renderer") ?? box;
}

export function ensureGifButton(commentBox, { doc, win, logger = console } = {}) {
  if (!commentBox) return false;
  const root = canonicalCommentRoot(commentBox);
  if (root.querySelector(`[${BUTTON_MARK}]`)) return false;
  const documentRef = doc ?? root.ownerDocument;
  const windowRef = win ?? documentRef.defaultView;
  ensureStyles(documentRef);

  const btn = documentRef.createElement("button");
  btn.type = "button";
  btn.className = "aunucore-gif-btn";
  btn.setAttribute(BUTTON_MARK, "1");
  btn.textContent = "GIF";
  btn.title = "AunuCore youtube gift (phase test #3) — pilih GIF";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const existing = documentRef.getElementById(PANEL_ID);
    if (existing) { existing.remove(); pickerState.isOpen = false; return; }
    const panel = buildPanel(documentRef, windowRef, logger);
    root.appendChild(panel);
    pickerState.isOpen = true;
  });

  findToolbar(root).appendChild(btn);
  return true;
}

export function scanAndInjectButtons({ doc = document, logger = console } = {}) {
  let added = 0;
  // Hanya renderer kanonis. "#simple-box" sengaja TIDAK dicari
  // terpisah: ia anak renderer simplebox (lihat canonicalCommentRoot).
  const boxes = doc.querySelectorAll(
    "ytd-comment-simplebox-renderer, ytd-commentbox-renderer"
  );
  boxes.forEach((box) => { if (ensureGifButton(box, { logger })) added++; });
  return added;
}

export function initGifPicker({ win = window, doc = document, logger = console } = {}) {
  if (!doc || !win) return () => {};
  scanAndInjectButtons({ doc, logger });
  const observer = new win.MutationObserver(() => scanAndInjectButtons({ doc, logger }));
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  logger.info?.("[AunuCore youtube gift (phase test #3)] tombol GIF + picker aktif");
  return () => observer.disconnect();
}
