# Panduan konfigurasi API Hyperlink

Dokumen ini menjelaskan API yang dapat dikonfigurasi di aplikasi Hyperlink 3.1.1. **Tidak perlu menanam API key ke source code, `.env`, atau GitHub.** Masukkan credential melalui menu Setelan di perangkat.

> Mulai dengan Demo dan testnet. Jangan memberikan izin penarikan dana pada API key exchange. Jangan membagikan API Secret, passphrase, Telegram API Hash, kode login, password 2FA, atau sesi Telegram.

## 1. Telegram (opsional)

Dipakai untuk login TDLib, memilih channel/grup yang dipantau, membaca riwayat, dan—bila diaktifkan—mendeteksi call baru. Hyperlink tidak memerlukan bot token untuk alur TDLib ini.

1. Buka [my.telegram.org](https://my.telegram.org), masuk dengan akun Telegram, lalu buka **API development tools**.
2. Buat aplikasi Telegram dan catat **API ID** (angka) serta **API Hash** (32 karakter alfanumerik).
3. Di Hyperlink, buka **Setelan → Telegram**, masukkan API ID dan API Hash, lalu pilih **Pilih tindakan Telegram → Simpan pengaturan Telegram**.
4. Pilih **Mulai / ulangi TDLib**. Masukkan nomor dalam format internasional (contoh `+62…`), kode yang diterima dari Telegram, dan password 2FA jika diminta.
5. Setelah status **Terhubung**, pilih channel/grup yang ingin dipantau. Aktifkan sakelar automation hanya jika Anda memang ingin memantau call baru.
6. Untuk membaca pesan lama, pilih **Scan riwayat**. Channel yang dipilih dan automation dapat diatur kembali kapan saja.

TDLib menjalankan sesi akun Telegram pada perangkat. Logout dari Setelan menghapus sesi lokal. Telegram/layanan pihak ketiga tetap menerapkan aturan dan pembatasannya sendiri.

## 2. Google Gemini (opsional, untuk analisis AI)

Gemini membantu menganalisis pesan yang tidak dikenali parser lokal dan memberi saran margin yang dibatasi oleh perhitungan risiko lokal. Pemakaian Gemini memerlukan API key dan tunduk pada kuota/kebijakan Google.

1. Buka [Google AI Studio](https://aistudio.google.com/) dan buat API key untuk akun/proyek Anda.
2. Di Hyperlink buka **Setelan → AI & data → Gemini AI**.
3. Tempel key pada **Google AI Studio API Key**, pilih model yang tersedia atau masukkan nama model manual.
4. Tekan **Simpan, test & muat model**. Jika model tidak muncul, test koneksi lalu pilih model yang didukung akun Anda.

Key tidak diperlukan untuk setiap input: parser lokal dapat menangani format call yang dikenali. Tanpa key, fitur Gemini tidak tersedia; gunakan analisis manual dan selalu periksa nilai entry, SL, TP, leverage, serta arah.

## 3. CoinGecko (opsional)

Harga/data publik bisa digunakan tanpa key, tetapi key dapat membantu mengurangi batas request.

1. Dapatkan key dari halaman API CoinGecko resmi: [coingecko.com/en/api](https://www.coingecko.com/en/api).
2. Buka **Setelan → AI & data → Data & sumber**.
3. Masukkan key ke **CoinGecko Demo API key (opsional)** lalu simpan.
4. Pilih sumber harga Demo CoinGecko atau ticker publik exchange dari Beranda sesuai kebutuhan.

CoinGecko key bukan credential exchange dan tidak mengaktifkan order Live.

## 4. API exchange (Live)

Hyperlink mendukung Bitget, Bybit, OKX, dan Binance. Buat API key dari dashboard resmi exchange yang Anda pakai. Nama menu pembuatan API berbeda menurut exchange dan dapat berubah.

### Hak akses yang disarankan

- Mulai dari key **read-only** untuk menguji koneksi dan membaca saldo/posisi.
- Jika akan mengirim/mengelola order, aktifkan hanya izin trading yang benar-benar diperlukan.
- **Jangan aktifkan withdrawal/transfer.** Gunakan IP allowlist jika tersedia dan cocok dengan jaringan Anda.
- Pisahkan key testnet dan mainnet. Simpan key mainnet untuk penggunaan sadar risiko saja.

### Masukkan key di aplikasi

1. Buka **Setelan → Exchange**, pilih exchange yang benar.
2. Masukkan field yang diminta:
   - **Bitget:** API Key, API Secret, API Passphrase.
   - **Bybit:** API Key dan API Secret.
   - **OKX:** API Key, API Secret, API Passphrase.
   - **Binance:** API Key dan API Secret.
3. Untuk Bybit/OKX/Binance pilih lingkungan testnet/demo terlebih dahulu jika tersedia. Untuk Bitget, aplikasi menandai bahwa tidak ada testnet publik pada alur ini; gunakan mode Demo aplikasi untuk menguji strategi tanpa mengirim order.
4. Buka **Tindakan koneksi Exchange → Test koneksi**. Untuk memperbarui saldo/posisi pilih **Simpan & sinkron**.
5. Pastikan akun, exchange, pair, jumlah, leverage, mode margin, SL/TP, dan lingkungan sudah tepat sebelum menyetujui order apa pun.

**Demo aplikasi dan testnet exchange berbeda:** Demo adalah simulasi lokal Hyperlink dan tidak mengirim order. Testnet exchange mengirim request ke lingkungan uji exchange. Mainnet menggunakan akun nyata.

### Sebelum Live

- Pastikan mode **Live** memang dipilih, lingkungan menunjukkan **Mainnet**, dan API key exchange yang benar terpasang.
- Baca kembali dialog konfirmasi order. Jangan mengandalkan saran AI untuk menentukan ukuran posisi.
- Auto-entry Telegram nonaktif secara default. Pertahankan mati sampai Anda memahami seluruh kondisi, risiko, dan pengaman.
- Bila koneksi gagal, jangan menempelkan key ke issue/chat/log publik. Periksa exchange, lingkungan testnet/mainnet, izin key, passphrase, jam perangkat, dan status akun.

## Di mana credential disimpan dan bagaimana data mengalir?

Credential disimpan pada perangkat melalui library `react-native-keychain` (di Android melalui fasilitas Keystore yang digunakan library). API request dilakukan dari aplikasi ke provider yang dipilih; source ini tidak menyertakan backend Hyperlink untuk menyimpan credential. Telegram menjalankan TDLib secara lokal di aplikasi. Credential tidak tersinkron otomatis ke perangkat lain.

Karena key digunakan dari aplikasi mobile, perlakukan perangkat dan APK sebagai bagian dari batas kepercayaan Anda. Jangan gunakan APK modifikasi/tidak dikenal untuk memasukkan key. Cabut/revoke key dari dashboard provider jika key terindikasi terekspos.

## Pemecahan masalah singkat

- **401/invalid signature:** pastikan key/secret/passphrase berasal dari exchange dan environment yang sama; buat key baru jika ragu.
- **403/permission denied:** cek izin API serta restriction IP/akun. Jangan menambah izin withdrawal untuk memperbaiki error.
- **Gemini 403/429:** periksa akses/kuota/wilayah dan model; tunggu bila dibatasi.
- **Harga tidak tampil:** periksa koneksi, sumber harga yang dipilih, dan batas request provider.
- **Jangan pernah mengirim API key atau log berisi header/auth ke issue GitHub.**
