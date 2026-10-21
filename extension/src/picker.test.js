/**
 * Test picker untuk: AunuCore youtube gift (phase test #3)
 * Jalankan: node --test extension/src/picker.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTenorSearchUrl,
  buildTenorFeaturedUrl,
  normalizeTenorResults,
  isDirectGifUrl,
  gifFromDirectUrl,
  createPickerState,
  selectGif,
  clearSelectedGif,
  searchTenor,
  searchGifs,
} from "./picker.js";

test("buildTenorSearchUrl menyusun query Tenor v2 dengan benar", () => {
  const url = new URL(buildTenorSearchUrl({ q: "kucing lucu", apiKey: "KEY123", limit: 12 }));
  assert.equal(url.origin + url.pathname, "https://tenor.googleapis.com/v2/search");
  assert.equal(url.searchParams.get("q"), "kucing lucu");
  assert.equal(url.searchParams.get("key"), "KEY123");
  assert.equal(url.searchParams.get("limit"), "12");
  assert.match(url.searchParams.get("media_filter"), /gif/);
});

test("buildTenorFeaturedUrl tanpa query", () => {
  const url = new URL(buildTenorFeaturedUrl({ apiKey: "K" }));
  assert.equal(url.pathname, "/v2/featured");
  assert.equal(url.searchParams.get("key"), "K");
});

test("normalizeTenorResults memetakan media_formats dan melewati item tanpa gif", () => {
  const out = normalizeTenorResults({
    results: [
      {
        id: 1,
        title: "Satu",
        media_formats: {
          gif: { url: "https://media.tenor.com/a.gif", dims: [480, 270] },
          tinygif: { url: "https://media.tenor.com/a-tiny.gif" },
        },
      },
      { id: 2, title: "Rusak", media_formats: {} },
      null,
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].gifUrl, "https://media.tenor.com/a.gif");
  assert.equal(out[0].previewUrl, "https://media.tenor.com/a-tiny.gif");
  assert.equal(out[0].width, 480);
  assert.equal(out[0].source, "tenor");
});

test("mode URL langsung hanya menerima http/https berakhiran .gif/.webp", () => {
  assert.equal(isDirectGifUrl("https://x.com/a.gif"), true);
  assert.equal(isDirectGifUrl("https://x.com/a.webp?x=1"), true);
  assert.equal(isDirectGifUrl("https://x.com/a.png"), false);
  assert.equal(isDirectGifUrl("ftp://x.com/a.gif"), false);
  assert.equal(isDirectGifUrl("bukan url"), false);
  const gif = gifFromDirectUrl("https://x.com/a.gif");
  assert.equal(gif.source, "direct-url");
  assert.equal(gifFromDirectUrl("https://x.com/a.jpg"), null);
});

test("state picker: pilih lalu bersihkan", () => {
  const state = createPickerState();
  assert.equal(state.selected, null);
  selectGif(state, { gifUrl: "https://x.com/a.gif", title: "A" });
  assert.equal(state.selected.title, "A");
  selectGif(state, { title: "tanpa url" });
  assert.equal(state.selected.title, "A"); // pilihan tidak valid diabaikan
  clearSelectedGif(state);
  assert.equal(state.selected, null);
});

test("searchTenor menolak jelas bila API key kosong", async () => {
  await assert.rejects(
    () => searchTenor({ q: "x", apiKey: "", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    (err) => err.code === "NO_API_KEY",
  );
});

test("searchTenor memakai fetch yang di-inject dan menormalkan hasil", async () => {
  const fakeFetch = async (url) => {
    assert.match(String(url), /tenor\.googleapis\.com\/v2\/search/);
    return {
      ok: true,
      json: async () => ({
        results: [{ id: 9, title: "Tes", media_formats: { gif: { url: "https://media.tenor.com/t.gif", dims: [100, 100] } } }],
      }),
    };
  };
  const out = await searchTenor({ q: "tes", apiKey: "K", fetchImpl: fakeFetch });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "9");
});

test("searchGifs memprioritaskan bridgeSearch yang di-inject (jalur service worker)", async () => {
  const out = await searchGifs({
    q: "halo",
    bridgeSearch: async (q) => [{ id: "b1", gifUrl: "https://media.tenor.com/b.gif", title: q }],
  });
  assert.equal(out[0].id, "b1");
  assert.equal(out[0].title, "halo");
});

test("searchGifs memakai API key pribadi sebagai override langsung", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ results: [{ id: 5, title: "Langsung", media_formats: { gif: { url: "https://media.tenor.com/d.gif", dims: [10, 10] } } }] }),
  });
  const out = await searchGifs({ q: "langsung", apiKey: "KEY_PRIBADI", fetchImpl: fakeFetch });
  assert.equal(out[0].id, "5");
});
