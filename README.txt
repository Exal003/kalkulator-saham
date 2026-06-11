KALKULATOR SAHAM PWA v1.3.0

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

Cara update di GitHub:
1. Ekstrak ZIP.
2. Buka folder kalkulator-saham-pwa-v1-3.
3. Upload semua isi folder ke repository GitHub yang sama.
4. Commit changes.
5. Tunggu GitHub Pages selesai deploy.
6. Buka aplikasi.
7. Tekan tombol Update.
8. Jika muncul notifikasi Update tersedia, tekan Muat ulang.

Catatan penting:
- Untuk update berikutnya, naikkan APP_VERSION di app.js, APP_VERSION di sw.js, versi di version.json, dan teks versi di index.html.
- Pengguna tidak perlu install ulang PWA dari layar utama.
- Jika pengguna masih berada di versi lama sebelum fitur Update tersedia, cukup tutup aplikasi lalu buka lagi, atau refresh dari browser satu kali setelah upload v1.3.0.

Tes entry 199:
Total Modal: boleh kosong
Alokasi Per Trade: 20.000.000
Harga Entry: 199
Target Profit Bersih: 2.000.000
Fee Beli: 0,15
Fee Jual Total: 0,25
Pajak Estimasi: 0,10

Catatan biaya:
Fee jual total dipakai sebagai total potongan jual. Pajak estimasi hanya ditampilkan sebagai rincian agar tidak dihitung dua kali.
