# PRD: Fintel — AI-Powered Personal Finance Manager (Offline-First)

**Versi:** 1.0
**Status:** Draft untuk Fase Perencanaan
**Role Penyusun:** Senior Software Architect (AI-assisted)
**Target User:** Single-user, personal use

---

## 1. Ringkasan Eksekutif

Fintel adalah aplikasi manajemen keuangan pribadi berbasis desktop yang berjalan **sepenuhnya offline**, dilengkapi AI lokal (via Ollama) yang mampu:
1. Mencatat transaksi secara manual maupun via percakapan natural language.
2. Menghitung dan memvisualisasikan alokasi keuangan berdasarkan rumus **50/30/20** (Needs/Wants/Savings).
3. Memberikan rekomendasi alokasi dana dalam bentuk narasi yang dihasilkan AI, berbasis hasil kalkulasi rule-based (bukan analisis bebas AI).
4. Menyajikan grafik pemasukan/pengeluaran dan tracking saldo & tabungan.

**Prinsip inti:** Privasi total (data tidak pernah meninggalkan device), AI sebagai *asisten interpretasi & narasi*, bukan sebagai sumber kebenaran finansial (kalkulasi tetap rule-based/deterministik).

---

## 2. Keputusan Fondasi (Terkunci)

| Aspek | Keputusan |
|---|---|
| Platform | Desktop, Windows-only (rilis awal) |
| Framework | Tauri (Rust backend) + React/Vue frontend |
| AI Engine | LLM lokal via **Ollama** (offline) |
| Database | SQLite lokal, tanpa sync cloud |
| User Model | Single-user, tanpa login/multi-profil |
| Kategori Transaksi | Fixed (Needs / Wants / Savings + sub-kategori umum), tidak custom |
| Metode Rekomendasi AI | Rule-based 50/30/20 calculation + AI-generated narrative |
| Parsing Input Natural Language | Ekstraksi: nominal, kategori, tanggal, jenis (income/expense) |

> Keputusan ini adalah kontrak yang mengikat scope MVP. Perubahan besar (mis. ganti stack, tambah cloud sync) harus melalui revisi PRD, bukan keputusan implisit saat development.

---

## 3. Problem Statement & Goals

**Problem:**
Pengguna kesulitan mengalokasikan uang secara sehat karena (a) tidak ada visibilitas jelas atas pola pemasukan/pengeluaran, dan (b) input data manual terasa membosankan sehingga jarang konsisten dilakukan.

**Goals (MVP):**
- G1: User bisa mencatat transaksi dalam <10 detik, baik manual maupun via chat AI.
- G2: User bisa melihat status kesehatan keuangan (sesuai 50/30/20) secara real-time.
- G3: AI memberikan insight/narasi yang actionable, bukan generic.
- G4: Semua data tetap privat — zero network call untuk data keuangan.

**Non-Goals (MVP):**
- Tidak ada multi-currency.
- Tidak ada integrasi bank/OCR struk.
- Tidak ada multi-device sync.
- Tidak ada investment tracking (saham/crypto).

---

## 4. User Persona & Core User Journey

**Persona:** Individu (mahasiswa/pekerja muda) yang ingin disiplin finansial tapi malas mencatat manual secara detail, nyaman menggunakan bahasa natural/casual.

**Core Journey:**
1. Onboarding: user input pemasukan bulanan awal ? sistem hitung alokasi 50/30/20 dasar.
2. Harian: user mencatat transaksi — via form manual ATAU chat ("gue abis makan siang 35rb").
3. Sistem otomatis mengkategorikan (Needs/Wants/Savings) & mengupdate saldo.
4. Dashboard menampilkan grafik pemasukan/pengeluaran, progress terhadap budget 50/30/20, dan status saving goal.
5. AI memberi ringkasan periodik ("minggu ini pengeluaran Wants kamu sudah 80% dari budget, sisa 3 hari lagi").

---

## 5. Functional Requirements

### 5.1 Modul Transaksi
- FR-1: User dapat menambah transaksi manual (nominal, kategori, sub-kategori, tanggal, jenis income/expense, catatan opsional).
- FR-2: User dapat menambah transaksi via chat natural language ke AI; sistem mengekstrak nominal, kategori, tanggal, jenis, lalu **meminta konfirmasi user sebelum menyimpan** (human-in-the-loop, karena LLM lokal kecil rawan salah ekstrak).
- FR-3: User dapat mengedit/menghapus transaksi.
- FR-4: Riwayat transaksi dapat difilter berdasarkan tanggal, kategori, jenis.

### 5.2 Modul Budgeting 50/30/20
- FR-5: Sistem menghitung alokasi ideal berdasarkan total income periode berjalan: 50% Needs, 30% Wants, 20% Savings.
- FR-6: Sistem menampilkan realisasi vs alokasi ideal per kategori (progress bar / persentase).
- FR-7: Sistem memberi peringatan/notifikasi in-app saat suatu kategori melebihi alokasi.

### 5.3 Modul AI Assistant
- FR-8: AI dapat menerima input percakapan bebas untuk mencatat transaksi (lihat FR-2).
- FR-9: AI dapat menghasilkan narasi rekomendasi berdasarkan hasil kalkulasi rule-based (bukan menghitung sendiri secara bebas) — AI hanya "membungkus" angka menjadi bahasa manusiawi + saran actionable.
- FR-10: AI dapat menjawab pertanyaan user seputar data keuangan mereka sendiri (mis. "pengeluaran makan gue bulan ini berapa?") via query ke local DB, bukan halusinasi.

### 5.4 Modul Visualisasi & Laporan
- FR-11: Grafik pemasukan vs pengeluaran (line/bar chart, per hari/minggu/bulan).
- FR-12: Grafik komposisi pengeluaran per kategori (pie/donut: Needs/Wants/Savings).
- FR-13: Kalkulasi saldo real-time (total income - total expense, all-time & per periode).
- FR-14: Tracking savings terkumpul vs target (jika user set target).

### 5.5 Modul Pengaturan
- FR-15: User dapat mengatur ulang income bulanan (untuk recalculate budget 50/30/20).
- FR-16: User dapat memilih/mengganti model Ollama yang dipakai (dropdown dari model terinstall).
- FR-17: User dapat mengatur target tabungan (nominal & tenggat waktu opsional).

---

## 6. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| Privasi | Tidak ada data keuangan yang dikirim ke luar device. Ollama harus jalan 100% lokal. |
| Performa | Waktu respon AI untuk parsing transaksi < 3 detik pada model kecil (mis. Llama 3.2 3B/Phi-3 mini) di hardware konsumen. |
| Reliabilitas | Kalkulasi budget tidak boleh bergantung pada AI — harus tetap benar walau Ollama tidak berjalan (AI berupa fitur opsional/enhancement). |
| Portabilitas | Instalasi single binary Windows (.msi/.exe via Tauri bundler). |
| Data Integrity | Setiap perubahan dari AI-parsed transaction wajib melalui konfirmasi eksplisit user sebelum commit ke DB. |
| Graceful Degradation | Jika Ollama/model tidak terpasang, app tetap fungsional penuh untuk mode manual, dengan notifikasi jelas bahwa fitur AI nonaktif. |

---

## 7. System Architecture

### 7.1 High-Level Architecture

```
+---------------------------------------------------------+
¦                     Tauri Application                     ¦
¦                                                             ¦
¦  +-------------------+        +----------------------+   ¦
¦  ¦   Frontend (WebView)¦?-----?¦   Tauri Core (Rust)   ¦   ¦
¦  ¦  React/Vue + Charts ¦  IPC  ¦   Command Handlers    ¦   ¦
¦  +-------------------+        +----------------------+   ¦
¦                                            ¦               ¦
¦                    +-----------------------+---------+    ¦
¦                    ?                       ?         ?    ¦
¦           +-------------+       +-------------+ +-------+¦
¦           ¦  SQLite DB   ¦       ¦ Budget Engine¦ ¦ Ollama¦¦
¦           ¦ (rusqlite)   ¦       ¦ (Rust, pure  ¦ ¦ Client¦¦
¦           ¦              ¦       ¦  rule-based) ¦ ¦ (HTTP ¦¦
¦           +-------------+       +-------------+ ¦localhost)¦
¦                                                    +-------+¦
+--------------------------------------------------------+---+
                                                            ?
                                                   +--------------+
                                                   ¦ Ollama Runtime¦
                                                   ¦ (local process,¦
                                                   ¦  external dep) ¦
                                                   +--------------+
```

**Prinsip arsitektur kunci:**
- **Separation of Concerns:** Budget Engine (kalkulasi 50/30/20, saldo, statistik) adalah modul Rust murni, deterministik, **tidak bergantung pada AI**. AI hanya konsumen output dari Budget Engine untuk membuat narasi.
- **AI sebagai enhancement layer, bukan core dependency.** Semua fitur inti tetap berjalan tanpa Ollama.
- **Local-only I/O:** Satu-satunya "network call" adalah HTTP request ke `localhost:11434` (Ollama default port) — tidak ada egress ke internet.

### 7.2 Tech Stack Detail

| Layer | Teknologi | Alasan |
|---|---|---|
| Shell/Runtime | Tauri v2 | Lebih ringan dari Electron, native performance, akses filesystem aman |
| Backend Logic | Rust | Type-safe, cocok untuk Budget Engine deterministik & IPC command |
| Frontend | React + TypeScript | Ekosistem matang untuk charting & state management |
| Styling | Tailwind CSS | Cepat untuk MVP, konsisten dengan preferensi frontend-design |
| Charting | Recharts atau Chart.js | Grafik income/expense & komposisi kategori |
| Database | SQLite via `rusqlite` | Embedded, zero-config, cocok single-user offline |
| AI Runtime | Ollama (HTTP API localhost) | Mudah manage model lokal, banyak model ringan tersedia |
| Model Rekomendasi Awal | Llama 3.2 3B / Phi-3 mini / Qwen2.5 3B | Ringan, cukup untuk parsing NLU + narasi sederhana |
| State Management (FE) | Zustand atau React Query | Ringan, cocok untuk sinkronisasi state dengan Tauri commands |

### 7.3 Data Model (SQLite Schema — Draft)

```sql
-- Kategori fixed, di-seed saat first-run
CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,          -- e.g. "Makan", "Transport", "Hiburan"
    group_type TEXT NOT NULL     -- 'needs' | 'wants' | 'savings'
        CHECK (group_type IN ('needs','wants','savings'))
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    amount INTEGER NOT NULL,          -- simpan dalam satuan terkecil (rupiah, integer)
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    category_id INTEGER REFERENCES categories(id),
    note TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_chat')),
    transaction_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE budget_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- single row, single user
    monthly_income INTEGER NOT NULL DEFAULT 0,
    needs_pct INTEGER NOT NULL DEFAULT 50,
    wants_pct INTEGER NOT NULL DEFAULT 30,
    savings_pct INTEGER NOT NULL DEFAULT 20,
    ollama_model TEXT DEFAULT 'llama3.2:3b',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE saving_goals (
    id INTEGER PRIMARY KEY,
    target_amount INTEGER NOT NULL,
    target_date DATE,
    current_amount INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 7.4 AI Integration Flow (Chat-to-Transaction)

```
User: "gue abis makan siang 35rb tadi"
        ¦
        ?
[Frontend] kirim raw text ke Tauri command `parse_transaction_intent`
        ¦
        ?
[Rust] format prompt terstruktur ? kirim ke Ollama (JSON mode/structured output)
        ¦
        ?
[Ollama] return JSON:
  { "amount": 35000, "type": "expense", "category_guess": "Makan",
    "date": "2026-08-29", "confidence": "high" }
        ¦
        ?
[Rust] validasi schema JSON, map category_guess ? category_id via fuzzy match
        ¦
        ?
[Frontend] tampilkan card konfirmasi: "Catat: Rp35.000 - Makan (Needs) - hari ini?"
        ¦
        ?
User confirm ? [Tauri command] insert ke SQLite ? recalculate budget ? update dashboard
```

**Catatan desain penting:** AI TIDAK PERNAH langsung menulis ke database. Semua output AI melewati validasi schema + konfirmasi user. Ini mitigasi risiko halusinasi/salah parsing dari model kecil.

### 7.5 Budget Engine Logic (Rule-Based, Bukan AI)

```
alokasi_ideal = {
  needs:   monthly_income * 0.50,
  wants:   monthly_income * 0.30,
  savings: monthly_income * 0.20
}

realisasi = SUM(transactions.amount) GROUP BY category.group_type WHERE type='expense' (or savings-tagged)

status_per_kategori = realisasi / alokasi_ideal * 100%

# AI hanya menerima objek ini sebagai context untuk generate narasi,
# TIDAK menghitung ulang sendiri.
```

---

## 8. Risks & Mitigations

| Risiko | Mitigasi |
|---|---|
| Model lokal kecil salah parsing nominal/kategori | Human-in-the-loop confirmation wajib sebelum commit; tampilkan hasil parsing untuk diedit user |
| User tidak install Ollama | Deteksi saat startup, tampilkan onboarding untuk install Ollama + pull model; app tetap jalan tanpa AI |
| Performa lambat di device rendah | Rekomendasikan model kecil (3B) sebagai default; beri opsi ganti model |
| Data korup karena SQLite (single point of failure) | Auto-backup periodik ke file lokal (mis. `.db.bak` harian) |

---

## 9. Roadmap Fase (High-Level)

| Fase | Fokus |
|---|---|
| Fase 0 | Setup project (Tauri + React scaffold), skema DB, seed kategori |
| Fase 1 | CRUD transaksi manual + kalkulasi saldo dasar |
| Fase 2 | Budget Engine 50/30/20 + dashboard progress |
| Fase 3 | Grafik income/expense & komposisi kategori |
| Fase 4 | Integrasi Ollama: parsing chat-to-transaction + konfirmasi |
| Fase 5 | AI narrative recommendation berbasis budget engine output |
| Fase 6 | Saving goals + settings + polish + packaging Windows installer |

*(Detail phased execution prompt untuk AI Agent ada di dokumen terpisah: `AI-Agent-Execution-Prompts.md`, mengikuti pola SDD yang biasa dipakai: rules.md/AGENTS.md ? SKILLS.md ? phased prompt dengan verification gate.)*

---

## 10. Open Questions untuk Diputuskan Sebelum Fase 0

Sebelum mulai coding, ini beberapa hal yang sebaiknya dikunci juga (belum termasuk keputusan awal):

1. Satuan mata uang: asumsi Rupiah (IDR) saja untuk MVP — konfirmasi?
2. Format konfirmasi AI: apakah via modal popup, atau inline card di chat panel?
3. Apakah dashboard jadi halaman utama (default view), atau chat AI yang jadi entry point utama?
4. Apakah butuh dark mode di MVP atau ditunda ke fase polish?
