/**
 * Test bundle + injeksi untuk perbaikan "Unsafe attempt to load URL".
 * Jalankan: node --test extension/src/bundle.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { buildBundle } from "../../tools/build-bundle.mjs";
import { layoutPaths, injectMainBundle } from "./sw.js";

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
    loader: "root-loader.js",
  });
  assert.deepEqual(layoutPaths("/src/sw.js"), {
    bundle: "src/main.bundle.js",
    bridge: "src/content-bridge.js",
    loader: "src/loader.js",
  });
});

test("injectMainBundle memanggil chrome.scripting ke tab+frame pengirim, world MAIN", async () => {
  const calls = [];
  const fakeScripting = { executeScript: async (arg) => { calls.push(arg); } };
  const used = await injectMainBundle(
    { tab: { id: 42 }, frameId: 0 },
    { scripting: fakeScripting, swPathname: "/extension/src/sw.js" },
  );
  assert.equal(used, "extension/src/main.bundle.js");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].files, ["extension/src/main.bundle.js"]);
  assert.equal(calls[0].world, "MAIN");
  assert.equal(calls[0].target.tabId, 42);
  assert.deepEqual(calls[0].target.frameIds, [0]);
});
