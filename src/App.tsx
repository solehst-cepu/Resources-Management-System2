/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AppShell, type NavRouteId } from './components/layout/AppShell';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { DashboardPage } from './pages/DashboardPage';
import { GallonInventoryPage } from './pages/GallonInventoryPage';
import { GallonOrderPage } from './pages/GallonOrderPage';
import { LaminatingOrderPage } from './pages/LaminatingOrderPage';
import { LoginPage } from './pages/LoginPage';
import { MasterDataPage } from './pages/MasterDataPage';
import { OrderManagementPage } from './pages/OrderManagementPage';
import { PhotocopyOrderPage } from './pages/PhotocopyOrderPage';
import { ReportsAnalyticsPage } from './pages/ReportsAnalyticsPage';
import { SettingsAuditPage } from './pages/SettingsAuditPage';
import { UnitPhotocopyReportPage } from './pages/UnitPhotocopyReportPage';

function AuthenticatedRouter() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<NavRouteId>('dashboard');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="font-display text-base font-bold text-[#1755CE]">
            Lazuardi Resources Management System
          </div>
          <p className="mt-1 text-xs text-slate-500">Memverifikasi sesi pengguna...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppShell activeRoute={route} onNavigate={setRoute}>
      {route === 'dashboard' && <DashboardPage onNavigate={setRoute} />}
      {route === 'my_orders' && <OrderManagementPage onlyMine={true} />}
      {route === 'order_gallon' && <GallonOrderPage onCreated={() => setRoute('my_orders')} />}
      {route === 'order_photocopy' && <PhotocopyOrderPage onCreated={() => setRoute('my_orders')} />}
      {route === 'order_laminating' && <LaminatingOrderPage onCreated={() => setRoute('my_orders')} />}
      {route === 'order_management' && <OrderManagementPage onlyMine={false} />}
      {route === 'inventory_gallon' && <GallonInventoryPage />}
      {route === 'unit_photocopy_report' && <UnitPhotocopyReportPage />}
      {route === 'reports_analytics' && <ReportsAnalyticsPage />}
      {route === 'master_data' && <MasterDataPage />}
      {route === 'settings_audit' && <SettingsAuditPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthenticatedRouter />
      </AuthProvider>
    </ToastProvider>
  );
}
