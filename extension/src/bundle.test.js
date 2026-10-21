/**
 * Test bundle + injeksi untuk perbaikan "Unsafe attempt to load URL".
 * Jalankan: node --test extension/src/bundle.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { buildBundle } from "../../tools/build-bundle.mjs";
import { layoutPaths, injectTabScripts } from "./sw.js";

const pickerSrc = readFileSync(new URL("./picker.js", import.meta.url), "utf8");
const mainSrc = readFileSync(new URL("./main.js", import.meta.url), "utf8");

test("bundle: gabungan picker+main tanpa sisa import/export dan bisa di-parse", () => {
  const bundle = buildBundle(pickerSrc, mainSrc);
  assert.doesNotMatch(bundle, /^import\s/m);
  assert.doesNotMatch(bundle, /^export\s/m);
  assert.match(bundle, /initGifPicker/);
  assert.match(bundle, /installFetchInterceptor/);
  new vm.Script(bundle); // melempar bila sintaks rusak
});

test("bundle: tidak memakai innerHTML sama sekali (Trusted Types YouTube)", () => {
  const bundle = buildBundle(pickerSrc, mainSrc);
  assert.doesNotMatch(bundle, /\.innerHTML\s*=/);
});

test("bundle: nama top-level bentrok ditolak", () => {
  assert.throws(
    () => buildBundle("export const sama = 1;", "export const sama = 2;"),
    /bentrok/,
  );
});

test("layoutPaths membedakan layout root repo vs folder extension", () => {
  assert.deepEqual(layoutPaths("/extension/src/sw.js"), {
    bundle: "extension/src/main.bundle.js",
    bridge: "extension/src/content-bridge.js",
  });
  assert.deepEqual(layoutPaths("/src/sw.js"), {
    bundle: "src/main.bundle.js",
    bridge: "src/content-bridge.js",
  });
});

test("injectTabScripts (fallback tab lama): bridge isolated dulu, bundle MAIN world", async () => {
  const calls = [];
  const fakeScripting = { executeScript: async (arg) => { calls.push(arg); } };
  const paths = await injectTabScripts(42, { scripting: fakeScripting, swPathname: "/extension/src/sw.js" });
  assert.equal(paths.bundle, "extension/src/main.bundle.js");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].files, ["extension/src/content-bridge.js"]);
  assert.equal(calls[0].world, undefined);
  assert.deepEqual(calls[1].files, ["extension/src/main.bundle.js"]);
  assert.equal(calls[1].world, "MAIN");
  assert.equal(calls[1].target.tabId, 42);
});

test("kedua manifest mendaftarkan bundle sebagai content script MAIN world di document_start", () => {
  for (const mf of ["../../manifest.json", "../manifest.json"]) {
    const m = JSON.parse(readFileSync(new URL(mf, import.meta.url), "utf8"));
    const mainEntry = m.content_scripts.find((e) => e.world === "MAIN");
    assert.ok(mainEntry, `${mf}: entri MAIN world harus ada`);
    assert.equal(mainEntry.run_at, "document_start");
    assert.ok(mainEntry.js.some((f) => f.endsWith("main.bundle.js")));
    const allJs = m.content_scripts.flatMap((e) => e.js).join(" ");
    assert.doesNotMatch(allJs, /loader/);
  }
});
