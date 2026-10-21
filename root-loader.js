// AunuCore youtube gift (phase test #4) - root loader
// Dipakai jika folder yang dipilih di "Load unpacked" adalah folder
// root repo/project (aunucore-youtube-gift), bukan folder extension/.
// Isinya sama dengan extension/src/loader.js: meminta service worker
// menyuntikkan main.bundle.js ke MAIN world via chrome.scripting.
// (Tag <script src="chrome-extension://"> dari halaman dibuang karena
// memicu error Blink "Unsafe attempt to load URL" di sebagian frame.)
(() => {
  const BUILD_NAME = "AunuCore youtube gift (phase test #4)";
  try {
    chrome.runtime.sendMessage({ type: "aunucore:inject-main" }).then(
      (res) => {
        if (res?.ok) console.info(`[${BUILD_NAME}] root-loader: ${res.bundle} disuntikkan via service worker`);
        else console.error(`[${BUILD_NAME}] root-loader: injeksi gagal:`, res?.error ?? "tanpa jawaban");
      },
      (err) => console.error(`[${BUILD_NAME}] root-loader: service worker tidak menjawab:`, err),
    );
  } catch (err) {
    console.error(`[${BUILD_NAME}] root-loader gagal:`, err);
  }
})();
