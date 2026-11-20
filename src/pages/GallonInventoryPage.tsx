import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  Lock,
  Plus,
  Printer,
  Truck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { exportRowsToExcel, exportTableToPdf } from '../lib/exportUtils';
import { formatIdDate, formatIdDateTime, formatIdNumber } from '../shared/calculations';
import type {
  InventoryBalance,
  InventoryLocation,
  InventoryReceipt,
  InventoryTransaction,
  OrderRecord,
  PaginatedResponse,
  StockOpnameRecord,
  StockType,
  Unit,
} from '../shared/types';

type InvTab =
  | 'dashboard'
  | 'balances'
  | 'receipts'
  | 'distribution'
  | 'empty_returns'
  | 'opname'
  | 'adjustments'
  | 'mutations'
  | 'report';

interface OverviewPayload {
  locations: InventoryLocation[];
  balances: InventoryBalance[];
  receipts: InventoryReceipt[];
  opnames: StockOpnameRecord[];
  transactions: PaginatedResponse<InventoryTransaction>;
  monthlyTrend: Array<{ month: string; received: number; distributed: number; emptyReturned: number }>;
}

const INV_TABS: Array<{ id: InvTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard Stok' },
  { id: 'balances', label: 'Stok Galon' },
  { id: 'receipts', label: 'Barang Masuk' },
  { id: 'distribution', label: 'Distribusi Galon' },
  { id: 'empty_returns', label: 'Pengembalian Kosong' },
  { id: 'opname', label: 'Stock Opname' },
  { id: 'adjustments', label: 'Penyesuaian Stok' },
  { id: 'mutations', label: 'Riwayat Mutasi' },
  { id: 'report', label: 'Laporan Persediaan' },
];

export function GallonInventoryPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<InvTab>('dashboard');
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [pendingDistOrders, setPendingDistOrders] = useState<OrderRecord[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Receipt form
  const [rcvDate, setRcvDate] = useState(new Date().toISOString().slice(0, 10));
  const [rcvSupplier, setRcvSupplier] = useState('');
  const [rcvLocId, setRcvLocId] = useState('');
  const [rcvFilled, setRcvFilled] = useState(20);
  const [rcvEmpty, setRcvEmpty] = useState(0);
  const [rcvDocNo, setRcvDocNo] = useState('');
  const [rcvNotes, setRcvNotes] = useState('');

  // Empty return form
  const [retLocId, setRetLocId] = useState('');
  const [retQty, setRetQty] = useState(1);
  const [retUnitId, setRetUnitId] = useState('');
  const [retRef, setRetRef] = useState('');
  const [retNotes, setRetNotes] = useState('');

  // Manual adjustment form
  const [adjLocId, setAdjLocId] = useState('');
  const [adjType, setAdjType] = useState<StockType>('damaged');
  const [adjDelta, setAdjDelta] = useState(1);
  const [adjReason, setAdjReason] = useState('');

  // Stock opname form
  const [opnLocId, setOpnLocId] = useState('');
  const [opnDate, setOpnDate] = useState(new Date().toISOString().slice(0, 10));
  const [opnNotes, setOpnNotes] = useState('');
  const [opnFilled, setOpnFilled] = useState(0);
  const [opnEmpty, setOpnEmpty] = useState(0);
  const [opnDamaged, setOpnDamaged] = useState(0);
  const [opnLost, setOpnLost] = useState(0);
  const [opnReason, setOpnReason] = useState('');
  const [editingOpnameId, setEditingOpnameId] = useState<string | undefined>(undefined);

  // Mutations filter
  const [txPage, setTxPage] = useState(1);
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');
  const [txData, setTxData] = useState<PaginatedResponse<InventoryTransaction> | null>(null);

  // Distribution quick confirm
  const [distOrder, setDistOrder] = useState<OrderRecord | null>(null);
  const [distLocId, setDistLocId] = useState('');
  const [distFilled, setDistFilled] = useState(1);
  const [distEmpty, setDistEmpty] = useState(0);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, ordRes, bootRes] = await Promise.all([
        apiFetch<OverviewPayload>('/inventory/overview'),
        apiFetch<PaginatedResponse<OrderRecord>>('/orders?serviceCode=AIR_GALON&status=ACTIVE_QUEUE&pageSize=30'),
        apiFetch<{ units: Unit[] }>('/master/bootstrap'),
      ]);
      setOverview(ov);
      setTxData(ov.transactions);
      setPendingDistOrders(ordRes.items || []);
      setUnits(bootRes.units || []);

      const firstLoc = ov.locations[0]?.id || '';
      if (!rcvLocId && firstLoc) setRcvLocId(firstLoc);
      if (!retLocId && firstLoc) setRetLocId(firstLoc);
      if (!adjLocId && firstLoc) setAdjLocId(firstLoc);
      if (!distLocId && firstLoc) setDistLocId(firstLoc);
      if (!opnLocId && firstLoc) {
        setOpnLocId(firstLoc);
        const bal = ov.balances.find((b) => b.location_id === firstLoc);
        if (bal) {
          setOpnFilled(bal.qty_filled);
          setOpnEmpty(bal.qty_empty);
          setOpnDamaged(bal.qty_damaged);
          setOpnLost(bal.qty_lost);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat inventaris galon', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const loadMutations = async (page = txPage, type = txTypeFilter) => {
    try {
      const res = await apiFetch<PaginatedResponse<InventoryTransaction>>(
        `/inventory/transactions?page=${page}&pageSize=15&txType=${type}`
      );
      setTxData(res);
    } catch {
      // ignore
    }
  };

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/inventory/receipts', {
        method: 'POST',
        body: JSON.stringify({
          receiptDate: rcvDate,
          supplier: rcvSupplier,
          locationId: rcvLocId,
          qtyFilled: Number(rcvFilled),
          qtyEmpty: Number(rcvEmpty),
          documentNo: rcvDocNo,
          notes: rcvNotes,
        }),
      });
      showToast('Penerimaan barang masuk berhasil dicatat', 'success');
      setRcvSupplier('');
      setRcvDocNo('');
      setRcvNotes('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mencatat barang masuk', 'error');
    }
  };

  const handleEmptyReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/inventory/empty-returns', {
        method: 'POST',
        body: JSON.stringify({
          locationId: retLocId,
          qtyEmpty: Number(retQty),
          unitId: retUnitId || undefined,
          referenceNo: retRef,
          notes: retNotes,
        }),
      });
      showToast('Pengembalian galon kosong berhasil dicatat', 'success');
      setRetRef('');
      setRetNotes('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mencatat pengembalian', 'error');
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          locationId: adjLocId,
          stockType: adjType,
          qtyDelta: Number(adjDelta),
          reason: adjReason,
        }),
      });
      showToast('Penyesuaian stok berhasil disimpan', 'success');
      setAdjReason('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal melakukan penyesuaian', 'error');
    }
  };

  const handleSaveOpnameDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/inventory/opname/draft', {
        method: 'POST',
        body: JSON.stringify({
          opnameId: editingOpnameId,
          opnameDate: opnDate,
          locationId: opnLocId,
          notes: opnNotes,
          items: [
            { stockType: 'filled', physicalQty: Number(opnFilled), varianceReason: opnReason },
            { stockType: 'empty', physicalQty: Number(opnEmpty), varianceReason: opnReason },
            { stockType: 'damaged', physicalQty: Number(opnDamaged), varianceReason: opnReason },
            { stockType: 'lost', physicalQty: Number(opnLost), varianceReason: opnReason },
          ],
        }),
      });
      showToast('Draft stock opname disimpan', 'success');
      setEditingOpnameId(undefined);
      setOpnNotes('');
      setOpnReason('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan draft opname', 'error');
    }
  };

  const handleFinalizeOpname = async (opnameId: string, opnameNumber: string) => {
    try {
      await apiFetch(`/inventory/opname/${opnameId}/finalize`, { method: 'POST' });
      showToast(`Stock Opname ${opnameNumber} berhasil difinalisasi`, 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memfinalisasi stock opname', 'error');
    }
  };

  const handleConfirmDist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distOrder) return;
    try {
      await apiFetch(`/orders/${distOrder.id}/confirm-gallon-delivery`, {
        method: 'POST',
        body: JSON.stringify({
          locationId: distLocId,
          actualFilledSent: Number(distFilled),
          emptyReceived: Number(distEmpty),
        }),
      });
      showToast(`Distribusi ${distOrder.order_number} dikonfirmasi`, 'success');
      setDistOrder(null);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal konfirmasi distribusi', 'error');
    }
  };

  if (loading || !overview) {
    return <div className="p-8 text-center text-xs text-slate-500">Memuat data inventaris air galon...</div>;
  }

  const totalFilled = overview.balances.reduce((a, b) => a + b.qty_filled, 0);
  const totalEmpty = overview.balances.reduce((a, b) => a + b.qty_empty, 0);
  const totalDamaged = overview.balances.reduce((a, b) => a + b.qty_damaged, 0);
  const totalLost = overview.balances.reduce((a, b) => a + b.qty_lost, 0);
  const totalAllocated = overview.balances.reduce((a, b) => a + b.qty_allocated, 0);

  const selectedBal = overview.balances.find((b) => b.location_id === opnLocId);

  return (
    <div className="space-y-5">
      {/* 9-Tab Sub-Navigation */}
      <div className="no-print flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
        {INV_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-[#1755CE] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. Dashboard Stok */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Total Galon Isi</div>
              <div className="mt-1.5 font-display text-2xl font-bold text-[#1755CE] tabular-nums">
                {formatIdNumber(totalFilled)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Dialokasikan: {totalAllocated} · Bebas: {Math.max(0, totalFilled - totalAllocated)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Total Galon Kosong</div>
              <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {formatIdNumber(totalEmpty)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Galon Rusak</div>
              <div className="mt-1.5 font-display text-2xl font-bold text-amber-700 tabular-nums">
                {formatIdNumber(totalDamaged)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Galon Hilang</div>
              <div className="mt-1.5 font-display text-2xl font-bold text-red-700 tabular-nums">
                {formatIdNumber(totalLost)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Batas Stok Minimum</div>
              <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {formatIdNumber(overview.balances[0]?.min_stock_threshold ?? 15)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Tren Pemakaian & Penerimaan Galon Bulanan
            </h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="received" name="Barang Masuk" fill="#1755CE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="distributed" name="Didistribusikan" fill="#D97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="emptyReturned" name="Kosong Kembali" fill="#16A34A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 2. Stok Galon per Lokasi */}
      {tab === 'balances' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Lokasi Penyimpanan</th>
                <th className="px-4 py-3 text-right font-semibold">Galon Isi</th>
                <th className="px-4 py-3 text-right font-semibold">Alokasi Order</th>
                <th className="px-4 py-3 text-right font-semibold">Tersedia Bebas</th>
                <th className="px-4 py-3 text-right font-semibold">Galon Kosong</th>
                <th className="px-4 py-3 text-right font-semibold">Rusak</th>
                <th className="px-4 py-3 text-right font-semibold">Hilang</th>
                <th className="px-4 py-3 font-semibold">Indikator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overview.balances.map((b) => {
                const isLow = b.available_filled <= b.min_stock_threshold;
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">{b.location_code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{b.location_name}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{b.qty_filled}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">{b.qty_allocated}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[#1755CE]">
                      {b.available_filled}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{b.qty_empty}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">{b.qty_damaged}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{b.qty_lost}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Di bawah min. ({b.min_stock_threshold})</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-emerald-700">Aman</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Barang Masuk */}
      {tab === 'receipts' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleReceiptSubmit} className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 space-y-3 text-xs">
            <h3 className="font-display text-sm font-bold text-slate-900">Catat Barang Masuk (Supplier)</h3>
            <div>
              <label className="block font-semibold text-slate-700">Tanggal Penerimaan *</label>
              <input type="date" required value={rcvDate} onChange={(e) => setRcvDate(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Nama Supplier *</label>
              <input type="text" required value={rcvSupplier} onChange={(e) => setRcvSupplier(e.target.value)} placeholder="PT Tirta Sehat Nusantara" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Lokasi Penyimpanan *</label>
              <select value={rcvLocId} onChange={(e) => setRcvLocId(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
                {overview.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Jumlah Galon Isi *</label>
                <input type="number" min={0} required value={rcvFilled} onChange={(e) => setRcvFilled(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 tabular-nums" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Jumlah Galon Kosong</label>
                <input type="number" min={0} value={rcvEmpty} onChange={(e) => setRcvEmpty(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 tabular-nums" />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Nomor Surat Jalan / Dokumen</label>
              <input type="text" value={rcvDocNo} onChange={(e) => setRcvDocNo(e.target.value)} placeholder="SJ-2026-001" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Keterangan</label>
              <input type="text" value={rcvNotes} onChange={(e) => setRcvNotes(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#1755CE] py-2 font-semibold text-white hover:bg-[#1244A8]">
              Simpan Penerimaan Stok
            </button>
          </form>

          <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white overflow-x-auto">
            <div className="border-b border-slate-200 px-5 py-3.5 font-display text-sm font-bold text-slate-900">
              Riwayat Barang Masuk
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">No. Penerimaan</th>
                  <th className="px-4 py-2.5">Tanggal</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Gudang</th>
                  <th className="px-4 py-2.5 text-right">Isi</th>
                  <th className="px-4 py-2.5 text-right">Kosong</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.receipt_number}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatIdDate(r.receipt_date)}</td>
                    <td className="px-4 py-2.5">{r.supplier}</td>
                    <td className="px-4 py-2.5">{r.location_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">+{r.qty_filled}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">+{r.qty_empty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Distribusi Galon */}
      {tab === 'distribution' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Antrean Distribusi Order Air Galon
            </h3>
            <p className="text-xs text-slate-500">
              Konfirmasi pengiriman mencatat jumlah galon isi dikirim & galon kosong diterima secara atomic.
            </p>
          </div>
          {pendingDistOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Tidak ada antrean distribusi galon.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nomor Order</th>
                  <th className="px-4 py-3">Unit & Pemesan</th>
                  <th className="px-4 py-3">Lokasi Tujuan</th>
                  <th className="px-4 py-3 text-right">Diminta</th>
                  <th className="px-4 py-3 text-right">Tukar Kosong</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingDistOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.unit_name}</div>
                      <div className="text-[11px] text-slate-500">{o.requester_name}</div>
                    </td>
                    <td className="px-4 py-3">{o.location_label}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{o.item?.requested_qty}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{o.item?.empty_exchange_qty}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setDistOrder(o);
                          setDistFilled(o.item?.requested_qty ?? 1);
                          setDistEmpty(o.item?.empty_exchange_qty ?? 0);
                        }}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        <span>Konfirmasi Kirim</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {distOrder && (
            <form onSubmit={handleConfirmDist} className="border-t border-slate-200 bg-slate-50 p-4 grid grid-cols-1 gap-3 sm:grid-cols-5 items-end text-xs">
              <div>
                <div className="font-semibold text-slate-900">Order {distOrder.order_number}</div>
                <select value={distLocId} onChange={(e) => setDistLocId(e.target.value)} className="mt-1 w-full rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  {overview.locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Isi Dikirim</label>
                <input type="number" min={0} value={distFilled} onChange={(e) => setDistFilled(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 tabular-nums" />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Kosong Diterima</label>
                <input type="number" min={0} value={distEmpty} onChange={(e) => setDistEmpty(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 tabular-nums" />
              </div>
              <button type="submit" className="rounded bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-700">
                Simpan Distribusi
              </button>
              <button type="button" onClick={() => setDistOrder(null)} className="rounded border border-slate-200 bg-white py-2 font-semibold text-slate-700">
                Batal
              </button>
            </form>
          )}
        </div>
      )}

      {/* 5. Pengembalian Galon Kosong */}
      {tab === 'empty_returns' && (
        <form onSubmit={handleEmptyReturnSubmit} className="max-w-xl rounded-lg border border-slate-200 bg-white p-6 space-y-4 text-xs">
          <h3 className="font-display text-sm font-bold text-slate-900">Catat Pengembalian Galon Kosong</h3>
          <div>
            <label className="block font-semibold text-slate-700">Gudang Penerima *</label>
            <select value={retLocId} onChange={(e) => setRetLocId(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
              {overview.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700">Unit Asal</label>
              <select value={retUnitId} onChange={(e) => setRetUnitId(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
                <option value="">-- Pilih Unit --</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Jumlah Galon Kosong *</label>
              <input type="number" min={1} required value={retQty} onChange={(e) => setRetQty(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700">Referensi / Keterangan</label>
            <input type="text" value={retNotes} onChange={(e) => setRetNotes(e.target.value)} placeholder="Pengembalian galon kosong susulan dari ruang guru" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
          </div>
          <button type="submit" className="rounded-lg bg-[#1755CE] px-4 py-2 font-semibold text-white hover:bg-[#1244A8]">
            Catat Pengembalian
          </button>
        </form>
      )}

      {/* 6. Stock Opname */}
      {tab === 'opname' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveOpnameDraft} className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#1755CE]" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                {editingOpnameId ? 'Edit Draft Stock Opname' : 'Buat Draft Stock Opname'}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Tanggal Opname *</label>
                <input type="date" required value={opnDate} onChange={(e) => setOpnDate(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Lokasi Gudang *</label>
                <select
                  value={opnLocId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setOpnLocId(id);
                    const b = overview.balances.find((x) => x.location_id === id);
                    if (b) {
                      setOpnFilled(b.qty_filled);
                      setOpnEmpty(b.qty_empty);
                      setOpnDamaged(b.qty_damaged);
                      setOpnLost(b.qty_lost);
                    }
                  }}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
                >
                  {overview.locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedBal && (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="font-semibold text-slate-800">Perbandingan Sistem vs Fisik</div>
                <div className="grid grid-cols-3 gap-2 items-center font-medium text-slate-600">
                  <span>Jenis</span>
                  <span className="text-right">Stok Sistem</span>
                  <span className="text-right">Stok Fisik</span>
                </div>
                {[
                  { label: 'Galon Isi', sys: selectedBal.qty_filled, val: opnFilled, set: setOpnFilled },
                  { label: 'Galon Kosong', sys: selectedBal.qty_empty, val: opnEmpty, set: setOpnEmpty },
                  { label: 'Galon Rusak', sys: selectedBal.qty_damaged, val: opnDamaged, set: setOpnDamaged },
                  { label: 'Galon Hilang', sys: selectedBal.qty_lost, val: opnLost, set: setOpnLost },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-3 gap-2 items-center">
                    <span>{row.label}</span>
                    <span className="text-right font-mono tabular-nums">{row.sys}</span>
                    <input
                      type="number"
                      min={0}
                      value={row.val}
                      onChange={(e) => row.set(Math.max(0, Number(e.target.value)))}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-right font-mono tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700">Penyebab Selisih (Jika Ada)</label>
              <input type="text" value={opnReason} onChange={(e) => setOpnReason(e.target.value)} placeholder="Contoh: Galon bocor saat pengiriman / belum tercatat" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Catatan Pemeriksaan</label>
              <input type="text" value={opnNotes} onChange={(e) => setOpnNotes(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>

            <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1755CE] py-2 font-semibold text-white hover:bg-[#1244A8]">
              <Plus className="h-3.5 w-3.5" />
              <span>Simpan Draft Stock Opname</span>
            </button>
          </form>

          <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 font-display text-sm font-bold text-slate-900">
              Daftar & Histori Stock Opname
            </div>
            {overview.opnames.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Belum ada dokumen stock opname.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {overview.opnames.map((op) => (
                  <div key={op.id} className="p-4 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-900">{op.opname_number}</span>
                        <span className="mx-2 text-slate-300">·</span>
                        <span className="font-medium text-slate-700">{op.location_name}</span>
                        <span className="mx-2 text-slate-300">·</span>
                        <span className="tabular-nums text-slate-500">{formatIdDate(op.opname_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {op.status === 'Final' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <Lock className="h-3.5 w-3.5" />
                            <span>Final (Terkunci)</span>
                          </span>
                        ) : (
                          <>
                            <span className="font-semibold text-amber-700">Draft</span>
                            <button
                              type="button"
                              onClick={() => handleFinalizeOpname(op.id, op.opname_number)}
                              className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
                            >
                              Finalisasi & Sesuaikan Stok
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 rounded p-2.5">
                      {op.items.map((it) => (
                        <div key={it.id}>
                          <span className="capitalize text-slate-500">{it.stock_type}: </span>
                          <span className="font-mono font-semibold tabular-nums">
                            {it.system_qty} → {it.physical_qty}
                          </span>{' '}
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              it.variance_qty === 0 ? 'text-slate-500' : 'text-red-700'
                            }`}
                          >
                            ({it.variance_qty >= 0 ? `+${it.variance_qty}` : it.variance_qty})
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-500">Petugas: {op.inspector_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Penyesuaian Stok */}
      {tab === 'adjustments' && (
        <form onSubmit={handleAdjustmentSubmit} className="max-w-xl rounded-lg border border-slate-200 bg-white p-6 space-y-4 text-xs">
          <h3 className="font-display text-sm font-bold text-slate-900">Penyesuaian Stok Manual</h3>
          <p className="text-slate-500">Gunakan untuk koreksi galon rusak/hilang dengan alasan terdokumentasi. Sistem menolak nilai stok negatif.</p>
          <div>
            <label className="block font-semibold text-slate-700">Lokasi Gudang *</label>
            <select value={adjLocId} onChange={(e) => setAdjLocId(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
              {overview.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700">Jenis Stok *</label>
              <select value={adjType} onChange={(e) => setAdjType(e.target.value as StockType)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
                <option value="filled">Galon Isi</option>
                <option value="empty">Galon Kosong</option>
                <option value="damaged">Galon Rusak</option>
                <option value="lost">Galon Hilang</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Selisih (+/-) *</label>
              <input type="number" required value={adjDelta} onChange={(e) => setAdjDelta(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700">Alasan Penyesuaian *</label>
            <input type="text" required value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Contoh: Galon retak tidak dapat diisi ulang" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
          </div>
          <button type="submit" className="rounded-lg bg-[#1755CE] px-4 py-2 font-semibold text-white hover:bg-[#1244A8]">
            Terapkan Penyesuaian
          </button>
        </form>
      )}

      {/* 8. Riwayat Mutasi */}
      {tab === 'mutations' && txData && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <h3 className="font-display text-sm font-bold text-slate-900">Riwayat Mutasi Persediaan</h3>
            <select
              value={txTypeFilter}
              onChange={(e) => {
                setTxTypeFilter(e.target.value);
                setTxPage(1);
                loadMutations(1, e.target.value);
              }}
              className="rounded border border-slate-200 px-3 py-1.5 text-xs"
            >
              <option value="ALL">Semua Mutasi</option>
              <option value="RECEIPT">Barang Masuk</option>
              <option value="DISTRIBUTION">Distribusi</option>
              <option value="EMPTY_RETURN">Pengembalian Kosong</option>
              <option value="OPNAME_ADJUSTMENT">Penyesuaian Opname</option>
              <option value="MANUAL_ADJUSTMENT">Penyesuaian Manual</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">No. Transaksi</th>
                  <th className="px-4 py-2.5">Waktu</th>
                  <th className="px-4 py-2.5">Tipe</th>
                  <th className="px-4 py-2.5">Lokasi</th>
                  <th className="px-4 py-2.5 text-right">Isi</th>
                  <th className="px-4 py-2.5 text-right">Kosong</th>
                  <th className="px-4 py-2.5 text-right">Rusak/Hilang</th>
                  <th className="px-4 py-2.5">Referensi & Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txData.items.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold">{t.tx_number}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{formatIdDateTime(t.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium">{t.tx_type}</td>
                    <td className="px-4 py-2.5">{t.location_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{t.qty_filled_delta}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{t.qty_empty_delta}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {t.qty_damaged_delta}/{t.qty_lost_delta}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{t.reference_no || '-'}</div>
                      <div className="text-[11px] text-slate-500">{t.actor_name}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. Laporan Persediaan */}
      {tab === 'report' && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Laporan Saldo & Persediaan Galon</h3>
              <p className="text-xs text-slate-500">Rekap posisi stok aktual seluruh gudang penyimpanan</p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  exportRowsToExcel(
                    'Laporan_Persediaan_Galon_LRMS',
                    'Stok Galon',
                    overview.balances.map((b) => ({
                      Kode: b.location_code,
                      Lokasi: b.location_name,
                      Galon_Isi: b.qty_filled,
                      Dialokasikan: b.qty_allocated,
                      Tersedia_Bebas: b.available_filled,
                      Galon_Kosong: b.qty_empty,
                      Galon_Rusak: b.qty_damaged,
                      Galon_Hilang: b.qty_lost,
                    }))
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor Excel</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportTableToPdf(
                    'Laporan_Persediaan_Galon_LRMS',
                    'Laporan Persediaan Air Galon',
                    `Dicetak pada ${formatIdDateTime(new Date().toISOString())}`,
                    ['Kode', 'Lokasi', 'Isi', 'Alokasi', 'Tersedia', 'Kosong', 'Rusak', 'Hilang'],
                    overview.balances.map((b) => [
                      b.location_code,
                      b.location_name,
                      b.qty_filled,
                      b.qty_allocated,
                      b.available_filled,
                      b.qty_empty,
                      b.qty_damaged,
                      b.qty_lost,
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor PDF</span>
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

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Lokasi</th>
                  <th className="px-4 py-2.5 text-right">Galon Isi</th>
                  <th className="px-4 py-2.5 text-right">Galon Kosong</th>
                  <th className="px-4 py-2.5 text-right">Galon Rusak</th>
                  <th className="px-4 py-2.5 text-right">Galon Hilang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.balances.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-medium">{b.location_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.qty_filled}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.qty_empty}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.qty_damaged}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.qty_lost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
