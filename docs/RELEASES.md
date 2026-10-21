# Skema Rilis — AunuCore Youtube Gift

## Aturan main

1. **Satu phase = satu pre-release di GitHub.**
   - Nama rilis: `AunuCore youtube gift (phase test #<n>)`
   - Tag: `v0.<n>.0-phase-test.<n>` — contoh phase #1:
     `v0.1.0-phase-test.1`
   - Centang **Set as a pre-release** (bukan latest).
   - Isi catatan rilis diambil dari section phase itu di
     `CHANGELOG.md`: apa yang dicoba, apa yang berubah, optimisasi,
     dan known issues.
   - Lampirkan zip ekstensi versi phase itu sebagai asset rilis.
   - Kode di tag itu harus persis sama dengan yang diuji
     (`PHASE_TEST_NUMBER` di `main.js` = nomor phase rilis).

2. **Naik phase** bila ada percobaan baru yang berarti: capture
   struktur payload baru, implementasi upload, encoder WebP,
   perbaikan dari kegagalan phase sebelumnya, dll.
   Setiap kegagalan phase WAJIB tercatat di CHANGELOG — itu bahan
   rangkuman `v1.0.0`.

3. **Real release `v1.0.0`** diterbitkan hanya bila semua kriteria
   di `CHANGELOG.md` bagian `[Unreleased]` terpenuhi. Rilis ini:
   - Bukan pre-release, ditandai **Latest**.
   - Tag: `v1.0.0`
   - Catatan rilisnya merangkum SELURUH perjalanan phase test:
     daftar percobaan, kegagalan (mis. manifest hilang di percobaan
     awal), optimisasi yang dipakai di versi final, dan cara kerja
     solusi akhirnya.
   - Setelah `v1.0.0`, perubahan berikutnya mengikuti semver biasa
     (`v1.0.1` patch, `v1.1.0` fitur, dst.) dan phase test dihentikan.

## Peta jalan saat ini

| Versi | Status | Isi |
|---|---|---|
| `v0.1.0-phase-test.1` | Rilis percobaan #1 | Interceptor + strip `tenorId`, manifest + loader, 9 test |
| `v0.2.0-phase-test.2` | Rilis percobaan #2 | Tombol GIF + panel picker Tenor/URL langsung, pending GIF, 17 test |
| `v0.3.0-phase-test.3` | Direncanakan | Capture struktur `imageAttachment` + endpoint upload, `resolveEncryptedBlobId` nyata + encoder animated WebP |
| `v0.4.0-phase-test.4` | Direncanakan | Uji end-to-end kirim komentar GIF |
| `v1.0.0` | Target real release | Rangkuman semua percobaan & optimisasi |
