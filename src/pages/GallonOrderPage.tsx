import React, { useEffect, useState } from 'react';
import { CheckCircle2, Droplets } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import type { LocationItem, OrderRecord, Unit } from '../shared/types';

export function GallonOrderPage({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [unitId, setUnitId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [requestedQty, setRequestedQty] = useState(1);
  const [emptyExchangeQty, setEmptyExchangeQty] = useState(1);
  const [neededDate, setNeededDate] = useState(new Date().toISOString().slice(0, 10));
  const [neededTime, setNeededTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<OrderRecord | null>(null);

  useEffect(() => {
    apiFetch<{ units: Unit[]; locations: LocationItem[] }>('/master/bootstrap')
      .then((res) => {
        setUnits(res.units);
        setLocations(res.locations);
        const defUnit = user?.primary_unit_id || res.units[0]?.id || '';
        setUnitId(defUnit);
        const defLoc = res.locations.find((l) => l.unit_id === defUnit) || res.locations[0];
        if (defLoc) setLocationId(defLoc.id);
      })
      .catch(() => {});
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const locObj = locations.find((l) => l.id === locationId);
    const locationLabel =
      locationId === 'CUSTOM'
        ? customLocation.trim()
        : locObj
        ? `${locObj.building} · ${locObj.floor} · ${locObj.room}`
        : customLocation.trim();

    if (!unitId || !locationLabel) {
      showToast('Unit dan lokasi pengiriman wajib diisi.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: OrderRecord }>('/orders/gallon', {
        method: 'POST',
        body: JSON.stringify({
          unitId,
          locationId: locationId === 'CUSTOM' ? null : locationId || null,
          locationLabel,
          requestedQty: Number(requestedQty),
          emptyExchangeQty: Number(emptyExchangeQty),
          neededDate,
          neededTime: neededTime || null,
          notes,
        }),
      });
      setCreatedOrder(res.order);
      showToast(`Order ${res.order.order_number} berhasil dibuat`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat permintaan air galon.', 'error');
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
            Permintaan Air Galon Masuk Antrean Resources
          </h2>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-1.5">
          <div>
            Nomor Order: <span className="font-mono font-bold text-slate-900">{createdOrder.order_number}</span>
          </div>
          <div>Unit: {createdOrder.unit_name}</div>
          <div>Lokasi Pengiriman: {createdOrder.location_label}</div>
          <div>
            Jumlah Diminta: <span className="font-semibold tabular-nums">{createdOrder.item?.requested_qty}</span> galon
            (Tukar kosong: <span className="tabular-nums">{createdOrder.item?.empty_exchange_qty}</span>)
          </div>
          <div>Status: {createdOrder.status}</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setCreatedOrder(null)}
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
        <Droplets className="h-5 w-5 text-[#1755CE]" />
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">Formulir Permintaan Air Galon</h2>
          <p className="text-xs text-slate-500">
            Nomor order dibuat otomatis · Langsung masuk antrean Admin Resources tanpa approval
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
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1755CE] focus:outline-none"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">Lokasi Pengiriman *</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1755CE] focus:outline-none"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.building} · {l.floor} · {l.room}
              </option>
            ))}
            <option value="CUSTOM">Lokasi Lainnya (Isi Manual)</option>
          </select>
          {locationId === 'CUSTOM' && (
            <input
              type="text"
              required
              placeholder="Contoh: Gedung Timur Lt. 3 Ruang Lab IPA"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Jumlah Galon Isi Diminta *</label>
            <input
              type="number"
              min={1}
              max={50}
              required
              value={requestedQty}
              onChange={(e) => setRequestedQty(Math.max(1, Number(e.target.value)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-[#1755CE] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Jumlah Galon Kosong Ditukar *
            </label>
            <input
              type="number"
              min={0}
              max={50}
              required
              value={emptyExchangeQty}
              onChange={(e) => setEmptyExchangeQty(Math.max(0, Number(e.target.value)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-[#1755CE] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Tanggal Kebutuhan *</label>
            <input
              type="date"
              required
              value={neededDate}
              onChange={(e) => setNeededDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Jam Kebutuhan (Opsional)</label>
            <input
              type="time"
              value={neededTime}
              onChange={(e) => setNeededTime(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">Catatan Tambahan</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instruksi pengantaran atau keterangan lokasi dispenser..."
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#1755CE] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1244A8] disabled:opacity-60"
          >
            {submitting ? 'Mengirim Permintaan...' : 'Kirim Permintaan Air Galon'}
          </button>
        </div>
      </form>
    </div>
  );
}
