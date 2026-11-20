import type {
  AppSettingsMap,
  AuditLogEntry,
  InventoryBalance,
  InventoryLocation,
  InventoryReceipt,
  InventoryTransaction,
  LocationItem,
  NotificationItem,
  OrderAttachment,
  OrderRecord,
  OrderStatus,
  PaginatedResponse,
  ReportDeliveryLog,
  ServiceCatalogItem,
  ServiceCode,
  StockOpnameRecord,
  StockType,
  Unit,
  UserProfile,
  UserRole,
} from '../../src/shared/types.ts';

export interface CreateGallonOrderInput {
  unitId: string;
  locationId: string | null;
  locationLabel: string;
  requestedQty: number;
  emptyExchangeQty: number;
  neededDate: string;
  neededTime?: string | null;
  notes?: string;
}

export interface CreatePhotocopyOrderInput {
  unitId: string;
  docName: string;
  pageCount: number;
  copyCount: number;
  paperSize: 'A4' | 'F4' | 'A3' | 'Lainnya';
  printColor: 'Hitam Putih' | 'Warna';
  isDuplex: boolean;
  finishingNotes?: string;
  neededDate: string;
  notes?: string;
  attachment?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    base64Content: string;
  } | null;
}

export interface CreateLaminatingOrderInput {
  unitId: string;
  docName: string;
  laminatingSize: 'A4' | 'F4' | 'A3' | 'ID Card' | 'Custom';
  sheetCount: number;
  laminatingType: string;
  neededDate: string;
  notes?: string;
}

export interface OrderFilterParams {
  page: number;
  pageSize: number;
  search?: string;
  serviceCode?: ServiceCode | 'ALL';
  status?: OrderStatus | 'ALL' | 'ACTIVE_QUEUE';
  unitId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'created_at' | 'needed_date' | 'order_number';
  sortDir?: 'asc' | 'desc';
  onlyMine?: boolean;
}

export interface DashboardSummary {
  ordersToday: number;
  ordersNew: number;
  ordersInProgress: number;
  ordersCompleted: number;
  ordersCancelled: number;
  totalGallonOrders: number;
  totalPhotocopyOrders: number;
  totalLaminatingOrders: number;
  totalFilledGallons: number;
  totalEmptyGallons: number;
  totalDamagedGallons: number;
  totalLostGallons: number;
  minStockThreshold: number;
  lowStockLocations: Array<{ locationName: string; qtyFilled: number; availableFilled: number; threshold: number }>;
  trendByDay: Array<{ date: string; gallon: number; photocopy: number; laminating: number }>;
  gallonUsageByMonth: Array<{ month: string; distributed: number; emptyReturned: number }>;
  photocopyByMonth: Array<{ month: string; bwSides: number; colorSides: number; sheets: number }>;
  ordersByUnit: Array<{ unitName: string; count: number }>;
  recentOrders: OrderRecord[];
  pendingWorkOrders: OrderRecord[];
}

export interface PhotocopyReportResponse {
  periodMonth: number;
  periodYear: number;
  unitId: string;
  unitName: string;
  headName: string;
  headEmail: string;
  summary: {
    totalOrders: number;
    totalBwSides: number;
    totalColorSides: number;
    totalSheets: number;
  };
  byRequester: Array<{
    requesterName: string;
    requesterEmail: string;
    orders: number;
    bwSides: number;
    colorSides: number;
    sheets: number;
  }>;
  monthlyTrend: Array<{
    monthLabel: string;
    bwSides: number;
    colorSides: number;
    sheets: number;
  }>;
  rows: Array<{
    orderNumber: string;
    createdAt: string;
    requesterName: string;
    docName: string;
    printColor: string;
    paperSize: string;
    pageCount: number;
    copyCount: number;
    isDuplex: boolean;
    printSidesTotal: number;
    paperSheetsTotal: number;
    status: OrderStatus;
  }>;
}

export interface LrmsBackend {
  resolveUserFromToken(token: string): Promise<UserProfile | null>;
  getSandboxUsers?(): Promise<UserProfile[]>;
  getUserById(userId: string): Promise<UserProfile | null>;
  getDashboard(actor: UserProfile): Promise<DashboardSummary>;

  // Master Data
  listUnits(includeInactive?: boolean): Promise<Unit[]>;
  upsertUnit(actor: UserProfile, data: Partial<Unit> & { code: string; name: string }): Promise<Unit>;
  listUsers(actor: UserProfile): Promise<UserProfile[]>;
  updateUserRoleAndUnits(
    actor: UserProfile,
    targetUserId: string,
    payload: { role: UserRole; unitIds: string[]; primaryUnitId: string | null; headUnitIds: string[]; isActive: boolean }
  ): Promise<UserProfile>;
  listServices(): Promise<ServiceCatalogItem[]>;
  upsertService(actor: UserProfile, data: Partial<ServiceCatalogItem> & { code: ServiceCode }): Promise<ServiceCatalogItem>;
  listLocations(includeInactive?: boolean): Promise<LocationItem[]>;
  upsertLocation(actor: UserProfile, data: Partial<LocationItem> & { code: string; building: string; floor: string; room: string }): Promise<LocationItem>;
  getSettings(actor: UserProfile): Promise<AppSettingsMap>;
  updateSettings(actor: UserProfile, settings: Partial<AppSettingsMap>): Promise<AppSettingsMap>;

  // Orders
  listOrders(actor: UserProfile, filter: OrderFilterParams): Promise<PaginatedResponse<OrderRecord>>;
  getOrderById(actor: UserProfile, orderId: string): Promise<OrderRecord | null>;
  createGallonOrder(actor: UserProfile, input: CreateGallonOrderInput): Promise<OrderRecord>;
  createPhotocopyOrder(actor: UserProfile, input: CreatePhotocopyOrderInput): Promise<OrderRecord>;
  createLaminatingOrder(actor: UserProfile, input: CreateLaminatingOrderInput): Promise<OrderRecord>;
  updateOrderStatus(
    actor: UserProfile,
    orderId: string,
    payload: {
      status: OrderStatus;
      internalNotes?: string;
      cancelReason?: string;
      actualQty?: number;
      assigneeId?: string | null;
      note?: string;
    }
  ): Promise<OrderRecord>;
  confirmGallonDelivery(
    actor: UserProfile,
    orderId: string,
    payload: { locationId: string; actualFilledSent: number; emptyReceived: number; note?: string }
  ): Promise<OrderRecord>;
  getAttachmentDownloadInfo(
    actor: UserProfile,
    attachmentId: string
  ): Promise<{ attachment: OrderAttachment; signedUrl?: string; localFilePath?: string }>;
  getAttachmentByIdDirect?(attachmentId: string): Promise<{ attachment: OrderAttachment; localFilePath: string } | null>;

  // Inventory
  getInventoryOverview(actor: UserProfile): Promise<{
    locations: InventoryLocation[];
    balances: InventoryBalance[];
    receipts: InventoryReceipt[];
    opnames: StockOpnameRecord[];
    transactions: PaginatedResponse<InventoryTransaction>;
    monthlyTrend: Array<{ month: string; received: number; distributed: number; emptyReturned: number }>;
  }>;
  listInventoryTransactions(
    actor: UserProfile,
    params: { page: number; pageSize: number; locationId?: string; txType?: string; dateFrom?: string; dateTo?: string }
  ): Promise<PaginatedResponse<InventoryTransaction>>;
  recordGallonReceipt(
    actor: UserProfile,
    payload: {
      receiptDate: string;
      supplier: string;
      locationId: string;
      qtyFilled: number;
      qtyEmpty: number;
      documentNo: string;
      notes: string;
    }
  ): Promise<InventoryReceipt>;
  recordEmptyReturn(
    actor: UserProfile,
    payload: { locationId: string; qtyEmpty: number; unitId?: string; referenceNo: string; notes: string }
  ): Promise<InventoryTransaction>;
  recordManualAdjustment(
    actor: UserProfile,
    payload: { locationId: string; stockType: StockType; qtyDelta: number; reason: string }
  ): Promise<InventoryTransaction>;
  createOrUpdateOpnameDraft(
    actor: UserProfile,
    payload: {
      opnameId?: string;
      opnameDate: string;
      locationId: string;
      notes: string;
      items: Array<{ stockType: StockType; physicalQty: number; varianceReason: string; notes?: string }>;
    }
  ): Promise<StockOpnameRecord>;
  finalizeStockOpname(actor: UserProfile, opnameId: string): Promise<StockOpnameRecord>;

  // Reports & Notifications & Audit
  getUnitPhotocopyReport(
    actor: UserProfile,
    params: { unitId?: string; month: number; year: number }
  ): Promise<PhotocopyReportResponse>;
  listReportDeliveryLogs(actor: UserProfile, month?: number, year?: number): Promise<ReportDeliveryLog[]>;
  dispatchMonthlyPhotocopyReports(
    actor: UserProfile | null,
    params: { month: number; year: number; unitId?: string; forceResend?: boolean }
  ): Promise<ReportDeliveryLog[]>;
  getAnalyticsReport(
    actor: UserProfile,
    params: { reportType: string; dateFrom?: string; dateTo?: string; unitId?: string; serviceCode?: string; status?: string }
  ): Promise<{ rows: Array<Record<string, unknown>>; summary: Record<string, unknown> }>;
  listNotifications(actor: UserProfile): Promise<NotificationItem[]>;
  markNotificationRead(actor: UserProfile, notificationId: string | 'ALL'): Promise<void>;
  listAuditLogs(actor: UserProfile, page: number, pageSize: number): Promise<PaginatedResponse<AuditLogEntry>>;
}
