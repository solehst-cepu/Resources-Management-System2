import crypto from 'node:crypto';
import type { UserProfile } from '../../src/shared/types.ts';
import { getEnvConfig } from './env.ts';

export const SANDBOX_COOKIE_NAME = 'lrms_sandbox_session';

export function isAllowedSchoolEmail(email: string, allowedDomain?: string): boolean {
  const cfg = getEnvConfig();
  const domain = (allowedDomain || cfg.allowedEmailDomain).toLowerCase().trim();
  const normalized = (email || '').toLowerCase().trim();
  const parts = normalized.split('@');
  return parts.length === 2 && parts[1] === domain && parts[0].length > 0;
}

export function signSandboxToken(userId: string): string {
  const { sessionSecret } = getEnvConfig();
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySandboxToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || Number.isNaN(exp) || Date.now() > exp) return null;
  const { sessionSecret } = getEnvConfig();
  const expected = crypto
    .createHmac('sha256', sessionSecret)
    .update(`${userId}.${expStr}`)
    .digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    return userId;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    result[k] = decodeURIComponent(v);
  }
  return result;
}

export function signFileAccessToken(attachmentId: string, userId: string): string {
  const { sessionSecret } = getEnvConfig();
  const exp = Date.now() + 1000 * 60 * 2; // short-lived 2-minute URL
  const payload = `${attachmentId}.${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyFileAccessToken(token: string, attachmentId: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [attId, userId, expStr, sig] = parts;
  if (attId !== attachmentId) return null;
  const exp = Number(expStr);
  if (Number.isNaN(exp) || Date.now() > exp) return null;
  const { sessionSecret } = getEnvConfig();
  const expected = crypto
    .createHmac('sha256', sessionSecret)
    .update(`${attId}.${userId}.${expStr}`)
    .digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

export function canAccessAttachment(user: UserProfile, uploadedBy: string): boolean {
  if (user.role === 'super_admin' || user.role === 'admin_resources') return true;
  return user.id === uploadedBy;
}
