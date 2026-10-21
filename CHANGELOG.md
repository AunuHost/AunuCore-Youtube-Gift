# Changelog — AunuCore Youtube Gift

Semua percobaan, perubahan, dan optimisasi dicatat di file ini.
Skema rilis:

- **Phase test** = rilis percobaan (GitHub *pre-release*), tag
  `v0.<phase>.0-phase-test.<phase>` — contoh: phase test #1 =
  `v0.1.0-phase-test.1`. Setiap percobaan menaikkan nomor phase dan
  nama build: `AunuCore youtube gift (phase test #<n>)`.
- **Real release `v1.0.0`** = rilis stabil pertama. Dirilis hanya jika
  alur end-to-end terbukti jalan: GIF Tenor -> animated WebP -> upload
  gambar YouTube -> `encryptedBlobId` asli -> komentar terkirim dengan
  lampiran. Changelog `v1.0.0` nanti merangkum SEMUA percobaan phase
  test (yang berhasil, yang gagal, dan optimisasinya).

Format mengikuti Keep a Changelog: Added / Changed / Fixed /
Optimizations / Known Issues / Experiments.

---

## [Unreleased] — menuju v1.0.0

### Rencana percobaan berikutnya
- Phase test #2: capture 1x pengiriman komentar bergambar manual yang
  berhasil (DevTools Network) untuk memetakan struktur persis
  `imageAttachment` dan endpoint upload gambar YouTube.
- Phase test #3: implementasi `resolveEncryptedBlobId` nyata
  (fetch Tenor -> encode animated WebP -> upload -> blob id).
- Phase test #4: uji end-to-end kirim komentar GIF di desktop.

### Kriteria lolos v1.0.0 (real release)
- [ ] Komentar dengan GIF terkirim dan lampirannya tampil di YouTube desktop
- [ ] Tidak ada request yang gagal 400 gara-gara `tenorId`
- [ ] Test suite hijau + uji manual terdokumentasi di changelog
- [ ] README memuat cara install dari GitHub Release

---

## [0.1.0-phase-test.1] — 2026-10-21 — AunuCore youtube gift (phase test #1)

Rilis percobaan pertama. Tujuan phase ini BUKAN GIF langsung tampil,
melainkan membuktikan fondasi: request `create_comment` yang membawa
`tenorId` tidak lagi gagal 400 gara-gara field tersebut.

### Added
- `extension/src/main.js` — interceptor `fetch` modular:
  - `transformCreateCommentPayload()` (fungsi murni) menghapus
    `tenorId` / `tenorAttachment` secara rekursif di semua level
    nesting & array, tanpa memutasi payload asli.
  - `buildImageAttachment()` mengisi `imageAttachment.encryptedBlobId`
    HANYA jika blob id valid tersedia; nilai palsu tidak pernah
    disuntikkan ke request live.
  - `fetchTenorAsWebpBlob()` — fetch GIF Tenor + konversi animated
    WebP lewat encoder yang di-inject (mis. libwebp WASM).
  - `installFetchInterceptor()` — intersepsi khusus
    `POST */comment/create_comment`, mendukung body dari `init.body`
    maupun objek `Request`; request non-JSON / bukan GIF diteruskan
    apa adanya.
  - Sistem penamaan percobaan: `PHASE_TEST_NUMBER` -> `BUILD_NAME`
    (`AunuCore youtube gift (phase test #1)`), dipakai di prefix log
    dan `window.__AUNUCORE_YT_GIFT__`. Nama TIDAK disuntikkan ke
    payload (field asing berisiko 400).
- `extension/src/main.test.js` — 9 unit test (`node --test`), semua lolos.
- `extension/manifest.json` + `manifest.json` (root) — Manifest V3 agar
  ekstensi bisa di-Load unpacked dari folder `extension/` maupun root.
- `extension/src/loader.js` + `root-loader.js` — menyuntikkan `main.js`
  (ES module) sebagai `<script type="module">` ke konteks halaman
  YouTube, karena interceptor harus berjalan di MAIN world.
- `docs/PENJELASAN-KODE.md` — penjelasan isi tiap file & alur data.
- `docs/RELEASES.md` — aturan skema rilis phase test -> v1.0.0.

### Experiments (percobaan di phase ini)
- Payload tiruan (mock) before/after diverifikasi di unit test:
  before membawa `tenorId`, after bersih + `imageAttachment` mock.
- Percobaan Load unpacked pertama gagal: "Manifest file is missing or
  unreadable" — karena paket awal hanya berisi `main.js`.

### Fixed
- Kegagalan Load unpacked di atas: ditambahkan `manifest.json`
  (MV3) di root dan di `extension/`, plus loader module — ekstensi
  sekarang bisa dimuat Chrome.

### Optimizations
- Transformer bekerja pada clone (`structuredClone`), payload asli
  YouTube tidak pernah dimutasi.
- Interceptor keluar sedini mungkin untuk request yang bukan
  `create_comment` / bukan POST / bukan JSON (overhead ~0 di halaman lain).

### Known Issues
- `resolveEncryptedBlobId` masih mengembalikan `undefined` dengan
  sengaja: GIF belum benar-benar terkirim sebagai lampiran. Yang
  terverifikasi di phase ini baru penghapusan `tenorId`.
- `encryptedBlobId` tidak bisa dibuat di client; wajib berasal dari
  response flow upload gambar YouTube yang nyata (target phase #2–#3).
- Konversi GIF -> animated WebP butuh encoder asli; mengganti
  ekstensi / MIME type saja akan gagal validasi server.
