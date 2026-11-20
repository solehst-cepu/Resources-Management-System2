import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Boxes,
  Check,
  ClipboardList,
  Copy,
  Database,
  Droplets,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Printer,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import { ROLE_LABELS, formatIdDateTime } from '../../shared/calculations';
import type { NotificationItem } from '../../shared/types';

export type NavRouteId =
  | 'dashboard'
  | 'order_gallon'
  | 'order_photocopy'
  | 'order_laminating'
  | 'my_orders'
  | 'order_management'
  | 'inventory_gallon'
  | 'unit_photocopy_report'
  | 'reports_analytics'
  | 'master_data'
  | 'settings_audit';

interface NavGroup {
  label: string;
  items: Array<{
    id: NavRouteId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles: Array<'super_admin' | 'admin_resources' | 'kepala_unit' | 'user'>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Utama',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        roles: ['super_admin', 'admin_resources', 'kepala_unit', 'user'],
      },
      {
        id: 'my_orders',
        label: 'Pesanan Saya',
        icon: ClipboardList,
        roles: ['super_admin', 'admin_resources', 'kepala_unit', 'user'],
      },
    ],
  },
  {
    label: 'Layanan Operasional',
    items: [
      {
        id: 'order_gallon',
        label: 'Air Galon',
        icon: Droplets,
        roles: ['super_admin', 'admin_resources', 'kepala_unit', 'user'],
      },
      {
        id: 'order_photocopy',
        label: 'Fotokopi',
        icon: Printer,
        roles: ['super_admin', 'admin_resources', 'kepala_unit', 'user'],
      },
      {
        id: 'order_laminating',
        label: 'Laminating',
        icon: Layers,
        roles: ['super_admin', 'admin_resources', 'kepala_unit', 'user'],
      },
    ],
  },
  {
    label: 'Manajemen Resources',
    items: [
      {
        id: 'order_management',
        label: 'Order Management',
        icon: Copy,
        roles: ['super_admin', 'admin_resources'],
      },
      {
        id: 'inventory_gallon',
        label: 'Inventory Air Galon',
        icon: Boxes,
        roles: ['super_admin', 'admin_resources'],
      },
    ],
  },
  {
    label: 'Pelaporan & Analitik',
    items: [
      {
        id: 'unit_photocopy_report',
        label: 'Laporan Fotokopi Unit',
        icon: FileText,
        roles: ['super_admin', 'admin_resources', 'kepala_unit'],
      },
      {
        id: 'reports_analytics',
        label: 'Reports & Analytics',
        icon: BarChart3,
        roles: ['super_admin', 'admin_resources'],
      },
    ],
  },
  {
    label: 'Administrasi Sistem',
    items: [
      {
        id: 'master_data',
        label: 'Master Data',
        icon: Database,
        roles: ['super_admin', 'admin_resources'],
      },
      {
        id: 'settings_audit',
        label: 'Pengaturan & Audit Log',
        icon: Settings,
        roles: ['super_admin'],
      },
    ],
  },
];

const ROUTE_TITLES: Record<NavRouteId, string> = {
  dashboard: 'Dashboard Operasional',
  my_orders: 'Riwayat & Status Pesanan Saya',
  order_gallon: 'Air Galon — Buat Permintaan',
  order_photocopy: 'Fotokopi — Buat Permintaan',
  order_laminating: 'Laminating — Buat Permintaan',
  order_management: 'Order Management',
  inventory_gallon: 'Inventory — Air Galon',
  unit_photocopy_report: 'Laporan Penggunaan Fotokopi Unit',
  reports_analytics: 'Reports & Analytics',
  master_data: 'Master Data Operasional',
  settings_audit: 'Pengaturan Sistem & Audit Log',
};

export function AppShell({
  activeRoute,
  onNavigate,
  children,
}: {
  activeRoute: NavRouteId;
  onNavigate: (route: NavRouteId) => void;
  children: React.ReactNode;
}) {
  const { user, configStatus, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const loadNotifications = async () => {
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/notifications');
      setNotifications(res.notifications || []);
    } catch {
      // ignore transient notification errors
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, activeRoute]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    await apiFetch('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notificationId: 'ALL' }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  if (!user) return null;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <img
          src="/src/assets/images/lazuardi_emblem_1795154206471.jpg"
          alt="Logo Lazuardi"
          referrerPolicy="no-referrer"
          className="h-9 w-9 shrink-0 rounded-md object-contain border border-slate-200 bg-white"
        />
        <div className="min-w-0">
          <div className="font-display text-sm font-bold tracking-tight text-slate-900 truncate">
            Lazuardi LRMS
          </div>
          <div className="text-[11px] text-slate-500 truncate">One Portal, All Resources</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((it) => it.roles.includes(user.role));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeRoute === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id);
                        setMobileOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#1755CE] text-white'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</div>
        <div className="mt-0.5 text-[11px] text-slate-500 truncate">
          {ROLE_LABELS[user.role]} · {user.email}
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 w-72 max-w-[85vw]">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        {/* Top Header Bar */}
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu navigasi"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Divisi Resources</span>
                <span aria-hidden="true">/</span>
                <span className="truncate font-medium text-slate-900">{ROUTE_TITLES[activeRoute]}</span>
              </div>
              <h1 className="font-display text-base font-bold text-slate-900 truncate">
                {ROUTE_TITLES[activeRoute]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifikasi"
                className="relative flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Bell className="h-4 w-4 text-slate-600" />
                <span className="hidden sm:inline">Notifikasi</span>
                {unreadCount > 0 && (
                  <span className="ml-0.5 font-mono text-[11px] font-semibold text-[#1755CE] tabular-nums">
                    ({unreadCount})
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-lg border border-slate-200 bg-white shadow-lg z-40">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-900">Notifikasi</span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#1755CE] hover:underline"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Tandai dibaca</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Belum ada notifikasi baru.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 text-xs ${n.is_read ? 'bg-white' : 'bg-blue-50/40'}`}
                        >
                          <div className="font-semibold text-slate-900">{n.title}</div>
                          <p className="mt-0.5 text-slate-600 leading-relaxed">{n.message}</p>
                          <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                            {formatIdDateTime(n.created_at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Honest Environment Banner when Supabase is unconfigured */}
        {configStatus && !configStatus.supabaseConfigured && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
            <span className="font-semibold">Mode Pengembangan Lokal:</span> Kredensial Supabase produksi belum
            dikonfigurasi pada environment. Data sementara disimpan secara persisten di server lokal. Atur{' '}
            <code className="font-mono font-medium">VITE_SUPABASE_URL</code>,{' '}
            <code className="font-mono font-medium">VITE_SUPABASE_ANON_KEY</code>, dan{' '}
            <code className="font-mono font-medium">SUPABASE_SERVICE_ROLE_KEY</code> untuk mengaktifkan Google SSO &
            Supabase PostgreSQL.
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
