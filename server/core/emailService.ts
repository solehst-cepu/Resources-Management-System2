import nodemailer from 'nodemailer';
import { getEnvConfig } from './env.ts';
import { MONTH_NAMES_ID, formatIdNumber } from '../../src/shared/calculations.ts';

export interface MonthlyPhotocopyEmailPayload {
  recipientEmail: string;
  recipientName: string;
  unitName: string;
  periodMonth: number;
  periodYear: number;
  totalOrders: number;
  totalBwSides: number;
  totalColorSides: number;
  totalSheets: number;
  byRequester: Array<{
    requesterName: string;
    orders: number;
    bwSides: number;
    colorSides: number;
    sheets: number;
  }>;
}

export function buildMonthlyPhotocopyEmailHtml(payload: MonthlyPhotocopyEmailPayload): string {
  const monthLabel = MONTH_NAMES_ID[payload.periodMonth - 1] || String(payload.periodMonth);

  const requesterRows =
    payload.byRequester.length === 0
      ? `<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;border-bottom:1px solid #e2e8f0;">Tidak ada transaksi fotokopi pada periode ini.</td></tr>`
      : payload.byRequester
          .map(
            (r) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${escapeHtml(r.requesterName)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;">${formatIdNumber(r.orders)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;">${formatIdNumber(r.bwSides)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;">${formatIdNumber(r.colorSides)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;font-size:13px;">${formatIdNumber(r.sheets)}</td>
          </tr>`
          )
          .join('');

  return `
  <!doctype html>
  <html lang="id">
    <body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'DM Sans',Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <div style="background:#1755CE;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.04em;opacity:0.9;">LAZUARDI RESOURCES MANAGEMENT SYSTEM</div>
          <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;">Laporan Bulanan Penggunaan Fotokopi Unit</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
            Yth. Bapak/Ibu <strong>${escapeHtml(payload.recipientName || 'Kepala Unit')}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">
            Berikut ringkasan penggunaan layanan fotokopi untuk unit <strong>${escapeHtml(payload.unitName)}</strong> periode <strong>${monthLabel} ${payload.periodYear}</strong>. Laporan ini dikirim otomatis tanpa lampiran file dokumen demi keamanan berkas sekolah.
          </p>

          <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr>
              <td style="padding:12px;border:1px solid #e2e8f0;background:#f8fafc;width:25%;">
                <div style="font-size:11px;color:#64748b;">Total Order</div>
                <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${formatIdNumber(payload.totalOrders)}</div>
              </td>
              <td style="padding:12px;border:1px solid #e2e8f0;background:#f8fafc;width:25%;">
                <div style="font-size:11px;color:#64748b;">Sisi Hitam Putih</div>
                <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${formatIdNumber(payload.totalBwSides)}</div>
              </td>
              <td style="padding:12px;border:1px solid #e2e8f0;background:#f8fafc;width:25%;">
                <div style="font-size:11px;color:#64748b;">Sisi Warna</div>
                <div style="font-size:18px;font-weight:700;color:#1755CE;margin-top:4px;">${formatIdNumber(payload.totalColorSides)}</div>
              </td>
              <td style="padding:12px;border:1px solid #e2e8f0;background:#f8fafc;width:25%;">
                <div style="font-size:11px;color:#64748b;">Total Lembar Kertas</div>
                <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${formatIdNumber(payload.totalSheets)}</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size:14px;font-weight:600;margin:0 0 10px;color:#0f172a;">Rekapitulasi per Pemesan</h2>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Nama Pemesan</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Order</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Sisi B/W</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Sisi Warna</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Total Lembar</th>
              </tr>
            </thead>
            <tbody>
              ${requesterRows}
            </tbody>
          </table>

          <p style="margin:20px 0 0;font-size:12px;color:#64748b;">
            Untuk rincian lengkap per nomor order serta ekspor Excel/PDF, silakan masuk ke portal LRMS menggunakan akun Google @lazuardi.sch.id Anda.
          </p>
        </div>
      </div>
    </body>
  </html>`;
}

export async function sendMonthlyPhotocopyEmail(
  payload: MonthlyPhotocopyEmailPayload
): Promise<{ ok: boolean; provider: string; error?: string }> {
  const cfg = getEnvConfig();
  const monthLabel = MONTH_NAMES_ID[payload.periodMonth - 1] || String(payload.periodMonth);
  const subject = `[LRMS] Laporan Penggunaan Fotokopi ${payload.unitName} — ${monthLabel} ${payload.periodYear}`;
  const html = buildMonthlyPhotocopyEmailHtml(payload);

  if (!cfg.emailConfigured) {
    return {
      ok: false,
      provider: 'unconfigured',
      error: 'Konfigurasi layanan email server-side (RESEND_API_KEY atau SMTP_HOST/SMTP_USER/SMTP_PASS) belum diatur.',
    };
  }

  try {
    if (cfg.resendApiKey) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: cfg.emailFrom,
          to: [payload.recipientEmail],
          subject,
          html,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, provider: 'resend', error: `Resend HTTP ${resp.status}: ${text}` };
      }
      return { ok: true, provider: 'resend' };
    }

    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: {
        user: cfg.smtpUser,
        pass: cfg.smtpPass,
      },
    });
    await transporter.sendMail({
      from: cfg.emailFrom,
      to: payload.recipientEmail,
      subject,
      html,
    });
    return { ok: true, provider: 'smtp' };
  } catch (err) {
    return {
      ok: false,
      provider: cfg.resendApiKey ? 'resend' : 'smtp',
      error: err instanceof Error ? err.message : 'Gagal mengirim email laporan.',
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
