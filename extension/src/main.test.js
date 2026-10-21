/**
 * Test untuk: AunuCore youtube gift (phase test #1)
 * Jalankan: node --test extension/src/main.test.js
 * Setiap naik phase, update ekspektasi BUILD_NAME di test pertama.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILD_NAME,
  PHASE_TEST_NUMBER,
  makePhaseTestName,
  nextPhaseTestName,
  isCreateCommentRequest,
  extractTenorId,
  buildImageAttachment,
  transformCreateCommentPayload,
  mockPayloadBefore,
  mockPayloadAfter,
  fetchTenorAsWebpBlob,
} from "./main.js";

test("nama build mengikuti pola phase test dan naik tiap percobaan", () => {
  assert.equal(PHASE_TEST_NUMBER, 1);
  assert.equal(BUILD_NAME, "AunuCore youtube gift (phase test #1)");
  assert.equal(makePhaseTestName(2), "AunuCore youtube gift (phase test #2)");
  assert.equal(nextPhaseTestName(1), "AunuCore youtube gift (phase test #2)");
  assert.notEqual(makePhaseTestName(1), makePhaseTestName(2));
});

test("deteksi hanya endpoint create_comment", () => {
  assert.equal(
    isCreateCommentRequest(
      "https://www.youtube.com/youtubei/v1/comment/create_comment?key=x&prettyPrint=false",
    ),
    true,
  );
  assert.equal(
    isCreateCommentRequest("https://www.youtube.com/youtubei/v1/comment/update_comment"),
    false,
  );
  assert.equal(isCreateCommentRequest(""), false);
  assert.equal(isCreateCommentRequest(undefined), false);
});

test("mock before -> after: tenorId hilang, imageAttachment mock terisi", () => {
  const out = transformCreateCommentPayload(mockPayloadBefore(), {
    encryptedBlobId: "MOCK_BLOB_ID_FROM_REAL_UPLOAD_RESPONSE",
  });
  assert.deepEqual(out, mockPayloadAfter());
});

test("tenorId terhapus rekursif di semua level nesting & array", () => {
  const out = transformCreateCommentPayload({
    tenorId: "1",
    nested: { tenorId: "2", list: [{ tenorId: "3", keep: true }] },
    commentText: "x",
  });
  assert.equal("tenorId" in out, false);
  assert.equal("tenorId" in out.nested, false);
  assert.equal("tenorId" in out.nested.list[0], false);
  assert.equal(out.nested.list[0].keep, true);
  assert.equal(out.commentText, "x");
});

test("payload asli tidak ikut termutasi", () => {
  const original = { tenorId: "123", commentText: "x" };
  transformCreateCommentPayload(original, { encryptedBlobId: "MOCK" });
  assert.equal(original.tenorId, "123");
  assert.equal(original.imageAttachment, undefined);
});

test("tanpa encryptedBlobId valid, tidak memalsukan imageAttachment", () => {
  const out = transformCreateCommentPayload({ tenorId: "123" }, {});
  assert.equal(out.imageAttachment, undefined);
  assert.equal(buildImageAttachment({}), null);
  assert.equal(buildImageAttachment({ encryptedBlobId: 42 }), null);
  assert.deepEqual(buildImageAttachment({ encryptedBlobId: "abc" }), {
    encryptedBlobId: "abc",
  });
});

test("extractTenorId menemukan id di level atas maupun nested", () => {
  assert.equal(extractTenorId({ tenorId: "999" }), "999");
  assert.equal(extractTenorId({ a: { b: { tenorId: "777" } } }), "777");
  assert.equal(extractTenorId({ commentText: "x" }), undefined);
  assert.equal(extractTenorId(null), undefined);
});

test("fetchTenorAsWebpBlob menolak jika encoder belum dipasang", async () => {
  await assert.rejects(
    () => fetchTenorAsWebpBlob("https://media.tenor.com/x.gif", {}),
    /convertGifToAnimatedWebp belum dipasang/,
  );
});

test("fetchTenorAsWebpBlob memakai encoder yang di-inject", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    blob: async () => new Blob(["GIF89a"], { type: "image/gif" }),
  });
  const fakeConvert = async (blob) => {
    assert.equal(blob.type, "image/gif");
    return new Blob(["RIFF....WEBP"], { type: "image/webp" });
  };
  const out = await fetchTenorAsWebpBlob("https://media.tenor.com/x.gif", {
    fetchImpl: fakeFetch,
    convertGifToAnimatedWebp: fakeConvert,
  });
  assert.equal(out.type, "image/webp");
});
