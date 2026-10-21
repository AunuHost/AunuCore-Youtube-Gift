// AunuCore youtube gift (phase test #4) — content bridge
// Content script (isolated world). Jembatan antara:
//   picker.js (jalan di MAIN world, tidak punya akses chrome.runtime)
//   <-> sw.js service worker (yang bicara ke Tenor)
// Protokol window.postMessage:
//   masuk : { source: "aunucore-main",   type: "SEARCH"|"FEATURED", requestId, query }
//   keluar: { source: "aunucore-bridge", type: "RESULT", requestId, ok, gifs?, error? }
(() => {
  const BUILD_NAME = "AunuCore youtube gift (phase test #4)";
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "aunucore-main") return;
    if (data.type !== "SEARCH" && data.type !== "FEATURED") return;

    const reply = (payload) =>
      window.postMessage(
        { source: "aunucore-bridge", type: "RESULT", requestId: data.requestId, ...payload },
        window.location.origin,
      );

    try {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reply({ ok: false, error: "Service worker tidak tersedia (chrome.runtime tidak ada)" });
        return;
      }
      const msg =
        data.type === "SEARCH"
          ? { type: "aunucore:search", query: String(data.query ?? "") }
          : { type: "aunucore:featured" };
      const res = await chrome.runtime.sendMessage(msg);
      if (res?.ok) reply({ ok: true, gifs: res.gifs });
      else reply({ ok: false, error: res?.error ?? "Service worker gagal menjawab" });
    } catch (err) {
      reply({ ok: false, error: `[${BUILD_NAME}] ${String(err?.message ?? err)}` });
    }
  });
})();
