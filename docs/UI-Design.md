# UI Design Prompts — Fintel (Google Stitch)

Dokumen ini berisi prompt khusus untuk **Google Stitch**, dipakai di Fase 0.5 (lihat `AI-Agent-Execution-Prompts.md`). Hasil dari sini (screenshot/export) menjadi referensi visual wajib untuk Fase 1-3 di Antigravity — bukan kode final, hanya acuan layout & hierarki.

> **Catatan:** Desain sudah diekspor manual oleh user dari Stitch dan ditempatkan di folder `design/` root project. Dokumen ini tetap berguna sebagai referensi prompt yang dipakai untuk membuat desain tersebut di Stitch, dan sebagai acuan kalau nanti perlu merevisi/menambah layar.

**Sebelum mulai:** 3 keputusan UX di bawah ini sebaiknya dipilih dulu, karena mempengaruhi struktur prompt Layar 1 & 2.

---

## Keputusan UX Pendahuluan

Isi salah satu pilihan di tiap poin sebelum menjalankan prompt Layar 1 & 2:

1. **Entry point utama app:**
   - [ ] Dashboard tampil duluan saat app dibuka (chat AI diakses lewat tombol/tab)
   - [ ] Chat AI tampil duluan sebagai layar utama (dashboard diakses lewat tab/menu)

2. **Format konfirmasi transaksi hasil parsing AI:**
   - [ ] Modal popup di tengah layar
   - [ ] Inline card di dalam alur chat (muncul sebagai bubble balasan AI)

3. **Dark mode:**
   - [ ] Termasuk di MVP (desain 2 varian: light & dark)
   - [ ] Ditunda ke fase polish (desain light mode saja dulu)

---

## Gaya Visual Umum (Sertakan di Semua Prompt Layar)

Tempelkan blok ini di awal setiap prompt Stitch supaya konsisten antar layar:

```
Gaya visual: aplikasi finance desktop yang terasa personal dan approachable,
BUKAN formal seperti aplikasi perbankan korporat. Rounded corners, whitespace
lega, tidak padat.

Palet warna: hijau tua/emerald sebagai warna utama (asosiasi "sehat finansial"),
dengan aksen ungu/biru muda untuk elemen terkait AI (chat, insight card) supaya
AI terasa berbeda secara visual dari data finansial murni. Merah/kuning/hijau
hanya untuk indikator status budget (over/warning/aman).

Tipografi: sans-serif modern, rounded (mis. gaya Inter/Poppins), ukuran heading
tegas tapi tidak kaku.

Platform: desktop app (bukan mobile) — layout harus memanfaatkan lebar layar,
gunakan grid/kolom, jangan desain single-column seperti mobile app.
```

---

## Layar 1 — Dashboard Utama

**Prompt Stitch:**

```
[Tempelkan "Gaya Visual Umum" di atas]

Desain dashboard utama aplikasi manajemen keuangan personal bernama "Fintel".
Ini adalah desktop app, layout lebar (bukan mobile).

Elemen yang HARUS ada di layar ini:
1. Header: nama app "Fintel", dan saldo saat ini ditampilkan besar/prominent
   (saldo all-time dan saldo bulan berjalan, dua angka berdampingan).
2. Tiga progress bar horizontal untuk kategori Needs / Wants / Savings,
   masing-masing menunjukkan: nominal terpakai vs nominal alokasi ideal,
   dan persentase pemakaian. Gunakan warna indikator: hijau (<80%),
   kuning (80-100%), merah (>100%).
3. Grafik garis/batang: income vs expense over time (asumsikan data bulanan),
   ditempatkan sebagai panel visual yang cukup besar (bukan kecil di pojok).
4. Grafik donut/pie kecil: komposisi pengeluaran per kategori (Needs/Wants/Savings)
   untuk periode berjalan.
5. Card "Insight AI" — berisi ringkasan naratif singkat (2-3 kalimat) dari AI,
   dengan visual yang membedakannya dari elemen data lain (gunakan aksen ungu/biru,
   mungkin dengan icon spark/AI kecil) — supaya user paham ini "opini AI",
   bukan angka mentah.
6. Tombol/tab akses ke: Riwayat Transaksi, Chat AI, Settings.
   [Sesuaikan dengan keputusan UX #1: jika chat AI adalah entry point utama,
   tombol ke chat AI harus paling prominent, bukan sekadar tab kecil]
7. Tombol "+ Tambah Transaksi" yang jelas terlihat (untuk input manual).

[Jika keputusan UX #3 = dark mode termasuk MVP, tambahkan kalimat berikut:]
Buat 2 varian: light mode dan dark mode.
```

---

## Layar 2 — Chat AI + Card Konfirmasi Transaksi

**Prompt Stitch:**

```
[Tempelkan "Gaya Visual Umum" di atas]

Desain layar/panel chat AI untuk aplikasi finance desktop "Fintel". User
mengetik kalimat natural (mis. "gue abis makan siang 35rb tadi") dan AI
merespons dengan usulan pencatatan transaksi yang HARUS dikonfirmasi user
sebelum benar-benar tersimpan.

Elemen yang HARUS ada:
1. Area chat dengan bubble percakapan standar (user di kanan, AI di kiri),
   riwayat chat bisa di-scroll.
2. Input text box di bagian bawah untuk mengetik pesan.
3. [Sesuai keputusan UX #2] — desain elemen konfirmasi transaksi sebagai:
   [PILIH SALAH SATU sesuai keputusan di atas:]
   (a) Modal popup di tengah layar yang muncul menimpa chat, berisi ringkasan
       transaksi (nominal, kategori, jenis, tanggal) dan 3 tombol: Konfirmasi,
       Edit, Batal.
   (b) Card inline di dalam alur chat (tampil sebagai bubble balasan AI yang
       formatnya beda dari bubble teks biasa — ada border/background khusus),
       berisi ringkasan transaksi yang sama dan 3 tombol: Konfirmasi, Edit, Batal.
4. Indikator status Ollama di suatu tempat di layar ini (kecil, tidak mengganggu):
   "AI aktif" (hijau) atau "AI tidak aktif — Ollama belum berjalan" (abu-abu/merah),
   supaya user paham kondisi fitur AI tanpa perlu buka Settings.
5. State kosong (empty state) saat belum ada percakapan — ajakan singkat untuk
   mulai mengetik transaksi pertama.

[Jika keputusan UX #3 = dark mode termasuk MVP, tambahkan kalimat berikut:]
Buat 2 varian: light mode dan dark mode.
```

---

## Layar 3 (Opsional) — Riwayat Transaksi dengan Filter

**Hanya kerjakan jika ingin layout custom; kalau ingin pakai tabel standar, boleh dilewati dan biarkan Gemini di Antigravity yang menentukan layout tabel generik.**

**Prompt Stitch:**

```
[Tempelkan "Gaya Visual Umum" di atas]

Desain layar riwayat transaksi untuk aplikasi finance desktop "Fintel".

Elemen yang HARUS ada:
1. Filter di bagian atas: rentang tanggal, kategori (dropdown), jenis
   (income/expense/semua).
2. Daftar transaksi dalam bentuk list/tabel, setiap baris menampilkan:
   tanggal, kategori (dengan badge warna sesuai group Needs/Wants/Savings),
   nominal (warna hijau untuk income, merah/netral untuk expense), catatan singkat,
   dan indikator kecil jika transaksi berasal dari AI chat (source='ai_chat')
   vs manual — misalnya icon kecil chat-bubble vs pensil.
3. Tombol edit/hapus per baris (bisa muncul saat hover, tidak perlu selalu terlihat).
4. Empty state jika filter tidak menghasilkan transaksi apapun.

[Jika keputusan UX #3 = dark mode termasuk MVP, tambahkan kalimat berikut:]
Buat 2 varian: light mode dan dark mode.
```

---

## Setelah Desain Selesai

1. File hasil export sudah ditempatkan di folder `design/` root project.
2. Lanjutkan ke Fase 0.5 di `AI-Agent-Execution-Prompts.md` — Gemini akan menginventarisasi file di `design/` dan mencatat 3 keputusan UX di atas ke `AGENTS.md`/`CONTEXT.md`.
3. Setelah itu lanjut ke Fase 1, dengan setiap prompt yang menyentuh frontend merujuk ke folder `design/`.