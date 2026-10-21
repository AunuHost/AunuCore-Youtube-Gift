// AunuCore youtube gift (phase test #3) - loader
// Content script (isolated world). Tugasnya hanya satu: menyuntikkan
// src/main.js sebagai <script type="module"> ke konteks halaman (MAIN world),
// karena hanya di sana window.fetch milik YouTube bisa di-intercept.
// main.js memakai sintaks ES module (export), jadi TIDAK boleh dimuat
// langsung sebagai content script klasik - lewat loader ini aman.
(() => {
  const BUILD_NAME = "AunuCore youtube gift (phase test #3)";
  try {
    const script = document.createElement("script");
    script.type = "module";
    script.src = chrome.runtime.getURL("src/main.js");
    script.dataset.buildName = BUILD_NAME;
    script.addEventListener("load", () => script.remove());
    (document.head || document.documentElement).appendChild(script);
    console.info(`[${BUILD_NAME}] loader: main.js disuntikkan`);
  } catch (err) {
    console.error(`[${BUILD_NAME}] loader gagal:`, err);
  }
})();
