import fs from 'node:fs';
import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import type { OrderStatus, ServiceCode, StockType, UserProfile, UserRole } from '../../src/shared/types.ts';
import {
  SANDBOX_COOKIE_NAME,
  parseCookies,
  signFileAccessToken,
  signSandboxToken,
  verifyFileAccessToken,
  verifySandboxToken,
} from './auth.ts';
import type { LrmsBackend } from './backendTypes.ts';
import { getEnvConfig } from './env.ts';
import { LocalSandboxBackend } from './localSandboxStore.ts';
import { SupabaseBackend } from './supabaseBackend.ts';

function getBackend(): LrmsBackend {
  const cfg = getEnvConfig();
  return cfg.supabaseConfigured ? new SupabaseBackend() : new LocalSandboxBackend();
}

async function authenticateRequest(req: Request, backend: LrmsBackend): Promise<UserProfile | null> {
  const cfg = getEnvConfig();
  const authHeader = req.headers.authorization;
  if (cfg.supabaseConfigured) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return backend.resolveUserFromToken(token);
  }
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SANDBOX_COOKIE_NAME];
  if (!raw) return null;
  const userId = verifySandboxToken(raw);
  if (!userId) return null;
  return backend.getUserById(userId);
}

function sendError(res: Response, err: unknown, status = 400) {
  const msg = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
  const lower = msg.toLowerCase();
  const code =
    lower.includes('ditolak') ||
    lower.includes('berwenang') ||
    lower.includes('hanya') ||
    lower.includes('tidak memiliki izin') ||
    lower.includes('dibatasi')
      ? 403
      : status;
  res.status(code).json({ error: msg });
}

export function createApiRouter(): Router {
  const router = express.Router();
  router.use(express.json({ limit: '22mb' }));

  // System config status (public metadata only, zero secrets)
  router.get('/system/config-status', (_req, res) => {
    const cfg = getEnvConfig();
    res.json({
      supabaseConfigured: cfg.supabaseConfigured,
      emailConfigured: cfg.emailConfigured,
      allowedDomain: cfg.allowedEmailDomain,
      mode: cfg.supabaseConfigured ? 'supabase' : 'local_sandbox',
    });
  });

  // Sandbox role switcher accounts (ONLY active when Supabase env is unconfigured)
  router.get('/auth/sandbox-accounts', async (_req, res) => {
    const cfg = getEnvConfig();
    if (cfg.supabaseConfigured) {
      return res.status(404).json({ error: 'Sandbox mode tidak tersedia saat mode produksi aktif.' });
    }
    const backend = getBackend();
    const users = await backend.getSandboxUsers?.();
    res.json({ users: users || [] });
  });

  router.post('/auth/sandbox-login', async (req, res) => {
    const cfg = getEnvConfig();
    if (cfg.supabaseConfigured) {
      return res.status(403).json({ error: 'Gunakan Google SSO (@lazuardi.sch.id) pada mode produksi.' });
    }
    const schema = z.object({ userId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'User ID tidak valid.' });

    const backend = getBackend();
    const user = await backend.getUserById(parsed.data.userId);
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    const token = signSandboxToken(user.id);
    res.cookie(SANDBOX_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 1000 * 60 * 60 * 12,
      path: '/',
    });
    res.json({ user });
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(SANDBOX_COOKIE_NAME, { sameSite: 'none', secure: true, path: '/' });
    res.json({ ok: true });
  });

  router.get('/auth/me', async (req, res) => {
    try {
      const backend = getBackend();
      const user = await authenticateRequest(req, backend);
      if (!user) return res.status(401).json({ error: 'Sesi tidak ditemukan atau belum masuk.' });
      res.json({ user });
    } catch (err) {
      sendError(res, err, 403);
    }
  });

  // Protected attachment download via short-lived HMAC token (Local Sandbox Mode)
  router.get('/files/download/:attachmentId', async (req, res) => {
    try {
      const token = String(req.query.token || '');
      const userId = verifyFileAccessToken(token, req.params.attachmentId);
      if (!userId) return res.status(403).json({ error: 'Tautan unduhan kadaluarsa atau tidak valid.' });
      const backend = getBackend();
      const found = await backend.getAttachmentByIdDirect?.(req.params.attachmentId);
      if (!found || !fs.existsSync(found.localFilePath)) {
        return res.status(404).json({ error: 'File dokumen tidak ditemukan.' });
      }
      res.setHeader('Content-Type', found.attachment.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(found.attachment.file_name)}"`);
      fs.createReadStream(found.localFilePath).pipe(res);
    } catch (err) {
      sendError(res, err, 403);
    }
  });

  // Scheduled Monthly Photocopy Report Cron Endpoint (Vercel Cron / Authenticated Admin)
  router.all('/cron/monthly-photocopy-reports', async (req, res) => {
    try {
      const cfg = getEnvConfig();
      const backend = getBackend();
      const cronHeader = req.headers.authorization;
      const isCronValid = cfg.cronSecret && cronHeader === `Bearer ${cfg.cronSecret}`;
      const actor = isCronValid ? null : await authenticateRequest(req, backend);

      if (!isCronValid && (!actor || (actor.role !== 'super_admin' && actor.role !== 'admin_resources'))) {
        return res.status(401).json({ error: 'Unauthorized cron execution.' });
      }

      const now = new Date();
      const month = Number(req.query.month || req.body?.month || now.getMonth() + 1);
      const year = Number(req.query.year || req.body?.year || now.getFullYear());
      const unitId = (req.query.unitId || req.body?.unitId) as string | undefined;
      const forceResend = Boolean(req.body?.forceResend);

      const logs = await backend.dispatchMonthlyPhotocopyReports(actor, { month, year, unitId, forceResend });
      res.json({ logs });
    } catch (err) {
      sendError(res, err, 400);
    }
  });

  // All remaining routes require authenticated school user
  router.use(async (req, res, next) => {
    try {
      const backend = getBackend();
      const user = await authenticateRequest(req, backend);
      if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan. Silakan masuk dengan akun @lazuardi.sch.id.' });
      (req as Request & { user: UserProfile; backend: LrmsBackend }).user = user;
      (req as Request & { user: UserProfile; backend: LrmsBackend }).backend = backend;
      next();
    } catch (err) {
      sendError(res, err, 403);
    }
  });

  const ctx = (req: Request) => req as Request & { user: UserProfile; backend: LrmsBackend };

  // Dashboard
  router.get('/dashboard', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const data = await backend.getDashboard(user);
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Master Data
  router.get('/master/bootstrap', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const includeInactive = req.query.includeInactive === 'true';
      const [units, services, locations] = await Promise.all([
        backend.listUnits(includeInactive),
        backend.listServices(),
        backend.listLocations(includeInactive),
      ]);
      let invLocations: unknown[] = [];
      let balances: unknown[] = [];
      if (user.role === 'super_admin' || user.role === 'admin_resources') {
        const inv = await backend.getInventoryOverview(user);
        invLocations = inv.locations;
        balances = inv.balances;
      }
      res.json({ units, services, locations, inventoryLocations: invLocations, inventoryBalances: balances });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/master/units', async (req, res) => {
    try {
      const schema = z.object({
        id: z.string().optional(),
        code: z.string().min(2).max(16),
        name: z.string().min(2).max(120),
        category: z.string().default('Akademik'),
        head_user_id: z.string().nullable().optional(),
        head_name: z.string().optional().default(''),
        head_email: z.string().optional().default(''),
        is_active: z.boolean().optional().default(true),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const saved = await backend.upsertUnit(user, parsed);
      res.json({ unit: saved });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/master/users', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const users = await backend.listUsers(user);
      res.json({ users });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/master/users/:userId', async (req, res) => {
    try {
      const schema = z.object({
        role: z.enum(['super_admin', 'admin_resources', 'kepala_unit', 'user']),
        unitIds: z.array(z.string()),
        primaryUnitId: z.string().nullable(),
        headUnitIds: z.array(z.string()),
        isActive: z.boolean(),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const updated = await backend.updateUserRoleAndUnits(user, req.params.userId, parsed as {
        role: UserRole;
        unitIds: string[];
        primaryUnitId: string | null;
        headUnitIds: string[];
        isActive: boolean;
      });
      res.json({ user: updated });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/master/services/:code', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const saved = await backend.upsertService(user, {
        ...req.body,
        code: req.params.code as ServiceCode,
      });
      res.json({ service: saved });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/master/locations', async (req, res) => {
    try {
      const schema = z.object({
        id: z.string().optional(),
        code: z.string().min(2),
        building: z.string().min(1),
        floor: z.string().min(1),
        room: z.string().min(1),
        unit_id: z.string().nullable().optional(),
        is_active: z.boolean().optional().default(true),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const saved = await backend.upsertLocation(user, parsed);
      res.json({ location: saved });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const settings = await backend.getSettings(user);
      res.json({ settings });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/settings', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const settings = await backend.updateSettings(user, req.body);
      res.json({ settings });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Orders
  router.get('/orders', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const result = await backend.listOrders(user, {
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 10),
        search: req.query.search ? String(req.query.search) : undefined,
        serviceCode: (req.query.serviceCode as ServiceCode | 'ALL') || 'ALL',
        status: (req.query.status as OrderStatus | 'ALL' | 'ACTIVE_QUEUE') || 'ALL',
        unitId: req.query.unitId ? String(req.query.unitId) : 'ALL',
        dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
        dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
        sortBy: (req.query.sortBy as 'created_at' | 'needed_date' | 'order_number') || 'created_at',
        sortDir: (req.query.sortDir as 'asc' | 'desc') || 'desc',
        onlyMine: req.query.onlyMine === 'true',
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/orders/:id', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const order = await backend.getOrderById(user, req.params.id);
      if (!order) return res.status(404).json({ error: 'Order tidak ditemukan.' });
      res.json({ order });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/orders/gallon', async (req, res) => {
    try {
      const schema = z.object({
        unitId: z.string().min(1),
        locationId: z.string().nullable(),
        locationLabel: z.string().min(2),
        requestedQty: z.number().int().min(1).max(50),
        emptyExchangeQty: z.number().int().min(0).max(50),
        neededDate: z.string().min(8),
        neededTime: z.string().nullable().optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const order = await backend.createGallonOrder(user, parsed);
      res.status(201).json({ order });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/orders/photocopy', async (req, res) => {
    try {
      const schema = z.object({
        unitId: z.string().min(1),
        docName: z.string().min(2),
        pageCount: z.number().int().min(1).max(2000),
        copyCount: z.number().int().min(1).max(1000),
        paperSize: z.enum(['A4', 'F4', 'A3', 'Lainnya']),
        printColor: z.enum(['Hitam Putih', 'Warna']),
        isDuplex: z.boolean(),
        finishingNotes: z.string().optional(),
        neededDate: z.string().min(8),
        notes: z.string().optional(),
        attachment: z
          .object({
            fileName: z.string().min(1),
            mimeType: z.string().min(1),
            sizeBytes: z.number().int().positive().max(15728640),
            base64Content: z.string().min(1),
          })
          .nullable()
          .optional(),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const order = await backend.createPhotocopyOrder(user, parsed);
      res.status(201).json({ order });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/orders/laminating', async (req, res) => {
    try {
      const schema = z.object({
        unitId: z.string().min(1),
        docName: z.string().min(2),
        laminatingSize: z.enum(['A4', 'F4', 'A3', 'ID Card', 'Custom']),
        sheetCount: z.number().int().min(1).max(500),
        laminatingType: z.string().min(2),
        neededDate: z.string().min(8),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const order = await backend.createLaminatingOrder(user, parsed);
      res.status(201).json({ order });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/orders/:id/status', async (req, res) => {
    try {
      const schema = z.object({
        status: z.enum([
          'Menunggu Diproses',
          'Diproses',
          'Dalam Pengiriman',
          'Siap Diambil',
          'Selesai',
          'Dibatalkan',
        ]),
        internalNotes: z.string().optional(),
        cancelReason: z.string().optional(),
        actualQty: z.number().int().min(0).optional(),
        assigneeId: z.string().nullable().optional(),
        note: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const order = await backend.updateOrderStatus(user, req.params.id, parsed);
      res.json({ order });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/orders/:id/confirm-gallon-delivery', async (req, res) => {
    try {
      const schema = z.object({
        locationId: z.string().min(1),
        actualFilledSent: z.number().int().min(0).max(200),
        emptyReceived: z.number().int().min(0).max(200),
        note: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const order = await backend.confirmGallonDelivery(user, req.params.id, parsed);
      res.json({ order });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/attachments/:id/signed-url', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const info = await backend.getAttachmentDownloadInfo(user, req.params.id);
      if (info.signedUrl) {
        return res.json({ url: info.signedUrl, fileName: info.attachment.file_name });
      }
      const token = signFileAccessToken(info.attachment.id, user.id);
      res.json({
        url: `/api/files/download/${info.attachment.id}?token=${encodeURIComponent(token)}`,
        fileName: info.attachment.file_name,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Inventory Air Galon
  router.get('/inventory/overview', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const data = await backend.getInventoryOverview(user);
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/inventory/transactions', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const data = await backend.listInventoryTransactions(user, {
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 15),
        locationId: req.query.locationId ? String(req.query.locationId) : 'ALL',
        txType: req.query.txType ? String(req.query.txType) : 'ALL',
        dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
        dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
      });
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/inventory/receipts', async (req, res) => {
    try {
      const schema = z.object({
        receiptDate: z.string().min(8),
        supplier: z.string().min(2),
        locationId: z.string().min(1),
        qtyFilled: z.number().int().min(0),
        qtyEmpty: z.number().int().min(0),
        documentNo: z.string().optional().default(''),
        notes: z.string().optional().default(''),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const receipt = await backend.recordGallonReceipt(user, parsed);
      res.status(201).json({ receipt });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/inventory/empty-returns', async (req, res) => {
    try {
      const schema = z.object({
        locationId: z.string().min(1),
        qtyEmpty: z.number().int().min(1),
        unitId: z.string().optional(),
        referenceNo: z.string().optional().default(''),
        notes: z.string().optional().default(''),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const tx = await backend.recordEmptyReturn(user, parsed);
      res.status(201).json({ transaction: tx });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/inventory/adjustments', async (req, res) => {
    try {
      const schema = z.object({
        locationId: z.string().min(1),
        stockType: z.enum(['filled', 'empty', 'damaged', 'lost']),
        qtyDelta: z.number().int().refine((v) => v !== 0, 'Selisih tidak boleh 0'),
        reason: z.string().min(3),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const tx = await backend.recordManualAdjustment(user, parsed as {
        locationId: string;
        stockType: StockType;
        qtyDelta: number;
        reason: string;
      });
      res.status(201).json({ transaction: tx });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/inventory/opname/draft', async (req, res) => {
    try {
      const schema = z.object({
        opnameId: z.string().optional(),
        opnameDate: z.string().min(8),
        locationId: z.string().min(1),
        notes: z.string().optional().default(''),
        items: z.array(
          z.object({
            stockType: z.enum(['filled', 'empty', 'damaged', 'lost']),
            physicalQty: z.number().int().min(0),
            varianceReason: z.string().optional().default(''),
            notes: z.string().optional(),
          })
        ),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const opname = await backend.createOrUpdateOpnameDraft(user, parsed);
      res.json({ opname });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/inventory/opname/:id/finalize', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const opname = await backend.finalizeStockOpname(user, req.params.id);
      res.json({ opname });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Reports
  router.get('/reports/unit-photocopy', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const now = new Date();
      const month = Number(req.query.month || now.getMonth() + 1);
      const year = Number(req.query.year || now.getFullYear());
      const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
      const report = await backend.getUnitPhotocopyReport(user, { unitId, month, year });
      res.json(report);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/reports/delivery-logs', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const logs = await backend.listReportDeliveryLogs(user, month, year);
      res.json({ logs });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/reports/dispatch-monthly', async (req, res) => {
    try {
      const schema = z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2024).max(2100),
        unitId: z.string().optional(),
        forceResend: z.boolean().optional().default(false),
      });
      const parsed = schema.parse(req.body);
      const { user, backend } = ctx(req);
      const logs = await backend.dispatchMonthlyPhotocopyReports(user, parsed);
      res.json({ logs });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/reports/analytics', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const data = await backend.getAnalyticsReport(user, {
        reportType: String(req.query.reportType || 'service_performance'),
        dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
        dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
        unitId: req.query.unitId ? String(req.query.unitId) : undefined,
        serviceCode: req.query.serviceCode ? String(req.query.serviceCode) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Notifications & Audit Logs
  router.get('/notifications', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const notifications = await backend.listNotifications(user);
      res.json({ notifications });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/notifications/read', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      await backend.markNotificationRead(user, req.body?.notificationId || 'ALL');
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/audit-logs', async (req, res) => {
    try {
      const { user, backend } = ctx(req);
      const data = await backend.listAuditLogs(
        user,
        Number(req.query.page || 1),
        Number(req.query.pageSize || 20)
      );
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
