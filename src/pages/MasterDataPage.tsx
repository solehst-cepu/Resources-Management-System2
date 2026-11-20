import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { ROLE_LABELS, formatIdDateTime } from '../shared/calculations';
import type { LocationItem, ServiceCatalogItem, Unit, UserProfile, UserRole } from '../shared/types';

type MasterTab = 'units' | 'users' | 'services' | 'locations';

export function MasterDataPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperAdmin = user?.role === 'super_admin';

  const [tab, setTab] = useState<MasterTab>('units');
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Unit Form
  const [unitForm, setUnitForm] = useState({
    id: '',
    code: '',
    name: '',
    category: 'Akademik',
    head_name: '',
    head_email: '',
    is_active: true,
  });

  // Location Form
  const [locForm, setLocForm] = useState({
    id: '',
    code: '',
    building: '',
    floor: '',
    room: '',
    unit_id: '',
    is_active: true,
  });

  // User Role Editor
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editUnitIds, setEditUnitIds] = useState<string[]>([]);
  const [editHeadUnitIds, setEditHeadUnitIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [boot, usersRes] = await Promise.all([
        apiFetch<{ units: Unit[]; services: ServiceCatalogItem[]; locations: LocationItem[] }>(
          '/master/bootstrap?includeInactive=true'
        ),
        apiFetch<{ users: UserProfile[] }>('/master/users'),
      ]);
      setUnits(boot.units || []);
      setServices(boot.services || []);
      setLocations(boot.locations || []);
      setUsers(usersRes.users || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat master data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/master/units', {
        method: 'POST',
        body: JSON.stringify({ ...unitForm, id: unitForm.id || undefined }),
      });
      showToast('Data unit berhasil disimpan', 'success');
      setUnitForm({ id: '', code: '', name: '', category: 'Akademik', head_name: '', head_email: '', is_active: true });
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan unit', 'error');
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/master/locations', {
        method: 'POST',
        body: JSON.stringify({
          ...locForm,
          id: locForm.id || undefined,
          unit_id: locForm.unit_id || null,
        }),
      });
      showToast('Data lokasi berhasil disimpan', 'success');
      setLocForm({ id: '', code: '', building: '', floor: '', room: '', unit_id: '', is_active: true });
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan lokasi', 'error');
    }
  };

  const handleUpdateService = async (svc: ServiceCatalogItem) => {
    try {
      await apiFetch(`/master/services/${svc.code}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: svc.name,
          description: svc.description,
          sla_estimate_minutes: svc.sla_estimate_minutes,
          is_active: !svc.is_active,
        }),
      });
      showToast(`Status layanan ${svc.name} diperbarui`, 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui layanan', 'error');
    }
  };

  const handleSaveUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await apiFetch(`/master/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: editRole,
          unitIds: editUnitIds,
          primaryUnitId: editUnitIds[0] || null,
          headUnitIds: editRole === 'kepala_unit' ? editHeadUnitIds : [],
          isActive: editActive,
        }),
      });
      showToast(`Role & unit ${editingUser.full_name} diperbarui`, 'success');
      setEditingUser(null);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui pengguna', 'error');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Memuat master data...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
        {[
          { id: 'units' as MasterTab, label: 'Master Unit / Departemen' },
          { id: 'users' as MasterTab, label: 'Master User & Role' },
          { id: 'services' as MasterTab, label: 'Master Layanan' },
          { id: 'locations' as MasterTab, label: 'Master Lokasi' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-[#1755CE] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* A. Master Unit */}
      {tab === 'units' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {isSuperAdmin && (
            <form onSubmit={handleSaveUnit} className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-5 space-y-3 text-xs">
              <h3 className="font-display text-sm font-bold text-slate-900">
                {unitForm.id ? 'Ubah Unit' : 'Tambah Unit / Departemen'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Kode Unit *</label>
                  <input type="text" required value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} placeholder="SMP" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Kategori</label>
                  <select value={unitForm.category} onChange={(e) => setUnitForm({ ...unitForm, category: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
                    <option value="Akademik">Akademik</option>
                    <option value="Operasional">Operasional</option>
                    <option value="Manajemen">Manajemen</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Nama Unit *</label>
                <input type="text" required value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="SMP Lazuardi" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Nama Kepala Unit</label>
                <input type="text" value={unitForm.head_name} onChange={(e) => setUnitForm({ ...unitForm, head_name: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Email Kepala Unit</label>
                <input type="email" value={unitForm.head_email} onChange={(e) => setUnitForm({ ...unitForm, head_email: e.target.value })} placeholder="kepala.smp@lazuardi.sch.id" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={unitForm.is_active} onChange={(e) => setUnitForm({ ...unitForm, is_active: e.target.checked })} />
                <span>Unit Aktif</span>
              </label>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 rounded-lg bg-[#1755CE] py-2 font-semibold text-white hover:bg-[#1244A8]">
                  Simpan Unit
                </button>
                {unitForm.id && (
                  <button type="button" onClick={() => setUnitForm({ id: '', code: '', name: '', category: 'Akademik', head_name: '', head_email: '', is_active: true })} className="rounded-lg border border-slate-200 px-3 py-2">
                    Batal
                  </button>
                )}
              </div>
            </form>
          )}

          <div className={`${isSuperAdmin ? 'lg:col-span-8' : 'lg:col-span-12'} rounded-lg border border-slate-200 bg-white overflow-x-auto`}>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama Unit</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Kepala Unit</th>
                  <th className="px-4 py-3">Status</th>
                  {isSuperAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{u.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-4 py-3">{u.category}</td>
                    <td className="px-4 py-3">
                      <div>{u.head_name || '-'}</div>
                      <div className="text-[11px] text-slate-500">{u.head_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${u.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setUnitForm({
                              id: u.id,
                              code: u.code,
                              name: u.name,
                              category: u.category,
                              head_name: u.head_name,
                              head_email: u.head_email,
                              is_active: u.is_active,
                            })
                          }
                          className="rounded border border-slate-200 px-2.5 py-1 font-medium hover:bg-slate-50"
                        >
                          Ubah
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* B. Master User */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nama & Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Unit Penugasan</th>
                  <th className="px-4 py-3">Login Terakhir</th>
                  <th className="px-4 py-3">Status</th>
                  {isSuperAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{u.full_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{ROLE_LABELS[u.role]}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {u.unit_ids.map((id) => units.find((x) => x.id === id)?.name || id).join(', ') || '-'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{formatIdDateTime(u.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${u.is_active ? 'text-emerald-700' : 'text-red-700'}`}>
                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(u);
                            setEditRole(u.role);
                            setEditUnitIds(u.unit_ids);
                            setEditHeadUnitIds(u.head_unit_ids);
                            setEditActive(u.is_active);
                          }}
                          className="rounded border border-slate-200 px-2.5 py-1 font-medium hover:bg-slate-50"
                        >
                          Atur Role
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingUser && isSuperAdmin && (
            <form onSubmit={handleSaveUserRole} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 text-xs">
              <div className="font-display text-sm font-bold text-slate-900">
                Pengaturan Role & Unit: {editingUser.full_name}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-slate-700">Role Sistem</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
                  >
                    <option value="user">User / Pemesan</option>
                    <option value="kepala_unit">Kepala Unit</option>
                    <option value="admin_resources">Admin Resources</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Unit Penugasan (Multi-Unit)</label>
                  <div className="mt-1 max-h-28 overflow-y-auto rounded border border-slate-200 p-2 space-y-1">
                    {units.map((un) => (
                      <label key={un.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editUnitIds.includes(un.id)}
                          onChange={(e) =>
                            setEditUnitIds((prev) =>
                              e.target.checked ? [...prev, un.id] : prev.filter((x) => x !== un.id)
                            )
                          }
                        />
                        <span>{un.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {editRole === 'kepala_unit' && (
                  <div>
                    <label className="block font-semibold text-slate-700">Unit Tanggung Jawab Kepala Unit</label>
                    <div className="mt-1 max-h-28 overflow-y-auto rounded border border-slate-200 p-2 space-y-1">
                      {units.map((un) => (
                        <label key={un.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editHeadUnitIds.includes(un.id)}
                            onChange={(e) =>
                              setEditHeadUnitIds((prev) =>
                                e.target.checked ? [...prev, un.id] : prev.filter((x) => x !== un.id)
                              )
                            }
                          />
                          <span>{un.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                <span>Akun Aktif</span>
              </label>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-[#1755CE] px-4 py-2 font-semibold text-white hover:bg-[#1244A8]">
                  Simpan Perubahan
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border border-slate-200 px-4 py-2">
                  Batal
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* C. Master Layanan */}
      {tab === 'services' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Layanan</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3 text-right">Estimasi SLA</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono font-semibold">{s.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.description}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{s.sla_estimate_minutes} mnt</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${s.is_active ? 'text-emerald-700' : 'text-red-700'}`}>
                      {s.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleUpdateService(s)}
                        className="rounded border border-slate-200 px-2.5 py-1 font-medium hover:bg-slate-50"
                      >
                        {s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* D. Master Lokasi */}
      {tab === 'locations' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveLocation} className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-5 space-y-3 text-xs">
            <h3 className="font-display text-sm font-bold text-slate-900">Tambah / Ubah Lokasi Layanan</h3>
            <div>
              <label className="font-semibold text-slate-700">Kode Lokasi *</label>
              <input type="text" required value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} placeholder="LOC-SD-02" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Gedung *</label>
              <input type="text" required value={locForm.building} onChange={(e) => setLocForm({ ...locForm, building: e.target.value })} placeholder="Gedung Utama" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700">Lantai *</label>
                <input type="text" required value={locForm.floor} onChange={(e) => setLocForm({ ...locForm, floor: e.target.value })} placeholder="Lantai 2" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Ruangan *</label>
                <input type="text" required value={locForm.room} onChange={(e) => setLocForm({ ...locForm, room: e.target.value })} placeholder="Ruang Guru" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-700">Unit Terkait</label>
              <select value={locForm.unit_id} onChange={(e) => setLocForm({ ...locForm, unit_id: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-3 py-2">
                <option value="">-- Umum --</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#1755CE] py-2 font-semibold text-white hover:bg-[#1244A8]">
              Simpan Lokasi
            </button>
          </form>

          <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Gedung</th>
                  <th className="px-4 py-3">Lantai</th>
                  <th className="px-4 py-3">Ruangan</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{l.code}</td>
                    <td className="px-4 py-3">{l.building}</td>
                    <td className="px-4 py-3">{l.floor}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{l.room}</td>
                    <td className="px-4 py-3">{l.unit_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${l.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {l.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
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
