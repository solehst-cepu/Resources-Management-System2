import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Printer,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { OrderStatusLabel, ServiceLabel } from '../components/ui/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { formatIdDate, formatIdDateTime, formatIdNumber } from '../shared/calculations';
import type {
  InventoryLocation,
  OrderRecord,
  OrderStatus,
  PaginatedResponse,
  ServiceCode,
  Unit,
  UserProfile,
} from '../shared/types';

type TabKey = 'ALL' | 'NEW' | 'IN_PROGRESS' | 'READY' | 'DONE' | 'CANCELLED';

export function OrderManagementPage({ onlyMine = false }: { onlyMine?: boolean }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = !onlyMine && (user?.role === 'super_admin' || user?.role === 'admin_resources');

  const [tab, setTab] = useState<TabKey>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<ServiceCode | 'ALL'>('ALL');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [ordersPage, setOrdersPage] = useState<PaginatedResponse<OrderRecord> | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [invLocations, setInvLocations] = useState<InventoryLocation[]>([]);
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Admin action state
  const [internalNotes, setInternalNotes] = useState('');
  const [actualQtyInput, setActualQtyInput] = useState<number>(0);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelBox, setShowCancelBox] = useState(false);

  // Gallon delivery atomic modal state
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryLocId, setDeliveryLocId] = useState('');
  const [actualFilledSent, setActualFilledSent] = useState(1);
  const [emptyReceived, setEmptyReceived] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    apiFetch<{ units: Unit[]; inventoryLocations: InventoryLocation[] }>('/master/bootstrap')
      .then((res) => {
        setUnits(res.units || []);
        setInvLocations(res.inventoryLocations || []);
        if (res.inventoryLocations?.[0]) setDeliveryLocId(res.inventoryLocations[0].id);
      })
      .catch(() => {});

    if (isAdmin) {
      apiFetch<{ users: UserProfile[] }>('/master/users')
        .then((res) =>
          setStaffList(
            (res.users || []).filter((u) => u.role === 'admin_resources' || u.role === 'super_admin')
          )
        )
        .catch(() => {});
    }
  }, [isAdmin]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const statusParam =
        tab === 'ALL'
          ? 'ALL'
          : tab === 'NEW'
          ? 'Menunggu Diproses'
          : tab === 'IN_PROGRESS'
          ? 'Diproses'
          : tab === 'DONE'
          ? 'Selesai'
          : tab === 'CANCELLED'
          ? 'Dibatalkan'
          : 'ALL';

      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '12',
        serviceCode: serviceFilter,
        status: statusParam,
        unitId: unitFilter,
        onlyMine: String(onlyMine),
      });
      if (debouncedSearch) qs.set('search', debouncedSearch);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);

      const res = await apiFetch<PaginatedResponse<OrderRecord>>(`/orders?${qs.toString()}`);
      if (tab === 'READY') {
        res.items = res.items.filter(
          (o) => o.status === 'Siap Diambil' || o.status === 'Dalam Pengiriman'
        );
      }
      setOrdersPage(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat daftar order', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [tab, debouncedSearch, serviceFilter, unitFilter, dateFrom, dateTo, page, onlyMine]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setShowCancelBox(false);
    setCancelReason('');
    try {
      const res = await apiFetch<{ order: OrderRecord }>(`/orders/${id}`);
      setSelectedOrder(res.order);
      setInternalNotes(res.order.internal_notes || '');
      setActualQtyInput(res.order.item?.actual_qty ?? res.order.item?.requested_qty ?? 1);
      setAssigneeId(res.order.assignee_id || '');
      setActualFilledSent(res.order.item?.requested_qty ?? 1);
      setEmptyReceived(res.order.item?.empty_exchange_qty ?? 0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka detail order', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusUpdate = async (nextStatus: OrderStatus) => {
    if (!selectedOrder) return;
    if (nextStatus === 'Dibatalkan' && !cancelReason.trim()) {
      showToast('Masukkan alasan pembatalan terlebih dahulu.', 'error');
      return;
    }
    setBusyAction(true);
    try {
      const res = await apiFetch<{ order: OrderRecord }>(`/orders/${selectedOrder.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          internalNotes,
          cancelReason: nextStatus === 'Dibatalkan' ? cancelReason : undefined,
          actualQty: isAdmin ? Number(actualQtyInput) : undefined,
          assigneeId: isAdmin ? assigneeId || null : undefined,
        }),
      });
      setSelectedOrder(res.order);
      setShowCancelBox(false);
      showToast(`Order ${res.order.order_number} diperbarui: ${nextStatus}`, 'success');
      await loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui status', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmGallonDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setBusyAction(true);
    try {
      const res = await apiFetch<{ order: OrderRecord }>(
        `/orders/${selectedOrder.id}/confirm-gallon-delivery`,
        {
          method: 'POST',
          body: JSON.stringify({
            locationId: deliveryLocId,
            actualFilledSent: Number(actualFilledSent),
            emptyReceived: Number(emptyReceived),
            note: deliveryNote,
          }),
        }
      );
      setSelectedOrder(res.order);
      setShowDeliveryModal(false);
      showToast(`Pengiriman ${res.order.order_number} selesai & stok terpotong otomatis`, 'success');
      await loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengonfirmasi pengiriman', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadAttachment = async (attId: string) => {
    try {
      const res = await apiFetch<{ url: string; fileName: string }>(`/attachments/${attId}/signed-url`);
      const a = document.createElement('a');
      a.href = res.url;
      a.download = res.fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengakses berkas dokumen', 'error');
    }
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'ALL', label: 'Semua Order' },
    { key: 'NEW', label: 'Order Baru' },
    { key: 'IN_PROGRESS', label: 'Dalam Proses' },
    { key: 'READY', label: 'Siap Diambil / Pengiriman' },
    { key: 'DONE', label: 'Selesai' },
    { key: 'CANCELLED', label: 'Dibatalkan' },
  ];

  return (
    <div className="space-y-5">
      {/* Segmented Status Tabs */}
      <div className="no-print flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-[#1755CE] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters Toolbar */}
      <div className="no-print grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nomor order, pemesan, unit, atau dokumen..."
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-[#1755CE] focus:outline-none"
          />
        </div>
        <select
          value={serviceFilter}
          onChange={(e) => {
            setServiceFilter(e.target.value as ServiceCode | 'ALL');
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#1755CE] focus:outline-none"
        >
          <option value="ALL">Semua Layanan</option>
          <option value="AIR_GALON">Air Galon</option>
          <option value="FOTOKOPI">Fotokopi</option>
          <option value="LAMINATING">Laminating</option>
        </select>
        {isAdmin ? (
          <select
            value={unitFilter}
            onChange={(e) => {
              setUnitFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#1755CE] focus:outline-none"
          >
            <option value="ALL">Semua Unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            title="Dari Tanggal"
          />
        )}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            title="Sampai Tanggal"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="no-print rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat data pesanan...</div>
        ) : !ordersPage || ordersPage.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Tidak ada pesanan yang sesuai filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nomor Order</th>
                    <th className="px-4 py-3 font-semibold">Layanan</th>
                    <th className="px-4 py-3 font-semibold">Unit & Pemesan</th>
                    <th className="px-4 py-3 font-semibold">Detail Kebutuhan</th>
                    <th className="px-4 py-3 font-semibold">Tgl Butuh</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordersPage.items.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {o.order_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ServiceLabel code={o.service_code} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{o.unit_name}</div>
                        <div className="text-[11px] text-slate-500">{o.requester_name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                        {o.service_code === 'AIR_GALON' &&
                          `${o.item?.requested_qty ?? 0} galon · ${o.location_label}`}
                        {o.service_code === 'FOTOKOPI' &&
                          `${o.item?.doc_name || '-'} (${formatIdNumber(o.item?.paper_sheets_total)} lbr)`}
                        {o.service_code === 'LAMINATING' &&
                          `${o.item?.doc_name || '-'} (${o.item?.laminating_size} · ${o.item?.requested_qty} lbr)`}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 whitespace-nowrap">
                        {formatIdDate(o.needed_date)}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusLabel status={o.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(o.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
              <div className="tabular-nums">
                Halaman {ordersPage.page} dari {ordersPage.totalPages} ({ordersPage.total} order)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-200 p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page >= ordersPage.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-200 p-1.5 disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Order Detail Drawer / Modal + Print Work Order */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 print:static print:bg-white">
          <div className="print-container relative h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl print:max-w-none print:shadow-none">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs text-slate-500">Work Order Divisi Resources Lazuardi</div>
                <h3 className="font-display text-lg font-bold text-slate-900 font-mono">
                  {selectedOrder.order_number}
                </h3>
                <div className="mt-1">
                  <OrderStatusLabel status={selectedOrder.status} />
                </div>
              </div>
              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Cetak Work Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">Memuat detail...</div>
            ) : (
              <div className="mt-5 space-y-6 text-xs">
                {/* Summary Grid */}
                <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <dt className="text-slate-500">Pemesan</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">{selectedOrder.requester_name}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Unit / Departemen</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">{selectedOrder.unit_name}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tanggal Order</dt>
                    <dd className="mt-0.5 tabular-nums text-slate-900">
                      {formatIdDateTime(selectedOrder.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tanggal Dibutuhkan</dt>
                    <dd className="mt-0.5 tabular-nums text-slate-900">
                      {formatIdDate(selectedOrder.needed_date)} {selectedOrder.needed_time || ''}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Lokasi / Tujuan</dt>
                    <dd className="mt-0.5 text-slate-900">{selectedOrder.location_label}</dd>
                  </div>
                </dl>

                {/* Service Specific Item Info */}
                <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                  <div className="font-semibold text-slate-900">Rincian Layanan</div>
                  {selectedOrder.service_code === 'AIR_GALON' && (
                    <div className="grid grid-cols-2 gap-2 text-slate-700">
                      <div>Galon Isi Diminta: <strong className="tabular-nums">{selectedOrder.item?.requested_qty}</strong></div>
                      <div>Galon Kosong Tukar: <strong className="tabular-nums">{selectedOrder.item?.empty_exchange_qty}</strong></div>
                      <div>Aktual Dikirim: <strong className="tabular-nums">{selectedOrder.item?.actual_qty ?? '-'}</strong></div>
                      <div>Kosong Diterima: <strong className="tabular-nums">{selectedOrder.item?.empty_returned_qty ?? '-'}</strong></div>
                    </div>
                  )}
                  {selectedOrder.service_code === 'FOTOKOPI' && (
                    <div className="grid grid-cols-2 gap-2 text-slate-700">
                      <div className="col-span-2">Dokumen: <strong>{selectedOrder.item?.doc_name}</strong></div>
                      <div>Halaman: <strong className="tabular-nums">{selectedOrder.item?.page_count}</strong></div>
                      <div>Rangkap: <strong className="tabular-nums">{selectedOrder.item?.copy_count}</strong></div>
                      <div>Kertas & Cetak: <strong>{selectedOrder.item?.paper_size} · {selectedOrder.item?.print_color}</strong></div>
                      <div>Mode: <strong>{selectedOrder.item?.is_duplex ? 'Dua Sisi' : 'Satu Sisi'}</strong></div>
                      <div>Total Sisi Cetak: <strong className="tabular-nums">{formatIdNumber(selectedOrder.item?.print_sides_total)}</strong></div>
                      <div>Total Lembar Kertas: <strong className="tabular-nums text-[#1755CE]">{formatIdNumber(selectedOrder.item?.paper_sheets_total)}</strong></div>
                      {selectedOrder.item?.finishing_notes && (
                        <div className="col-span-2">Finishing: {selectedOrder.item.finishing_notes}</div>
                      )}
                    </div>
                  )}
                  {selectedOrder.service_code === 'LAMINATING' && (
                    <div className="grid grid-cols-2 gap-2 text-slate-700">
                      <div className="col-span-2">Dokumen: <strong>{selectedOrder.item?.doc_name}</strong></div>
                      <div>Ukuran: <strong>{selectedOrder.item?.laminating_size}</strong></div>
                      <div>Jenis: <strong>{selectedOrder.item?.laminating_type}</strong></div>
                      <div>Jumlah Lembar: <strong className="tabular-nums">{selectedOrder.item?.requested_qty}</strong></div>
                      <div>Aktual Selesai: <strong className="tabular-nums">{selectedOrder.item?.actual_qty ?? '-'}</strong></div>
                    </div>
                  )}
                  {selectedOrder.notes && (
                    <div className="pt-2 border-t border-slate-100 text-slate-600">
                      Catatan Pemesan: {selectedOrder.notes}
                    </div>
                  )}
                </div>

                {/* Attachments (Signed URL) */}
                {selectedOrder.attachments && selectedOrder.attachments.length > 0 && (
                  <div className="no-print rounded-lg border border-slate-200 p-4">
                    <div className="font-semibold text-slate-900">Dokumen Terlampir (Bucket Privat)</div>
                    <div className="mt-2 space-y-2">
                      {selectedOrder.attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                          <span className="truncate font-medium text-slate-800">{att.file_name}</span>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(att.id)}
                            className="inline-flex items-center gap-1.5 rounded bg-[#1755CE] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1244A8]"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Unduh Aman</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Operational Controls */}
                {isAdmin && selectedOrder.status !== 'Selesai' && selectedOrder.status !== 'Dibatalkan' && (
                  <div className="no-print rounded-lg border border-slate-200 p-4 space-y-4">
                    <div className="font-semibold text-slate-900">Tindakan Operasional Admin</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">Tetapkan Petugas</label>
                        <select
                          value={assigneeId}
                          onChange={(e) => setAssigneeId(e.target.value)}
                          className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs"
                        >
                          <option value="">-- Belum Ditentukan --</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedOrder.service_code !== 'AIR_GALON' && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600">
                            {selectedOrder.service_code === 'FOTOKOPI'
                              ? 'Rangkap Aktual Dikerjakan'
                              : 'Jumlah Lembar Aktual'}
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={actualQtyInput}
                            onChange={(e) => setActualQtyInput(Number(e.target.value))}
                            className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs tabular-nums"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Catatan Internal Petugas</label>
                      <input
                        type="text"
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        placeholder="Catatan internal divisi Resources..."
                        className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedOrder.status === 'Menunggu Diproses' && (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleStatusUpdate('Diproses')}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          Proses Sekarang
                        </button>
                      )}
                      {selectedOrder.service_code === 'AIR_GALON' ? (
                        <>
                          {selectedOrder.status !== 'Dalam Pengiriman' && (
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleStatusUpdate('Dalam Pengiriman')}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                            >
                              Tandai Dalam Pengiriman
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => setShowDeliveryModal(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span>Konfirmasi Pengiriman & Potong Stok</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {selectedOrder.status !== 'Siap Diambil' && (
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleStatusUpdate('Siap Diambil')}
                              className="rounded-lg bg-[#1755CE] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1244A8]"
                            >
                              Tandai Siap Diambil
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handleStatusUpdate('Selesai')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Selesaikan Order
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCancelBox((v) => !v)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Batalkan Order
                      </button>
                    </div>

                    {showCancelBox && (
                      <div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Alasan pembatalan wajib diisi..."
                          className="w-full rounded border border-red-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleStatusUpdate('Dibatalkan')}
                          className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                        >
                          Konfirmasi Pembatalan
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* User Cancel Option */}
                {!isAdmin &&
                  selectedOrder.requester_id === user?.id &&
                  selectedOrder.status === 'Menunggu Diproses' && (
                    <div className="no-print rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
                      <div className="font-semibold text-red-900">Batalkan Permintaan</div>
                      <input
                        type="text"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Alasan pembatalan..."
                        className="w-full rounded border border-red-200 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleStatusUpdate('Dibatalkan')}
                        className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                      >
                        Batalkan Pesanan Saya
                      </button>
                    </div>
                  )}

                {/* Activity Timeline */}
                <div>
                  <div className="font-semibold text-slate-900 mb-2">Riwayat Aktivitas & Status</div>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {(selectedOrder.history || []).map((h) => (
                      <div key={h.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{h.to_status}</span>
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            {formatIdDateTime(h.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-slate-600">{h.note}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">Oleh: {h.changed_by_name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Atomic Gallon Delivery Confirmation Modal */}
      {showDeliveryModal && selectedOrder && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h4 className="font-display text-base font-bold text-slate-900">
              Konfirmasi Pengiriman Air Galon
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Stok galon isi akan dipotong dan galon kosong bertambah secara atomic untuk order{' '}
              <span className="font-mono font-semibold">{selectedOrder.order_number}</span>.
            </p>
            <form onSubmit={handleConfirmGallonDelivery} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Gudang Asal Stok *</label>
                <select
                  required
                  value={deliveryLocId}
                  onChange={(e) => setDeliveryLocId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {invLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700">Galon Isi Dikirim *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={actualFilledSent}
                    onChange={(e) => setActualFilledSent(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Galon Kosong Diterima *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={emptyReceived}
                    onChange={(e) => setEmptyReceived(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Catatan Pengiriman</label>
                <input
                  type="text"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="Diterima oleh petugas unit..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeliveryModal(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busyAction ? 'Memproses...' : 'Konfirmasi & Selesaikan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
