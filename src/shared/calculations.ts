import type { OrderStatus, ServiceCode, UserRole } from './types';

export interface PhotocopyCalculation {
  pageCount: number;
  copyCount: number;
  isDuplex: boolean;
  sheetsPerCopy: number;
  printSidesTotal: number;
  paperSheetsTotal: number;
}

/**
 * Menghitung jumlah sisi cetak aktual dan lembar kertas aktual secara akurat,
 * termasuk dokumen dengan jumlah halaman ganjil pada mode cetak dua sisi (duplex).
 */
export function calculatePhotocopyMetrics(
  pageCount: number,
  copyCount: number,
  isDuplex: boolean
): PhotocopyCalculation {
  const safePages = Math.max(0, Math.floor(Number(pageCount) || 0));
  const safeCopies = Math.max(0, Math.floor(Number(copyCount) || 0));

  const printSidesTotal = safePages * safeCopies;
  const sheetsPerCopy = isDuplex ? Math.ceil(safePages / 2) : safePages;
  const paperSheetsTotal = sheetsPerCopy * safeCopies;

  return {
    pageCount: safePages,
    copyCount: safeCopies,
    isDuplex,
    sheetsPerCopy,
    printSidesTotal,
    paperSheetsTotal,
  };
}

export function calculateAvailableGallons(qtyFilled: number, qtyAllocated: number): number {
  return Math.max(0, Math.floor(qtyFilled) - Math.max(0, Math.floor(qtyAllocated)));
}

export function formatIdNumber(val: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID').format(Number(val ?? 0));
}

export function formatIdDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatIdDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin_resources: 'Admin Resources',
  kepala_unit: 'Kepala Unit',
  user: 'User / Pemesan',
};

export const SERVICE_LABELS: Record<ServiceCode, string> = {
  AIR_GALON: 'Air Galon',
  FOTOKOPI: 'Fotokopi',
  LAMINATING: 'Laminating',
};

export const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  'Menunggu Diproses': 'Antrean Baru',
  Diproses: 'Sedang Dikerjakan',
  'Dalam Pengiriman': 'Dalam Pengantaran',
  'Siap Diambil': 'Siap Diambil di Resources',
  Selesai: 'Tuntas',
  Dibatalkan: 'Dibatalkan',
};

export const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
