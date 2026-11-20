# LAZUARDI RESOURCES MANAGEMENT SYSTEM (LRMS)

**Tagline:** *One Portal, All Resources Services*

Sistem manajemen layanan operasional sekolah Divisi Resources Lazuardi yang terintegrasi untuk pengajuan Air Galon, Fotokopi, Laminating, Manajemen Persediaan Galon (termasuk Stock Opname atomic), Order Management, serta pelaporan otomatis bulanan untuk Kepala Unit.

---

## Arsitektur & Teknologi

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend API:** Vercel Serverless Functions (`/api/index.ts`) + Express adapter lokal (`server.ts`) menggunakan router bersama (`/server/core/router.ts`)
- **Database:** Supabase PostgreSQL (24+ tabel relasional, Row Level Security, & PostgreSQL RPC transaksi atomic)
- **Authentication:** Supabase Auth dengan Google Single Sign-On (`@lazuardi.sch.id`) + validasi domain sisi server
- **Private Storage:** Supabase Storage (`fotokopi-documents` bucket privat dengan signed URL berumur 60 detik)
- **Email Reporting:** Layanan email server-side via Resend API atau SMTP Sekolah (Nodemailer) + Vercel Cron bulanan
- **Export:** Excel (`.xlsx`), CSV, PDF (`jspdf-autotable`), dan Cetak Work Order / Laporan

---

## Struktur Direktori Utama

```
├── api/index.ts                       # Entrypoint Vercel Serverless Functions
├── server.ts                          # Entrypoint Express + Vite (Development / Preview)
├── server/core/
│   ├── auth.ts                        # Verifikasi domain sekolah, HMAC token, & akses lampiran
│   ├── backendTypes.ts                # Kontrak interface backend
│   ├── emailService.ts                # Pengirim & template HTML laporan bulanan Kepala Unit
│   ├── env.ts                         # Pembaca variabel lingkungan
│   ├── localSandboxStore.ts           # Penyimpanan lokal terisolasi (saat env Supabase belum diisi)
│   ├── router.ts                      # Seluruh endpoint REST API (/api/*) dengan validasi Zod
│   └── supabaseBackend.ts             # Implementasi produksi Supabase PostgreSQL, Auth, & Storage
├── supabase/migrations/
│   ├── 001_schema.sql                 # Skema lengkap tabel, constraints, & index optimasi Free Plan
│   ├── 002_rls.sql                    # Kebijakan Row Level Security & private storage bucket
│   ├── 003_rpc_functions.sql          # RPC transaksi atomic (nomor order, kirim galon, finalisasi opname)
│   └── 004_seed.sql                   # Data awal unit, layanan, lokasi, dan konfigurasi sistem
├── src/
│   ├── shared/
│   │   ├── calculations.ts            # Kalkulasi sisi/lembar fotokopi & ketersediaan stok galon
│   │   └── types.ts                   # Tipe TypeScript lintas frontend-backend
│   ├── contexts/                      # AuthContext & ToastContext
│   ├── lib/                           # Supabase client, API client, Excel/CSV/PDF exporter
│   └── pages/                         # Seluruh modul antarmuka LRMS
├── vercel.json                        # Konfigurasi SPA routing, API rewrite, security headers, & Cron
└── .env.example                       # Contoh variabel environment (tanpa secret)
```

---

## Panduan Setup Supabase

1. **Buat Project Supabase** di [supabase.com](https://supabase.com).
2. **Jalankan SQL Migrations** secara berurutan di **SQL Editor** Supabase:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_rpc_functions.sql`
   - `supabase/migrations/004_seed.sql`
3. **Konfigurasi Google OAuth di Supabase Auth**:
   - Buka **Authentication → Providers → Google**, aktifkan provider.
   - Masukkan **Client ID** dan **Client Secret** dari Google Cloud Console.
   - Pada Google Cloud Console OAuth 2.0 Credentials, daftarkan Authorized Redirect URI:
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - Pada **Authentication → URL Configuration** di Supabase:
     - **Site URL:** `https://domain-produksi-anda.vercel.app`
     - **Redirect URLs:** tambahkan `http://localhost:3000/**` dan `https://domain-produksi-anda.vercel.app/**` (jangan gunakan wildcard longgar di produksi).
4. **Tetapkan Akun Super Admin Pertama**:
   - Login sekali menggunakan Google `@lazuardi.sch.id`, lalu jalankan SQL di Supabase untuk menaikkan role akun pertama:
     ```sql
     UPDATE public.user_roles
     SET role = 'super_admin'
     WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'admin@lazuardi.sch.id');
     ```

---

## Variabel Environment

Salin `.env.example` menjadi `.env` untuk pengembangan lokal, atau tambahkan di **Vercel Project → Settings → Environment Variables**:

| Variabel | Keterangan | Sisi |
|---|---|---|
| `VITE_SUPABASE_URL` | URL project Supabase | Publik (Frontend) |
| `VITE_SUPABASE_ANON_KEY` | Anon public key Supabase | Publik (Frontend) |
| `SUPABASE_URL` | URL project Supabase | Server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase (**JANGAN** beri prefix `VITE_`) | Server-only |
| `SUPABASE_STORAGE_BUCKET` | Default: `fotokopi-documents` | Server-only |
| `ALLOWED_EMAIL_DOMAIN` | Default: `lazuardi.sch.id` | Server-only |
| `SESSION_SECRET` | String acak min. 32 karakter | Server-only |
| `CRON_SECRET` | Secret untuk proteksi endpoint `/api/cron/monthly-photocopy-reports` | Server-only |
| `RESEND_API_KEY` | API key Resend (atau gunakan `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) | Server-only |
| `EMAIL_FROM` | Alamat pengirim laporan email resmi | Server-only |
| `APP_URL` | URL aktif aplikasi | Server-only |

---

## Deployment ke GitHub & Vercel

1. Push repository ini ke GitHub (pastikan `.env` tidak ikut ter-commit).
2. Import repository di [Vercel](https://vercel.com).
3. Framework preset akan terdeteksi otomatis sebagai **Vite**, sedangkan folder `api/` otomatis menjadi Vercel Serverless Functions sesuai `vercel.json`.
4. Isi seluruh **Environment Variables** pada dashboard Vercel.
5. Deploy! Cron job `0 1 1 * *` pada `vercel.json` akan mengirim laporan penggunaan fotokopi bulanan setiap tanggal 1 pukul 01:00 UTC (08:00 WIB).

---

## Skenario Pengujian & Validasi

1. **Login Google Domain Sekolah:** Masuk dengan akun `@lazuardi.sch.id` berhasil dan tercatat pada `profiles`.
2. **Penolakan Domain Eksternal:** Login dengan `@gmail.com` ditolak di server (`403 Forbidden`).
3. **Role Super Admin:** Mengakses seluruh modul, mengubah role, mengelola master unit/layanan/lokasi, melihat audit log.
4. **Role Admin Resources:** Memproses order, mengelola stok galon & stock opname, melihat laporan operasional, namun dilarang mengubah role Super Admin.
5. **Role Kepala Unit:** Hanya melihat laporan fotokopi unit yang ditugaskan kepadanya, tidak melihat unit lain, tanpa tombol approval pesanan, dan tidak dapat mengunduh file dokumen fotokopi pemesan lain.
6. **Role User / Pemesan:** Membuat permintaan Air Galon, Fotokopi, Laminating; membatalkan pesanan selama status masih `Menunggu Diproses`.
7. **Pembuatan Order & Nomor Unik:** Nomor order `GAL-YYYYMM-0001`, `FCP-YYYYMM-0001`, `LAM-YYYYMM-0001` dibuat unik oleh database/mutex.
8. **Upload File Fotokopi Privat:** File disimpan di private bucket dan hanya dapat diunduh melalui signed URL berumur pendek oleh pemesan atau Admin.
9. **Perhitungan Sisi & Lembar Fotokopi:** Dokumen 9 halaman, 30 rangkap, dua sisi menghasilkan `270` sisi cetak dan `150` lembar kertas (`ceil(9/2) * 30`); 10 halaman 5 rangkap satu sisi menghasilkan `50` sisi dan `50` lembar.
10. **Distribusi Galon & Penerimaan Kosong Atomic:** Mengurangi `qty_filled`, menambah `qty_empty`, mengurangi alokasi, dan menandai order `Selesai` dalam satu transaksi.
11. **Pencegahan Stok Negatif & Transaksi Ganda:** Permintaan melebihi stok bebas atau klik ganda konfirmasi pengiriman ditolak dengan pesan error jelas.
12. **Stock Opname Draft → Final:** Draft dapat disimpan berulang, dan saat Finalisasi selisih otomatis disesuaikan ke saldo dan dikunci (`Final`).
13. **Ekspor & Cetak:** Ekspor `.xlsx`, `.csv`, `.pdf`, dan cetak work order / laporan berfungsi tanpa error.
14. **Responsive Layout:** Tata letak menyesuaikan rapi pada desktop (`1440px`), tablet, dan smartphone.
