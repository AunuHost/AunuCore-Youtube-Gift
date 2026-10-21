/**
 * Test untuk: AunuCore youtube gift (phase test #5)
 * Jalankan: node --test extension/src/main.test.js
 * Setiap naik phase, update ekspektasi BUILD_NAME di test pertama.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILD_NAME,
  PHASE_TEST_NUMBER,
  RETRY_DELAYS_MS,
  MAX_TRIES,
  PENDING_TTL_MS,
  makePhaseTestName,
  nextPhaseTestName,
  isCreateCommentRequest,
  extractTenorId,
  isTenorPostId,
  applyGifToPayload,
  transformCreateCommentPayload,
  mockPayloadBefore,
  mockPayloadAfter,
  classifyCommentResponse,
  collectShowErrorMessages,
  installFetchInterceptor,
  getHookLive,
  setPendingGif,
  getPendingGif,
} from "./main.js";

const GIF = { id: "13710736021070431175", gifUrl: "https://media1.tenor.com/m/x/meow.gif", title: "meow" };
const CREATE_URL = "https://www.youtube.com/youtubei/v1/comment/create_comment?key=x";

function fakeResponse({ status = 200, json = null } = {}) {
  const res = {
    status,
    ok: status >= 200 && status < 300,
    clone() { return res; },
    async json() {
      if (json === null) throw new Error("bukan json");
      return json;
    },
  };
  return res;
}
const BLOCKED = () => fakeResponse({ status: 400, json: { error: { status: "INVALID_ARGUMENT", message: "bad" } } });
const POSTED = () => fakeResponse({ status: 200, json: { actionResult: { status: "STATUS_SUCCEEDED" } } });

// Harness phase test #5: interceptor tinggal di slot hook pada
// window palsu; transport adalah fetch "asli" window itu.
function makeFakeWindow(transport, readyState = "complete") {
  return { fetch: transport, document: { readyState } };
}

async function runInterceptor(responses, { gif = GIF } = {}) {
  const calls = [];
  const results = [];
  const transport = async (input, init) => {
    calls.push(init?.body ?? null);
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  const win = makeFakeWindow(transport);
  setPendingGif(gif);
  installFetchInterceptor({
    win,
    sleep: async () => {},
    retryDelaysMs: [1, 1],
    logger: { info() {}, warn() {}, debug() {} },
    onResult: (d) => results.push(d),
  });
  const body = JSON.stringify({ commentText: "halo", createCommentParams: "Eg0" });
  const res = await win.fetch(CREATE_URL, { method: "POST", body });
  return { calls, results, res, win };
}

test("nama build mengikuti pola phase test dan naik tiap percobaan", () => {
  assert.equal(PHASE_TEST_NUMBER, 5);
  assert.equal(BUILD_NAME, "AunuCore youtube gift (phase test #5)");
  assert.equal(makePhaseTestName(6), "AunuCore youtube gift (phase test #6)");
  assert.equal(nextPhaseTestName(5), "AunuCore youtube gift (phase test #6)");
});

test("deteksi hanya endpoint create_comment", () => {
  assert.equal(isCreateCommentRequest(`${CREATE_URL}`), true);
  assert.equal(
    isCreateCommentRequest("https://www.youtube.com/youtubei/v1/comment/create_comment_reply?key=x"),
    true,
  );
  assert.equal(
    isCreateCommentRequest("https://www.youtube.com/youtubei/v1/comment/update_comment"),
    false,
  );
  assert.equal(isCreateCommentRequest(""), false);
  assert.equal(isCreateCommentRequest(undefined), false);
});

test("mock before -> after: tenorId GIF terpilih terpasang", () => {
  assert.deepEqual(transformCreateCommentPayload(mockPayloadBefore(), { pendingGif: GIF }), mockPayloadAfter());
  const { armed } = applyGifToPayload(mockPayloadBefore(), GIF);
  assert.equal(armed, true);
});

test("payload asli tidak ikut termutasi", () => {
  const original = { commentText: "x" };
  applyGifToPayload(original, GIF);
  assert.equal(original.tenorId, undefined);
});

test("GIF non-Tenor (URL langsung) tidak bisa di-arm", () => {
  assert.equal(isTenorPostId("13710736021070431175"), true);
  assert.equal(isTenorPostId("direct:https://x/y.gif"), false);
  assert.equal(isTenorPostId(""), false);
  const { armed, payload } = applyGifToPayload({ commentText: "x" }, { id: "direct:u", gifUrl: "https://x/y.gif" });
  assert.equal(armed, false);
  assert.equal(payload.tenorId, undefined);
});

test("extractTenorId menemukan id di level atas maupun nested", () => {
  assert.equal(extractTenorId({ tenorId: "999" }), "999");
  assert.equal(extractTenorId({ a: { b: { tenorId: "777" } } }), "777");
  assert.equal(extractTenorId({ commentText: "x" }), undefined);
  assert.equal(extractTenorId(null), undefined);
});

test("classify: posted / blocked / gif / rejected / uncertain", () => {
  assert.equal(
    classifyCommentResponse({ httpStatus: 200, json: { actionResult: { status: "STATUS_SUCCEEDED" } } }).kind,
    "posted",
  );
  assert.equal(
    classifyCommentResponse({ httpStatus: 400, json: { error: { status: "INVALID_ARGUMENT" } } }).kind,
    "blocked",
  );
  const gifVerdict = classifyCommentResponse({
    httpStatus: 200,
    json: {
      actions: [{ showErrorAction: { errorMessage: { simpleText: "GIF tidak dikenal" } } }],
      actionResult: { status: "STATUS_SUCCEEDED" },
    },
  });
  assert.equal(gifVerdict.kind, "gif");
  assert.match(gifVerdict.message, /GIF tidak dikenal/);
  assert.equal(classifyCommentResponse({ httpStatus: 403, json: {} }).kind, "rejected");
  assert.equal(classifyCommentResponse({ httpStatus: 200, json: null }).kind, "uncertain");
  assert.deepEqual(collectShowErrorMessages({ a: [{ showErrorAction: { errorMessage: { simpleText: "x" } } }] }), ["x"]);
});

test("jadwal retry: 12 percobaan maksimum secara default", () => {
  assert.equal(RETRY_DELAYS_MS.length, 11);
  assert.equal(MAX_TRIES, 12);
});

test("pending GIF kedaluwarsa setelah TTL", () => {
  const t0 = 1_000_000;
  setPendingGif(GIF, t0);
  assert.deepEqual(getPendingGif(t0 + PENDING_TTL_MS - 1), GIF);
  assert.equal(getPendingGif(t0 + PENDING_TTL_MS + 1), null);
  setPendingGif(null);
});

test("interceptor: blocked 2x lalu posted -> 3 panggilan, tenorId terpasang, pending bersih", async () => {
  const { calls, results } = await runInterceptor([BLOCKED(), BLOCKED(), POSTED()]);
  assert.equal(calls.length, 3);
  const sent = JSON.parse(calls[0]);
  assert.equal(sent.tenorId, GIF.id);
  assert.equal(sent.commentText, "halo");
  assert.equal(results.at(-1).kind, "posted");
  assert.equal(results.at(-1).tries, 3);
  assert.equal(getPendingGif(), null);
});

test("interceptor: blocked terus -> berhenti di batas retry, pending dipertahankan", async () => {
  const { calls, results } = await runInterceptor([BLOCKED()]);
  assert.equal(calls.length, 3); // retryDelaysMs test = [1,1] -> 3 tries
  assert.equal(results.at(-1).kind, "blocked");
  assert.deepEqual(getPendingGif(), GIF);
  setPendingGif(null);
});

test("interceptor: tanpa pending GIF, request lolos utuh tanpa diubah", async () => {
  setPendingGif(null);
  let seen = null;
  const win = makeFakeWindow(async (input, init) => { seen = init?.body; return POSTED(); });
  installFetchInterceptor({
    win,
    sleep: async () => {},
    logger: { info() {}, warn() {}, debug() {} },
    onResult: () => assert.fail("tidak boleh ada hasil untuk komentar non-GIF"),
  });
  const body = JSON.stringify({ commentText: "teks biasa" });
  await win.fetch(CREATE_URL, { method: "POST", body });
  assert.equal(seen, body);
});

test("hook: salinan kedua mempensiunkan salinan pertama; request diproses sekali", async () => {
  let transportCalls = 0;
  let teardowns = 0;
  const win = makeFakeWindow(async () => { transportCalls++; return POSTED(); });
  const quiet = { info() {}, warn() {}, debug() {} };
  installFetchInterceptor({ win, logger: quiet, teardown: () => { teardowns++; } });
  installFetchInterceptor({ win, logger: quiet, sleep: async () => {}, onResult: () => {} });
  assert.equal(teardowns, 1);
  setPendingGif(GIF);
  await win.fetch(CREATE_URL, { method: "POST", body: JSON.stringify({ commentText: "x" }) });
  assert.equal(transportCalls, 1); // bukan 2 tumpukan interceptor
  setPendingGif(null);
});

test("hook live: false bila terpasang terlambat, true setelah request youtubei lewat wrapper", async () => {
  const win = makeFakeWindow(async () => POSTED(), "complete");
  installFetchInterceptor({ win, logger: { info() {}, warn() {}, debug() {} } });
  assert.equal(getHookLive(win), false);
  await win.fetch("https://www.youtube.com/youtubei/v1/browse?key=x", { method: "POST", body: "{}" });
  assert.equal(getHookLive(win), true);
});

test("hook live: langsung true bila terpasang saat document_start (readyState loading)", () => {
  const win = makeFakeWindow(async () => POSTED(), "loading");
  installFetchInterceptor({ win, logger: { info() {}, warn() {}, debug() {} } });
  assert.equal(getHookLive(win), true);
});
