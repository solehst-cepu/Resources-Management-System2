import crypto from 'node:crypto';

export function getEnvConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'fotokopi-documents';
  const allowedEmailDomain = (process.env.ALLOWED_EMAIL_DOMAIN || 'lazuardi.sch.id').toLowerCase().trim();
  const cronSecret = process.env.CRON_SECRET || '';
  const resendApiKey = process.env.RESEND_API_KEY || '';
  const emailFrom = process.env.EMAIL_FROM || 'Divisi Resources Lazuardi <resources@lazuardi.sch.id>';
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = Number(process.env.SMTP_PORT || '587');
  const smtpSecure = process.env.SMTP_SECURE === 'true';
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const sessionSecret =
    process.env.SESSION_SECRET ||
    crypto.createHash('sha256').update(`lrms-fallback-dev-${process.cwd()}`).digest('hex');

  const supabaseConfigured = Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseServiceRoleKey &&
      !supabaseUrl.includes('your-project-ref') &&
      !supabaseServiceRoleKey.includes('your-supabase')
  );

  const emailConfigured = Boolean(resendApiKey || (smtpHost && smtpUser && smtpPass));

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    storageBucket,
    allowedEmailDomain,
    cronSecret,
    resendApiKey,
    emailFrom,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    appUrl,
    sessionSecret,
    supabaseConfigured,
    emailConfigured,
  };
}
