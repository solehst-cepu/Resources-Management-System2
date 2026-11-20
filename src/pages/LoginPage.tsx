import { AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../shared/calculations';

export function LoginPage() {
  const { configStatus, authError, sandboxAccounts, signInWithGoogle, signInSandbox } = useAuth();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLocalError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal memulai Google SSO.');
    }
  };

  const handleSandboxLogin = async (userId: string) => {
    setLocalError(null);
    setSubmittingId(userId);
    try {
      await signInSandbox(userId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal masuk ke mode evaluasi.');
    } finally {
      setSubmittingId(null);
    }
  };

  const errMsg = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-12">
      {/* Left Institutional Visual Column */}
      <div className="relative hidden lg:flex lg:col-span-7 flex-col justify-between overflow-hidden bg-slate-900">
        <img
          src="/src/assets/images/lazuardi_campus_login_1795154206706.jpg"
          alt="Kampus Sekolah Lazuardi"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/45 to-slate-950/40" />

        <div className="relative z-10 flex items-center gap-3 p-10">
          <img
            src="/src/assets/images/lazuardi_emblem_1795154206471.jpg"
            alt="Emblem Lazuardi"
            referrerPolicy="no-referrer"
            className="h-11 w-11 rounded-lg bg-white p-1 object-contain"
          />
          <div className="text-white">
            <div className="font-display text-lg font-bold tracking-tight">
              LAZUARDI RESOURCES MANAGEMENT SYSTEM
            </div>
            <div className="text-xs text-slate-200">Divisi Resources · Sekolah Lazuardi</div>
          </div>
        </div>

        <div className="relative z-10 p-10 max-w-2xl text-white">
          <h2 className="font-display text-3xl font-bold leading-tight text-balance">
            One Portal, All Resources Services
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-200">
            Platform operasional terpadu untuk pengajuan air galon, penggandaan dokumen fotokopi,
            laminating, kendali stok gudang, serta pelaporan otomatis bulanan bagi Kepala Unit.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-200">
            <span>Autentikasi Google Workspace (@lazuardi.sch.id)</span>
            <span aria-hidden="true">·</span>
            <span>Pencatatan Stok Real-Time</span>
            <span aria-hidden="true">·</span>
            <span>Laporan Unit Terintegrasi</span>
          </div>
        </div>
      </div>

      {/* Right Authentication Column */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:col-span-5 bg-white">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3 lg:hidden mb-8">
            <img
              src="/src/assets/images/lazuardi_emblem_1795154206471.jpg"
              alt="Emblem Lazuardi"
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-lg border border-slate-200 p-1 object-contain"
            />
            <div>
              <div className="font-display text-base font-bold text-slate-900">Lazuardi LRMS</div>
              <div className="text-xs text-slate-500">One Portal, All Resources Services</div>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-slate-900">Masuk ke Portal LRMS</h1>
          <p className="mt-2 text-sm text-slate-600">
            Gunakan akun Google sekolah berakhiran{' '}
            <span className="font-mono font-medium text-slate-900">
              @{configStatus?.allowedDomain || 'lazuardi.sch.id'}
            </span>{' '}
            untuk mengakses layanan Divisi Resources.
          </p>

          {errMsg && (
            <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{errMsg}</span>
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={!configStatus?.supabaseConfigured}
              className={`flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                configStatus?.supabaseConfigured
                  ? 'bg-[#1755CE] text-white hover:bg-[#1244A8]'
                  : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Masuk dengan Google (@{configStatus?.allowedDomain || 'lazuardi.sch.id'})</span>
            </button>
            {!configStatus?.supabaseConfigured && (
              <p className="mt-2 text-xs text-slate-500">
                Tombol Google SSO aktif otomatis setelah variabel{' '}
                <code className="font-mono">VITE_SUPABASE_URL</code>,{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>, dan{' '}
                <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> dikonfigurasi.
              </p>
            )}
          </div>

          {/* Local Evaluation Mode when Supabase is not yet configured */}
          {configStatus && !configStatus.supabaseConfigured && sandboxAccounts.length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="text-xs font-semibold text-slate-900">
                Mode Evaluasi Lokal (Pilih Peran Pengujian)
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Karena environment Supabase belum terhubung, Anda dapat menguji seluruh alur kerja LRMS
                berdasarkan peran melalui sesi server lokal berikut:
              </p>

              <div className="mt-3 space-y-2">
                {sandboxAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={submittingId === acc.id}
                    onClick={() => handleSandboxLogin(acc.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left hover:border-[#1755CE] hover:bg-blue-50/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{acc.full_name}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {ROLE_LABELS[acc.role]} · {acc.email}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-slate-200 pt-5 text-xs text-slate-500">
            Kebijakan Keamanan: Hak akses peran ditentukan oleh database server dan dilindungi Row
            Level Security. Akun di luar domain sekolah otomatis ditolak.
          </div>
        </div>
      </div>
    </div>
  );
}
