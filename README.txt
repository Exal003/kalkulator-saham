KALKULATOR SAHAM PWA v1.4.1

Perubahan v1.1.0:
- Input utama tidak lagi berisi angka bawaan.
- Hasil awal tetap tanda strip sampai tombol Hitung diklik.
- Price ladder diperkuat untuk harga dekat perubahan fraksi, misalnya 199 ke 200 ke 202.
- Cache service worker dinaikkan ke v1.1.0.

Update v1.2.0:
- Menambahkan mode TP: nominal Rupiah lama, persen dari alokasi, tick, dan harga.
- Menambahkan mode SL: R:R lama, nominal Rupiah, persen dari alokasi, tick, dan harga.
- Total modal sekarang opsional. Validasi total modal hanya aktif jika kolom tersebut diisi.
- Menambahkan auto alokasi per trade berdasarkan target profit + TP atau risiko SL + SL.
- Menambahkan cek area ARA/ARB harian berdasarkan close kemarin, termasuk mode reguler, simetris, dan custom.
- Fungsi lama tetap tersedia sebagai mode default.

Update v1.3.0:
- Menambahkan tombol Update di bagian header aplikasi.
- Menambahkan file version.json untuk membaca versi terbaru dari server.
- Menambahkan notifikasi update tersedia.
- Menambahkan tombol Muat ulang agar pengguna bisa memakai versi baru tanpa download ulang aplikasi.
- Service worker sekarang membersihkan cache lama dan mengaktifkan cache versi terbaru.

Update v1.3.1:
- Memperbaiki logika cari alokasi dari Entry + Target Profit Bersih + TP tick/harga.
- Total Modal dan Alokasi per Trade boleh kosong saat pengguna mencari alokasi dana yang diperlukan.
- Nominal Auto untuk mode target profit tidak wajib jika kolom Target Profit Bersih sudah diisi.
- Jika TP belum diisi, aplikasi memberi pesan yang lebih tepat: pilih TP mode tick atau harga.

Cara update di GitHub:
1. Ekstrak ZIP.
2. Buka folder kalkulator-saham-pwa-v1-4-1.
3. Upload semua isi folder ke repository GitHub yang sama.
4. Commit changes.
5. Tunggu GitHub Pages selesai deploy.
6. Buka aplikasi.
7. Tekan tombol Update.
8. Jika muncul notifikasi Update tersedia, tekan Muat ulang.

Catatan penting:
- Untuk update berikutnya, naikkan APP_VERSION di app.js, APP_VERSION di sw.js, versi di version.json, dan teks versi di index.html.
- Pengguna tidak perlu install ulang PWA dari layar utama.
- Jika pengguna masih berada di versi lama sebelum fitur Update tersedia, cukup tutup aplikasi lalu buka lagi, atau refresh dari browser satu kali setelah upload v1.4.1.

Tes cari alokasi dari profit bersih:
Dana Trading Tersedia: kosong
Position Size / Plafon Posisi: kosong
Harga Entry: 199
Target Net Profit: 2.000.000
Mode TP: Jumlah tick ke atas
Nilai TP Baru: 5
Mode Alokasi: boleh tetap Manual seperti lama
Fee Beli: 0,15
Fee Jual Total: 0,25
Pajak Estimasi: 0,10

Hasil yang benar:
Aplikasi menghitung jumlah lot dan Kebutuhan Dana Beli. Aplikasi tidak lagi meminta Position Size / Plafon Posisi diisi terlebih dahulu.

Catatan biaya:
Fee jual total dipakai sebagai total potongan jual. Pajak estimasi hanya ditampilkan sebagai rincian agar tidak dihitung dua kali.


Update v1.4.1:
- Mengubah istilah awam menjadi istilah trading yang lebih profesional.
- Total Modal diganti menjadi Dana Trading Tersedia, karena field ini berfungsi sebagai batas maksimal dana, bukan kewajiban input.
- Alokasi per Trade diganti menjadi Position Size / Plafon Posisi.
- Modal Terpakai / Alokasi Diperlukan diganti menjadi Kebutuhan Dana Beli.
- Target Profit Bersih diganti menjadi Target Net Profit.
- Mode Alokasi diganti menjadi Metode Position Sizing.
- Menambahkan dukungan position sizing otomatis dari TP persentase dan SL persentase.
- Pesan error diperjelas agar pengguna tidak dipaksa mengisi plafon posisi ketika tujuannya justru mencari kebutuhan dana beli.

Logika perhitungan utama:
1. Nilai pokok pembelian = harga entry x jumlah saham.
2. Estimasi fee beli = nilai pokok pembelian x fee beli.
3. Kebutuhan dana beli = nilai pokok pembelian + estimasi fee beli.
4. Nilai pokok penjualan = harga jual x jumlah saham.
5. Dana jual bersih = nilai pokok penjualan - fee jual efektif.
6. Net profit = dana jual bersih TP - kebutuhan dana beli.
7. Net loss = kebutuhan dana beli - dana jual bersih SL.
8. Position size otomatis dari target net profit menggunakan TP sebagai dasar kalkulasi.
9. Position size otomatis dari risiko maksimal menggunakan SL sebagai dasar kalkulasi.

Catatan istilah:
- Dana Trading Tersedia: dana kas atau buying power yang tersedia untuk transaksi. Field ini opsional.
- Position Size / Plafon Posisi: batas dana yang ingin dipakai untuk satu transaksi.
- Kebutuhan Dana Beli: dana yang benar-benar dibutuhkan untuk membeli saham, termasuk fee beli.
- Target Net Profit: target keuntungan bersih setelah fee.
- Risiko Maksimal: batas kerugian bersih yang siap diterima jika harga menyentuh SL.
