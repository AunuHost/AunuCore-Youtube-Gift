// AunuCore youtube gift (phase test #2) - root loader
// Dipakai jika folder yang dipilih di "Load unpacked" adalah folder
// root repo/project (aunucore-youtube-gift), bukan folder extension/.
// Fungsinya sama dengan extension/src/loader.js, hanya path main.js-nya
// relatif dari root: extension/src/main.js
(() => {
  const BUILD_NAME = "AunuCore youtube gift (phase test #2)";
  try {
    const script = document.createElement("script");
    script.type = "module";
    script.src = chrome.runtime.getURL("extension/src/main.js");
    script.dataset.buildName = BUILD_NAME;
    script.addEventListener("load", () => script.remove());
    (document.head || document.documentElement).appendChild(script);
    console.info(`[${BUILD_NAME}] root-loader: main.js disuntikkan`);
  } catch (err) {
    console.error(`[${BUILD_NAME}] root-loader gagal:`, err);
  }
})();
