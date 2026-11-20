import { useEffect, useState } from 'react';
import { Download, Mail, Printer, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OrderStatusLabel } from '../components/ui/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { exportRowsToCsv, exportRowsToExcel, exportTableToPdf } from '../lib/exportUtils';
import { MONTH_NAMES_ID, formatIdDate, formatIdDateTime, formatIdNumber } from '../shared/calculations';
import type { OrderStatus, ReportDeliveryLog, Unit } from '../shared/types';

interface PhotocopyReportData {
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

export function UnitPhotocopyReportPage() {
  const { user, configStatus } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin_resources';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [unitId, setUnitId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [report, setReport] = useState<PhotocopyReportData | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<ReportDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/master/bootstrap')
      .then((res) => {
        const accessibleUnits = isAdmin
          ? res.units
          : res.units.filter((u) => user?.head_unit_ids.includes(u.id));
        setUnits(accessibleUnits);
        if (accessibleUnits[0]) setUnitId(accessibleUnits[0].id);
      })
      .catch(() => {});
  }, [isAdmin, user]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ month: String(month), year: String(year) });
      if (unitId) qs.set('unitId', unitId);
      const [rep, logsRes] = await Promise.all([
        apiFetch<PhotocopyReportData>(`/reports/unit-photocopy?${qs.toString()}`),
        apiFetch<{ logs: ReportDeliveryLog[] }>(`/reports/delivery-logs?${qs.toString()}`),
      ]);
      setReport(rep);
      setDeliveryLogs(logsRes.logs || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat laporan fotokopi unit', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin || (user?.head_unit_ids?.length ?? 0) > 0) {
      loadReport();
    } else {
      setLoading(false);
    }
  }, [month, year, unitId]);

  const handleDispatchEmail = async (forceResend = false) => {
    setDispatching(true);
    try {
      const res = await apiFetch<{ logs: ReportDeliveryLog[] }>('/reports/dispatch-monthly', {
        method: 'POST',
        body: JSON.stringify({
          month,
          year,
          unitId: unitId || undefined,
          forceResend,
        }),
      });
      setDeliveryLogs(res.logs || []);
      const failed = res.logs.filter((l) => l.status === 'Gagal');
      if (failed.length > 0) {
        showToast(
          'Pengiriman dicatat dengan status Gagal',
          'warning',
          failed[0].error_message || 'Periksa konfigurasi layanan email server-side.'
        );
      } else {
        showToast('Laporan bulanan berhasil dikirim ke email Kepala Unit', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengirim laporan bulanan', 'error');
    } finally {
      setDispatching(false);
    }
  };

  if (loading && !report) {
    return <div className="p-8 text-center text-xs text-slate-500">Memuat laporan fotokopi unit...</div>;
  }

  if (!report) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Akun Kepala Unit Anda belum dihubungkan ke unit di Master Unit. Hubungi Super Admin untuk penetapan unit.
      </div>
    );
  }

  const monthName = MONTH_NAMES_ID[month - 1];

  return (
    <div className="space-y-6">
      {/* Filter & Export Controls */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
          >
            {MONTH_NAMES_ID.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium tabular-nums"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {(isAdmin || units.length > 1) && (
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={report.rows.length === 0}
            onClick={() =>
              exportRowsToExcel(
                `Laporan_Fotokopi_${report.unitName}_${monthName}_${year}`,
                'Fotokopi Unit',
                report.rows.map((r) => ({
                  Nomor_Order: r.orderNumber,
                  Tanggal: r.createdAt.slice(0, 10),
                  Pemesan: r.requesterName,
                  Dokumen: r.docName,
                  Jenis_Cetak: r.printColor,
                  Ukuran_Kertas: r.paperSize,
                  Halaman: r.pageCount,
                  Rangkap: r.copyCount,
                  Mode_Sisi: r.isDuplex ? 'Dua Sisi' : 'Satu Sisi',
                  Total_Sisi_Cetak: r.printSidesTotal,
                  Total_Lembar_Kertas: r.paperSheetsTotal,
                  Status: r.status,
                }))
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            disabled={report.rows.length === 0}
            onClick={() =>
              exportRowsToCsv(
                `Laporan_Fotokopi_${report.unitName}_${monthName}_${year}`,
                report.rows.map((r) => ({
                  Nomor_Order: r.orderNumber,
                  Tanggal: r.createdAt.slice(0, 10),
                  Pemesan: r.requesterName,
                  Dokumen: r.docName,
                  Jenis_Cetak: r.printColor,
                  Kertas: r.paperSize,
                  Halaman: r.pageCount,
                  Rangkap: r.copyCount,
                  Sisi_Cetak: r.printSidesTotal,
                  Lembar_Kertas: r.paperSheetsTotal,
                  Status: r.status,
                }))
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            disabled={report.rows.length === 0}
            onClick={() =>
              exportTableToPdf(
                `Laporan_Fotokopi_${report.unitName}_${monthName}_${year}`,
                `Laporan Penggunaan Fotokopi — ${report.unitName}`,
                `Periode: ${monthName} ${year} · Kepala Unit: ${report.headName} (${report.headEmail})`,
                ['No. Order', 'Tanggal', 'Pemesan', 'Dokumen', 'Cetak', 'Hal', 'Rkp', 'Sisi', 'Lembar', 'Status'],
                report.rows.map((r) => [
                  r.orderNumber,
                  r.createdAt.slice(0, 10),
                  r.requesterName,
                  r.docName,
                  r.printColor,
                  r.pageCount,
                  r.copyCount,
                  r.printSidesTotal,
                  r.paperSheetsTotal,
                  r.status,
                ])
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1755CE] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1244A8]"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* Header & Summary */}
      <div className="print-container space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Laporan Penggunaan Fotokopi — {report.unitName}
              </h2>
              <div className="text-xs text-slate-500">
                Periode {monthName} {year} · Kepala Unit: {report.headName || '-'} ({report.headEmail || '-'})
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Catatan: Dokumen file fotokopi tidak dilampirkan demi privasi berkas.
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Total Order</div>
              <div className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {formatIdNumber(report.summary.totalOrders)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Total Sisi Hitam Putih</div>
              <div className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {formatIdNumber(report.summary.totalBwSides)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Total Sisi Warna</div>
              <div className="mt-1 font-display text-2xl font-bold text-[#1755CE] tabular-nums">
                {formatIdNumber(report.summary.totalColorSides)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Total Lembar Kertas</div>
              <div className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
                {formatIdNumber(report.summary.totalSheets)}
              </div>
            </div>
          </div>
        </div>

        {/* Chart & Per-Requester Summary */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="font-display text-sm font-bold text-slate-900">Grafik Penggunaan Bulanan</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="bwSides" name="Sisi B/W" fill="#334155" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="colorSides" name="Sisi Warna" fill="#1755CE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sheets" name="Lembar Kertas" fill="#16A34A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 font-display text-sm font-bold text-slate-900">
              Total Penggunaan per Pemesan
            </div>
            {report.byRequester.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Belum ada pemesanan pada periode ini.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Nama Pemesan</th>
                    <th className="px-4 py-2.5 text-right">Order</th>
                    <th className="px-4 py-2.5 text-right">Sisi B/W</th>
                    <th className="px-4 py-2.5 text-right">Sisi Warna</th>
                    <th className="px-4 py-2.5 text-right">Lembar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.byRequester.map((r) => (
                    <tr key={r.requesterEmail}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.requesterName}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.orders}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatIdNumber(r.bwSides)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatIdNumber(r.colorSides)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                        {formatIdNumber(r.sheets)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail Table */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5 font-display text-sm font-bold text-slate-900">
            Rincian Transaksi Fotokopi Unit
          </div>
          {report.rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Tidak ada order fotokopi pada {monthName} {year}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">No. Order</th>
                    <th className="px-4 py-2.5">Tanggal</th>
                    <th className="px-4 py-2.5">Pemesan</th>
                    <th className="px-4 py-2.5">Dokumen</th>
                    <th className="px-4 py-2.5">Cetak</th>
                    <th className="px-4 py-2.5 text-right">Hal</th>
                    <th className="px-4 py-2.5 text-right">Rkp</th>
                    <th className="px-4 py-2.5 text-right">Sisi Aktual</th>
                    <th className="px-4 py-2.5 text-right">Lembar Aktual</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((r) => (
                    <tr key={r.orderNumber}>
                      <td className="px-4 py-2.5 font-mono font-semibold">{r.orderNumber}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatIdDate(r.createdAt)}</td>
                      <td className="px-4 py-2.5">{r.requesterName}</td>
                      <td className="px-4 py-2.5">{r.docName}</td>
                      <td className="px-4 py-2.5">
                        {r.printColor} · {r.paperSize} · {r.isDuplex ? '2 Sisi' : '1 Sisi'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.pageCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.copyCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatIdNumber(r.printSidesTotal)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-[#1755CE]">
                        {formatIdNumber(r.paperSheetsTotal)}
                      </td>
                      <td className="px-4 py-2.5">
                        <OrderStatusLabel status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Automated & Manual Monthly Email Delivery Section */}
      <div className="no-print rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">
              Riwayat Pengiriman Laporan Bulanan ke Email Kepala Unit
            </h3>
            <p className="text-xs text-slate-500">
              Dikirim otomatis setiap tanggal 1 via cron server-side. Mencegah email ganda secara otomatis.
              {!configStatus?.emailConfigured &&
                ' (Layanan email RESEND_API_KEY / SMTP belum dikonfigurasi — pengiriman akan tercatat sebagai Gagal dengan keterangan).' }
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={dispatching}
                onClick={() => handleDispatchEmail(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1755CE] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1244A8] disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Kirim Laporan Bulan Ini</span>
              </button>
              <button
                type="button"
                disabled={dispatching}
                onClick={() => handleDispatchEmail(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Kirim Ulang</span>
              </button>
            </div>
          )}
        </div>
        {deliveryLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada riwayat pengiriman email untuk periode {monthName} {year}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">Email Kepala Unit</th>
                  <th className="px-4 py-2.5">Periode</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Waktu Kirim</th>
                  <th className="px-4 py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveryLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-medium">{log.unit_name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{log.recipient_email}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {MONTH_NAMES_ID[log.period_month - 1]} {log.period_year}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-semibold ${
                          log.status === 'Berhasil' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{formatIdDateTime(log.sent_at)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{log.error_message || 'Terkirim'}</td>
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
