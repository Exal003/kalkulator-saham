KALKULATOR SAHAM PWA v1.1.0

Perubahan:
- Input utama tidak lagi berisi angka bawaan.
- Hasil awal tetap tanda strip sampai tombol Hitung diklik.
- Price ladder diperkuat untuk harga dekat perubahan fraksi, misalnya 199 ke 200 ke 202.
- Cache service worker dinaikkan ke v1.1.0.

Cara update di GitHub:
1. Ekstrak ZIP.
2. Buka folder kalkulator-saham-pwa-v1-1.
3. Upload semua isi folder ke repository GitHub yang sama.
4. Commit changes.
5. Tunggu GitHub Pages selesai deploy.
6. Buka link aplikasi dan refresh.

Tes entry 199:
Total Modal: 100.000.000
Alokasi per Trade: 20.000.000
Harga Entry: 199
Target Profit Bersih: 2.000.000
Fee Beli: 0,15
Fee Jual Total: 0,25
Pajak Estimasi: 0,10

Catatan:
Fee jual total dipakai sebagai total potongan jual. Pajak estimasi hanya ditampilkan sebagai rincian agar tidak dihitung dua kali.
