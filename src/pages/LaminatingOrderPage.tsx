import React, { useEffect, useState } from 'react';
import { CheckCircle2, Layers } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import type { LaminatingSize, OrderRecord, Unit } from '../shared/types';

export function LaminatingOrderPage({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState('');
  const [docName, setDocName] = useState('');
  const [laminatingSize, setLaminatingSize] = useState<LaminatingSize>('A4');
  const [sheetCount, setSheetCount] = useState(5);
  const [laminatingType, setLaminatingType] = useState('Glossy Kaku (100 micron)');
  const [neededDate, setNeededDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<OrderRecord | null>(null);

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/master/bootstrap')
      .then((res) => {
        setUnits(res.units);
        setUnitId(user?.primary_unit_id || res.units[0]?.id || '');
      })
      .catch(() => {});
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !docName.trim()) {
      showToast('Unit dan nama dokumen wajib diisi.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: OrderRecord }>('/orders/laminating', {
        method: 'POST',
        body: JSON.stringify({
          unitId,
          docName: docName.trim(),
          laminatingSize,
          sheetCount: Number(sheetCount),
          laminatingType,
          neededDate,
          notes,
        }),
      });
      setCreatedOrder(res.order);
      showToast(`Order ${res.order.order_number} berhasil dibuat`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat permintaan laminating.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdOrder) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8">
        <div className="flex items-center gap-3 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
          <h2 className="font-display text-lg font-bold text-slate-900">
            Permintaan Laminating Berhasil Dibuat
          </h2>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-1.5">
          <div>
            Nomor Order: <span className="font-mono font-bold text-slate-900">{createdOrder.order_number}</span>
          </div>
          <div>Unit: {createdOrder.unit_name}</div>
          <div>Dokumen: {createdOrder.item?.doc_name}</div>
          <div>
            Ukuran & Jumlah: {createdOrder.item?.laminating_size} ·{' '}
            <span className="tabular-nums font-semibold">{createdOrder.item?.requested_qty}</span> lembar
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setCreatedOrder(null);
              setDocName('');
            }}
            className="rounded-lg bg-[#1755CE] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1244A8]"
          >
            Buat Permintaan Lagi
          </button>
          <button
            type="button"
            onClick={onCreated}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Lihat Pesanan Saya
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4 flex items-center gap-2.5">
        <Layers className="h-5 w-5 text-[#1755CE]" />
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">Formulir Permintaan Laminating</h2>
          <p className="text-xs text-slate-500">
            Langsung masuk antrean Admin Resources · Tanpa memerlukan approval
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Nama Pemesan</label>
            <input
              type="text"
              readOnly
              value={user?.full_name || ''}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Unit / Departemen *</label>
            <select
              required
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">Nama Dokumen *</label>
          <input
            type="text"
            required
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Contoh: Kartu Identitas Panitia Lomba / Poster Kelas"
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Ukuran Laminating *</label>
            <select
              value={laminatingSize}
              onChange={(e) => setLaminatingSize(e.target.value as LaminatingSize)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            >
              <option value="A4">A4</option>
              <option value="F4">F4</option>
              <option value="A3">A3</option>
              <option value="ID Card">ID Card</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Jumlah Lembar *</label>
            <input
              type="number"
              min={1}
              max={500}
              required
              value={sheetCount}
              onChange={(e) => setSheetCount(Math.max(1, Number(e.target.value)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-[#1755CE] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Jenis Laminating</label>
            <select
              value={laminatingType}
              onChange={(e) => setLaminatingType(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            >
              <option value="Glossy Kaku (100 micron)">Glossy Kaku (100 micron)</option>
              <option value="Glossy Standar (80 micron)">Glossy Standar (80 micron)</option>
              <option value="Doff / Matte">Doff / Matte</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Tanggal Dibutuhkan *</label>
            <input
              type="date"
              required
              value={neededDate}
              onChange={(e) => setNeededDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Catatan Tambahan</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Potong sudut tumpul untuk ID Card"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#1755CE] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1244A8] disabled:opacity-60"
          >
            {submitting ? 'Mengirim Order...' : 'Kirim Permintaan Laminating'}
          </button>
        </div>
      </form>
    </div>
  );
}
