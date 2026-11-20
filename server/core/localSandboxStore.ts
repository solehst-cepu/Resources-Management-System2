import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
import {
  MONTH_NAMES_ID,
  calculateAvailableGallons,
  calculatePhotocopyMetrics,
} from '../../src/shared/calculations.ts';
import type {
  CreateGallonOrderInput,
  CreateLaminatingOrderInput,
  CreatePhotocopyOrderInput,
  DashboardSummary,
  LrmsBackend,
  OrderFilterParams,
  PhotocopyReportResponse,
} from './backendTypes.ts';
import { sendMonthlyPhotocopyEmail } from './emailService.ts';

interface SandboxDatabase {
  users: UserProfile[];
  units: Unit[];
  services: ServiceCatalogItem[];
  locations: LocationItem[];
  settings: AppSettingsMap;
  orderSequences: Record<string, number>;
  orders: OrderRecord[];
  inventoryLocations: InventoryLocation[];
  inventoryBalances: InventoryBalance[];
  inventoryReceipts: InventoryReceipt[];
  inventoryTransactions: InventoryTransaction[];
  stockOpnames: StockOpnameRecord[];
  reportDeliveryLogs: ReportDeliveryLog[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
}

const DATA_FILE = path.resolve(process.cwd(), '.lrms-dev-data.json');
const UPLOAD_DIR = path.resolve(process.cwd(), '.lrms-uploads');

let mutexPromise: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = mutexPromise;
  let release!: () => void;
  mutexPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

function createInitialDatabase(): SandboxDatabase {
  const unitResId = '11111111-1111-4111-8111-111111111101';
  const unitTkId = '11111111-1111-4111-8111-111111111102';
  const unitSdId = '11111111-1111-4111-8111-111111111103';
  const unitSmpId = '11111111-1111-4111-8111-111111111104';
  const unitSmaId = '11111111-1111-4111-8111-111111111105';
  const unitFinId = '11111111-1111-4111-8111-111111111106';

  const superAdminId = '22222222-2222-4222-8222-222222222201';
  const adminResId = '22222222-2222-4222-8222-222222222202';
  const kepalaSmpId = '22222222-2222-4222-8222-222222222203';
  const guruSdId = '22222222-2222-4222-8222-222222222204';
  const guruSmpId = '22222222-2222-4222-8222-222222222205';

  const units: Unit[] = [
    {
      id: unitResId,
      code: 'RES',
      name: 'Divisi Resources',
      category: 'Operasional',
      head_user_id: superAdminId,
      head_name: 'Nadia Kusuma',
      head_email: 'nadia.kusuma@lazuardi.sch.id',
      is_active: true,
      created_at: daysAgoIso(60),
    },
    {
      id: unitTkId,
      code: 'TK',
      name: 'TK Lazuardi',
      category: 'Akademik',
      head_user_id: null,
      head_name: 'Siti Rahmawati',
      head_email: 'kepala.tk@lazuardi.sch.id',
      is_active: true,
      created_at: daysAgoIso(60),
    },
    {
      id: unitSdId,
      code: 'SD',
      name: 'SD Lazuardi',
      category: 'Akademik',
      head_user_id: null,
      head_name: 'Hendra Wijaya',
      head_email: 'kepala.sd@lazuardi.sch.id',
      is_active: true,
      created_at: daysAgoIso(60),
    },
    {
      id: unitSmpId,
      code: 'SMP',
      name: 'SMP Lazuardi',
      category: 'Akademik',
      head_user_id: kepalaSmpId,
      head_name: 'Dr. Budi Santoso',
      head_email: 'budi.santoso@lazuardi.sch.id',
      is_active: true,
      created_at: daysAgoIso(60),
    },
    {
      id: unitSmaId,
      code: 'SMA',
      name: 'SMA Lazuardi',
      category: 'Akademik',
      head_user_id: null,
      head_name: 'Ratna Permata',
      head_email: 'kepala.sma@lazuardi.sch.id',
      is_active: true,
      created_at: daysAgoIso(60),
    },
    {
      id: unitFinId,
      code: 'FIN',
      name: 'Keuangan & HR',
      category: 'Manajemen',
      head_user_id: null,
      head_name: 'Dian Prasetyo',
      head_email: 'finance@lazuardi.sch.id',
      is_active: true,
      created_at: daysAgoIso(60),
    },
  ];

  const users: UserProfile[] = [
    {
      id: superAdminId,
      email: 'nadia.kusuma@lazuardi.sch.id',
      full_name: 'Nadia Kusuma (Super Admin)',
      role: 'super_admin',
      is_active: true,
      unit_ids: [unitResId],
      primary_unit_id: unitResId,
      head_unit_ids: [],
      last_login_at: nowIso(),
    },
    {
      id: adminResId,
      email: 'rizky.resources@lazuardi.sch.id',
      full_name: 'Rizky Pratama (Admin Resources)',
      role: 'admin_resources',
      is_active: true,
      unit_ids: [unitResId],
      primary_unit_id: unitResId,
      head_unit_ids: [],
      last_login_at: daysAgoIso(1),
    },
    {
      id: kepalaSmpId,
      email: 'budi.santoso@lazuardi.sch.id',
      full_name: 'Dr. Budi Santoso (Kepala Unit SMP)',
      role: 'kepala_unit',
      is_active: true,
      unit_ids: [unitSmpId],
      primary_unit_id: unitSmpId,
      head_unit_ids: [unitSmpId],
      last_login_at: daysAgoIso(2),
    },
    {
      id: guruSdId,
      email: 'amira.zahra@lazuardi.sch.id',
      full_name: 'Amira Zahra (Guru SD)',
      role: 'user',
      is_active: true,
      unit_ids: [unitSdId],
      primary_unit_id: unitSdId,
      head_unit_ids: [],
      last_login_at: daysAgoIso(1),
    },
    {
      id: guruSmpId,
      email: 'farhan.guru@lazuardi.sch.id',
      full_name: 'Farhan Maulana (Guru SMP)',
      role: 'user',
      is_active: true,
      unit_ids: [unitSmpId],
      primary_unit_id: unitSmpId,
      head_unit_ids: [],
      last_login_at: daysAgoIso(3),
    },
  ];

  const services: ServiceCatalogItem[] = [
    {
      id: '33333333-3333-4333-8333-333333333301',
      code: 'AIR_GALON',
      name: 'Air Galon',
      description: 'Permintaan pengantaran air mineral galon 19L dan penukaran galon kosong antar ruangan.',
      is_active: true,
      sla_estimate_minutes: 45,
      config_json: { allow_exchange: true },
    },
    {
      id: '33333333-3333-4333-8333-333333333302',
      code: 'FOTOKOPI',
      name: 'Fotokopi',
      description: 'Penggandaan modul ajar, lembar ujian, dan dokumen resmi hitam putih atau warna (1 sisi / 2 sisi).',
      is_active: true,
      sla_estimate_minutes: 120,
      config_json: { max_file_mb: 15 },
    },
    {
      id: '33333333-3333-4333-8333-333333333303',
      code: 'LAMINATING',
      name: 'Laminating',
      description: 'Pelapisan laminasi plastik glossy/doff untuk poster, kartu identitas, dan perangkat ajar.',
      is_active: true,
      sla_estimate_minutes: 90,
      config_json: { sizes: ['A4', 'F4', 'A3', 'ID Card', 'Custom'] },
    },
  ];

  const locations: LocationItem[] = [
    {
      id: '44444444-4444-4444-8444-444444444401',
      code: 'LOC-SD-01',
      building: 'Gedung Utama',
      floor: 'Lantai 2',
      room: 'Ruang Guru SD',
      unit_id: unitSdId,
      unit_name: 'SD Lazuardi',
      is_active: true,
    },
    {
      id: '44444444-4444-4444-8444-444444444402',
      code: 'LOC-SMP-01',
      building: 'Gedung Timur',
      floor: 'Lantai 2',
      room: 'Ruang Guru SMP',
      unit_id: unitSmpId,
      unit_name: 'SMP Lazuardi',
      is_active: true,
    },
    {
      id: '44444444-4444-4444-8444-444444444403',
      code: 'LOC-SMA-01',
      building: 'Gedung Timur',
      floor: 'Lantai 3',
      room: 'Ruang Guru SMA',
      unit_id: unitSmaId,
      unit_name: 'SMA Lazuardi',
      is_active: true,
    },
    {
      id: '44444444-4444-4444-8444-444444444404',
      code: 'LOC-TK-01',
      building: 'Gedung Barat',
      floor: 'Lantai 1',
      room: 'Pantry & Guru TK',
      unit_id: unitTkId,
      unit_name: 'TK Lazuardi',
      is_active: true,
    },
  ];

  const invLocMainId = '55555555-5555-4555-8555-555555555501';
  const invLocEastId = '55555555-5555-4555-8555-555555555502';

  const inventoryLocations: InventoryLocation[] = [
    {
      id: invLocMainId,
      code: 'GDG-UTAMA',
      name: 'Gudang Utama Resources',
      building: 'Gedung Operasional Lt. 1',
      description: 'Pusat penerimaan supplier & distribusi galon sekolah',
      is_active: true,
    },
    {
      id: invLocEastId,
      code: 'POS-TIMUR',
      name: 'Pos Distribusi Gedung Timur',
      building: 'Gedung Timur Lt. 1',
      description: 'Stok penyangga unit SMP & SMA',
      is_active: true,
    },
  ];

  const inventoryBalances: InventoryBalance[] = [
    {
      id: '66666666-6666-4666-8666-666666666601',
      item_id: '77777777-7777-4777-8777-777777777701',
      location_id: invLocMainId,
      location_name: 'Gudang Utama Resources',
      location_code: 'GDG-UTAMA',
      qty_filled: 38,
      qty_empty: 16,
      qty_damaged: 2,
      qty_lost: 0,
      qty_allocated: 3,
      available_filled: 35,
      min_stock_threshold: 15,
      updated_at: nowIso(),
    },
    {
      id: '66666666-6666-4666-8666-666666666602',
      item_id: '77777777-7777-4777-8777-777777777701',
      location_id: invLocEastId,
      location_name: 'Pos Distribusi Gedung Timur',
      location_code: 'POS-TIMUR',
      qty_filled: 12,
      qty_empty: 6,
      qty_damaged: 0,
      qty_lost: 0,
      qty_allocated: 0,
      available_filled: 12,
      min_stock_threshold: 15,
      updated_at: nowIso(),
    },
  ];

  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const fcpCalc1 = calculatePhotocopyMetrics(9, 30, true); // odd pages duplex: 9 pages -> 5 sheets/copy -> 150 sheets, 270 sides
  const fcpCalc2 = calculatePhotocopyMetrics(10, 5, false); // 10 pages, 5 copies, single-sided: 50 sides, 50 sheets

  const orders: OrderRecord[] = [
    {
      id: '88888888-8888-4888-8888-888888888801',
      order_number: `GAL-${ym}-0001`,
      service_code: 'AIR_GALON',
      requester_id: guruSdId,
      requester_name: 'Amira Zahra (Guru SD)',
      requester_email: 'amira.zahra@lazuardi.sch.id',
      unit_id: unitSdId,
      unit_name: 'SD Lazuardi',
      location_id: '44444444-4444-4444-8444-444444444401',
      location_label: 'Gedung Utama · Lantai 2 · Ruang Guru SD',
      status: 'Menunggu Diproses',
      needed_date: todayDateStr(),
      needed_time: '09:30',
      notes: 'Dispenser ruang guru lantai 2 sudah hampir habis.',
      internal_notes: '',
      cancel_reason: null,
      cancelled_at: null,
      completed_at: null,
      created_at: daysAgoIso(0),
      updated_at: daysAgoIso(0),
      assignee_id: null,
      assignee_name: null,
      item: {
        id: '99999999-9999-4999-8999-999999999901',
        order_id: '88888888-8888-4888-8888-888888888801',
        item_type: 'AIR_GALON',
        requested_qty: 3,
        actual_qty: null,
        empty_exchange_qty: 3,
        empty_returned_qty: null,
        is_duplex: false,
      },
      attachments: [],
      history: [
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888801',
          from_status: null,
          to_status: 'Menunggu Diproses',
          changed_by: guruSdId,
          changed_by_name: 'Amira Zahra (Guru SD)',
          note: 'Permintaan air galon dibuat oleh pemesan.',
          created_at: daysAgoIso(0),
        },
      ],
    },
    {
      id: '88888888-8888-4888-8888-888888888802',
      order_number: `FCP-${ym}-0001`,
      service_code: 'FOTOKOPI',
      requester_id: guruSmpId,
      requester_name: 'Farhan Maulana (Guru SMP)',
      requester_email: 'farhan.guru@lazuardi.sch.id',
      unit_id: unitSmpId,
      unit_name: 'SMP Lazuardi',
      location_id: '44444444-4444-4444-8444-444444444402',
      location_label: 'Gedung Timur · Lantai 2 · Ruang Guru SMP',
      status: 'Selesai',
      needed_date: todayDateStr(),
      needed_time: null,
      notes: 'Mohon distaples rapi di pojok kiri atas.',
      internal_notes: 'Selesai dicetak di mesin Konica Lt. 1',
      cancel_reason: null,
      cancelled_at: null,
      completed_at: daysAgoIso(1),
      created_at: daysAgoIso(2),
      updated_at: daysAgoIso(1),
      assignee_id: adminResId,
      assignee_name: 'Rizky Pratama (Admin Resources)',
      item: {
        id: '99999999-9999-4999-8999-999999999902',
        order_id: '88888888-8888-4888-8888-888888888802',
        item_type: 'FOTOKOPI',
        requested_qty: 30,
        actual_qty: 30,
        empty_exchange_qty: 0,
        empty_returned_qty: null,
        doc_name: 'Soal Asesmen IPA Kelas 8.pdf',
        page_count: fcpCalc1.pageCount,
        copy_count: fcpCalc1.copyCount,
        paper_size: 'A4',
        print_color: 'Hitam Putih',
        is_duplex: true,
        print_sides_total: fcpCalc1.printSidesTotal,
        paper_sheets_total: fcpCalc1.paperSheetsTotal,
        finishing_notes: 'Staples pojok kiri atas',
      },
      attachments: [],
      history: [
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888802',
          from_status: null,
          to_status: 'Menunggu Diproses',
          changed_by: guruSmpId,
          changed_by_name: 'Farhan Maulana (Guru SMP)',
          note: 'Permintaan fotokopi masuk antrean Resources.',
          created_at: daysAgoIso(2),
        },
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888802',
          from_status: 'Menunggu Diproses',
          to_status: 'Selesai',
          changed_by: adminResId,
          changed_by_name: 'Rizky Pratama (Admin Resources)',
          note: 'Dokumen selesai digandakan dan diserahkan.',
          created_at: daysAgoIso(1),
        },
      ],
    },
    {
      id: '88888888-8888-4888-8888-888888888803',
      order_number: `FCP-${ym}-0002`,
      service_code: 'FOTOKOPI',
      requester_id: kepalaSmpId,
      requester_name: 'Dr. Budi Santoso (Kepala Unit SMP)',
      requester_email: 'budi.santoso@lazuardi.sch.id',
      unit_id: unitSmpId,
      unit_name: 'SMP Lazuardi',
      location_id: '44444444-4444-4444-8444-444444444402',
      location_label: 'Gedung Timur · Lantai 2 · Ruang Guru SMP',
      status: 'Diproses',
      needed_date: todayDateStr(),
      needed_time: null,
      notes: 'Materi rapat koordinasi kurikulum bulanan.',
      internal_notes: '',
      cancel_reason: null,
      cancelled_at: null,
      completed_at: null,
      created_at: daysAgoIso(1),
      updated_at: daysAgoIso(0),
      assignee_id: adminResId,
      assignee_name: 'Rizky Pratama (Admin Resources)',
      item: {
        id: '99999999-9999-4999-8999-999999999903',
        order_id: '88888888-8888-4888-8888-888888888803',
        item_type: 'FOTOKOPI',
        requested_qty: 5,
        actual_qty: 5,
        empty_exchange_qty: 0,
        empty_returned_qty: null,
        doc_name: 'Panduan Proyek P5 Semester Ganjil.pdf',
        page_count: fcpCalc2.pageCount,
        copy_count: fcpCalc2.copyCount,
        paper_size: 'F4',
        print_color: 'Warna',
        is_duplex: false,
        print_sides_total: fcpCalc2.printSidesTotal,
        paper_sheets_total: fcpCalc2.paperSheetsTotal,
        finishing_notes: 'Jilid spiral',
      },
      attachments: [],
      history: [
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888803',
          from_status: null,
          to_status: 'Menunggu Diproses',
          changed_by: kepalaSmpId,
          changed_by_name: 'Dr. Budi Santoso (Kepala Unit SMP)',
          note: 'Permintaan fotokopi dibuat.',
          created_at: daysAgoIso(1),
        },
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888803',
          from_status: 'Menunggu Diproses',
          to_status: 'Diproses',
          changed_by: adminResId,
          changed_by_name: 'Rizky Pratama (Admin Resources)',
          note: 'Sedang dicetak warna.',
          created_at: daysAgoIso(0),
        },
      ],
    },
    {
      id: '88888888-8888-4888-8888-888888888804',
      order_number: `LAM-${ym}-0001`,
      service_code: 'LAMINATING',
      requester_id: guruSdId,
      requester_name: 'Amira Zahra (Guru SD)',
      requester_email: 'amira.zahra@lazuardi.sch.id',
      unit_id: unitSdId,
      unit_name: 'SD Lazuardi',
      location_id: '44444444-4444-4444-8444-444444444401',
      location_label: 'Gedung Utama · Lantai 2 · Ruang Guru SD',
      status: 'Siap Diambil',
      needed_date: todayDateStr(),
      needed_time: null,
      notes: 'Kartu piket kelas dan tata tertib ruang laboratorium.',
      internal_notes: 'Sudah dilaminasi kaku 100 micron',
      cancel_reason: null,
      cancelled_at: null,
      completed_at: null,
      created_at: daysAgoIso(1),
      updated_at: daysAgoIso(0),
      assignee_id: adminResId,
      assignee_name: 'Rizky Pratama (Admin Resources)',
      item: {
        id: '99999999-9999-4999-8999-999999999904',
        order_id: '88888888-8888-4888-8888-888888888804',
        item_type: 'LAMINATING',
        requested_qty: 12,
        actual_qty: 12,
        empty_exchange_qty: 0,
        empty_returned_qty: null,
        doc_name: 'Kartu Piket & Poster Tata Tertib Kelas',
        laminating_size: 'A4',
        laminating_type: 'Glossy Kaku (100 micron)',
        is_duplex: false,
      },
      attachments: [],
      history: [
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888804',
          from_status: null,
          to_status: 'Menunggu Diproses',
          changed_by: guruSdId,
          changed_by_name: 'Amira Zahra (Guru SD)',
          note: 'Permintaan laminating dibuat.',
          created_at: daysAgoIso(1),
        },
        {
          id: crypto.randomUUID(),
          order_id: '88888888-8888-4888-8888-888888888804',
          from_status: 'Menunggu Diproses',
          to_status: 'Siap Diambil',
          changed_by: adminResId,
          changed_by_name: 'Rizky Pratama (Admin Resources)',
          note: 'Laminating selesai, siap diambil di loket Resources.',
          created_at: daysAgoIso(0),
        },
      ],
    },
  ];

  const inventoryReceipts: InventoryReceipt[] = [
    {
      id: 'aaaa1111-1111-4111-8111-111111111101',
      receipt_number: `RCV-${ym}-0001`,
      receipt_date: todayDateStr(),
      supplier: 'PT Tirta Sehat Nusantara',
      location_id: invLocMainId,
      location_name: 'Gudang Utama Resources',
      qty_filled: 40,
      qty_empty: 10,
      document_no: 'SJ-TSN-2026-1104',
      notes: 'Penerimaan stok awal bulan divisi Resources',
      created_by_name: 'Rizky Pratama (Admin Resources)',
      created_at: daysAgoIso(3),
    },
  ];

  const inventoryTransactions: InventoryTransaction[] = [
    {
      id: 'bbbb1111-1111-4111-8111-111111111101',
      tx_number: `TX-${ym}-0001`,
      tx_type: 'RECEIPT',
      location_id: invLocMainId,
      location_name: 'Gudang Utama Resources',
      order_id: null,
      qty_filled_delta: 40,
      qty_empty_delta: 10,
      qty_damaged_delta: 0,
      qty_lost_delta: 0,
      reference_no: `RCV-${ym}-0001`,
      supplier_name: 'PT Tirta Sehat Nusantara',
      actor_id: adminResId,
      actor_name: 'Rizky Pratama (Admin Resources)',
      notes: 'Penerimaan stok awal bulan dari supplier resmi',
      created_at: daysAgoIso(3),
    },
    {
      id: 'bbbb1111-1111-4111-8111-111111111102',
      tx_number: `TX-${ym}-0002`,
      tx_type: 'DISTRIBUTION',
      location_id: invLocMainId,
      location_name: 'Gudang Utama Resources',
      order_id: null,
      qty_filled_delta: -2,
      qty_empty_delta: 2,
      qty_damaged_delta: 0,
      qty_lost_delta: 0,
      reference_no: 'DIST-AWAL-01',
      supplier_name: '',
      actor_id: adminResId,
      actor_name: 'Rizky Pratama (Admin Resources)',
      notes: 'Distribusi rutin ruang guru Gedung Utama',
      created_at: daysAgoIso(2),
    },
  ];

  return {
    users,
    units,
    services,
    locations,
    settings: {
      allowed_domain: 'lazuardi.sch.id',
      min_gallon_stock_alert: 15,
      attachment_retention_days: 90,
      monthly_report_day: 1,
    },
    orderSequences: {
      [`GAL-${ym}`]: 1,
      [`FCP-${ym}`]: 2,
      [`LAM-${ym}`]: 1,
    },
    orders,
    inventoryLocations,
    inventoryBalances,
    inventoryReceipts,
    inventoryTransactions,
    stockOpnames: [],
    reportDeliveryLogs: [],
    notifications: [
      {
        id: crypto.randomUUID(),
        user_id: null,
        target_role: 'admin_resources',
        title: 'Stok Pos Distribusi Gedung Timur di bawah batas minimum',
        message: 'Pos Distribusi Gedung Timur memiliki 12 galon isi (ambang batas minimum 15 galon).',
        type: 'warning',
        related_order_id: null,
        is_read: false,
        created_at: daysAgoIso(0),
      },
      {
        id: crypto.randomUUID(),
        user_id: guruSdId,
        target_role: null,
        title: `Order LAM-${ym}-0001 Siap Diambil`,
        message: 'Laminating Kartu Piket & Poster Tata Tertib Kelas telah selesai dan siap diambil di Divisi Resources.',
        type: 'success',
        related_order_id: '88888888-8888-4888-8888-888888888804',
        is_read: false,
        created_at: daysAgoIso(0),
      },
    ],
    auditLogs: [
      {
        id: crypto.randomUUID(),
        actor_id: superAdminId,
        actor_email: 'nadia.kusuma@lazuardi.sch.id',
        actor_role: 'super_admin',
        action: 'SYSTEM_INITIALIZED',
        entity_type: 'app_settings',
        entity_id: 'initial',
        metadata_json: { allowed_domain: 'lazuardi.sch.id' },
        ip_address: '127.0.0.1',
        created_at: daysAgoIso(3),
      },
    ],
  };
}

function loadDb(): SandboxDatabase {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw) as SandboxDatabase;
    }
  } catch {
    // Re-create if corrupted
  }
  const db = createInitialDatabase();
  saveDb(db);
  return db;
}

function saveDb(db: SandboxDatabase): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function nextOrderNumber(db: SandboxDatabase, serviceCode: ServiceCode): string {
  const prefix = serviceCode === 'AIR_GALON' ? 'GAL' : serviceCode === 'FOTOKOPI' ? 'FCP' : 'LAM';
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const key = `${prefix}-${ym}`;
  const nextSeq = (db.orderSequences[key] || 0) + 1;
  db.orderSequences[key] = nextSeq;
  return `${key}-${String(nextSeq).padStart(4, '0')}`;
}

function nextTxNumber(db: SandboxDatabase): string {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const key = `TX-${ym}`;
  const nextSeq = (db.orderSequences[key] || db.inventoryTransactions.length) + 1;
  db.orderSequences[key] = nextSeq;
  return `${key}-${String(nextSeq).padStart(4, '0')}`;
}

function appendAudit(
  db: SandboxDatabase,
  actor: UserProfile | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
) {
  db.auditLogs.unshift({
    id: crypto.randomUUID(),
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? 'system@lazuardi.sch.id',
    actor_role: actor?.role ?? 'system',
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: metadata,
    ip_address: '127.0.0.1',
    created_at: nowIso(),
  });
}

export class LocalSandboxBackend implements LrmsBackend {
  async resolveUserFromToken(_token: string): Promise<UserProfile | null> {
    return null;
  }

  async getSandboxUsers(): Promise<UserProfile[]> {
    const db = loadDb();
    return db.users.filter((u) => u.is_active);
  }

  async getUserById(userId: string): Promise<UserProfile | null> {
    const db = loadDb();
    return db.users.find((u) => u.id === userId && u.is_active) ?? null;
  }

  async getDashboard(actor: UserProfile): Promise<DashboardSummary> {
    const db = loadDb();
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    const relevantOrders = isAdmin
      ? db.orders
      : actor.role === 'kepala_unit'
      ? db.orders.filter(
          (o) =>
            o.requester_id === actor.id ||
            (o.service_code === 'FOTOKOPI' && actor.head_unit_ids.includes(o.unit_id))
        )
      : db.orders.filter((o) => o.requester_id === actor.id);

    const today = todayDateStr();
    const ordersToday = relevantOrders.filter((o) => o.created_at.slice(0, 10) === today).length;
    const ordersNew = relevantOrders.filter((o) => o.status === 'Menunggu Diproses').length;
    const ordersInProgress = relevantOrders.filter(
      (o) => o.status === 'Diproses' || o.status === 'Dalam Pengiriman' || o.status === 'Siap Diambil'
    ).length;
    const ordersCompleted = relevantOrders.filter((o) => o.status === 'Selesai').length;
    const ordersCancelled = relevantOrders.filter((o) => o.status === 'Dibatalkan').length;

    const totalGallonOrders = relevantOrders.filter((o) => o.service_code === 'AIR_GALON').length;
    const totalPhotocopyOrders = relevantOrders.filter((o) => o.service_code === 'FOTOKOPI').length;
    const totalLaminatingOrders = relevantOrders.filter((o) => o.service_code === 'LAMINATING').length;

    const threshold = db.settings.min_gallon_stock_alert ?? 15;
    let totalFilledGallons = 0;
    let totalEmptyGallons = 0;
    let totalDamagedGallons = 0;
    let totalLostGallons = 0;
    const lowStockLocations: DashboardSummary['lowStockLocations'] = [];

    for (const b of db.inventoryBalances) {
      totalFilledGallons += b.qty_filled;
      totalEmptyGallons += b.qty_empty;
      totalDamagedGallons += b.qty_damaged;
      totalLostGallons += b.qty_lost;
      const avail = calculateAvailableGallons(b.qty_filled, b.qty_allocated);
      if (avail <= threshold) {
        lowStockLocations.push({
          locationName: b.location_name,
          qtyFilled: b.qty_filled,
          availableFilled: avail,
          threshold,
        });
      }
    }

    // 7-day order trend
    const trendByDay: DashboardSummary['trendByDay'] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
      const dayOrders = relevantOrders.filter((o) => o.created_at.slice(0, 10) === d);
      trendByDay.push({
        date: d.slice(5),
        gallon: dayOrders.filter((o) => o.service_code === 'AIR_GALON').length,
        photocopy: dayOrders.filter((o) => o.service_code === 'FOTOKOPI').length,
        laminating: dayOrders.filter((o) => o.service_code === 'LAMINATING').length,
      });
    }

    // Monthly gallon usage & photocopy volume
    const gallonByMonthMap = new Map<string, { distributed: number; emptyReturned: number }>();
    for (const tx of db.inventoryTransactions) {
      if (tx.tx_type === 'DISTRIBUTION' || tx.tx_type === 'EMPTY_RETURN') {
        const m = tx.created_at.slice(0, 7);
        const cur = gallonByMonthMap.get(m) ?? { distributed: 0, emptyReturned: 0 };
        cur.distributed += Math.abs(Math.min(0, tx.qty_filled_delta));
        cur.emptyReturned += Math.max(0, tx.qty_empty_delta);
        gallonByMonthMap.set(m, cur);
      }
    }
    const gallonUsageByMonth = Array.from(gallonByMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    const fcpMonthMap = new Map<string, { bwSides: number; colorSides: number; sheets: number }>();
    for (const o of relevantOrders) {
      if (o.service_code === 'FOTOKOPI' && o.status !== 'Dibatalkan' && o.item) {
        const m = o.created_at.slice(0, 7);
        const cur = fcpMonthMap.get(m) ?? { bwSides: 0, colorSides: 0, sheets: 0 };
        const sides = o.item.print_sides_total ?? 0;
        if (o.item.print_color === 'Warna') cur.colorSides += sides;
        else cur.bwSides += sides;
        cur.sheets += o.item.paper_sheets_total ?? 0;
        fcpMonthMap.set(m, cur);
      }
    }
    const photocopyByMonth = Array.from(fcpMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    const unitCounts = new Map<string, number>();
    for (const o of relevantOrders) {
      unitCounts.set(o.unit_name, (unitCounts.get(o.unit_name) ?? 0) + 1);
    }
    const ordersByUnit = Array.from(unitCounts.entries()).map(([unitName, count]) => ({ unitName, count }));

    const sorted = [...relevantOrders].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const recentOrders = sorted.slice(0, 8);
    const pendingWorkOrders = sorted
      .filter((o) => o.status !== 'Selesai' && o.status !== 'Dibatalkan')
      .slice(0, 8);

    return {
      ordersToday,
      ordersNew,
      ordersInProgress,
      ordersCompleted,
      ordersCancelled,
      totalGallonOrders,
      totalPhotocopyOrders,
      totalLaminatingOrders,
      totalFilledGallons,
      totalEmptyGallons,
      totalDamagedGallons,
      totalLostGallons,
      minStockThreshold: threshold,
      lowStockLocations,
      trendByDay,
      gallonUsageByMonth,
      photocopyByMonth,
      ordersByUnit,
      recentOrders,
      pendingWorkOrders,
    };
  }

  async listUnits(includeInactive = false): Promise<Unit[]> {
    const db = loadDb();
    return includeInactive ? db.units : db.units.filter((u) => u.is_active);
  }

  async upsertUnit(actor: UserProfile, data: Partial<Unit> & { code: string; name: string }): Promise<Unit> {
    if (actor.role !== 'super_admin') {
      throw new Error('Hanya Super Admin yang dapat mengelola Master Unit.');
    }
    return withLock(() => {
      const db = loadDb();
      const idx = data.id ? db.units.findIndex((u) => u.id === data.id) : -1;
      if (idx >= 0) {
        db.units[idx] = {
          ...db.units[idx],
          ...data,
        };
        appendAudit(db, actor, 'UPDATE_UNIT', 'units', db.units[idx].id, { code: data.code, name: data.name });
        saveDb(db);
        return db.units[idx];
      }
      if (db.units.some((u) => u.code.toLowerCase() === data.code.toLowerCase())) {
        throw new Error(`Kode unit ${data.code} sudah digunakan.`);
      }
      const created: Unit = {
        id: crypto.randomUUID(),
        code: data.code.toUpperCase().trim(),
        name: data.name.trim(),
        category: data.category || 'Akademik',
        head_user_id: data.head_user_id ?? null,
        head_name: data.head_name || '',
        head_email: data.head_email || '',
        is_active: data.is_active ?? true,
        created_at: nowIso(),
      };
      db.units.push(created);
      appendAudit(db, actor, 'CREATE_UNIT', 'units', created.id, { code: created.code, name: created.name });
      saveDb(db);
      return created;
    });
  }

  async listUsers(actor: UserProfile): Promise<UserProfile[]> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses daftar pengguna ditolak.');
    }
    const db = loadDb();
    return db.users;
  }

  async updateUserRoleAndUnits(
    actor: UserProfile,
    targetUserId: string,
    payload: { role: UserRole; unitIds: string[]; primaryUnitId: string | null; headUnitIds: string[]; isActive: boolean }
  ): Promise<UserProfile> {
    if (actor.role !== 'super_admin') {
      throw new Error('Hanya Super Admin yang berwenang mengubah role pengguna.');
    }
    return withLock(() => {
      const db = loadDb();
      const idx = db.users.findIndex((u) => u.id === targetUserId);
      if (idx < 0) throw new Error('Pengguna tidak ditemukan.');
      db.users[idx] = {
        ...db.users[idx],
        role: payload.role,
        unit_ids: payload.unitIds,
        primary_unit_id: payload.primaryUnitId,
        head_unit_ids: payload.role === 'kepala_unit' ? payload.headUnitIds : [],
        is_active: payload.isActive,
      };
      // Sync head_user_id on units if kepala_unit
      for (const unit of db.units) {
        if (payload.role === 'kepala_unit' && payload.headUnitIds.includes(unit.id)) {
          unit.head_user_id = db.users[idx].id;
          unit.head_name = db.users[idx].full_name;
          unit.head_email = db.users[idx].email;
        }
      }
      appendAudit(db, actor, 'UPDATE_USER_ROLE', 'user_roles', targetUserId, {
        role: payload.role,
        unitIds: payload.unitIds,
        headUnitIds: payload.headUnitIds,
      });
      saveDb(db);
      return db.users[idx];
    });
  }

  async listServices(): Promise<ServiceCatalogItem[]> {
    const db = loadDb();
    return db.services;
  }

  async upsertService(
    actor: UserProfile,
    data: Partial<ServiceCatalogItem> & { code: ServiceCode }
  ): Promise<ServiceCatalogItem> {
    if (actor.role !== 'super_admin') {
      throw new Error('Hanya Super Admin yang dapat mengubah Master Layanan.');
    }
    return withLock(() => {
      const db = loadDb();
      const idx = db.services.findIndex((s) => s.code === data.code);
      if (idx < 0) throw new Error('Layanan tidak ditemukan.');
      db.services[idx] = { ...db.services[idx], ...data };
      appendAudit(db, actor, 'UPDATE_SERVICE', 'service_catalog', data.code, { ...data });
      saveDb(db);
      return db.services[idx];
    });
  }

  async listLocations(includeInactive = false): Promise<LocationItem[]> {
    const db = loadDb();
    return includeInactive ? db.locations : db.locations.filter((l) => l.is_active);
  }

  async upsertLocation(
    actor: UserProfile,
    data: Partial<LocationItem> & { code: string; building: string; floor: string; room: string }
  ): Promise<LocationItem> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Tidak memiliki izin mengelola lokasi.');
    }
    return withLock(() => {
      const db = loadDb();
      const unit = db.units.find((u) => u.id === data.unit_id);
      const idx = data.id ? db.locations.findIndex((l) => l.id === data.id) : -1;
      if (idx >= 0) {
        db.locations[idx] = {
          ...db.locations[idx],
          ...data,
          unit_name: unit?.name ?? db.locations[idx].unit_name,
        };
        saveDb(db);
        return db.locations[idx];
      }
      const created: LocationItem = {
        id: crypto.randomUUID(),
        code: data.code.toUpperCase().trim(),
        building: data.building.trim(),
        floor: data.floor.trim(),
        room: data.room.trim(),
        unit_id: data.unit_id ?? null,
        unit_name: unit?.name,
        is_active: data.is_active ?? true,
      };
      db.locations.push(created);
      appendAudit(db, actor, 'CREATE_LOCATION', 'locations', created.id, { code: created.code });
      saveDb(db);
      return created;
    });
  }

  async getSettings(_actor: UserProfile): Promise<AppSettingsMap> {
    const db = loadDb();
    return db.settings;
  }

  async updateSettings(actor: UserProfile, settings: Partial<AppSettingsMap>): Promise<AppSettingsMap> {
    if (actor.role !== 'super_admin') {
      throw new Error('Hanya Super Admin yang dapat mengubah pengaturan sistem.');
    }
    return withLock(() => {
      const db = loadDb();
      db.settings = { ...db.settings, ...settings };
      if (typeof settings.min_gallon_stock_alert === 'number') {
        for (const bal of db.inventoryBalances) {
          bal.min_stock_threshold = settings.min_gallon_stock_alert;
        }
      }
      appendAudit(db, actor, 'UPDATE_SETTINGS', 'app_settings', 'global', settings as Record<string, unknown>);
      saveDb(db);
      return db.settings;
    });
  }

  async listOrders(actor: UserProfile, filter: OrderFilterParams): Promise<PaginatedResponse<OrderRecord>> {
    const db = loadDb();
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';

    let rows = db.orders.filter((o) => {
      if (filter.onlyMine) {
        return o.requester_id === actor.id;
      }
      if (isAdmin) return true;
      if (actor.role === 'kepala_unit') {
        return (
          o.requester_id === actor.id ||
          (o.service_code === 'FOTOKOPI' && actor.head_unit_ids.includes(o.unit_id))
        );
      }
      return o.requester_id === actor.id;
    });

    if (filter.serviceCode && filter.serviceCode !== 'ALL') {
      rows = rows.filter((o) => o.service_code === filter.serviceCode);
    }
    if (filter.status && filter.status !== 'ALL') {
      if (filter.status === 'ACTIVE_QUEUE') {
        rows = rows.filter((o) => o.status !== 'Selesai' && o.status !== 'Dibatalkan');
      } else {
        rows = rows.filter((o) => o.status === filter.status);
      }
    }
    if (filter.unitId && filter.unitId !== 'ALL') {
      rows = rows.filter((o) => o.unit_id === filter.unitId);
    }
    if (filter.dateFrom) {
      rows = rows.filter((o) => o.created_at.slice(0, 10) >= filter.dateFrom!);
    }
    if (filter.dateTo) {
      rows = rows.filter((o) => o.created_at.slice(0, 10) <= filter.dateTo!);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      rows = rows.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.requester_name.toLowerCase().includes(q) ||
          o.unit_name.toLowerCase().includes(q) ||
          (o.item?.doc_name || '').toLowerCase().includes(q) ||
          o.location_label.toLowerCase().includes(q)
      );
    }

    const sortBy = filter.sortBy || 'created_at';
    const sortDir = filter.sortDir || 'desc';
    rows.sort((a, b) => {
      const va = String(a[sortBy] ?? '');
      const vb = String(b[sortBy] ?? '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(50, Math.max(5, filter.pageSize || 10));
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const items = rows.slice((page - 1) * pageSize, page * pageSize);

    return { items, total, page, pageSize, totalPages };
  }

  async getOrderById(actor: UserProfile, orderId: string): Promise<OrderRecord | null> {
    const db = loadDb();
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return null;
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    const isHeadAllowed =
      actor.role === 'kepala_unit' &&
      order.service_code === 'FOTOKOPI' &&
      actor.head_unit_ids.includes(order.unit_id);

    if (!isAdmin && order.requester_id !== actor.id && !isHeadAllowed) {
      throw new Error('Anda tidak memiliki akses ke detail order ini.');
    }

    // Kepala Unit cannot inspect raw attachments
    if (actor.role === 'kepala_unit' && order.requester_id !== actor.id) {
      return { ...order, attachments: [] };
    }
    return order;
  }

  async createGallonOrder(actor: UserProfile, input: CreateGallonOrderInput): Promise<OrderRecord> {
    if (input.requestedQty < 1 || input.emptyExchangeQty < 0) {
      throw new Error('Jumlah permintaan galon minimal 1 dan galon tukar tidak boleh negatif.');
    }
    return withLock(() => {
      const db = loadDb();
      const unit = db.units.find((u) => u.id === input.unitId);
      if (!unit) throw new Error('Unit/Departemen tidak ditemukan.');

      // Total available across storage
      const totalAvailable = db.inventoryBalances.reduce(
        (acc, b) => acc + calculateAvailableGallons(b.qty_filled, b.qty_allocated),
        0
      );
      if (totalAvailable < input.requestedQty) {
        throw new Error(
          `Stok galon isi tersedia saat ini hanya ${totalAvailable} galon (mempertimbangkan alokasi pesanan aktif).`
        );
      }

      // Allocate on primary warehouse first
      const mainBal = db.inventoryBalances[0];
      if (mainBal) {
        mainBal.qty_allocated += input.requestedQty;
        mainBal.available_filled = calculateAvailableGallons(mainBal.qty_filled, mainBal.qty_allocated);
      }

      const orderId = crypto.randomUUID();
      const orderNumber = nextOrderNumber(db, 'AIR_GALON');
      const ts = nowIso();

      const order: OrderRecord = {
        id: orderId,
        order_number: orderNumber,
        service_code: 'AIR_GALON',
        requester_id: actor.id,
        requester_name: actor.full_name,
        requester_email: actor.email,
        unit_id: unit.id,
        unit_name: unit.name,
        location_id: input.locationId,
        location_label: input.locationLabel,
        status: 'Menunggu Diproses',
        needed_date: input.neededDate,
        needed_time: input.neededTime || null,
        notes: input.notes || '',
        internal_notes: '',
        cancel_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: ts,
        updated_at: ts,
        assignee_id: null,
        assignee_name: null,
        item: {
          id: crypto.randomUUID(),
          order_id: orderId,
          item_type: 'AIR_GALON',
          requested_qty: input.requestedQty,
          actual_qty: null,
          empty_exchange_qty: input.emptyExchangeQty,
          empty_returned_qty: null,
          is_duplex: false,
        },
        attachments: [],
        history: [
          {
            id: crypto.randomUUID(),
            order_id: orderId,
            from_status: null,
            to_status: 'Menunggu Diproses',
            changed_by: actor.id,
            changed_by_name: actor.full_name,
            note: `Permintaan ${input.requestedQty} air galon (tukar ${input.emptyExchangeQty} kosong) masuk antrean Resources.`,
            created_at: ts,
          },
        ],
      };

      db.orders.unshift(order);
      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: null,
        target_role: 'admin_resources',
        title: `Order Air Galon Baru: ${orderNumber}`,
        message: `${actor.full_name} (${unit.name}) meminta ${input.requestedQty} galon ke ${input.locationLabel}.`,
        type: 'info',
        related_order_id: orderId,
        is_read: false,
        created_at: ts,
      });
      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: actor.id,
        target_role: null,
        title: `Order ${orderNumber} Berhasil Dibuat`,
        message: `Permintaan air galon Anda telah masuk antrean Admin Resources.`,
        type: 'success',
        related_order_id: orderId,
        is_read: false,
        created_at: ts,
      });
      saveDb(db);
      return order;
    });
  }

  async createPhotocopyOrder(actor: UserProfile, input: CreatePhotocopyOrderInput): Promise<OrderRecord> {
    if (input.pageCount < 1 || input.copyCount < 1) {
      throw new Error('Jumlah halaman dan rangkap minimal 1.');
    }
    return withLock(() => {
      const db = loadDb();
      const unit = db.units.find((u) => u.id === input.unitId);
      if (!unit) throw new Error('Unit/Departemen tidak ditemukan.');

      const calc = calculatePhotocopyMetrics(input.pageCount, input.copyCount, input.isDuplex);
      const orderId = crypto.randomUUID();
      const orderNumber = nextOrderNumber(db, 'FOTOKOPI');
      const ts = nowIso();

      const attachments: OrderAttachment[] = [];
      if (input.attachment) {
        if (input.attachment.sizeBytes > 15 * 1024 * 1024) {
          throw new Error('Ukuran file melebihi batas maksimal 15 MB.');
        }
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const safeName = input.attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${actor.id}/${orderId}_${safeName}`;
        const fullPath = path.join(UPLOAD_DIR, storagePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const buffer = Buffer.from(input.attachment.base64Content, 'base64');
        fs.writeFileSync(fullPath, buffer);

        attachments.push({
          id: crypto.randomUUID(),
          order_id: orderId,
          bucket_name: 'fotokopi-documents',
          storage_path: storagePath,
          file_name: input.attachment.fileName,
          mime_type: input.attachment.mimeType,
          file_size_bytes: input.attachment.sizeBytes,
          uploaded_by: actor.id,
          created_at: ts,
        });
      }

      const order: OrderRecord = {
        id: orderId,
        order_number: orderNumber,
        service_code: 'FOTOKOPI',
        requester_id: actor.id,
        requester_name: actor.full_name,
        requester_email: actor.email,
        unit_id: unit.id,
        unit_name: unit.name,
        location_id: null,
        location_label: `Unit ${unit.name}`,
        status: 'Menunggu Diproses',
        needed_date: input.neededDate,
        needed_time: null,
        notes: input.notes || '',
        internal_notes: '',
        cancel_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: ts,
        updated_at: ts,
        assignee_id: null,
        assignee_name: null,
        item: {
          id: crypto.randomUUID(),
          order_id: orderId,
          item_type: 'FOTOKOPI',
          requested_qty: input.copyCount,
          actual_qty: input.copyCount,
          empty_exchange_qty: 0,
          empty_returned_qty: null,
          doc_name: input.docName,
          page_count: calc.pageCount,
          copy_count: calc.copyCount,
          paper_size: input.paperSize,
          print_color: input.printColor,
          is_duplex: calc.isDuplex,
          print_sides_total: calc.printSidesTotal,
          paper_sheets_total: calc.paperSheetsTotal,
          finishing_notes: input.finishingNotes || '',
        },
        attachments,
        history: [
          {
            id: crypto.randomUUID(),
            order_id: orderId,
            from_status: null,
            to_status: 'Menunggu Diproses',
            changed_by: actor.id,
            changed_by_name: actor.full_name,
            note: `Order fotokopi (${calc.printSidesTotal} sisi, ${calc.paperSheetsTotal} lembar) langsung masuk antrean Admin Resources.`,
            created_at: ts,
          },
        ],
      };

      db.orders.unshift(order);
      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: null,
        target_role: 'admin_resources',
        title: `Order Fotokopi Baru: ${orderNumber}`,
        message: `${actor.full_name} (${unit.name}) — ${input.docName} (${calc.paperSheetsTotal} lembar).`,
        type: 'info',
        related_order_id: orderId,
        is_read: false,
        created_at: ts,
      });
      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: actor.id,
        target_role: null,
        title: `Order ${orderNumber} Berhasil Dibuat`,
        message: `Permintaan fotokopi "${input.docName}" langsung masuk antrean tanpa perlu approval.`,
        type: 'success',
        related_order_id: orderId,
        is_read: false,
        created_at: ts,
      });
      saveDb(db);
      return order;
    });
  }

  async createLaminatingOrder(actor: UserProfile, input: CreateLaminatingOrderInput): Promise<OrderRecord> {
    if (input.sheetCount < 1) {
      throw new Error('Jumlah lembar laminating minimal 1.');
    }
    return withLock(() => {
      const db = loadDb();
      const unit = db.units.find((u) => u.id === input.unitId);
      if (!unit) throw new Error('Unit/Departemen tidak ditemukan.');

      const orderId = crypto.randomUUID();
      const orderNumber = nextOrderNumber(db, 'LAMINATING');
      const ts = nowIso();

      const order: OrderRecord = {
        id: orderId,
        order_number: orderNumber,
        service_code: 'LAMINATING',
        requester_id: actor.id,
        requester_name: actor.full_name,
        requester_email: actor.email,
        unit_id: unit.id,
        unit_name: unit.name,
        location_id: null,
        location_label: `Unit ${unit.name}`,
        status: 'Menunggu Diproses',
        needed_date: input.neededDate,
        needed_time: null,
        notes: input.notes || '',
        internal_notes: '',
        cancel_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: ts,
        updated_at: ts,
        assignee_id: null,
        assignee_name: null,
        item: {
          id: crypto.randomUUID(),
          order_id: orderId,
          item_type: 'LAMINATING',
          requested_qty: input.sheetCount,
          actual_qty: input.sheetCount,
          empty_exchange_qty: 0,
          empty_returned_qty: null,
          doc_name: input.docName,
          laminating_size: input.laminatingSize,
          laminating_type: input.laminatingType,
          is_duplex: false,
        },
        attachments: [],
        history: [
          {
            id: crypto.randomUUID(),
            order_id: orderId,
            from_status: null,
            to_status: 'Menunggu Diproses',
            changed_by: actor.id,
            changed_by_name: actor.full_name,
            note: `Permintaan laminating ${input.sheetCount} lembar (${input.laminatingSize}) dibuat.`,
            created_at: ts,
          },
        ],
      };

      db.orders.unshift(order);
      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: null,
        target_role: 'admin_resources',
        title: `Order Laminating Baru: ${orderNumber}`,
        message: `${actor.full_name} (${unit.name}) — ${input.docName} (${input.sheetCount} lembar ${input.laminatingSize}).`,
        type: 'info',
        related_order_id: orderId,
        is_read: false,
        created_at: ts,
      });
      saveDb(db);
      return order;
    });
  }

  async updateOrderStatus(
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
  ): Promise<OrderRecord> {
    return withLock(() => {
      const db = loadDb();
      const idx = db.orders.findIndex((o) => o.id === orderId);
      if (idx < 0) throw new Error('Order tidak ditemukan.');
      const order = db.orders[idx];
      const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';

      if (!isAdmin) {
        // User can ONLY cancel their own order when still 'Menunggu Diproses'
        if (order.requester_id !== actor.id) {
          throw new Error('Anda tidak berwenang mengubah pesanan orang lain.');
        }
        if (payload.status !== 'Dibatalkan' || order.status !== 'Menunggu Diproses') {
          throw new Error('Pesanan hanya dapat dibatalkan oleh pemesan selama masih berstatus Menunggu Diproses.');
        }
      }

      if (order.status === 'Selesai' || order.status === 'Dibatalkan') {
        throw new Error(`Order sudah berstatus ${order.status} dan tidak dapat diubah lagi.`);
      }

      if (order.service_code === 'AIR_GALON' && payload.status === 'Selesai') {
        throw new Error('Penyelesaian order Air Galon wajib melalui Konfirmasi Pengiriman & Mutasi Stok.');
      }

      const prevStatus = order.status;
      const ts = nowIso();
      order.status = payload.status;
      order.updated_at = ts;
      if (typeof payload.internalNotes === 'string') {
        order.internal_notes = payload.internalNotes;
      }
      if (typeof payload.actualQty === 'number' && order.item) {
        order.item.actual_qty = Math.max(0, payload.actualQty);
        if (order.service_code === 'FOTOKOPI' && order.item.page_count) {
          const calc = calculatePhotocopyMetrics(
            order.item.page_count,
            order.item.actual_qty,
            order.item.is_duplex
          );
          order.item.copy_count = calc.copyCount;
          order.item.print_sides_total = calc.printSidesTotal;
          order.item.paper_sheets_total = calc.paperSheetsTotal;
        }
      }
      if (payload.assigneeId !== undefined) {
        const staff = db.users.find((u) => u.id === payload.assigneeId);
        order.assignee_id = staff?.id ?? null;
        order.assignee_name = staff?.full_name ?? null;
      }

      if (payload.status === 'Dibatalkan') {
        order.cancel_reason = payload.cancelReason || 'Dibatalkan';
        order.cancelled_at = ts;
        // Release gallon allocation if cancelled
        if (order.service_code === 'AIR_GALON' && order.item && db.inventoryBalances[0]) {
          db.inventoryBalances[0].qty_allocated = Math.max(
            0,
            db.inventoryBalances[0].qty_allocated - order.item.requested_qty
          );
          db.inventoryBalances[0].available_filled = calculateAvailableGallons(
            db.inventoryBalances[0].qty_filled,
            db.inventoryBalances[0].qty_allocated
          );
        }
      }
      if (payload.status === 'Selesai') {
        order.completed_at = ts;
      }

      order.history = order.history || [];
      order.history.push({
        id: crypto.randomUUID(),
        order_id: order.id,
        from_status: prevStatus,
        to_status: payload.status,
        changed_by: actor.id,
        changed_by_name: actor.full_name,
        note:
          payload.note ||
          (payload.status === 'Dibatalkan'
            ? `Dibatalkan: ${order.cancel_reason}`
            : `Status diperbarui dari ${prevStatus} menjadi ${payload.status}`),
        created_at: ts,
      });

      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: order.requester_id,
        target_role: null,
        title: `Status Order ${order.order_number}: ${payload.status}`,
        message:
          payload.status === 'Dibatalkan'
            ? `Order dibatalkan. Alasan: ${order.cancel_reason}`
            : `Order Anda kini berstatus ${payload.status}.`,
        type: payload.status === 'Dibatalkan' ? 'error' : payload.status === 'Selesai' ? 'success' : 'info',
        related_order_id: order.id,
        is_read: false,
        created_at: ts,
      });

      appendAudit(db, actor, 'UPDATE_ORDER_STATUS', 'orders', order.id, {
        order_number: order.order_number,
        from: prevStatus,
        to: payload.status,
      });

      saveDb(db);
      return order;
    });
  }

  async confirmGallonDelivery(
    actor: UserProfile,
    orderId: string,
    payload: { locationId: string; actualFilledSent: number; emptyReceived: number; note?: string }
  ): Promise<OrderRecord> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Hanya Admin Resources / Super Admin yang berwenang mengonfirmasi distribusi galon.');
    }
    if (payload.actualFilledSent < 0 || payload.emptyReceived < 0) {
      throw new Error('Jumlah galon tidak boleh negatif.');
    }
    return withLock(() => {
      const db = loadDb();
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order tidak ditemukan.');
      if (order.service_code !== 'AIR_GALON') throw new Error('Order bukan layanan Air Galon.');
      if (order.status === 'Selesai' || order.status === 'Dibatalkan') {
        throw new Error(`Order sudah berstatus ${order.status} — transaksi ganda dicegah.`);
      }

      const bal = db.inventoryBalances.find((b) => b.location_id === payload.locationId);
      if (!bal) throw new Error('Lokasi penyimpanan stok galon tidak ditemukan.');
      if (bal.qty_filled < payload.actualFilledSent) {
        throw new Error(
          `Stok galon isi di ${bal.location_name} tidak mencukupi (tersedia ${bal.qty_filled}, akan dikirim ${payload.actualFilledSent}).`
        );
      }

      const ts = nowIso();
      const requestedQty = order.item?.requested_qty ?? 0;
      bal.qty_filled -= payload.actualFilledSent;
      bal.qty_empty += payload.emptyReceived;
      bal.qty_allocated = Math.max(0, bal.qty_allocated - requestedQty);
      bal.available_filled = calculateAvailableGallons(bal.qty_filled, bal.qty_allocated);
      bal.updated_at = ts;

      if (order.item) {
        order.item.actual_qty = payload.actualFilledSent;
        order.item.empty_returned_qty = payload.emptyReceived;
      }

      const prevStatus = order.status;
      order.status = 'Selesai';
      order.completed_at = ts;
      order.updated_at = ts;
      order.assignee_id = actor.id;
      order.assignee_name = actor.full_name;

      order.history = order.history || [];
      order.history.push({
        id: crypto.randomUUID(),
        order_id: order.id,
        from_status: prevStatus,
        to_status: 'Selesai',
        changed_by: actor.id,
        changed_by_name: actor.full_name,
        note: `Pengiriman dikonfirmasi dari ${bal.location_name}: ${payload.actualFilledSent} galon isi dikirim, ${payload.emptyReceived} galon kosong diterima.`,
        created_at: ts,
      });

      const txNo = nextTxNumber(db);
      db.inventoryTransactions.unshift({
        id: crypto.randomUUID(),
        tx_number: txNo,
        tx_type: 'DISTRIBUTION',
        location_id: bal.location_id,
        location_name: bal.location_name,
        order_id: order.id,
        qty_filled_delta: -payload.actualFilledSent,
        qty_empty_delta: payload.emptyReceived,
        qty_damaged_delta: 0,
        qty_lost_delta: 0,
        reference_no: order.order_number,
        supplier_name: '',
        actor_id: actor.id,
        actor_name: actor.full_name,
        notes: payload.note || `Distribusi order ${order.order_number} ke ${order.unit_name}`,
        created_at: ts,
      });

      // Check low stock alert
      if (bal.available_filled <= db.settings.min_gallon_stock_alert) {
        db.notifications.unshift({
          id: crypto.randomUUID(),
          user_id: null,
          target_role: 'admin_resources',
          title: `Peringatan Stok Minimum: ${bal.location_name}`,
          message: `Stok galon isi tersedia kini ${bal.available_filled} (batas minimum ${db.settings.min_gallon_stock_alert}).`,
          type: 'warning',
          related_order_id: order.id,
          is_read: false,
          created_at: ts,
        });
      }

      db.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: order.requester_id,
        target_role: null,
        title: `Order ${order.order_number} Selesai Dikirim`,
        message: `${payload.actualFilledSent} galon isi telah dikirim ke ${order.location_label}.`,
        type: 'success',
        related_order_id: order.id,
        is_read: false,
        created_at: ts,
      });

      appendAudit(db, actor, 'CONFIRM_GALLON_DELIVERY', 'orders', order.id, {
        order_number: order.order_number,
        tx_number: txNo,
        actual_filled_sent: payload.actualFilledSent,
        empty_received: payload.emptyReceived,
      });

      saveDb(db);
      return order;
    });
  }

  async getAttachmentDownloadInfo(
    actor: UserProfile,
    attachmentId: string
  ): Promise<{ attachment: OrderAttachment; localFilePath?: string }> {
    const db = loadDb();
    for (const order of db.orders) {
      const att = order.attachments?.find((a) => a.id === attachmentId);
      if (att) {
        const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
        if (!isAdmin && att.uploaded_by !== actor.id) {
          throw new Error('Akses berkas dokumen fotokopi dibatasi hanya untuk pemesan dan petugas Resources.');
        }
        return {
          attachment: att,
          localFilePath: path.join(UPLOAD_DIR, att.storage_path),
        };
      }
    }
    throw new Error('Lampiran dokumen tidak ditemukan.');
  }

  async getAttachmentByIdDirect(
    attachmentId: string
  ): Promise<{ attachment: OrderAttachment; localFilePath: string } | null> {
    const db = loadDb();
    for (const order of db.orders) {
      const att = order.attachments?.find((a) => a.id === attachmentId);
      if (att) {
        return {
          attachment: att,
          localFilePath: path.join(UPLOAD_DIR, att.storage_path),
        };
      }
    }
    return null;
  }

  async getInventoryOverview(actor: UserProfile) {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses manajemen inventaris hanya untuk Admin Resources & Super Admin.');
    }
    const db = loadDb();
    const txPage = await this.listInventoryTransactions(actor, { page: 1, pageSize: 15 });

    const monthMap = new Map<string, { received: number; distributed: number; emptyReturned: number }>();
    for (const tx of db.inventoryTransactions) {
      const m = tx.created_at.slice(0, 7);
      const cur = monthMap.get(m) ?? { received: 0, distributed: 0, emptyReturned: 0 };
      if (tx.tx_type === 'RECEIPT') cur.received += Math.max(0, tx.qty_filled_delta);
      if (tx.tx_type === 'DISTRIBUTION') {
        cur.distributed += Math.abs(Math.min(0, tx.qty_filled_delta));
        cur.emptyReturned += Math.max(0, tx.qty_empty_delta);
      }
      if (tx.tx_type === 'EMPTY_RETURN') {
        cur.emptyReturned += Math.max(0, tx.qty_empty_delta);
      }
      monthMap.set(m, cur);
    }

    const monthlyTrend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    return {
      locations: db.inventoryLocations,
      balances: db.inventoryBalances,
      receipts: db.inventoryReceipts,
      opnames: db.stockOpnames,
      transactions: txPage,
      monthlyTrend,
    };
  }

  async listInventoryTransactions(
    actor: UserProfile,
    params: { page: number; pageSize: number; locationId?: string; txType?: string; dateFrom?: string; dateTo?: string }
  ): Promise<PaginatedResponse<InventoryTransaction>> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses histori mutasi hanya untuk Admin.');
    }
    const db = loadDb();
    let rows = [...db.inventoryTransactions];
    if (params.locationId && params.locationId !== 'ALL') {
      rows = rows.filter((t) => t.location_id === params.locationId);
    }
    if (params.txType && params.txType !== 'ALL') {
      rows = rows.filter((t) => t.tx_type === params.txType);
    }
    if (params.dateFrom) rows = rows.filter((t) => t.created_at.slice(0, 10) >= params.dateFrom!);
    if (params.dateTo) rows = rows.filter((t) => t.created_at.slice(0, 10) <= params.dateTo!);

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(5, params.pageSize || 15));
    const total = rows.length;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async recordGallonReceipt(
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
  ): Promise<InventoryReceipt> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Tidak memiliki izin mencatat barang masuk.');
    }
    if (payload.qtyFilled < 0 || payload.qtyEmpty < 0 || (payload.qtyFilled === 0 && payload.qtyEmpty === 0)) {
      throw new Error('Jumlah penerimaan galon tidak valid.');
    }
    return withLock(() => {
      const db = loadDb();
      const bal = db.inventoryBalances.find((b) => b.location_id === payload.locationId);
      if (!bal) throw new Error('Lokasi gudang tidak ditemukan.');

      const ts = nowIso();
      const ym = ts.slice(0, 7).replace('-', '');
      const rcvNo = `RCV-${ym}-${String(db.inventoryReceipts.length + 1).padStart(4, '0')}`;

      bal.qty_filled += payload.qtyFilled;
      bal.qty_empty += payload.qtyEmpty;
      bal.available_filled = calculateAvailableGallons(bal.qty_filled, bal.qty_allocated);
      bal.updated_at = ts;

      const receipt: InventoryReceipt = {
        id: crypto.randomUUID(),
        receipt_number: rcvNo,
        receipt_date: payload.receiptDate,
        supplier: payload.supplier.trim(),
        location_id: bal.location_id,
        location_name: bal.location_name,
        qty_filled: payload.qtyFilled,
        qty_empty: payload.qtyEmpty,
        document_no: payload.documentNo.trim(),
        notes: payload.notes.trim(),
        created_by_name: actor.full_name,
        created_at: ts,
      };
      db.inventoryReceipts.unshift(receipt);

      const txNo = nextTxNumber(db);
      db.inventoryTransactions.unshift({
        id: crypto.randomUUID(),
        tx_number: txNo,
        tx_type: 'RECEIPT',
        location_id: bal.location_id,
        location_name: bal.location_name,
        order_id: null,
        qty_filled_delta: payload.qtyFilled,
        qty_empty_delta: payload.qtyEmpty,
        qty_damaged_delta: 0,
        qty_lost_delta: 0,
        reference_no: rcvNo,
        supplier_name: payload.supplier.trim(),
        actor_id: actor.id,
        actor_name: actor.full_name,
        notes: payload.notes || `Barang masuk dari ${payload.supplier}`,
        created_at: ts,
      });

      appendAudit(db, actor, 'GALLON_RECEIPT', 'inventory_receipts', receipt.id, {
        receipt_number: rcvNo,
        qty_filled: payload.qtyFilled,
        qty_empty: payload.qtyEmpty,
      });

      saveDb(db);
      return receipt;
    });
  }

  async recordEmptyReturn(
    actor: UserProfile,
    payload: { locationId: string; qtyEmpty: number; unitId?: string; referenceNo: string; notes: string }
  ): Promise<InventoryTransaction> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Tidak memiliki izin mencatat pengembalian galon.');
    }
    if (payload.qtyEmpty <= 0) throw new Error('Jumlah galon kosong yang dikembalikan minimal 1.');
    return withLock(() => {
      const db = loadDb();
      const bal = db.inventoryBalances.find((b) => b.location_id === payload.locationId);
      if (!bal) throw new Error('Lokasi penyimpanan tidak ditemukan.');
      const unit = db.units.find((u) => u.id === payload.unitId);

      const ts = nowIso();
      bal.qty_empty += payload.qtyEmpty;
      bal.updated_at = ts;

      const tx: InventoryTransaction = {
        id: crypto.randomUUID(),
        tx_number: nextTxNumber(db),
        tx_type: 'EMPTY_RETURN',
        location_id: bal.location_id,
        location_name: bal.location_name,
        order_id: null,
        qty_filled_delta: 0,
        qty_empty_delta: payload.qtyEmpty,
        qty_damaged_delta: 0,
        qty_lost_delta: 0,
        reference_no: payload.referenceNo || 'RET-UNIT',
        supplier_name: unit ? unit.name : '',
        actor_id: actor.id,
        actor_name: actor.full_name,
        notes: payload.notes || `Pengembalian ${payload.qtyEmpty} galon kosong`,
        created_at: ts,
      };
      db.inventoryTransactions.unshift(tx);
      saveDb(db);
      return tx;
    });
  }

  async recordManualAdjustment(
    actor: UserProfile,
    payload: { locationId: string; stockType: StockType; qtyDelta: number; reason: string }
  ): Promise<InventoryTransaction> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Tidak memiliki izin penyesuaian stok.');
    }
    if (!payload.reason.trim()) throw new Error('Alasan penyesuaian wajib diisi.');
    return withLock(() => {
      const db = loadDb();
      const bal = db.inventoryBalances.find((b) => b.location_id === payload.locationId);
      if (!bal) throw new Error('Lokasi stok tidak ditemukan.');

      const fieldMap: Record<StockType, 'qty_filled' | 'qty_empty' | 'qty_damaged' | 'qty_lost'> = {
        filled: 'qty_filled',
        empty: 'qty_empty',
        damaged: 'qty_damaged',
        lost: 'qty_lost',
      };
      const key = fieldMap[payload.stockType];
      const nextVal = bal[key] + payload.qtyDelta;
      if (nextVal < 0) {
        throw new Error(`Penyesuaian ditolak: stok ${payload.stockType} tidak boleh menjadi negatif (${nextVal}).`);
      }

      const ts = nowIso();
      bal[key] = nextVal;
      bal.available_filled = calculateAvailableGallons(bal.qty_filled, bal.qty_allocated);
      bal.updated_at = ts;

      const tx: InventoryTransaction = {
        id: crypto.randomUUID(),
        tx_number: nextTxNumber(db),
        tx_type: 'MANUAL_ADJUSTMENT',
        location_id: bal.location_id,
        location_name: bal.location_name,
        order_id: null,
        qty_filled_delta: payload.stockType === 'filled' ? payload.qtyDelta : 0,
        qty_empty_delta: payload.stockType === 'empty' ? payload.qtyDelta : 0,
        qty_damaged_delta: payload.stockType === 'damaged' ? payload.qtyDelta : 0,
        qty_lost_delta: payload.stockType === 'lost' ? payload.qtyDelta : 0,
        reference_no: `ADJ-${payload.stockType.toUpperCase()}`,
        supplier_name: '',
        actor_id: actor.id,
        actor_name: actor.full_name,
        notes: payload.reason.trim(),
        created_at: ts,
      };
      db.inventoryTransactions.unshift(tx);
      appendAudit(db, actor, 'MANUAL_STOCK_ADJUSTMENT', 'inventory_balances', bal.id, payload);
      saveDb(db);
      return tx;
    });
  }

  async createOrUpdateOpnameDraft(
    actor: UserProfile,
    payload: {
      opnameId?: string;
      opnameDate: string;
      locationId: string;
      notes: string;
      items: Array<{ stockType: StockType; physicalQty: number; varianceReason: string; notes?: string }>;
    }
  ): Promise<StockOpnameRecord> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Tidak memiliki izin stock opname.');
    }
    return withLock(() => {
      const db = loadDb();
      const bal = db.inventoryBalances.find((b) => b.location_id === payload.locationId);
      if (!bal) throw new Error('Lokasi penyimpanan tidak ditemukan.');

      const sysByType: Record<StockType, number> = {
        filled: bal.qty_filled,
        empty: bal.qty_empty,
        damaged: bal.qty_damaged,
        lost: bal.qty_lost,
      };

      const existingIdx = payload.opnameId
        ? db.stockOpnames.findIndex((o) => o.id === payload.opnameId)
        : -1;

      if (existingIdx >= 0) {
        const existing = db.stockOpnames[existingIdx];
        if (existing.status === 'Final') {
          throw new Error('Stock opname yang sudah Final tidak boleh diubah.');
        }
        existing.opname_date = payload.opnameDate;
        existing.notes = payload.notes;
        existing.items = payload.items.map((it) => {
          const sys = sysByType[it.stockType];
          const phys = Math.max(0, Math.floor(it.physicalQty));
          return {
            id: crypto.randomUUID(),
            opname_id: existing.id,
            stock_type: it.stockType,
            system_qty: sys,
            physical_qty: phys,
            variance_qty: phys - sys,
            variance_reason: it.varianceReason || '',
            notes: it.notes || '',
          };
        });
        saveDb(db);
        return existing;
      }

      const id = crypto.randomUUID();
      const ym = nowIso().slice(0, 7).replace('-', '');
      const opnameNumber = `OPN-${ym}-${String(db.stockOpnames.length + 1).padStart(4, '0')}`;

      const record: StockOpnameRecord = {
        id,
        opname_number: opnameNumber,
        opname_date: payload.opnameDate,
        location_id: bal.location_id,
        location_name: bal.location_name,
        status: 'Draft',
        inspector_id: actor.id,
        inspector_name: actor.full_name,
        notes: payload.notes || '',
        finalized_at: null,
        created_at: nowIso(),
        items: payload.items.map((it) => {
          const sys = sysByType[it.stockType];
          const phys = Math.max(0, Math.floor(it.physicalQty));
          return {
            id: crypto.randomUUID(),
            opname_id: id,
            stock_type: it.stockType,
            system_qty: sys,
            physical_qty: phys,
            variance_qty: phys - sys,
            variance_reason: it.varianceReason || '',
            notes: it.notes || '',
          };
        }),
      };

      db.stockOpnames.unshift(record);
      saveDb(db);
      return record;
    });
  }

  async finalizeStockOpname(actor: UserProfile, opnameId: string): Promise<StockOpnameRecord> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Tidak memiliki izin finalisasi stock opname.');
    }
    return withLock(() => {
      const db = loadDb();
      const opname = db.stockOpnames.find((o) => o.id === opnameId);
      if (!opname) throw new Error('Dokumen stock opname tidak ditemukan.');
      if (opname.status === 'Final') {
        throw new Error('Dokumen stock opname sudah difinalisasi sebelumnya.');
      }

      const bal = db.inventoryBalances.find((b) => b.location_id === opname.location_id);
      if (!bal) throw new Error('Saldo lokasi tidak ditemukan.');

      let filledDelta = 0;
      let emptyDelta = 0;
      let damagedDelta = 0;
      let lostDelta = 0;
      let hasVariance = false;

      for (const item of opname.items) {
        if (item.physical_qty < 0) {
          throw new Error('Stok fisik tidak boleh negatif.');
        }
        if (item.stock_type === 'filled') {
          item.system_qty = bal.qty_filled;
          filledDelta = item.physical_qty - bal.qty_filled;
          item.variance_qty = filledDelta;
          bal.qty_filled = item.physical_qty;
        } else if (item.stock_type === 'empty') {
          item.system_qty = bal.qty_empty;
          emptyDelta = item.physical_qty - bal.qty_empty;
          item.variance_qty = emptyDelta;
          bal.qty_empty = item.physical_qty;
        } else if (item.stock_type === 'damaged') {
          item.system_qty = bal.qty_damaged;
          damagedDelta = item.physical_qty - bal.qty_damaged;
          item.variance_qty = damagedDelta;
          bal.qty_damaged = item.physical_qty;
        } else if (item.stock_type === 'lost') {
          item.system_qty = bal.qty_lost;
          lostDelta = item.physical_qty - bal.qty_lost;
          item.variance_qty = lostDelta;
          bal.qty_lost = item.physical_qty;
        }
        if (item.variance_qty !== 0) hasVariance = true;
      }

      const ts = nowIso();
      bal.available_filled = calculateAvailableGallons(bal.qty_filled, bal.qty_allocated);
      bal.updated_at = ts;
      opname.status = 'Final';
      opname.finalized_at = ts;

      if (hasVariance) {
        db.inventoryTransactions.unshift({
          id: crypto.randomUUID(),
          tx_number: nextTxNumber(db),
          tx_type: 'OPNAME_ADJUSTMENT',
          location_id: bal.location_id,
          location_name: bal.location_name,
          order_id: null,
          qty_filled_delta: filledDelta,
          qty_empty_delta: emptyDelta,
          qty_damaged_delta: damagedDelta,
          qty_lost_delta: lostDelta,
          reference_no: opname.opname_number,
          supplier_name: '',
          actor_id: actor.id,
          actor_name: actor.full_name,
          notes: `Finalisasi Stock Opname ${opname.opname_number}`,
          created_at: ts,
        });

        db.notifications.unshift({
          id: crypto.randomUUID(),
          user_id: null,
          target_role: 'admin_resources',
          title: `Selisih Stock Opname ${opname.opname_number}`,
          message: `Terdapat penyesuaian stok pada finalisasi opname di ${opname.location_name}.`,
          type: 'warning',
          related_order_id: null,
          is_read: false,
          created_at: ts,
        });
      }

      appendAudit(db, actor, 'FINALIZE_STOCK_OPNAME', 'inventory_stock_opnames', opname.id, {
        opname_number: opname.opname_number,
        filledDelta,
        emptyDelta,
        damagedDelta,
        lostDelta,
      });

      saveDb(db);
      return opname;
    });
  }

  async getUnitPhotocopyReport(
    actor: UserProfile,
    params: { unitId?: string; month: number; year: number }
  ): Promise<PhotocopyReportResponse> {
    const db = loadDb();
    let targetUnitId = params.unitId;

    if (actor.role === 'kepala_unit') {
      if (!actor.head_unit_ids.length) {
        throw new Error('Akun Kepala Unit Anda belum dihubungkan dengan unit di Master Unit.');
      }
      if (!targetUnitId || !actor.head_unit_ids.includes(targetUnitId)) {
        targetUnitId = actor.head_unit_ids[0];
      }
      if (!actor.head_unit_ids.includes(targetUnitId)) {
        throw new Error('Akses ditolak: Anda hanya dapat melihat laporan unit Anda sendiri.');
      }
    } else if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Laporan unit fotokopi hanya dapat diakses oleh Kepala Unit dan Admin.');
    }

    const unit = db.units.find((u) => u.id === targetUnitId) || db.units[0];
    const ymPrefix = `${params.year}-${String(params.month).padStart(2, '0')}`;

    const matchingOrders = db.orders.filter(
      (o) =>
        o.service_code === 'FOTOKOPI' &&
        o.unit_id === unit.id &&
        o.status !== 'Dibatalkan' &&
        o.created_at.slice(0, 7) === ymPrefix
    );

    let totalBwSides = 0;
    let totalColorSides = 0;
    let totalSheets = 0;
    const reqMap = new Map<
      string,
      { requesterName: string; requesterEmail: string; orders: number; bwSides: number; colorSides: number; sheets: number }
    >();

    const rows: PhotocopyReportResponse['rows'] = [];
    for (const o of matchingOrders) {
      const it = o.item;
      const sides = it?.print_sides_total ?? 0;
      const sheets = it?.paper_sheets_total ?? 0;
      const isColor = it?.print_color === 'Warna';
      if (isColor) totalColorSides += sides;
      else totalBwSides += sides;
      totalSheets += sheets;

      const cur = reqMap.get(o.requester_email) ?? {
        requesterName: o.requester_name,
        requesterEmail: o.requester_email,
        orders: 0,
        bwSides: 0,
        colorSides: 0,
        sheets: 0,
      };
      cur.orders += 1;
      if (isColor) cur.colorSides += sides;
      else cur.bwSides += sides;
      cur.sheets += sheets;
      reqMap.set(o.requester_email, cur);

      rows.push({
        orderNumber: o.order_number,
        createdAt: o.created_at,
        requesterName: o.requester_name,
        docName: it?.doc_name || '-',
        printColor: it?.print_color || 'Hitam Putih',
        paperSize: it?.paper_size || 'A4',
        pageCount: it?.page_count || 0,
        copyCount: it?.copy_count || 0,
        isDuplex: Boolean(it?.is_duplex),
        printSidesTotal: sides,
        paperSheetsTotal: sheets,
        status: o.status,
      });
    }

    // 6-month trend for this unit
    const monthlyTrend: PhotocopyReportResponse['monthlyTrend'] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const dt = new Date(params.year, params.month - 1 - offset, 1);
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const mOrders = db.orders.filter(
        (o) =>
          o.service_code === 'FOTOKOPI' &&
          o.unit_id === unit.id &&
          o.status !== 'Dibatalkan' &&
          o.created_at.slice(0, 7) === key
      );
      let bw = 0;
      let col = 0;
      let sh = 0;
      for (const mo of mOrders) {
        const sides = mo.item?.print_sides_total ?? 0;
        if (mo.item?.print_color === 'Warna') col += sides;
        else bw += sides;
        sh += mo.item?.paper_sheets_total ?? 0;
      }
      monthlyTrend.push({
        monthLabel: `${MONTH_NAMES_ID[m - 1].slice(0, 3)} ${y}`,
        bwSides: bw,
        colorSides: col,
        sheets: sh,
      });
    }

    return {
      periodMonth: params.month,
      periodYear: params.year,
      unitId: unit.id,
      unitName: unit.name,
      headName: unit.head_name,
      headEmail: unit.head_email,
      summary: {
        totalOrders: matchingOrders.length,
        totalBwSides,
        totalColorSides,
        totalSheets,
      },
      byRequester: Array.from(reqMap.values()).sort((a, b) => b.sheets - a.sheets),
      monthlyTrend,
      rows,
    };
  }

  async listReportDeliveryLogs(actor: UserProfile, month?: number, year?: number): Promise<ReportDeliveryLog[]> {
    const db = loadDb();
    let logs = [...db.reportDeliveryLogs];
    if (actor.role === 'kepala_unit') {
      logs = logs.filter((l) => actor.head_unit_ids.includes(l.unit_id));
    } else if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses log pengiriman laporan ditolak.');
    }
    if (month) logs = logs.filter((l) => l.period_month === month);
    if (year) logs = logs.filter((l) => l.period_year === year);
    return logs.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  }

  async dispatchMonthlyPhotocopyReports(
    actor: UserProfile | null,
    params: { month: number; year: number; unitId?: string; forceResend?: boolean }
  ): Promise<ReportDeliveryLog[]> {
    if (actor && actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Hanya Admin Resources / Super Admin yang dapat memicu pengiriman laporan bulanan.');
    }
    return withLock(async () => {
      const db = loadDb();
      const targetUnits = db.units.filter(
        (u) => u.is_active && u.head_email && (!params.unitId || u.id === params.unitId)
      );
      const results: ReportDeliveryLog[] = [];
      const systemActor: UserProfile = actor || db.users[0];

      for (const unit of targetUnits) {
        const existingIdx = db.reportDeliveryLogs.findIndex(
          (l) =>
            l.report_type === 'MONTHLY_PHOTOCOPY' &&
            l.period_month === params.month &&
            l.period_year === params.year &&
            l.unit_id === unit.id
        );

        // Prevent duplicate email when already succeeded unless forceResend
        if (existingIdx >= 0 && db.reportDeliveryLogs[existingIdx].status === 'Berhasil' && !params.forceResend) {
          results.push(db.reportDeliveryLogs[existingIdx]);
          continue;
        }

        const reportData = await this.getUnitPhotocopyReport(systemActor, {
          unitId: unit.id,
          month: params.month,
          year: params.year,
        });

        const sendRes = await sendMonthlyPhotocopyEmail({
          recipientEmail: unit.head_email,
          recipientName: unit.head_name,
          unitName: unit.name,
          periodMonth: params.month,
          periodYear: params.year,
          totalOrders: reportData.summary.totalOrders,
          totalBwSides: reportData.summary.totalBwSides,
          totalColorSides: reportData.summary.totalColorSides,
          totalSheets: reportData.summary.totalSheets,
          byRequester: reportData.byRequester.map((r) => ({
            requesterName: r.requesterName,
            orders: r.orders,
            bwSides: r.bwSides,
            colorSides: r.colorSides,
            sheets: r.sheets,
          })),
        });

        const logEntry: ReportDeliveryLog = {
          id: existingIdx >= 0 ? db.reportDeliveryLogs[existingIdx].id : crypto.randomUUID(),
          report_type: 'MONTHLY_PHOTOCOPY',
          period_month: params.month,
          period_year: params.year,
          unit_id: unit.id,
          unit_name: unit.name,
          recipient_email: unit.head_email,
          status: sendRes.ok ? 'Berhasil' : 'Gagal',
          summary_json: reportData.summary,
          error_message: sendRes.error || null,
          sent_at: nowIso(),
        };

        if (existingIdx >= 0) db.reportDeliveryLogs[existingIdx] = logEntry;
        else db.reportDeliveryLogs.unshift(logEntry);

        if (unit.head_user_id) {
          db.notifications.unshift({
            id: crypto.randomUUID(),
            user_id: unit.head_user_id,
            target_role: null,
            title: `Laporan Fotokopi ${MONTH_NAMES_ID[params.month - 1]} ${params.year} Tersedia`,
            message: `Ringkasan penggunaan fotokopi ${unit.name}: ${reportData.summary.totalSheets} lembar kertas.`,
            type: 'info',
            related_order_id: null,
            is_read: false,
            created_at: nowIso(),
          });
        }
        results.push(logEntry);
      }

      appendAudit(db, actor, 'DISPATCH_MONTHLY_PHOTOCOPY_REPORTS', 'report_delivery_logs', `${params.year}-${params.month}`, {
        count: results.length,
        forceResend: Boolean(params.forceResend),
      });

      saveDb(db);
      return results;
    });
  }

  async getAnalyticsReport(
    actor: UserProfile,
    params: { reportType: string; dateFrom?: string; dateTo?: string; unitId?: string; serviceCode?: string; status?: string }
  ): Promise<{ rows: Array<Record<string, unknown>>; summary: Record<string, unknown> }> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses laporan operasional terpadu hanya untuk Admin Resources & Super Admin.');
    }
    const db = loadDb();
    let orders = [...db.orders];
    if (params.dateFrom) orders = orders.filter((o) => o.created_at.slice(0, 10) >= params.dateFrom!);
    if (params.dateTo) orders = orders.filter((o) => o.created_at.slice(0, 10) <= params.dateTo!);
    if (params.unitId && params.unitId !== 'ALL') orders = orders.filter((o) => o.unit_id === params.unitId);
    if (params.status && params.status !== 'ALL') orders = orders.filter((o) => o.status === params.status);

    switch (params.reportType) {
      case 'gallon_orders': {
        const list = orders.filter((o) => o.service_code === 'AIR_GALON');
        return {
          rows: list.map((o) => ({
            nomor_order: o.order_number,
            tanggal: o.created_at.slice(0, 10),
            unit: o.unit_name,
            pemesan: o.requester_name,
            lokasi: o.location_label,
            diminta: o.item?.requested_qty ?? 0,
            dikirim: o.item?.actual_qty ?? 0,
            kosong_kembali: o.item?.empty_returned_qty ?? 0,
            status: o.status,
          })),
          summary: {
            total_order: list.length,
            total_diminta: list.reduce((a, b) => a + (b.item?.requested_qty ?? 0), 0),
            total_dikirim: list.reduce((a, b) => a + (b.item?.actual_qty ?? 0), 0),
          },
        };
      }
      case 'gallon_distribution': {
        const txs = db.inventoryTransactions.filter((t) => t.tx_type === 'DISTRIBUTION');
        return {
          rows: txs.map((t) => ({
            nomor_transaksi: t.tx_number,
            tanggal: t.created_at.slice(0, 10),
            lokasi_stok: t.location_name,
            referensi_order: t.reference_no,
            galon_isi_keluar: Math.abs(t.qty_filled_delta),
            galon_kosong_masuk: t.qty_empty_delta,
            petugas: t.actor_name,
            keterangan: t.notes,
          })),
          summary: {
            total_distribusi: txs.length,
            total_isi_keluar: txs.reduce((a, b) => a + Math.abs(b.qty_filled_delta), 0),
            total_kosong_masuk: txs.reduce((a, b) => a + b.qty_empty_delta, 0),
          },
        };
      }
      case 'stock_opname': {
        return {
          rows: db.stockOpnames.map((op) => ({
            nomor_opname: op.opname_number,
            tanggal: op.opname_date,
            lokasi: op.location_name,
            status: op.status,
            petugas: op.inspector_name,
            total_selisih_absolut: op.items.reduce((a, i) => a + Math.abs(i.variance_qty), 0),
            catatan: op.notes,
          })),
          summary: {
            total_opname: db.stockOpnames.length,
            final: db.stockOpnames.filter((o) => o.status === 'Final').length,
            draft: db.stockOpnames.filter((o) => o.status === 'Draft').length,
          },
        };
      }
      case 'inventory_mutations': {
        return {
          rows: db.inventoryTransactions.map((t) => ({
            nomor_tx: t.tx_number,
            tanggal: t.created_at.slice(0, 10),
            tipe: t.tx_type,
            lokasi: t.location_name,
            delta_isi: t.qty_filled_delta,
            delta_kosong: t.qty_empty_delta,
            delta_rusak: t.qty_damaged_delta,
            delta_hilang: t.qty_lost_delta,
            referensi: t.reference_no,
            petugas: t.actor_name,
          })),
          summary: { total_mutasi: db.inventoryTransactions.length },
        };
      }
      case 'photocopy': {
        const list = orders.filter((o) => o.service_code === 'FOTOKOPI');
        return {
          rows: list.map((o) => ({
            nomor_order: o.order_number,
            tanggal: o.created_at.slice(0, 10),
            unit: o.unit_name,
            pemesan: o.requester_name,
            dokumen: o.item?.doc_name ?? '-',
            jenis_cetak: o.item?.print_color ?? '-',
            kertas: o.item?.paper_size ?? '-',
            halaman: o.item?.page_count ?? 0,
            rangkap: o.item?.copy_count ?? 0,
            total_sisi: o.item?.print_sides_total ?? 0,
            total_lembar: o.item?.paper_sheets_total ?? 0,
            status: o.status,
          })),
          summary: {
            total_order: list.length,
            total_sisi_cetak: list.reduce((a, b) => a + (b.item?.print_sides_total ?? 0), 0),
            total_lembar_kertas: list.reduce((a, b) => a + (b.item?.paper_sheets_total ?? 0), 0),
          },
        };
      }
      case 'laminating': {
        const list = orders.filter((o) => o.service_code === 'LAMINATING');
        return {
          rows: list.map((o) => ({
            nomor_order: o.order_number,
            tanggal: o.created_at.slice(0, 10),
            unit: o.unit_name,
            pemesan: o.requester_name,
            dokumen: o.item?.doc_name ?? '-',
            ukuran: o.item?.laminating_size ?? '-',
            jenis: o.item?.laminating_type ?? '-',
            diminta: o.item?.requested_qty ?? 0,
            aktual: o.item?.actual_qty ?? 0,
            status: o.status,
          })),
          summary: {
            total_order: list.length,
            total_lembar: list.reduce((a, b) => a + (b.item?.actual_qty ?? b.item?.requested_qty ?? 0), 0),
          },
        };
      }
      case 'unit_usage': {
        const map = new Map<string, { unit: string; galon: number; fotokopi_lembar: number; laminating_lembar: number; total_order: number }>();
        for (const o of orders) {
          if (o.status === 'Dibatalkan') continue;
          const cur = map.get(o.unit_id) ?? {
            unit: o.unit_name,
            galon: 0,
            fotokopi_lembar: 0,
            laminating_lembar: 0,
            total_order: 0,
          };
          cur.total_order += 1;
          if (o.service_code === 'AIR_GALON') cur.galon += o.item?.actual_qty ?? o.item?.requested_qty ?? 0;
          if (o.service_code === 'FOTOKOPI') cur.fotokopi_lembar += o.item?.paper_sheets_total ?? 0;
          if (o.service_code === 'LAMINATING') cur.laminating_lembar += o.item?.actual_qty ?? o.item?.requested_qty ?? 0;
          map.set(o.unit_id, cur);
        }
        return {
          rows: Array.from(map.values()),
          summary: { total_unit_aktif: map.size, total_order: orders.length },
        };
      }
      default: {
        // service_performance
        const bySvc = (['AIR_GALON', 'FOTOKOPI', 'LAMINATING'] as ServiceCode[]).map((svc) => {
          const list = orders.filter((o) => o.service_code === svc);
          return {
            layanan: svc,
            total_order: list.length,
            selesai: list.filter((o) => o.status === 'Selesai').length,
            dalam_antrean: list.filter((o) => o.status !== 'Selesai' && o.status !== 'Dibatalkan').length,
            dibatalkan: list.filter((o) => o.status === 'Dibatalkan').length,
          };
        });
        return {
          rows: bySvc,
          summary: { total_semua_order: orders.length },
        };
      }
    }
  }

  async listNotifications(actor: UserProfile): Promise<NotificationItem[]> {
    const db = loadDb();
    return db.notifications
      .filter(
        (n) =>
          n.user_id === actor.id ||
          (n.target_role !== null &&
            (n.target_role === actor.role ||
              (n.target_role === 'admin_resources' && actor.role === 'super_admin')))
      )
      .slice(0, 30);
  }

  async markNotificationRead(actor: UserProfile, notificationId: string | 'ALL'): Promise<void> {
    return withLock(() => {
      const db = loadDb();
      for (const n of db.notifications) {
        const belongs =
          n.user_id === actor.id ||
          (n.target_role !== null &&
            (n.target_role === actor.role ||
              (n.target_role === 'admin_resources' && actor.role === 'super_admin')));
        if (belongs && (notificationId === 'ALL' || n.id === notificationId)) {
          n.is_read = true;
        }
      }
      saveDb(db);
    });
  }

  async listAuditLogs(actor: UserProfile, page: number, pageSize: number): Promise<PaginatedResponse<AuditLogEntry>> {
    if (actor.role !== 'super_admin') {
      throw new Error('Hanya Super Admin yang dapat melihat Audit Log sistem.');
    }
    const db = loadDb();
    const p = Math.max(1, page || 1);
    const ps = Math.min(50, Math.max(10, pageSize || 20));
    const total = db.auditLogs.length;
    return {
      items: db.auditLogs.slice((p - 1) * ps, p * ps),
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.max(1, Math.ceil(total / ps)),
    };
  }
}
