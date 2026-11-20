-- ==============================================================================
-- LRMS (Lazuardi Resources Management System) — 004_seed.sql
-- Master Data Awal Sekolah Lazuardi
-- ==============================================================================

INSERT INTO public.service_catalog (code, name, description, sla_estimate_minutes, config_json)
VALUES
  ('AIR_GALON', 'Air Galon', 'Permintaan pengantaran air mineral galon dan penukaran galon kosong antar unit sekolah.', 45, '{"allow_exchange": true, "default_unit": "Galon"}'),
  ('FOTOKOPI', 'Fotokopi', 'Layanan penggandaan dokumen hitam putih atau warna (1 sisi / 2 sisi) dengan unggah berkas privat.', 120, '{"max_file_mb": 15, "paper_sizes": ["A4", "F4", "A3", "Lainnya"]}'),
  ('LAMINATING', 'Laminating', 'Layanan laminasi dokumen ukuran A4, F4, A3, ID Card, atau custom untuk keperluan pengajaran dan administrasi.', 90, '{"sizes": ["A4", "F4", "A3", "ID Card", "Custom"]}')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.units (code, name, category, head_name, head_email)
VALUES
  ('RES', 'Divisi Resources', 'Operasional', 'Kepala Divisi Resources', 'resources@lazuardi.sch.id'),
  ('TK', 'TK Lazuardi', 'Akademik', 'Kepala Unit TK', 'kepala.tk@lazuardi.sch.id'),
  ('SD', 'SD Lazuardi', 'Akademik', 'Kepala Unit SD', 'kepala.sd@lazuardi.sch.id'),
  ('SMP', 'SMP Lazuardi', 'Akademik', 'Kepala Unit SMP', 'kepala.smp@lazuardi.sch.id'),
  ('SMA', 'SMA Lazuardi', 'Akademik', 'Kepala Unit SMA', 'kepala.sma@lazuardi.sch.id'),
  ('FIN', 'Keuangan & HR', 'Manajemen', 'Manajer Keuangan & HR', 'finance@lazuardi.sch.id')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.locations (code, building, floor, room, unit_id)
SELECT 'LOC-RES-01', 'Gedung Operasional', 'Lantai 1', 'Ruang Divisi Resources', id FROM public.units WHERE code = 'RES'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.locations (code, building, floor, room, unit_id)
SELECT 'LOC-SD-01', 'Gedung Utama', 'Lantai 2', 'Ruang Guru SD', id FROM public.units WHERE code = 'SD'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.locations (code, building, floor, room, unit_id)
SELECT 'LOC-SMP-01', 'Gedung Timur', 'Lantai 2', 'Ruang Guru SMP', id FROM public.units WHERE code = 'SMP'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.locations (code, building, floor, room, unit_id)
SELECT 'LOC-SMA-01', 'Gedung Timur', 'Lantai 3', 'Ruang Guru SMA', id FROM public.units WHERE code = 'SMA'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.inventory_items (code, name, category, unit_measure, min_stock_threshold)
VALUES ('GALON-19L', 'Air Mineral Galon 19L', 'Air Minum', 'Galon', 15)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.inventory_locations (code, name, building, description)
VALUES
  ('GDG-UTAMA', 'Gudang Utama Resources', 'Gedung Operasional Lt. 1', 'Pusat penyimpanan utama stok air galon sekolah'),
  ('POS-TIMUR', 'Pos Distribusi Gedung Timur', 'Gedung Timur Lt. 1', 'Pos stok penyangga untuk unit SMP dan SMA')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.inventory_balances (item_id, location_id, qty_filled, qty_empty, qty_damaged, qty_lost, qty_allocated)
SELECT i.id, l.id, 0, 0, 0, 0, 0
FROM public.inventory_items i CROSS JOIN public.inventory_locations l
ON CONFLICT (item_id, location_id) DO NOTHING;

INSERT INTO public.app_settings (key, value_json, description)
VALUES
  ('allowed_domain', '"lazuardi.sch.id"', 'Domain email Google Workspace resmi yang diizinkan masuk.'),
  ('min_gallon_stock_alert', '15', 'Ambang batas minimum stok galon isi sebelum peringatan aktif.'),
  ('attachment_retention_days', '90', 'Lama retensi dokumen fotokopi sebelum pembersihan terjadwal.'),
  ('monthly_report_day', '1', 'Tanggal pengiriman otomatis laporan fotokopi bulanan ke Kepala Unit.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.report_schedules (report_type, cron_expression, is_enabled)
VALUES ('MONTHLY_PHOTOCOPY', '0 1 1 * *', TRUE)
ON CONFLICT (report_type) DO NOTHING;
