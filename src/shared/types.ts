export type UserRole = 'super_admin' | 'admin_resources' | 'kepala_unit' | 'user';

export type ServiceCode = 'AIR_GALON' | 'FOTOKOPI' | 'LAMINATING';

export type OrderStatus =
  | 'Menunggu Diproses'
  | 'Diproses'
  | 'Dalam Pengiriman'
  | 'Siap Diambil'
  | 'Selesai'
  | 'Dibatalkan';

export type PaperSize = 'A4' | 'F4' | 'A3' | 'Lainnya';
export type PrintColor = 'Hitam Putih' | 'Warna';
export type LaminatingSize = 'A4' | 'F4' | 'A3' | 'ID Card' | 'Custom';
export type StockType = 'filled' | 'empty' | 'damaged' | 'lost';

export interface Unit {
  id: string;
  code: string;
  name: string;
  category: string;
  head_user_id: string | null;
  head_name: string;
  head_email: string;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  role: UserRole;
  is_active: boolean;
  unit_ids: string[];
  primary_unit_id: string | null;
  head_unit_ids: string[];
  last_login_at: string | null;
}

export interface ServiceCatalogItem {
  id: string;
  code: ServiceCode;
  name: string;
  description: string;
  is_active: boolean;
  sla_estimate_minutes: number;
  config_json: Record<string, unknown>;
}

export interface LocationItem {
  id: string;
  code: string;
  building: string;
  floor: string;
  room: string;
  unit_id: string | null;
  unit_name?: string;
  is_active: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_type: string;
  requested_qty: number;
  actual_qty: number | null;
  empty_exchange_qty: number;
  empty_returned_qty: number | null;
  doc_name?: string | null;
  page_count?: number | null;
  copy_count?: number | null;
  paper_size?: PaperSize | null;
  print_color?: PrintColor | null;
  is_duplex: boolean;
  print_sides_total?: number | null;
  paper_sheets_total?: number | null;
  finishing_notes?: string | null;
  laminating_size?: LaminatingSize | null;
  laminating_type?: string | null;
}

export interface OrderAttachment {
  id: string;
  order_id: string;
  bucket_name: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  changed_by_name: string;
  note: string;
  created_at: string;
}

export interface OrderRecord {
  id: string;
  order_number: string;
  service_code: ServiceCode;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  unit_id: string;
  unit_name: string;
  location_id: string | null;
  location_label: string;
  status: OrderStatus;
  needed_date: string;
  needed_time: string | null;
  notes: string;
  internal_notes: string;
  cancel_reason: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  item?: OrderItem | null;
  attachments?: OrderAttachment[];
  history?: OrderStatusHistoryEntry[];
}

export interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  building: string;
  description: string;
  is_active: boolean;
}

export interface InventoryBalance {
  id: string;
  item_id: string;
  location_id: string;
  location_name: string;
  location_code: string;
  qty_filled: number;
  qty_empty: number;
  qty_damaged: number;
  qty_lost: number;
  qty_allocated: number;
  available_filled: number;
  min_stock_threshold: number;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  tx_number: string;
  tx_type: 'RECEIPT' | 'DISTRIBUTION' | 'EMPTY_RETURN' | 'OPNAME_ADJUSTMENT' | 'MANUAL_ADJUSTMENT';
  location_id: string;
  location_name: string;
  order_id: string | null;
  qty_filled_delta: number;
  qty_empty_delta: number;
  qty_damaged_delta: number;
  qty_lost_delta: number;
  reference_no: string;
  supplier_name: string;
  actor_id: string | null;
  actor_name: string;
  notes: string;
  created_at: string;
}

export interface InventoryReceipt {
  id: string;
  receipt_number: string;
  receipt_date: string;
  supplier: string;
  location_id: string;
  location_name: string;
  qty_filled: number;
  qty_empty: number;
  document_no: string;
  notes: string;
  created_by_name: string;
  created_at: string;
}

export interface StockOpnameItem {
  id: string;
  opname_id: string;
  stock_type: StockType;
  system_qty: number;
  physical_qty: number;
  variance_qty: number;
  variance_reason: string;
  notes: string;
}

export interface StockOpnameRecord {
  id: string;
  opname_number: string;
  opname_date: string;
  location_id: string;
  location_name: string;
  status: 'Draft' | 'Final';
  inspector_id: string | null;
  inspector_name: string;
  notes: string;
  finalized_at: string | null;
  created_at: string;
  items: StockOpnameItem[];
}

export interface NotificationItem {
  id: string;
  user_id: string | null;
  target_role: UserRole | null;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  related_order_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ReportDeliveryLog {
  id: string;
  report_type: string;
  period_month: number;
  period_year: number;
  unit_id: string;
  unit_name: string;
  recipient_email: string;
  status: 'Berhasil' | 'Gagal' | 'Tertunda';
  summary_json: Record<string, unknown>;
  error_message: string | null;
  sent_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata_json: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface AppSettingsMap {
  allowed_domain: string;
  min_gallon_stock_alert: number;
  attachment_retention_days: number;
  monthly_report_day: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SystemConfigStatus {
  supabaseConfigured: boolean;
  emailConfigured: boolean;
  allowedDomain: string;
  mode: 'supabase' | 'local_sandbox';
}
