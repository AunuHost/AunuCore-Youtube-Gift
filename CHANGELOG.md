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
- Phase test #4: capture 1x pengiriman komentar bergambar manual yang
  berhasil (DevTools Network) untuk memetakan struktur persis
  `imageAttachment` + endpoint upload, lalu implementasi
  `resolveEncryptedBlobId` nyata
  (fetch Tenor -> encode animated WebP -> upload -> blob id),
  ditutup uji end-to-end kirim komentar GIF di desktop.

### Kriteria lolos v1.0.0 (real release)
- [ ] Komentar dengan GIF terkirim dan lampirannya tampil di YouTube desktop
- [ ] Tidak ada request yang gagal 400 gara-gara `tenorId`
- [ ] Test suite hijau + uji manual terdokumentasi di changelog
- [ ] README memuat cara install dari GitHub Release---

## [0.3.0-phase-test.3] — 2026-10-21 — AunuCore youtube gift (phase test #3)

Rilis percobaan ketiga. Fokus: pencarian Tenor di picker tidak lagi
membutuhkan API key pribadi, dengan mempelajari dan menerapkan pola
ekstensi desktop_gifs (rayytor/desktop_gifs).

### Added
- `extension/src/sw.js` — service worker khusus Tenor:
  - Mengambil key situs tenor.com (`API_V2_KEY` + `API_V2_CLIENT_KEY`)
    dari elemen `<script id="data">` (base64 JSON) di halaman
    tenor.com — key yang sama yang dipakai script situs Tenor sendiri.
  - Key disimpan di `chrome.storage.local`; pencarian berikutnya
    memakai key simpanan tanpa mengambil tenor.com lagi.
  - Panggilan API `tenor.googleapis.com/v2` dengan
    `contentfilter=high` (rating G) + `media_filter=tinygif,tinywebp,gif`.
  - Key ditolak (400/401/403) -> dibuang, panen ulang dari tenor.com,
    panggil ulang sekali.
  - API gagal total -> fallback ke data `<script id="store-cache">`
    yang disematkan Tenor di halaman featured/pencariannya.
  - Filter hasil: ID numerik, bukan sticker/static, rating G di jalur API.
- `extension/src/content-bridge.js` — jembatan `postMessage` antara
  picker (MAIN world, tak bisa akses `chrome.runtime`) dan service
  worker (`chrome.runtime.sendMessage`).
- `extension/src/sw.test.js` — 7 test service worker
  (total suite 26, semua lolos).
- Manifest: `background.service_worker` (module), permission
  `storage`, host permission `tenor.com` + `tenor.googleapis.com`,
  content script bridge di kedua manifest.

### Changed
- `searchGifs()` di picker: jalur utama kini lewat bridge ke service
  worker; API key pribadi turun peran menjadi override developer saja.
- Panel picker tidak lagi menampilkan pesan "butuh API key".
- Identitas build naik ke phase test #3 di semua file identitas
  (manifest versi `0.3.0`).
- Peta jalan digeser: phase #3 yang semula direncanakan untuk
  resolver upload kini dipakai untuk keyless search (keputusan Aunu:
  jalur Tenor dinilai stabil); resolver upload menjadi phase #4.

### Experiments
- Pola panen key situs dipelajari dari `extension/src/sw.js` milik
  rayytor/desktop_gifs, lalu ditulis ulang sesuai arsitektur repo ini
  (ES module + dependency injection agar teruji), bukan salinan.

### Known Issues
- Jalur key situs bergantung pada format halaman tenor.com; bila
  Tenor mengubah format `<script id="data">` / `store-cache`,
  pencarian bisa mati dan picker menampilkan error dari service worker.
- Service worker berbentuk ES module (Chrome). Dukungan Firefox
  (background scripts klasik) belum ditangani.
- GIF terpilih tetap belum terlampir ke komentar (resolver = phase #4).

---

## [0.2.0-phase-test.2] — 2026-10-21 — AunuCore youtube gift (phase test #2)

Rilis percobaan kedua. Fokus phase ini: UI yang hilang di phase #1 —
tombol GIF + panel picker, tersambung ke interceptor sebagai
*pending GIF*.

### Added
- `extension/src/picker.js` — UI picker lengkap:
  - Tombol **GIF** disisipkan ke kotak komentar YouTube desktop
    (`ytd-comment-simplebox-renderer`), dijaga `MutationObserver`
    agar muncul juga di kotak komentar yang dirender belakangan
    (balasan, panel komentar, navigasi SPA).
  - Panel picker: pencarian Tenor v2 (`search` / `featured`),
    grid hasil 4 kolom, klik GIF untuk memilih.
  - Mode **tempel URL langsung**: URL http/https berakhiran
    `.gif`/`.webp` bisa dipakai tanpa API key.
  - State pemilihan (`pickerState`) + CustomEvent
    `aunucore:gif-selected` / `aunucore:gif-cleared`.
  - Helper murni yang teruji: `buildTenorSearchUrl`,
    `buildTenorFeaturedUrl`, `normalizeTenorResults`,
    `isDirectGifUrl`, `gifFromDirectUrl`, `searchTenor`.
- `extension/src/picker.test.js` — 7 test picker (total suite 17, lolos semua).
- Integrasi di `main.js`: `setPendingGif` / `getPendingGif`;
  interceptor sekarang juga terpicu oleh pending GIF (bukan hanya
  `tenorId`), meneruskannya ke resolver, dan membersihkannya setelah
  komentar terkirim (response OK). `pickerState` + `getPendingGif`
  diekspos di `window.__AUNUCORE_YT_GIFT__` untuk inspeksi console.
- `picker.js` didaftarkan sebagai web-accessible resource di kedua manifest.

### Changed
- Semua identitas build naik ke phase test #2: `PHASE_TEST_NUMBER`,
  nama di kedua `manifest.json` (versi manifest `0.2.0`), loader, README.
- Urutan peta jalan digeser: picker yang semula tidak terjadwal kini
  menjadi phase #2 (karena tanpa UI tidak ada GIF yang bisa dipilih
  untuk diuji); capture upload + resolver menjadi phase #3.

### Fixed
- Console menandai build sebagai "phase test #2" padahal yang berjalan
  phase #1 (field `nextPhaseName` di `window.__AUNUCORE_YT_GIFT__`) —
  field itu dihapus (commit `183357e`, di antara rilis #1 dan #2).

### Experiments
- Pencarian Tenor butuh API key pribadi; tanpa key, panel memberi
  pesan jelas dan mode URL langsung tetap berfungsi penuh.

### Known Issues
- GIF terpilih **belum terlampir** ke komentar: resolver upload masih
  `undefined` sampai phase #3. Komentar tetap terkirim sebagai teks,
  pending GIF tercatat di console dan terpakai (dibersihkan).
- Selector kotak komentar mengikuti struktur DOM YouTube saat ini;
  perubahan DOM YouTube bisa memerlukan penyesuaian selector.
- Tombol GIF dirancang untuk halaman watch desktop; tampilan
  komentar Shorts memakai renderer berbeda dan belum dijamin.

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
