# Build Android dan release

## Toolchain

Source v3.1.0 memakai React Native 0.87.1. Build Android membutuhkan:

- Node.js 22.11 atau lebih baru
- JDK 21
- Android SDK Platform 36 dan Build Tools 36.1.0
- Android NDK 27.1.12297006
- ABI APK: `arm64-v8a`

## Build lokal

Dari root project:

```bash
npm ci
bash scripts/prepare-tdlib.sh
npm run typecheck
npm test -- --runInBand
cd android
./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`.

Script `prepare-tdlib.sh` menyiapkan kompatibilitas modul native TDLib dan membuang ABI native TDLib yang tidak dipakai oleh build arm64. Jalankan setelah `npm ci`.

## Signing untuk distribusi Anda

APK v3.1.0 yang disertakan ditandatangani dengan **Android debug certificate**, bukan kunci produksi. Jangan gunakan atau bagikan debug keystore milik mesin Anda. Untuk rilis sendiri, buat keystore baru dan simpan salinannya secara aman di luar repository:

```bash
keytool -genkeypair -v \
  -keystore hyperlink-release.jks \
  -alias hyperlink-release \
  -keyalg RSA -keysize 2048 -validity 10000
```

Jangan commit `.jks`, password, atau private key. Gradle menerima variabel lingkungan `RELEASE_KEYSTORE_PATH`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, dan `RELEASE_KEY_PASSWORD`.

Untuk workflow GitHub Actions, tambahkan secrets berikut di **Repository → Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64` — isi keystore yang di-Base64-kan (`base64 -w0 hyperlink-release.jks` di Linux).
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Jika keystore tidak diberikan, workflow menghasilkan APK bertanda debug untuk evaluasi saja. Kunci produksi yang berbeda tidak dapat memperbarui instalasi APK yang ditandatangani oleh kunci lain; pengguna harus mempertahankan kunci rilis yang sama untuk semua update.

## GitHub Actions

Workflow `.github/workflows/android.yml` berjalan pada push/PR ke cabang utama, tag `v*`, atau pemicu manual. Workflow memasang toolchain, menjalankan typecheck/test, membangun satu APK arm64, dan mengunggah artifact. Tag versi yang lulus build menerbitkan GitHub Release berisi APK, source ZIP, dan file SHA-256 yang sama dengan isi repository.

Jangan mengaktifkan workflow dari pull request yang tidak dipercaya setelah menambahkan signing secrets; jangan pernah mencetak isi secret ke log.

## Verifikasi source lokal

Pada source v3.1.0 yang disiapkan untuk repo:

- `npm run typecheck` — lulus.
- `npm test -- --runInBand` — 17 suite, 78 test lulus.
- APK yang disertakan — package `com.tradepilotnative`, versionName `3.1.0`, versionCode `34`, min/target API `31/36`, arm64-v8a, signature debug.

Tes unit dan metadata APK bukan pengganti uji pada perangkat atau uji exchange testnet.
