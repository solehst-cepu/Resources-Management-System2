import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileUp, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { calculatePhotocopyMetrics, formatIdNumber } from '../shared/calculations';
import type { OrderRecord, PaperSize, PrintColor, Unit } from '../shared/types';

export function PhotocopyOrderPage({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState('');
  const [docName, setDocName] = useState('');
  const [pageCount, setPageCount] = useState(10);
  const [copyCount, setCopyCount] = useState(5);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [printColor, setPrintColor] = useState<PrintColor>('Hitam Putih');
  const [isDuplex, setIsDuplex] = useState(false);
  const [finishingNotes, setFinishingNotes] = useState('');
  const [neededDate, setNeededDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    base64Content: string;
  } | null>(null);
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

  const calc = calculatePhotocopyMetrics(pageCount, copyCount, isDuplex);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('Ukuran file maksimal 15 MB.', 'error');
      e.target.value = '';
      return;
    }
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ];
    if (!allowed.includes(file.type)) {
      showToast('Format file harus PDF, DOC/DOCX, PNG, atau JPG.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setAttachment({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        base64Content: base64,
      });
      if (!docName.trim()) {
        setDocName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !docName.trim()) {
      showToast('Unit dan nama dokumen wajib diisi.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: OrderRecord }>('/orders/photocopy', {
        method: 'POST',
        body: JSON.stringify({
          unitId,
          docName: docName.trim(),
          pageCount: Number(pageCount),
          copyCount: Number(copyCount),
          paperSize,
          printColor,
          isDuplex,
          finishingNotes,
          neededDate,
          notes,
          attachment,
        }),
      });
      setCreatedOrder(res.order);
      showToast(`Order ${res.order.order_number} berhasil dibuat`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat permintaan fotokopi.', 'error');
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
            Permintaan Fotokopi Langsung Masuk Antrean Resources
          </h2>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-1.5">
          <div>
            Nomor Order: <span className="font-mono font-bold text-slate-900">{createdOrder.order_number}</span>
          </div>
          <div>Unit: {createdOrder.unit_name}</div>
          <div>Dokumen: {createdOrder.item?.doc_name}</div>
          <div>
            Total Sisi Cetak:{' '}
            <span className="font-semibold tabular-nums">
              {formatIdNumber(createdOrder.item?.print_sides_total)}
            </span>{' '}
            · Total Lembar Kertas:{' '}
            <span className="font-semibold tabular-nums">
              {formatIdNumber(createdOrder.item?.paper_sheets_total)}
            </span>
          </div>
          <div>Tercatat otomatis pada laporan penggunaan bulanan unit Anda.</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setCreatedOrder(null);
              setAttachment(null);
              setDocName('');
            }}
            className="rounded-lg bg-[#1755CE] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1244A8]"
          >
            Buat Order Fotokopi Lagi
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center gap-2.5">
          <Printer className="h-5 w-5 text-[#1755CE]" />
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Formulir Permintaan Fotokopi</h2>
            <p className="text-xs text-slate-500">
              Tidak memerlukan persetujuan Kepala Unit · Berkas disimpan aman dalam bucket privat
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
              placeholder="Contoh: Modul Matematika Kelas 7 Bab 3"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Unggah Berkas Dokumen (PDF, DOC/DOCX, JPG/PNG — Maks 15 MB)
            </label>
            <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600 hover:border-[#1755CE]">
              <FileUp className="h-4 w-4 text-[#1755CE] shrink-0" />
              <span className="truncate">
                {attachment
                  ? `${attachment.fileName} (${(attachment.sizeBytes / 1024).toFixed(0)} KB)`
                  : 'Pilih file dokumen dari komputer Anda...'}
              </span>
              <input type="file" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Jml Halaman *</label>
              <input
                type="number"
                min={1}
                max={2000}
                required
                value={pageCount}
                onChange={(e) => setPageCount(Math.max(1, Number(e.target.value)))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-[#1755CE] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Jml Rangkap *</label>
              <input
                type="number"
                min={1}
                max={1000}
                required
                value={copyCount}
                onChange={(e) => setCopyCount(Math.max(1, Number(e.target.value)))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-[#1755CE] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Ukuran Kertas</label>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
              >
                <option value="A4">A4</option>
                <option value="F4">F4</option>
                <option value="A3">A3</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Jenis Cetak</label>
              <select
                value={printColor}
                onChange={(e) => setPrintColor(e.target.value as PrintColor)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
              >
                <option value="Hitam Putih">Hitam Putih</option>
                <option value="Warna">Warna</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Mode Cetak Sisi Kertas</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setIsDuplex(false)}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    !isDuplex ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Satu Sisi (1-Side)
                </button>
                <button
                  type="button"
                  onClick={() => setIsDuplex(true)}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    isDuplex ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Dua Sisi (Bolak-Balik)
                </button>
              </div>
            </div>
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Keterangan Finishing</label>
              <input
                type="text"
                value={finishingNotes}
                onChange={(e) => setFinishingNotes(e.target.value)}
                placeholder="Contoh: Staples pojok kiri, jilid lakban"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1755CE] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Catatan Tambahan</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Keterangan khusus untuk petugas..."
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
              {submitting ? 'Mengirim Order...' : 'Kirim Permintaan Fotokopi'}
            </button>
          </div>
        </form>
      </div>

      {/* Live Calculation Preview */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-display text-sm font-bold text-slate-900">Kalkulasi Cetak & Kertas Aktual</h3>
          <p className="mt-1 text-xs text-slate-500">
            Menghitung akurat jumlah sisi cetak dan pemakaian lembar kertas (termasuk halaman ganjil bolak-balik).
          </p>

          <dl className="mt-4 divide-y divide-slate-100 text-xs">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Halaman Dokumen</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatIdNumber(calc.pageCount)} hal
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Jumlah Rangkap</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatIdNumber(calc.copyCount)} rangkap
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Mode Cetak</dt>
              <dd className="font-semibold text-slate-900">
                {calc.isDuplex ? 'Dua Sisi (Bolak-Balik)' : 'Satu Sisi'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Lembar per Rangkap</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatIdNumber(calc.sheetsPerCopy)} lembar
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="font-semibold text-slate-900">Total Sisi Cetak Aktual</dt>
              <dd className="font-mono text-base font-bold text-slate-900 tabular-nums">
                {formatIdNumber(calc.printSidesTotal)} sisi
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="font-semibold text-slate-900">Total Lembar Kertas Aktual</dt>
              <dd className="font-mono text-base font-bold text-[#1755CE] tabular-nums">
                {formatIdNumber(calc.paperSheetsTotal)} lembar
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
