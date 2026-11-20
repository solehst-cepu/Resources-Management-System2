-- ==============================================================================
-- LRMS (Lazuardi Resources Management System) — 002_rls.sql
-- Row Level Security (RLS) Policies & Private Storage Bucket Rules
-- ==============================================================================

-- Helper functions (SECURITY DEFINER to avoid recursive RLS evaluation)
CREATE OR REPLACE FUNCTION public.get_user_role(p_uid UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = p_uid LIMIT 1),
    'user'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role(p_uid) IN ('super_admin', 'admin_resources');
$$;

CREATE OR REPLACE FUNCTION public.is_unit_head_for(p_uid UUID, p_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = p_unit_id AND u.head_user_id = p_uid
  ) OR EXISTS (
    SELECT 1 FROM public.user_unit_assignments uua
    WHERE uua.user_id = p_uid AND uua.unit_id = p_unit_id AND uua.is_unit_head = TRUE
  );
$$;

-- Enable RLS across all operational tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_unit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_opnames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_opname_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users read own profile, admins read all, nobody elevates role here
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin_or_super(auth.uid()));

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- User Roles: read own role or Super Admin/Admin reads; ONLY Super Admin mutates
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin_or_super(auth.uid()));

CREATE POLICY "user_roles_super_admin_write" ON public.user_roles
  FOR ALL USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

-- Master Data (Units, Locations, Service Catalog): authenticated school users can read active records
CREATE POLICY "units_read_all_auth" ON public.units
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "units_super_admin_write" ON public.units
  FOR ALL USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

CREATE POLICY "user_unit_assignments_select" ON public.user_unit_assignments
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin_or_super(auth.uid()));

CREATE POLICY "user_unit_assignments_super_admin_write" ON public.user_unit_assignments
  FOR ALL USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

CREATE POLICY "service_catalog_read" ON public.service_catalog
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "service_catalog_super_admin_write" ON public.service_catalog
  FOR ALL USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

CREATE POLICY "locations_read" ON public.locations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "locations_super_admin_write" ON public.locations
  FOR ALL USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT USING (public.is_admin_or_super(auth.uid()));

CREATE POLICY "app_settings_super_admin_write" ON public.app_settings
  FOR ALL USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

-- Orders:
-- - Requester reads own orders
-- - Admin & Super Admin read/manage all orders
-- - Kepala Unit reads ONLY photocopy orders of their assigned unit(s)
CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT USING (
    requester_id = auth.uid()
    OR public.is_admin_or_super(auth.uid())
    OR (
      service_code = 'FOTOKOPI'
      AND public.get_user_role(auth.uid()) = 'kepala_unit'
      AND public.is_unit_head_for(auth.uid(), unit_id)
    )
  );

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "orders_update_policy" ON public.orders
  FOR UPDATE USING (
    public.is_admin_or_super(auth.uid())
    OR (requester_id = auth.uid() AND status = 'Menunggu Diproses')
  );

-- Order Items & Status History follow parent order visibility
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (
        o.requester_id = auth.uid()
        OR public.is_admin_or_super(auth.uid())
        OR (o.service_code = 'FOTOKOPI' AND public.get_user_role(auth.uid()) = 'kepala_unit' AND public.is_unit_head_for(auth.uid(), o.unit_id))
      )
    )
  );

CREATE POLICY "order_items_insert_own" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.requester_id = auth.uid())
  );

CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (o.requester_id = auth.uid() OR public.is_admin_or_super(auth.uid()))
    )
  );

-- Order Attachments: STRICTLY restricted to requester & Admin/Super Admin (Kepala Unit cannot access files!)
CREATE POLICY "order_attachments_select_restricted" ON public.order_attachments
  FOR SELECT USING (
    uploaded_by = auth.uid() OR public.is_admin_or_super(auth.uid())
  );

CREATE POLICY "order_attachments_insert_own" ON public.order_attachments
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "order_assignments_admin" ON public.order_assignments
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

-- Inventory: Admin Resources & Super Admin manage; authenticated users can read current availability summary via API
CREATE POLICY "inventory_read_auth" ON public.inventory_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "inventory_locations_read_auth" ON public.inventory_locations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "inventory_balances_read_auth" ON public.inventory_balances
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "inventory_balances_admin_write" ON public.inventory_balances
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

CREATE POLICY "inventory_transactions_admin" ON public.inventory_transactions
  FOR SELECT USING (public.is_admin_or_super(auth.uid()));

CREATE POLICY "inventory_receipts_admin" ON public.inventory_receipts
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

CREATE POLICY "inventory_opnames_admin" ON public.inventory_stock_opnames
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

CREATE POLICY "inventory_opname_items_admin" ON public.inventory_stock_opname_items
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

CREATE POLICY "inventory_adjustments_admin" ON public.inventory_adjustments
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

-- Reporting, Notifications & Audit Logs
CREATE POLICY "report_schedules_admin" ON public.report_schedules
  FOR ALL USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

CREATE POLICY "report_delivery_logs_select" ON public.report_delivery_logs
  FOR SELECT USING (
    public.is_admin_or_super(auth.uid())
    OR (public.get_user_role(auth.uid()) = 'kepala_unit' AND public.is_unit_head_for(auth.uid(), unit_id))
  );

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR (target_role IS NOT NULL AND target_role = public.get_user_role(auth.uid()))
  );

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "audit_logs_super_admin_only" ON public.audit_logs
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'super_admin');

-- Private Storage Bucket Setup
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotokopi-documents',
  'fotokopi-documents',
  FALSE,
  15728640,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fotokopi_storage_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'fotokopi-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "fotokopi_storage_select_owner_or_admin" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fotokopi-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin_or_super(auth.uid())
    )
  );
