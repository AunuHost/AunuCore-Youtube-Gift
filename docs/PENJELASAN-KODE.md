# Penjelasan Kode — AunuCore Youtube Gift

Dokumen ini menjelaskan isi repo: file apa saja, isinya apa, dan apa
yang berubah di tiap phase. Versi ringkas changelog ada di
`CHANGELOG.md`; skema rilis ada di `docs/RELEASES.md`.

## Masalah yang diselesaikan

Ekstensi "Desktop GIFs" memposting GIF Tenor ke komentar YouTube
desktop lewat field `tenorId` pada request
`youtubei/v1/comment/create_comment`. Sejak 14 Oktober 2026 YouTube
menolak field itu dengan `400 INVALID_ARGUMENT` (issue #93).
Field lampiran gambar (`imageAttachment.encryptedBlobId`) tidak
diblokir dengan cara yang sama — dari situlah ide workaround ini:
buang `tenorId`, ganti dengan lampiran gambar animated `.webp`
(YouTube sendiri memakai `.webp` animasi dari `ytimg.com`).

Batasan kerasnya: `encryptedBlobId` adalah token yang diterbitkan
server setelah gambar benar-benar di-upload. Ia tidak bisa
direkayasa, ditebak, atau dibuat dari konversi file lokal saja.

## Isi file per file

### `extension/src/main.js` — otaknya
Satu file, enam bagian:

1. **Identitas build** — `PHASE_TEST_NUMBER`, `makePhaseTestName()`,
   `nextPhaseTestName()`, `BUILD_NAME`
   (`AunuCore youtube gift (phase test #1)`), `LOG_PREFIX`.
   Ganti angka phase = ganti nama seluruh build.
2. **Deteksi request** — `isCreateCommentRequest(url)` mengenali
   pathname `/comment/create_comment`.
3. **Transformer murni** — `stripTenorDeep()` (hapus `tenorId`
   rekursif), `extractTenorId()`, `buildImageAttachment()`,
   `transformCreateCommentPayload()` (clone -> strip -> isi
   attachment bila blob id valid), plus `mockPayloadBefore/After()`
   untuk test. Bagian ini tidak menyentuh browser, jadi bisa diuji
   penuh dengan `node --test`.
4. **Konversi Tenor** — `fetchTenorAsWebpBlob(url, { convertGifToAnimatedWebp })`:
   ambil GIF, lalu encode ke animated WebP oleh encoder yang
   di-inject. Sengaja tidak hardcode encoder agar bisa diganti
   (libwebp WASM dsb.) dan agar test bisa memakai encoder palsu.
5. **Interceptor** — `installFetchInterceptor({ resolveEncryptedBlobId })`
   membungkus `window.fetch`: hanya untuk POST `create_comment`
   berbody JSON yang mengandung `tenorId`; sisanya diteruskan utuh.
   `resolveEncryptedBlobId` adalah titik sambung flow upload nyata
   (target phase #3) — di phase #1 ia mengembalikan `undefined`,
   jadi request terkirim sebagai komentar teks bersih.
6. **Auto-install** — hanya jalan di browser (`typeof window`),
   memasang interceptor + menaruh info build di
   `window.__AUNUCORE_YT_GIFT__`.

### `extension/src/picker.js` — tombol GIF + panel picker (phase #2)
Dua lapisan: (a) helper murni — URL builder Tenor v2, normalisasi
hasil ke `{id, title, gifUrl, previewUrl}`, validasi URL langsung,
dan state pemilihan; (b) UI browser — `ensureGifButton()` menyisipkan
tombol **GIF** ke `ytd-comment-simplebox-renderer`,
`initGifPicker()` memasang `MutationObserver` agar tombol muncul di
kotak komentar yang dirender belakangan, dan panel picker (cari di
Tenor bila API key terisi, atau tempel URL `.gif`/`.webp` langsung).
GIF terpilih diumumkan lewat CustomEvent `aunucore:gif-selected`;
`main.js` menyimpannya sebagai *pending GIF*. Di phase #2 GIF belum
terlampir ke komentar — itu pekerjaan resolver di phase #3.

### `extension/src/loader.js` dan `root-loader.js`
Content script kecil. Tugasnya menyuntikkan `main.js` sebagai
`<script type="module">` ke halaman (MAIN world) — syarat agar
`window.fetch` milik YouTube yang ter-intercept, dan agar sintaks
ES module di `main.js` tidak error. `loader.js` untuk manifest di
`extension/`, `root-loader.js` untuk manifest di root repo.

### `extension/manifest.json` dan `manifest.json` (root)
Manifest V3: nama `AunuCore youtube gift (phase test #1)`, versi
`1.0.0`, content script loader di `*://www.youtube.com/*`,
`main.js` didaftarkan sebagai web-accessible resource, host
permission YouTube + Tenor. Dua manifest disediakan supaya Load
unpacked bisa memilih folder root ataupun folder `extension/`.

### `extension/src/main.test.js` dan `picker.test.js`
Total 17 test. main: pola nama phase, deteksi endpoint, transformasi
mock before -> after, penghapusan rekursif, payload asli tidak
termutasi, penolakan blob id palsu, ekstraksi tenorId, pending GIF,
kontrak `fetchTenorAsWebpBlob`. picker: URL builder Tenor,
normalisasi hasil, validasi URL langsung, state pilih/bersihkan,
dan kontrak `searchTenor`. Jalankan:
`node --test extension/src/main.test.js extension/src/picker.test.js`.

### `README.md`, `CHANGELOG.md`, `docs/RELEASES.md`
README = cara install + ringkasan. CHANGELOG = catatan percobaan,
perubahan, optimisasi per versi. RELEASES = aturan main rilis.

## Apa saja yang dirubah di phase test #1 (dari draft awal)

| Aspek | Draft awal | Phase test #1 |
|---|---|---|
| Struktur | Potongan kode lepas | File utuh modular, 6 bagian |
| Penamaan | Tidak ada | `BUILD_NAME` otomatis per phase |
| Manifest | Tidak ada (Load unpacked gagal) | MV3 di root + `extension/` |
| Cara muat `main.js` | Belum jelas | Loader `<script type="module">` ke MAIN world |
| Attachment | Mock disebut saja | Hanya diisi bila blob id valid; mock khusus test |
| Test | Contoh singkat | 9 test terverifikasi hijau |
| Dokumentasi | Tidak ada | README + CHANGELOG + dokumen ini + RELEASES |

## Apa yang berubah di phase test #2

| Aspek | Phase test #1 | Phase test #2 |
|---|---|---|
| UI | Tidak ada sama sekali | Tombol GIF di kotak komentar + panel picker |
| Sumber GIF | — | Pencarian Tenor v2 (perlu API key) + tempel URL langsung |
| Kaitan UI <-> interceptor | — | Pending GIF via CustomEvent; interceptor terpicu & membersihkannya |
| Label console | Ada field nama phase berikutnya (membingungkan) | Dihapus — console hanya menyebut phase aktif |
| Test | 9 | 17 (tambah 7 picker + 1 pending GIF) |
