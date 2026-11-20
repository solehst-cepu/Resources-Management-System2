-- ==============================================================================
-- LRMS (Lazuardi Resources Management System) — 001_schema.sql
-- PostgreSQL / Supabase Production Schema
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Authentication & Master Data
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin_resources', 'kepala_unit', 'user')),
  assigned_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Akademik',
  head_user_id UUID REFERENCES public.profiles(id),
  head_name TEXT NOT NULL DEFAULT '',
  head_email TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_unit_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_unit_head BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, unit_id)
);

CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('AIR_GALON', 'FOTOKOPI', 'LAMINATING')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sla_estimate_minutes INTEGER NOT NULL DEFAULT 60 CHECK (sla_estimate_minutes > 0),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  building TEXT NOT NULL,
  floor TEXT NOT NULL,
  room TEXT NOT NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. Order Management
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_sequences (
  prefix TEXT NOT NULL,
  period_ym TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, period_ym)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  service_code TEXT NOT NULL REFERENCES public.service_catalog(code),
  requester_id UUID NOT NULL REFERENCES public.profiles(id),
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id),
  unit_name TEXT NOT NULL,
  location_id UUID REFERENCES public.locations(id),
  location_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN (
    'Menunggu Diproses',
    'Diproses',
    'Dalam Pengiriman',
    'Siap Diambil',
    'Selesai',
    'Dibatalkan'
  )),
  needed_date DATE NOT NULL,
  needed_time TIME,
  notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  requested_qty INTEGER NOT NULL DEFAULT 1 CHECK (requested_qty > 0),
  actual_qty INTEGER CHECK (actual_qty IS NULL OR actual_qty >= 0),
  empty_exchange_qty INTEGER NOT NULL DEFAULT 0 CHECK (empty_exchange_qty >= 0),
  empty_returned_qty INTEGER CHECK (empty_returned_qty IS NULL OR empty_returned_qty >= 0),
  doc_name TEXT,
  page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
  copy_count INTEGER CHECK (copy_count IS NULL OR copy_count > 0),
  paper_size TEXT,
  print_color TEXT CHECK (print_color IS NULL OR print_color IN ('Hitam Putih', 'Warna')),
  is_duplex BOOLEAN NOT NULL DEFAULT FALSE,
  print_sides_total INTEGER CHECK (print_sides_total IS NULL OR print_sides_total >= 0),
  paper_sheets_total INTEGER CHECK (paper_sheets_total IS NULL OR paper_sheets_total >= 0),
  finishing_notes TEXT,
  laminating_size TEXT,
  laminating_type TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  changed_by_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  bucket_name TEXT NOT NULL DEFAULT 'fotokopi-documents',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 15728640),
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES public.profiles(id),
  assignee_name TEXT NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Inventory Management (Air Galon)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Air Minum',
  unit_measure TEXT NOT NULL DEFAULT 'Galon',
  min_stock_threshold INTEGER NOT NULL DEFAULT 15 CHECK (min_stock_threshold >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  building TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  qty_filled INTEGER NOT NULL DEFAULT 0 CHECK (qty_filled >= 0),
  qty_empty INTEGER NOT NULL DEFAULT 0 CHECK (qty_empty >= 0),
  qty_damaged INTEGER NOT NULL DEFAULT 0 CHECK (qty_damaged >= 0),
  qty_lost INTEGER NOT NULL DEFAULT 0 CHECK (qty_lost >= 0),
  qty_allocated INTEGER NOT NULL DEFAULT 0 CHECK (qty_allocated >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_number TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL CHECK (tx_type IN (
    'RECEIPT',
    'DISTRIBUTION',
    'EMPTY_RETURN',
    'OPNAME_ADJUSTMENT',
    'MANUAL_ADJUSTMENT'
  )),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id),
  order_id UUID REFERENCES public.orders(id),
  qty_filled_delta INTEGER NOT NULL DEFAULT 0,
  qty_empty_delta INTEGER NOT NULL DEFAULT 0,
  qty_damaged_delta INTEGER NOT NULL DEFAULT 0,
  qty_lost_delta INTEGER NOT NULL DEFAULT 0,
  reference_no TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  actor_id UUID REFERENCES public.profiles(id),
  actor_name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  receipt_date DATE NOT NULL,
  supplier TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id),
  qty_filled INTEGER NOT NULL DEFAULT 0 CHECK (qty_filled >= 0),
  qty_empty INTEGER NOT NULL DEFAULT 0 CHECK (qty_empty >= 0),
  document_no TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_opnames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_number TEXT NOT NULL UNIQUE,
  opname_date DATE NOT NULL,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Final')),
  inspector_id UUID REFERENCES public.profiles(id),
  inspector_name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_opname_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_id UUID NOT NULL REFERENCES public.inventory_stock_opnames(id) ON DELETE CASCADE,
  stock_type TEXT NOT NULL CHECK (stock_type IN ('filled', 'empty', 'damaged', 'lost')),
  system_qty INTEGER NOT NULL CHECK (system_qty >= 0),
  physical_qty INTEGER NOT NULL CHECK (physical_qty >= 0),
  variance_qty INTEGER NOT NULL,
  variance_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number TEXT NOT NULL UNIQUE,
  opname_id UUID REFERENCES public.inventory_stock_opnames(id),
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id),
  stock_type TEXT NOT NULL CHECK (stock_type IN ('filled', 'empty', 'damaged', 'lost')),
  qty_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  approved_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. Reporting, Notifications, Audit Logs
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL DEFAULT 'MONTHLY_PHOTOCOPY',
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK (period_year >= 2024),
  unit_id UUID NOT NULL REFERENCES public.units(id),
  unit_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Berhasil', 'Gagal', 'Tertunda')),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  sent_by UUID REFERENCES public.profiles(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_type, period_month, period_year, unit_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_role TEXT CHECK (target_role IS NULL OR target_role IN ('super_admin', 'admin_resources', 'kepala_unit', 'user')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  related_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. Indexes for Supabase Free Plan Efficiency
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_orders_requester_created ON public.orders(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_unit_service_created ON public.orders(unit_id, service_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_needed ON public.orders(status, needed_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON public.order_status_history(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_created ON public.inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_location_type ON public.inventory_transactions(location_id, tx_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_logs_period ON public.report_delivery_logs(period_year, period_month, unit_id);
