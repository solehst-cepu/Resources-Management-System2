import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Droplets,
  FileText,
  Layers,
  Printer,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NavRouteId } from '../components/layout/AppShell';
import { OrderStatusLabel, ServiceLabel } from '../components/ui/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { formatIdDate, formatIdNumber } from '../shared/calculations';
import type { OrderRecord } from '../shared/types';

interface DashboardData {
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
  lowStockLocations: Array<{
    locationName: string;
    qtyFilled: number;
    availableFilled: number;
    threshold: number;
  }>;
  trendByDay: Array<{ date: string; gallon: number; photocopy: number; laminating: number }>;
  gallonUsageByMonth: Array<{ month: string; distributed: number; emptyReturned: number }>;
  photocopyByMonth: Array<{ month: string; bwSides: number; colorSides: number; sheets: number }>;
  ordersByUnit: Array<{ unitName: string; count: number }>;
  recentOrders: OrderRecord[];
  pendingWorkOrders: OrderRecord[];
}

export function DashboardPage({ onNavigate }: { onNavigate: (route: NavRouteId) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>('/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleQuickCancel = async (orderId: string, orderNumber: string) => {
    setCancellingId(orderId);
    try {
      await apiFetch(`/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'Dibatalkan',
          cancelReason: 'Dibatalkan oleh pemesan sebelum diproses.',
        }),
      });
      showToast(`Order ${orderNumber} dibatalkan`, 'success');
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membatalkan order', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-lg border border-slate-200 bg-white p-4 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-lg border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <div className="font-semibold">Gagal Memuat Data Dashboard</div>
        <p className="mt-1 text-xs">{error}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>
    );
  }

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin_resources';
  const isKepalaUnit = user?.role === 'kepala_unit';

  if (!isAdmin) {
    const activeOrders = data.recentOrders.filter(
      (o) => o.requester_id === user?.id && o.status !== 'Selesai' && o.status !== 'Dibatalkan'
    );
    const myHistory = data.recentOrders.filter((o) => o.requester_id === user?.id);

    return (
      <div className="space-y-6">
        {/* Quick Service Launchers */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Selamat datang, {user?.full_name}
              </h2>
              <p className="text-sm text-slate-600">
                Ajukan permintaan layanan operasional sekolah secara langsung tanpa persetujuan berjenjang.
              </p>
            </div>
            {isKepalaUnit && (
              <button
                type="button"
                onClick={() => onNavigate('unit_photocopy_report')}
                className="mt-3 sm:mt-0 inline-flex items-center gap-2 rounded-lg bg-[#1755CE] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1244A8] whitespace-nowrap shrink-0"
              >
                <FileText className="h-4 w-4" />
                <span>Buka Laporan Fotokopi Unit</span>
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => onNavigate('order_gallon')}
              className="group flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-left hover:border-[#1755CE] hover:bg-blue-50/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Droplets className="h-4 w-4 text-[#1755CE]" />
                  <span>Order Air Galon</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Permintaan antar galon isi & penukaran galon kosong unit.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#1755CE]" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('order_photocopy')}
              className="group flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-left hover:border-[#1755CE] hover:bg-blue-50/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Printer className="h-4 w-4 text-[#1755CE]" />
                  <span>Order Fotokopi</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Unggah dokumen PDF/Office, cetak 1 atau 2 sisi (B/W & Warna).
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#1755CE]" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('order_laminating')}
              className="group flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-left hover:border-[#1755CE] hover:bg-blue-50/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Layers className="h-4 w-4 text-[#1755CE]" />
                  <span>Order Laminating</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Laminasi kartu identitas, poster, dan dokumen A4/F4/A3.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#1755CE]" />
            </button>
          </div>
        </section>

        {/* Active Orders */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">Order Aktif Saya</h3>
            <button
              type="button"
              onClick={() => onNavigate('my_orders')}
              className="text-xs font-medium text-[#1755CE] hover:underline"
            >
              Lihat Semua Pesanan
            </button>
          </div>
          {activeOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Tidak ada pesanan aktif saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nomor Order</th>
                    <th className="px-4 py-3 font-semibold">Layanan</th>
                    <th className="px-4 py-3 font-semibold">Ringkasan</th>
                    <th className="px-4 py-3 font-semibold">Tgl Kebutuhan</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{o.order_number}</td>
                      <td className="px-4 py-3">
                        <ServiceLabel code={o.service_code} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {o.service_code === 'AIR_GALON'
                          ? `${o.item?.requested_qty ?? 0} galon · ${o.location_label}`
                          : o.item?.doc_name || '-'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatIdDate(o.needed_date)}</td>
                      <td className="px-4 py-3">
                        <OrderStatusLabel status={o.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.status === 'Menunggu Diproses' && (
                          <button
                            type="button"
                            disabled={cancellingId === o.id}
                            onClick={() => handleQuickCancel(o.id, o.order_number)}
                            className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Batalkan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent History */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">Riwayat Pesanan Terbaru</h3>
          </div>
          {myHistory.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Belum ada riwayat pesanan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nomor Order</th>
                    <th className="px-4 py-3 font-semibold">Layanan</th>
                    <th className="px-4 py-3 font-semibold">Tanggal Order</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myHistory.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{o.order_number}</td>
                      <td className="px-4 py-3">
                        <ServiceLabel code={o.service_code} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatIdDate(o.created_at)}</td>
                      <td className="px-4 py-3">
                        <OrderStatusLabel status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // Super Admin / Admin Resources Executive Dashboard
  const statCards = [
    { label: 'Total Order Hari Ini', value: data.ordersToday, accent: 'text-slate-900' },
    { label: 'Order Baru', value: data.ordersNew, accent: 'text-[#1755CE]' },
    { label: 'Order Dalam Proses', value: data.ordersInProgress, accent: 'text-amber-700' },
    { label: 'Order Selesai', value: data.ordersCompleted, accent: 'text-emerald-700' },
    { label: 'Order Dibatalkan', value: data.ordersCancelled, accent: 'text-red-700' },
    { label: 'Permintaan Air Galon', value: data.totalGallonOrders, accent: 'text-slate-900' },
    { label: 'Order Fotokopi', value: data.totalPhotocopyOrders, accent: 'text-slate-900' },
    { label: 'Order Laminating', value: data.totalLaminatingOrders, accent: 'text-slate-900' },
    { label: 'Stok Galon Isi', value: data.totalFilledGallons, accent: 'text-[#1755CE]' },
    { label: 'Stok Galon Kosong', value: data.totalEmptyGallons, accent: 'text-slate-900' },
    {
      label: 'Peringatan Stok Minimum',
      value: data.lowStockLocations.length,
      accent: data.lowStockLocations.length > 0 ? 'text-red-700' : 'text-emerald-700',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Low Stock Alert */}
      {data.lowStockLocations.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <div className="text-sm font-semibold text-red-900">
                Peringatan Persediaan Galon Minimum
              </div>
              <div className="mt-0.5 text-xs text-red-800">
                {data.lowStockLocations
                  .map(
                    (l) =>
                      `${l.locationName}: tersedia ${l.availableFilled} galon (batas min. ${l.threshold})`
                  )
                  .join(' · ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('inventory_gallon')}
            className="rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0"
          >
            Kelola Stok Galon
          </button>
        </div>
      )}

      {/* 11 Key Metric Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{c.label}</div>
            <div className={`mt-2 font-display text-2xl font-bold tabular-nums ${c.accent}`}>
              {formatIdNumber(c.value)}
            </div>
          </div>
        ))}
      </section>

      {/* Charts Grid */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-display text-sm font-bold text-slate-900">Tren Pesanan 7 Hari Terakhir</h3>
          <p className="text-xs text-slate-500">Perbandingan volume order Air Galon, Fotokopi, dan Laminating</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trendByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="gallon" name="Air Galon" stroke="#1755CE" strokeWidth={2} />
                <Line type="monotone" dataKey="photocopy" name="Fotokopi" stroke="#16A34A" strokeWidth={2} />
                <Line type="monotone" dataKey="laminating" name="Laminating" stroke="#D97706" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-display text-sm font-bold text-slate-900">Distribusi Order per Unit</h3>
          <p className="text-xs text-slate-500">Akumulasi seluruh permintaan operasional tiap unit sekolah</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ordersByUnit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="unitName" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="count" name="Jumlah Order" fill="#1755CE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-display text-sm font-bold text-slate-900">Penggunaan & Pengembalian Galon</h3>
          <p className="text-xs text-slate-500">Galon isi terdistribusi vs galon kosong kembali per bulan</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.gallonUsageByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="distributed" name="Isi Terdistribusi" fill="#1755CE" radius={[4, 4, 0, 0]} />
                <Bar dataKey="emptyReturned" name="Kosong Kembali" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-display text-sm font-bold text-slate-900">Volume Fotokopi Bulanan (Sisi & Lembar)</h3>
          <p className="text-xs text-slate-500">Total sisi hitam putih, sisi warna, dan lembar kertas aktual</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.photocopyByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="bwSides" name="Sisi B/W" fill="#334155" radius={[4, 4, 0, 0]} />
                <Bar dataKey="colorSides" name="Sisi Warna" fill="#1755CE" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sheets" name="Lembar Kertas" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Queues */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">Pekerjaan Belum Selesai</h3>
            <button
              type="button"
              onClick={() => onNavigate('order_management')}
              className="text-xs font-medium text-[#1755CE] hover:underline"
            >
              Kelola Antrean
            </button>
          </div>
          {data.pendingWorkOrders.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Seluruh order telah diselesaikan.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.pendingWorkOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-4 px-5 py-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{o.order_number}</span>
                      <span className="text-slate-400">·</span>
                      <ServiceLabel code={o.service_code} />
                    </div>
                    <div className="mt-0.5 text-slate-600 truncate">
                      {o.unit_name} · {o.requester_name} · Tgl butuh {formatIdDate(o.needed_date)}
                    </div>
                  </div>
                  <OrderStatusLabel status={o.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">Permintaan Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigate('order_management')}
              className="text-xs font-medium text-[#1755CE] hover:underline"
            >
              Semua Order
            </button>
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Belum ada permintaan tercatat.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-4 px-5 py-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{o.order_number}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-700">{o.unit_name}</span>
                    </div>
                    <div className="mt-0.5 text-slate-500 truncate">
                      {o.requester_name} · {formatIdDate(o.created_at)}
                    </div>
                  </div>
                  <OrderStatusLabel status={o.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
