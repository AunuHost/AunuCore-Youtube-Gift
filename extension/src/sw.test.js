/**
 * Test service worker Tenor untuk: AunuCore youtube gift (phase test #3)
 * Jalankan: node --test extension/src/sw.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readKeysFromHtml,
  extractStoreCache,
  toGifs,
  createMemoryStorage,
  createTenorClient,
  handleTenorMessage,
} from "./sw.js";

const gifItem = (id = 123) => ({
  id,
  content_description: "GIF tes",
  content_rating: "G",
  flags: [],
  media_formats: {
    gif: { url: "https://media.tenor.com/full.gif", dims: [480, 270] },
    tinygif: { url: "https://media.tenor.com/tiny.gif", dims: [220, 124] },
  },
});

function tenorHomeHtml({ key = "SITE_KEY", clientKey = "SITE_CLIENT", store = null } = {}) {
  const data = Buffer.from(JSON.stringify({ API_V2_KEY: key, API_V2_CLIENT_KEY: clientKey })).toString("base64");
  const storeJson = store ? `<script id="store-cache" type="text/x-cache">${JSON.stringify(store)}</script>` : "";
  return `<html><head><script id="data" type="text/x-cache">${data}</script>${storeJson}</head></html>`;
}

test("readKeysFromHtml mengekstrak API_V2_KEY + client key dari halaman tenor.com", () => {
  assert.deepEqual(readKeysFromHtml(tenorHomeHtml()), { key: "SITE_KEY", client_key: "SITE_CLIENT" });
  assert.equal(readKeysFromHtml("<html>tanpa script data</html>"), null);
  assert.equal(readKeysFromHtml(tenorHomeHtml({ key: 42 })), null);
});

test("extractStoreCache membaca JSON hasil tertanam, null bila rusak", () => {
  const store = { gifs: { featured: { results: [] } } };
  assert.deepEqual(extractStoreCache(tenorHomeHtml({ store })), store);
  assert.equal(extractStoreCache("<html></html>"), null);
});

test("toGifs memfilter sticker/static dan memetakan url", () => {
  const out = toGifs([
    gifItem(1),
    { ...gifItem(2), flags: ["sticker"] },
    { ...gifItem(3), media_formats: {} },
    { ...gifItem(4), id: "bukan-angka" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].gifUrl, "https://media.tenor.com/full.gif");
  assert.equal(out[0].previewUrl, "https://media.tenor.com/tiny.gif");
  assert.equal(out[0].contentRating, "G");
});

test("client: key dipanen dari tenor.com lalu dipakai memanggil API search", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url) === "https://tenor.com/") {
      return { ok: true, status: 200, text: async () => tenorHomeHtml() };
    }
    if (String(url).startsWith("https://tenor.googleapis.com/v2/search")) {
      const u = new URL(String(url));
      assert.equal(u.searchParams.get("key"), "SITE_KEY");
      assert.equal(u.searchParams.get("client_key"), "SITE_CLIENT");
      assert.equal(u.searchParams.get("contentfilter"), "high");
      assert.equal(u.searchParams.get("q"), "kucing");
      return { ok: true, status: 200, json: async () => ({ results: [gifItem(7)] }) };
    }
    throw new Error(`URL tak terduga: ${url}`);
  };
  const client = createTenorClient({ fetchImpl, storage: createMemoryStorage() });
  const out = await client.search("kucing");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "7");
});

test("client: key simpanan yang ditolak (403) dibuang, dipanen ulang, lalu berhasil", async () => {
  const storage = createMemoryStorage();
  await storage.set({ tenorKeys: { key: "KEY_LAMA", client_key: "CLIENT_LAMA" } });
  let apiCalls = 0;
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.startsWith("https://tenor.googleapis.com/v2/featured")) {
      apiCalls++;
      if (new URL(u).searchParams.get("key") === "KEY_LAMA") return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ results: [gifItem(8)] }) };
    }
    if (u === "https://tenor.com/") return { ok: true, status: 200, text: async () => tenorHomeHtml({ key: "KEY_BARU", clientKey: "CLIENT_BARU" }) };
    throw new Error(`URL tak terduga: ${url}`);
  };
  const client = createTenorClient({ fetchImpl, storage });
  const out = await client.featured();
  assert.equal(out.length, 1);
  assert.equal(apiCalls, 2);
  const { tenorKeys } = await storage.get("tenorKeys");
  assert.equal(tenorKeys.key, "KEY_BARU");
});

test("client: API mati total -> fallback ke store-cache halaman pencarian", async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.startsWith("https://tenor.googleapis.com/")) return { ok: false, status: 500, json: async () => ({}) };
    if (u === "https://tenor.com/") return { ok: true, status: 200, text: async () => tenorHomeHtml() };
    if (u === "https://tenor.com/search/anjing-lucu-gifs") {
      const store = { universal: { search: { a: { results: [gifItem(9)] } } } };
      return { ok: true, status: 200, text: async () => tenorHomeHtml({ store }) };
    }
    throw new Error(`URL tak terduga: ${url}`);
  };
  const client = createTenorClient({ fetchImpl, storage: createMemoryStorage() });
  const out = await client.search("anjing lucu");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "9");
});

test("handleTenorMessage merutekan featured/search dan menolak tipe asing", async () => {
  const fakeClient = {
    featured: async () => ["F"],
    search: async (q) => [`S:${q}`],
  };
  assert.deepEqual(await handleTenorMessage({ type: "aunucore:featured" }, fakeClient), ["F"]);
  assert.deepEqual(await handleTenorMessage({ type: "aunucore:search", query: "x" }, fakeClient), ["S:x"]);
  await assert.rejects(() => handleTenorMessage({ type: "lain" }, fakeClient), /Unknown message type/);
});
