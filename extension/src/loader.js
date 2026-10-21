// AunuCore youtube gift (phase test #4) - loader
// Content script (isolated world). Tugasnya hanya meminta service
// worker menyuntikkan main.bundle.js ke MAIN world lewat
// chrome.scripting.executeScript.
//
// Cara lama (tag <script src="chrome-extension://..."> dari halaman)
// DIBUANG: Blink menolak muatan itu di sebagian frame dengan error
// "Unsafe attempt to load URL ... Domains, protocols and ports must
// match". File yang disuntikkan chrome.scripting bukan muatan
// halaman, jadi tidak terkena penolakan tersebut.
(() => {
  const BUILD_NAME = "AunuCore youtube gift (phase test #4)";
  try {
    chrome.runtime.sendMessage({ type: "aunucore:inject-main" }).then(
      (res) => {
        if (res?.ok) console.info(`[${BUILD_NAME}] loader: ${res.bundle} disuntikkan via service worker`);
        else console.error(`[${BUILD_NAME}] loader: injeksi gagal:`, res?.error ?? "tanpa jawaban");
      },
      (err) => console.error(`[${BUILD_NAME}] loader: service worker tidak menjawab:`, err),
    );
  } catch (err) {
    console.error(`[${BUILD_NAME}] loader gagal:`, err);
  }
})();
