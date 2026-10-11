# Keamanan

## Credential dan signing key

- Jangan commit API key, API secret, passphrase, Telegram API Hash, kode login, password 2FA, sesi Telegram, `.env`, atau keystore.
- Credential untuk layanan dimasukkan melalui Setelan aplikasi. Gunakan perangkat yang Anda percaya; cabut key dari provider jika hilang atau dicurigai terekspos.
- Buat API exchange dengan akses minimum. Jangan aktifkan izin withdrawal/transfer. Gunakan testnet/Demo lebih dahulu.
- Jangan mengirim nilai credential, header autentikasi, atau file keystore ke issue, log CI, screenshot publik, atau chat.
- Simpan kunci signing produksi sebagai GitHub Actions Secrets atau secret manager lain. Jangan masukkan private key ke repository.

## Laporan kerentanan

Jika menemukan masalah keamanan, laporkan secara privat kepada pemilik repository melalui saluran yang tersedia di GitHub (mis. Security Advisory jika diaktifkan). Jangan memublikasikan detail exploit atau credential yang masih aktif sebelum ada kesempatan untuk mitigasi.

APK rilis yang disediakan ditandatangani dengan sertifikat debug dan ditujukan untuk evaluasi manual. Verifikasi source dan checksum sebelum memasang; untuk distribusi produksi, bangun sendiri dan tanda tangani dengan keystore milik Anda.
