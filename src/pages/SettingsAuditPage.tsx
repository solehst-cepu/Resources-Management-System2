import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { formatIdDateTime } from '../shared/calculations';
import type { AppSettingsMap, AuditLogEntry, PaginatedResponse } from '../shared/types';

export function SettingsAuditPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AppSettingsMap>({
    allowed_domain: 'lazuardi.sch.id',
    min_gallon_stock_alert: 15,
    attachment_retention_days: 90,
    monthly_report_day: 1,
  });
  const [logsPage, setLogsPage] = useState<PaginatedResponse<AuditLogEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const loadData = async (p = page) => {
    try {
      const [sRes, aRes] = await Promise.all([
        apiFetch<{ settings: AppSettingsMap }>('/settings'),
        apiFetch<PaginatedResponse<AuditLogEntry>>(`/audit-logs?page=${p}&pageSize=15`),
      ]);
      if (sRes.settings) setSettings(sRes.settings);
      setLogsPage(aRes);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat pengaturan & audit log', 'error');
    }
  };

  useEffect(() => {
    loadData(page);
  }, [page]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch<{ settings: AppSettingsMap }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      showToast('Pengaturan sistem berhasil disimpan', 'success');
      await loadData(1);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveSettings} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#1755CE]" />
          <h2 className="font-display text-base font-bold text-slate-900">Pengaturan Sistem Operasional</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700">Domain Email Sekolah Diizinkan</label>
            <input
              type="text"
              value={settings.allowed_domain}
              onChange={(e) => setSettings({ ...settings, allowed_domain: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700">Ambang Peringatan Stok Galon</label>
            <input
              type="number"
              min={1}
              value={settings.min_gallon_stock_alert}
              onChange={(e) => setSettings({ ...settings, min_gallon_stock_alert: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700">Retensi Berkas Fotokopi (Hari)</label>
            <input
              type="number"
              min={7}
              value={settings.attachment_retention_days}
              onChange={(e) => setSettings({ ...settings, attachment_retention_days: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700">Tanggal Kirim Laporan Bulanan</label>
            <input
              type="number"
              min={1}
              max={28}
              value={settings.monthly_report_day}
              onChange={(e) => setSettings({ ...settings, monthly_report_day: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#1755CE] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1244A8] disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>

      {/* Audit Logs */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-sm font-bold text-slate-900">Audit Log Keamanan & Operasi</h3>
          <p className="text-xs text-slate-500">Jejak perubahan role, stok, stock opname, pengiriman laporan, dan pengaturan.</p>
        </div>
        {!logsPage || logsPage.items.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Belum ada catatan audit log.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Waktu</th>
                    <th className="px-4 py-2.5">Aktor</th>
                    <th className="px-4 py-2.5">Aksi</th>
                    <th className="px-4 py-2.5">Entitas</th>
                    <th className="px-4 py-2.5">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logsPage.items.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500 whitespace-nowrap">
                        {formatIdDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{log.actor_email}</div>
                        <div className="text-[11px] text-slate-500">{log.actor_role}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{log.action}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{log.entity_type}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 max-w-md truncate">
                        {JSON.stringify(log.metadata_json)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
              <div className="tabular-nums">
                Halaman {logsPage.page} dari {logsPage.totalPages}
              </div>
              <div className="flex gap-1.5">
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
                  disabled={page >= logsPage.totalPages}
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
    </div>
  );
}
