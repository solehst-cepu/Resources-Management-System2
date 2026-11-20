import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { exportRowsToCsv, exportRowsToExcel, exportTableToPdf } from '../lib/exportUtils';
import { formatIdDateTime } from '../shared/calculations';
import type { OrderStatus, Unit } from '../shared/types';

const REPORT_TYPES = [
  { id: 'gallon_orders', label: '1. Laporan Permintaan Air Galon' },
  { id: 'gallon_distribution', label: '2. Laporan Distribusi Galon' },
  { id: 'stock_opname', label: '3. Laporan Stock Opname' },
  { id: 'inventory_mutations', label: '4. Laporan Mutasi Persediaan' },
  { id: 'photocopy', label: '5. Laporan Fotokopi' },
  { id: 'laminating', label: '6. Laporan Laminating' },
  { id: 'service_performance', label: '7. Laporan Kinerja Layanan' },
  { id: 'unit_usage', label: '8. Laporan Penggunaan per Unit' },
];

export function ReportsAnalyticsPage() {
  const { showToast } = useToast();
  const [reportType, setReportType] = useState('gallon_orders');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [unitId, setUnitId] = useState('ALL');
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [units, setUnits] = useState<Unit[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/master/bootstrap')
      .then((res) => setUnits(res.units || []))
      .catch(() => {});
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ reportType, unitId, status });
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      const res = await apiFetch<{ rows: Array<Record<string, unknown>>; summary: Record<string, unknown> }>(
        `/reports/analytics?${qs.toString()}`
      );
      setRows(res.rows || []);
      setSummary(res.summary || {});
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat laporan', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [reportType, dateFrom, dateTo, unitId, status]);

  const activeTitle = REPORT_TYPES.find((r) => r.id === reportType)?.label || 'Laporan';
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-5">
      <div className="no-print grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="lg:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
        >
          {REPORT_TYPES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        >
          <option value="ALL">Semua Unit</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
        />
      </div>

      <div className="print-container rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">{activeTitle}</h2>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
              {Object.entries(summary).map(([k, v]) => (
                <span key={k}>
                  {k.replace(/_/g, ' ')}: <strong className="font-mono tabular-nums text-slate-900">{String(v)}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus | 'ALL')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="ALL">Semua Status</option>
              <option value="Menunggu Diproses">Menunggu Diproses</option>
              <option value="Diproses">Diproses</option>
              <option value="Selesai">Selesai</option>
              <option value="Dibatalkan">Dibatalkan</option>
            </select>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => exportRowsToExcel(`LRMS_${reportType}`, reportType, rows)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => exportRowsToCsv(`LRMS_${reportType}`, rows)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() =>
                exportTableToPdf(
                  `LRMS_${reportType}`,
                  activeTitle,
                  `Dicetak pada ${formatIdDateTime(new Date().toISOString())}`,
                  columns.map((c) => c.replace(/_/g, ' ').toUpperCase()),
                  rows.map((r) => columns.map((c) => String(r[c] ?? '-')))
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1755CE] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1244A8]"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Menghitung data laporan...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Tidak ada data laporan untuk filter yang dipilih.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-2.5 font-semibold text-slate-700 capitalize whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 tabular-nums text-slate-800 whitespace-nowrap">
                        {String(row[col] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
