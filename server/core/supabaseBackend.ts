import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppSettingsMap,
  AuditLogEntry,
  InventoryBalance,
  InventoryLocation,
  InventoryReceipt,
  InventoryTransaction,
  LocationItem,
  NotificationItem,
  OrderAttachment,
  OrderRecord,
  OrderStatus,
  PaginatedResponse,
  ReportDeliveryLog,
  ServiceCatalogItem,
  ServiceCode,
  StockOpnameRecord,
  StockType,
  Unit,
  UserProfile,
  UserRole,
} from '../../src/shared/types.ts';
import {
  MONTH_NAMES_ID,
  calculateAvailableGallons,
  calculatePhotocopyMetrics,
} from '../../src/shared/calculations.ts';
import { isAllowedSchoolEmail } from './auth.ts';
import type {
  CreateGallonOrderInput,
  CreateLaminatingOrderInput,
  CreatePhotocopyOrderInput,
  DashboardSummary,
  LrmsBackend,
  OrderFilterParams,
  PhotocopyReportResponse,
} from './backendTypes.ts';
import { sendMonthlyPhotocopyEmail } from './emailService.ts';
import { getEnvConfig } from './env.ts';

export class SupabaseBackend implements LrmsBackend {
  private client: SupabaseClient;
  private storageBucket: string;
  private allowedDomain: string;

  constructor() {
    const cfg = getEnvConfig();
    this.client = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.storageBucket = cfg.storageBucket;
    this.allowedDomain = cfg.allowedEmailDomain;
  }

  async resolveUserFromToken(token: string): Promise<UserProfile | null> {
    if (!token) return null;
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) return null;

    const authUser = data.user;
    const email = (authUser.email || '').toLowerCase().trim();
    if (!isAllowedSchoolEmail(email, this.allowedDomain)) {
      throw new Error(`Akses ditolak: hanya akun Google resmi @${this.allowedDomain} yang diizinkan.`);
    }

    const fullName =
      (authUser.user_metadata?.full_name as string) ||
      (authUser.user_metadata?.name as string) ||
      email.split('@')[0];
    const avatarUrl = (authUser.user_metadata?.avatar_url as string) || null;

    // Ensure profile exists and update last_login_at
    await this.client.from('profiles').upsert(
      {
        id: authUser.id,
        email,
        full_name: fullName,
        avatar_url: avatarUrl,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    // Ensure default role = 'user' if not yet assigned
    const { data: existingRole } = await this.client
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (!existingRole) {
      await this.client.from('user_roles').insert({ user_id: authUser.id, role: 'user' });
    }

    return this.getUserById(authUser.id);
  }

  async getUserById(userId: string): Promise<UserProfile | null> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('id, email, full_name, avatar_url, phone, is_active, last_login_at')
      .eq('id', userId)
      .maybeSingle();
    if (!profile || !profile.is_active) return null;

    const [{ data: roleRow }, { data: unitRows }, { data: headUnits }] = await Promise.all([
      this.client.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      this.client
        .from('user_unit_assignments')
        .select('unit_id, is_primary, is_unit_head')
        .eq('user_id', userId),
      this.client.from('units').select('id').eq('head_user_id', userId),
    ]);

    const assignments = unitRows || [];
    const unitIds = assignments.map((a) => a.unit_id as string);
    const primaryUnit = assignments.find((a) => a.is_primary)?.unit_id ?? unitIds[0] ?? null;
    const headSet = new Set<string>([
      ...assignments.filter((a) => a.is_unit_head).map((a) => a.unit_id as string),
      ...(headUnits || []).map((u) => u.id as string),
    ]);

    return {
      id: profile.id as string,
      email: profile.email as string,
      full_name: profile.full_name as string,
      avatar_url: profile.avatar_url as string | null,
      phone: profile.phone as string | null,
      role: ((roleRow?.role as UserRole) || 'user'),
      is_active: Boolean(profile.is_active),
      unit_ids: unitIds,
      primary_unit_id: primaryUnit,
      head_unit_ids: Array.from(headSet),
      last_login_at: profile.last_login_at as string | null,
    };
  }

  async getDashboard(actor: UserProfile): Promise<DashboardSummary> {
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    let orderQuery = this.client
      .from('orders')
      .select(
        'id, order_number, service_code, requester_id, requester_name, requester_email, unit_id, unit_name, location_label, status, needed_date, created_at, updated_at, order_items(requested_qty, actual_qty, print_color, print_sides_total, paper_sheets_total, doc_name)'
      )
      .order('created_at', { ascending: false })
      .limit(300);

    if (!isAdmin) {
      if (actor.role === 'kepala_unit' && actor.head_unit_ids.length > 0) {
        orderQuery = orderQuery.or(
          `requester_id.eq.${actor.id},and(service_code.eq.FOTOKOPI,unit_id.in.(${actor.head_unit_ids.join(',')}))`
        );
      } else {
        orderQuery = orderQuery.eq('requester_id', actor.id);
      }
    }

    const [{ data: ordersRaw }, { data: balancesRaw }, { data: settingsRow }, { data: txRaw }] =
      await Promise.all([
        orderQuery,
        this.client
          .from('inventory_balances')
          .select(
            'id, item_id, location_id, qty_filled, qty_empty, qty_damaged, qty_lost, qty_allocated, updated_at, inventory_locations(name, code), inventory_items(min_stock_threshold)'
          ),
        this.client
          .from('app_settings')
          .select('value_json')
          .eq('key', 'min_gallon_stock_alert')
          .maybeSingle(),
        this.client
          .from('inventory_transactions')
          .select('tx_type, qty_filled_delta, qty_empty_delta, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

    const orders = (ordersRaw || []).map((row) => this.mapOrderRow(row));
    const today = new Date().toISOString().slice(0, 10);
    const threshold = Number(settingsRow?.value_json ?? 15);

    let totalFilledGallons = 0;
    let totalEmptyGallons = 0;
    let totalDamagedGallons = 0;
    let totalLostGallons = 0;
    const lowStockLocations: DashboardSummary['lowStockLocations'] = [];

    for (const b of balancesRaw || []) {
      const filled = Number(b.qty_filled || 0);
      const allocated = Number(b.qty_allocated || 0);
      const avail = calculateAvailableGallons(filled, allocated);
      totalFilledGallons += filled;
      totalEmptyGallons += Number(b.qty_empty || 0);
      totalDamagedGallons += Number(b.qty_damaged || 0);
      totalLostGallons += Number(b.qty_lost || 0);
      const locObj = Array.isArray(b.inventory_locations) ? b.inventory_locations[0] : b.inventory_locations;
      if (avail <= threshold) {
        lowStockLocations.push({
          locationName: (locObj as { name?: string })?.name || 'Gudang',
          qtyFilled: filled,
          availableFilled: avail,
          threshold,
        });
      }
    }

    const trendByDay: DashboardSummary['trendByDay'] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
      const dayOrders = orders.filter((o) => o.created_at.slice(0, 10) === d);
      trendByDay.push({
        date: d.slice(5),
        gallon: dayOrders.filter((o) => o.service_code === 'AIR_GALON').length,
        photocopy: dayOrders.filter((o) => o.service_code === 'FOTOKOPI').length,
        laminating: dayOrders.filter((o) => o.service_code === 'LAMINATING').length,
      });
    }

    const gallonByMonthMap = new Map<string, { distributed: number; emptyReturned: number }>();
    for (const tx of txRaw || []) {
      if (tx.tx_type === 'DISTRIBUTION' || tx.tx_type === 'EMPTY_RETURN') {
        const m = String(tx.created_at).slice(0, 7);
        const cur = gallonByMonthMap.get(m) ?? { distributed: 0, emptyReturned: 0 };
        cur.distributed += Math.abs(Math.min(0, Number(tx.qty_filled_delta || 0)));
        cur.emptyReturned += Math.max(0, Number(tx.qty_empty_delta || 0));
        gallonByMonthMap.set(m, cur);
      }
    }

    const fcpMonthMap = new Map<string, { bwSides: number; colorSides: number; sheets: number }>();
    for (const o of orders) {
      if (o.service_code === 'FOTOKOPI' && o.status !== 'Dibatalkan' && o.item) {
        const m = o.created_at.slice(0, 7);
        const cur = fcpMonthMap.get(m) ?? { bwSides: 0, colorSides: 0, sheets: 0 };
        const sides = o.item.print_sides_total ?? 0;
        if (o.item.print_color === 'Warna') cur.colorSides += sides;
        else cur.bwSides += sides;
        cur.sheets += o.item.paper_sheets_total ?? 0;
        fcpMonthMap.set(m, cur);
      }
    }

    const unitCounts = new Map<string, number>();
    for (const o of orders) {
      unitCounts.set(o.unit_name, (unitCounts.get(o.unit_name) ?? 0) + 1);
    }

    return {
      ordersToday: orders.filter((o) => o.created_at.slice(0, 10) === today).length,
      ordersNew: orders.filter((o) => o.status === 'Menunggu Diproses').length,
      ordersInProgress: orders.filter(
        (o) => o.status === 'Diproses' || o.status === 'Dalam Pengiriman' || o.status === 'Siap Diambil'
      ).length,
      ordersCompleted: orders.filter((o) => o.status === 'Selesai').length,
      ordersCancelled: orders.filter((o) => o.status === 'Dibatalkan').length,
      totalGallonOrders: orders.filter((o) => o.service_code === 'AIR_GALON').length,
      totalPhotocopyOrders: orders.filter((o) => o.service_code === 'FOTOKOPI').length,
      totalLaminatingOrders: orders.filter((o) => o.service_code === 'LAMINATING').length,
      totalFilledGallons,
      totalEmptyGallons,
      totalDamagedGallons,
      totalLostGallons,
      minStockThreshold: threshold,
      lowStockLocations,
      trendByDay,
      gallonUsageByMonth: Array.from(gallonByMonthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v })),
      photocopyByMonth: Array.from(fcpMonthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v })),
      ordersByUnit: Array.from(unitCounts.entries()).map(([unitName, count]) => ({ unitName, count })),
      recentOrders: orders.slice(0, 8),
      pendingWorkOrders: orders.filter((o) => o.status !== 'Selesai' && o.status !== 'Dibatalkan').slice(0, 8),
    };
  }

  async listUnits(includeInactive = false): Promise<Unit[]> {
    let q = this.client
      .from('units')
      .select('id, code, name, category, head_user_id, head_name, head_email, is_active, created_at')
      .order('name', { ascending: true });
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as Unit[];
  }

  async upsertUnit(actor: UserProfile, data: Partial<Unit> & { code: string; name: string }): Promise<Unit> {
    if (actor.role !== 'super_admin') throw new Error('Hanya Super Admin yang dapat mengelola unit.');
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      code: data.code.toUpperCase().trim(),
      name: data.name.trim(),
      category: data.category || 'Akademik',
      head_user_id: data.head_user_id ?? null,
      head_name: data.head_name || '',
      head_email: data.head_email || '',
      is_active: data.is_active ?? true,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await this.client.from('units').upsert(payload).select().single();
    if (error) throw new Error(error.message);
    await this.logAudit(actor, data.id ? 'UPDATE_UNIT' : 'CREATE_UNIT', 'units', saved.id, payload);
    return saved as Unit;
  }

  async listUsers(actor: UserProfile): Promise<UserProfile[]> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses ditolak.');
    }
    const [{ data: profiles }, { data: roles }, { data: assigns }] = await Promise.all([
      this.client.from('profiles').select('id, email, full_name, avatar_url, phone, is_active, last_login_at').order('full_name'),
      this.client.from('user_roles').select('user_id, role'),
      this.client.from('user_unit_assignments').select('user_id, unit_id, is_primary, is_unit_head'),
    ]);

    const roleMap = new Map((roles || []).map((r) => [r.user_id as string, r.role as UserRole]));
    return (profiles || []).map((p) => {
      const uAssigns = (assigns || []).filter((a) => a.user_id === p.id);
      return {
        id: p.id as string,
        email: p.email as string,
        full_name: p.full_name as string,
        avatar_url: p.avatar_url as string | null,
        phone: p.phone as string | null,
        role: roleMap.get(p.id as string) || 'user',
        is_active: Boolean(p.is_active),
        unit_ids: uAssigns.map((a) => a.unit_id as string),
        primary_unit_id: (uAssigns.find((a) => a.is_primary)?.unit_id as string) ?? (uAssigns[0]?.unit_id as string) ?? null,
        head_unit_ids: uAssigns.filter((a) => a.is_unit_head).map((a) => a.unit_id as string),
        last_login_at: p.last_login_at as string | null,
      };
    });
  }

  async updateUserRoleAndUnits(
    actor: UserProfile,
    targetUserId: string,
    payload: { role: UserRole; unitIds: string[]; primaryUnitId: string | null; headUnitIds: string[]; isActive: boolean }
  ): Promise<UserProfile> {
    if (actor.role !== 'super_admin') throw new Error('Hanya Super Admin yang berwenang mengubah role.');
    await this.client.from('profiles').update({ is_active: payload.isActive }).eq('id', targetUserId);
    await this.client
      .from('user_roles')
      .upsert({ user_id: targetUserId, role: payload.role, assigned_by: actor.id }, { onConflict: 'user_id' });

    await this.client.from('user_unit_assignments').delete().eq('user_id', targetUserId);
    if (payload.unitIds.length > 0) {
      await this.client.from('user_unit_assignments').insert(
        payload.unitIds.map((uid) => ({
          user_id: targetUserId,
          unit_id: uid,
          is_primary: uid === payload.primaryUnitId,
          is_unit_head: payload.role === 'kepala_unit' && payload.headUnitIds.includes(uid),
        }))
      );
    }

    await this.logAudit(actor, 'UPDATE_USER_ROLE', 'user_roles', targetUserId, payload);
    const updated = await this.getUserById(targetUserId);
    if (!updated) throw new Error('User tidak ditemukan.');
    return updated;
  }

  async listServices(): Promise<ServiceCatalogItem[]> {
    const { data, error } = await this.client
      .from('service_catalog')
      .select('id, code, name, description, is_active, sla_estimate_minutes, config_json')
      .order('name');
    if (error) throw new Error(error.message);
    return (data || []) as ServiceCatalogItem[];
  }

  async upsertService(
    actor: UserProfile,
    data: Partial<ServiceCatalogItem> & { code: ServiceCode }
  ): Promise<ServiceCatalogItem> {
    if (actor.role !== 'super_admin') throw new Error('Hanya Super Admin yang dapat mengubah layanan.');
    const { data: saved, error } = await this.client
      .from('service_catalog')
      .update({
        name: data.name,
        description: data.description,
        is_active: data.is_active,
        sla_estimate_minutes: data.sla_estimate_minutes,
        updated_at: new Date().toISOString(),
      })
      .eq('code', data.code)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return saved as ServiceCatalogItem;
  }

  async listLocations(includeInactive = false): Promise<LocationItem[]> {
    let q = this.client
      .from('locations')
      .select('id, code, building, floor, room, unit_id, is_active, units(name)')
      .order('building');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map((row) => {
      const uObj = Array.isArray(row.units) ? row.units[0] : row.units;
      return {
        id: row.id as string,
        code: row.code as string,
        building: row.building as string,
        floor: row.floor as string,
        room: row.room as string,
        unit_id: row.unit_id as string | null,
        unit_name: (uObj as { name?: string })?.name,
        is_active: Boolean(row.is_active),
      };
    });
  }

  async upsertLocation(
    actor: UserProfile,
    data: Partial<LocationItem> & { code: string; building: string; floor: string; room: string }
  ): Promise<LocationItem> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      code: data.code.toUpperCase().trim(),
      building: data.building.trim(),
      floor: data.floor.trim(),
      room: data.room.trim(),
      unit_id: data.unit_id ?? null,
      is_active: data.is_active ?? true,
    };
    const { data: saved, error } = await this.client.from('locations').upsert(payload).select().single();
    if (error) throw new Error(error.message);
    return saved as LocationItem;
  }

  async getSettings(): Promise<AppSettingsMap> {
    const { data } = await this.client.from('app_settings').select('key, value_json');
    const map: Record<string, unknown> = {};
    for (const row of data || []) map[row.key as string] = row.value_json;
    return {
      allowed_domain: String(map.allowed_domain || 'lazuardi.sch.id'),
      min_gallon_stock_alert: Number(map.min_gallon_stock_alert ?? 15),
      attachment_retention_days: Number(map.attachment_retention_days ?? 90),
      monthly_report_day: Number(map.monthly_report_day ?? 1),
    };
  }

  async updateSettings(actor: UserProfile, settings: Partial<AppSettingsMap>): Promise<AppSettingsMap> {
    if (actor.role !== 'super_admin') throw new Error('Hanya Super Admin yang dapat mengubah pengaturan.');
    for (const [key, val] of Object.entries(settings)) {
      await this.client
        .from('app_settings')
        .upsert({ key, value_json: val, updated_by: actor.id, updated_at: new Date().toISOString() });
    }
    await this.logAudit(actor, 'UPDATE_SETTINGS', 'app_settings', 'global', settings as Record<string, unknown>);
    return this.getSettings();
  }

  async listOrders(actor: UserProfile, filter: OrderFilterParams): Promise<PaginatedResponse<OrderRecord>> {
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(50, Math.max(5, filter.pageSize || 10));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = this.client
      .from('orders')
      .select(
        'id, order_number, service_code, requester_id, requester_name, requester_email, unit_id, unit_name, location_id, location_label, status, needed_date, needed_time, notes, internal_notes, cancel_reason, cancelled_at, completed_at, created_at, updated_at, order_items(*), order_assignments(assignee_id, assignee_name)',
        { count: 'exact' }
      );

    if (filter.onlyMine || (!isAdmin && actor.role !== 'kepala_unit')) {
      q = q.eq('requester_id', actor.id);
    } else if (actor.role === 'kepala_unit') {
      if (actor.head_unit_ids.length > 0) {
        q = q.or(
          `requester_id.eq.${actor.id},and(service_code.eq.FOTOKOPI,unit_id.in.(${actor.head_unit_ids.join(',')}))`
        );
      } else {
        q = q.eq('requester_id', actor.id);
      }
    }

    if (filter.serviceCode && filter.serviceCode !== 'ALL') q = q.eq('service_code', filter.serviceCode);
    if (filter.status && filter.status !== 'ALL') {
      if (filter.status === 'ACTIVE_QUEUE') {
        q = q.not('status', 'in', '("Selesai","Dibatalkan")');
      } else {
        q = q.eq('status', filter.status);
      }
    }
    if (filter.unitId && filter.unitId !== 'ALL') q = q.eq('unit_id', filter.unitId);
    if (filter.dateFrom) q = q.gte('created_at', `${filter.dateFrom}T00:00:00.000Z`);
    if (filter.dateTo) q = q.lte('created_at', `${filter.dateTo}T23:59:59.999Z`);
    if (filter.search) {
      const s = filter.search.replace(/[%_]/g, '');
      q = q.or(`order_number.ilike.%${s}%,requester_name.ilike.%${s}%,unit_name.ilike.%${s}%`);
    }

    const sortBy = filter.sortBy || 'created_at';
    const ascending = filter.sortDir === 'asc';
    q = q.order(sortBy, { ascending }).range(from, to);

    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    const total = count ?? 0;
    return {
      items: (data || []).map((r) => this.mapOrderRow(r)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getOrderById(actor: UserProfile, orderId: string): Promise<OrderRecord | null> {
    const { data, error } = await this.client
      .from('orders')
      .select('*, order_items(*), order_status_history(*), order_attachments(*), order_assignments(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (error || !data) return null;

    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    const isHeadAllowed =
      actor.role === 'kepala_unit' &&
      data.service_code === 'FOTOKOPI' &&
      actor.head_unit_ids.includes(data.unit_id as string);

    if (!isAdmin && data.requester_id !== actor.id && !isHeadAllowed) {
      throw new Error('Akses detail order ditolak.');
    }

    const mapped = this.mapOrderRow(data);
    if (actor.role === 'kepala_unit' && data.requester_id !== actor.id) {
      mapped.attachments = [];
    }
    return mapped;
  }

  async createGallonOrder(actor: UserProfile, input: CreateGallonOrderInput): Promise<OrderRecord> {
    const { data: unit } = await this.client.from('units').select('id, name').eq('id', input.unitId).single();
    if (!unit) throw new Error('Unit tidak ditemukan.');

    const { data: balances } = await this.client
      .from('inventory_balances')
      .select('id, qty_filled, qty_allocated');
    const totalAvailable = (balances || []).reduce(
      (acc, b) => acc + calculateAvailableGallons(Number(b.qty_filled), Number(b.qty_allocated)),
      0
    );
    if (totalAvailable < input.requestedQty) {
      throw new Error(`Stok galon isi tersedia saat ini ${totalAvailable} galon.`);
    }

    const { data: orderNumber, error: seqErr } = await this.client.rpc('generate_order_number', {
      p_service_code: 'AIR_GALON',
    });
    if (seqErr) throw new Error(seqErr.message);

    const { data: order, error } = await this.client
      .from('orders')
      .insert({
        order_number: orderNumber,
        service_code: 'AIR_GALON',
        requester_id: actor.id,
        requester_name: actor.full_name,
        requester_email: actor.email,
        unit_id: unit.id,
        unit_name: unit.name,
        location_id: input.locationId,
        location_label: input.locationLabel,
        status: 'Menunggu Diproses',
        needed_date: input.neededDate,
        needed_time: input.neededTime || null,
        notes: input.notes || '',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await this.client.from('order_items').insert({
      order_id: order.id,
      item_type: 'AIR_GALON',
      requested_qty: input.requestedQty,
      empty_exchange_qty: input.emptyExchangeQty,
    });

    if (balances && balances[0]) {
      await this.client
        .from('inventory_balances')
        .update({ qty_allocated: Number(balances[0].qty_allocated) + input.requestedQty })
        .eq('id', balances[0].id);
    }

    await this.client.from('order_status_history').insert({
      order_id: order.id,
      to_status: 'Menunggu Diproses',
      changed_by: actor.id,
      changed_by_name: actor.full_name,
      note: `Permintaan ${input.requestedQty} galon masuk antrean Resources.`,
    });

    await this.notifyNewOrder(order.id, orderNumber as string, 'AIR_GALON', actor, unit.name as string);
    return (await this.getOrderById(actor, order.id as string))!;
  }

  async createPhotocopyOrder(actor: UserProfile, input: CreatePhotocopyOrderInput): Promise<OrderRecord> {
    const { data: unit } = await this.client.from('units').select('id, name').eq('id', input.unitId).single();
    if (!unit) throw new Error('Unit tidak ditemukan.');

    const calc = calculatePhotocopyMetrics(input.pageCount, input.copyCount, input.isDuplex);
    const { data: orderNumber, error: seqErr } = await this.client.rpc('generate_order_number', {
      p_service_code: 'FOTOKOPI',
    });
    if (seqErr) throw new Error(seqErr.message);

    const { data: order, error } = await this.client
      .from('orders')
      .insert({
        order_number: orderNumber,
        service_code: 'FOTOKOPI',
        requester_id: actor.id,
        requester_name: actor.full_name,
        requester_email: actor.email,
        unit_id: unit.id,
        unit_name: unit.name,
        location_label: `Unit ${unit.name}`,
        status: 'Menunggu Diproses',
        needed_date: input.neededDate,
        notes: input.notes || '',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await this.client.from('order_items').insert({
      order_id: order.id,
      item_type: 'FOTOKOPI',
      requested_qty: calc.copyCount,
      actual_qty: calc.copyCount,
      doc_name: input.docName,
      page_count: calc.pageCount,
      copy_count: calc.copyCount,
      paper_size: input.paperSize,
      print_color: input.printColor,
      is_duplex: calc.isDuplex,
      print_sides_total: calc.printSidesTotal,
      paper_sheets_total: calc.paperSheetsTotal,
      finishing_notes: input.finishingNotes || '',
    });

    if (input.attachment) {
      const safeName = input.attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${actor.id}/${order.id}_${safeName}`;
      const buf = Buffer.from(input.attachment.base64Content, 'base64');
      const { error: upErr } = await this.client.storage
        .from(this.storageBucket)
        .upload(storagePath, buf, { contentType: input.attachment.mimeType, upsert: false });
      if (upErr) throw new Error(`Gagal unggah dokumen: ${upErr.message}`);

      await this.client.from('order_attachments').insert({
        order_id: order.id,
        bucket_name: this.storageBucket,
        storage_path: storagePath,
        file_name: input.attachment.fileName,
        mime_type: input.attachment.mimeType,
        file_size_bytes: input.attachment.sizeBytes,
        uploaded_by: actor.id,
      });
    }

    await this.client.from('order_status_history').insert({
      order_id: order.id,
      to_status: 'Menunggu Diproses',
      changed_by: actor.id,
      changed_by_name: actor.full_name,
      note: `Order fotokopi (${calc.printSidesTotal} sisi, ${calc.paperSheetsTotal} lembar) dibuat.`,
    });

    await this.notifyNewOrder(order.id, orderNumber as string, 'FOTOKOPI', actor, unit.name as string);
    return (await this.getOrderById(actor, order.id as string))!;
  }

  async createLaminatingOrder(actor: UserProfile, input: CreateLaminatingOrderInput): Promise<OrderRecord> {
    const { data: unit } = await this.client.from('units').select('id, name').eq('id', input.unitId).single();
    if (!unit) throw new Error('Unit tidak ditemukan.');

    const { data: orderNumber, error: seqErr } = await this.client.rpc('generate_order_number', {
      p_service_code: 'LAMINATING',
    });
    if (seqErr) throw new Error(seqErr.message);

    const { data: order, error } = await this.client
      .from('orders')
      .insert({
        order_number: orderNumber,
        service_code: 'LAMINATING',
        requester_id: actor.id,
        requester_name: actor.full_name,
        requester_email: actor.email,
        unit_id: unit.id,
        unit_name: unit.name,
        location_label: `Unit ${unit.name}`,
        status: 'Menunggu Diproses',
        needed_date: input.neededDate,
        notes: input.notes || '',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await this.client.from('order_items').insert({
      order_id: order.id,
      item_type: 'LAMINATING',
      requested_qty: input.sheetCount,
      actual_qty: input.sheetCount,
      doc_name: input.docName,
      laminating_size: input.laminatingSize,
      laminating_type: input.laminatingType,
    });

    await this.client.from('order_status_history').insert({
      order_id: order.id,
      to_status: 'Menunggu Diproses',
      changed_by: actor.id,
      changed_by_name: actor.full_name,
      note: `Permintaan laminating ${input.sheetCount} lembar (${input.laminatingSize}) dibuat.`,
    });

    await this.notifyNewOrder(order.id, orderNumber as string, 'LAMINATING', actor, unit.name as string);
    return (await this.getOrderById(actor, order.id as string))!;
  }

  async updateOrderStatus(
    actor: UserProfile,
    orderId: string,
    payload: {
      status: OrderStatus;
      internalNotes?: string;
      cancelReason?: string;
      actualQty?: number;
      assigneeId?: string | null;
      note?: string;
    }
  ): Promise<OrderRecord> {
    const existing = await this.getOrderById(actor, orderId);
    if (!existing) throw new Error('Order tidak ditemukan.');
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    if (!isAdmin) {
      if (existing.requester_id !== actor.id || payload.status !== 'Dibatalkan' || existing.status !== 'Menunggu Diproses') {
        throw new Error('Tidak memiliki izin mengubah status order ini.');
      }
    }
    if (existing.service_code === 'AIR_GALON' && payload.status === 'Selesai') {
      throw new Error('Order Air Galon wajib diselesaikan melalui Konfirmasi Pengiriman & Mutasi Stok.');
    }

    const updateObj: Record<string, unknown> = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    };
    if (typeof payload.internalNotes === 'string') updateObj.internal_notes = payload.internalNotes;
    if (payload.status === 'Dibatalkan') {
      updateObj.cancel_reason = payload.cancelReason || 'Dibatalkan';
      updateObj.cancelled_at = new Date().toISOString();
    }
    if (payload.status === 'Selesai') updateObj.completed_at = new Date().toISOString();

    await this.client.from('orders').update(updateObj).eq('id', orderId);

    if (typeof payload.actualQty === 'number' && existing.item) {
      const itemUpdate: Record<string, unknown> = { actual_qty: payload.actualQty };
      if (existing.service_code === 'FOTOKOPI' && existing.item.page_count) {
        const calc = calculatePhotocopyMetrics(existing.item.page_count, payload.actualQty, existing.item.is_duplex);
        itemUpdate.copy_count = calc.copyCount;
        itemUpdate.print_sides_total = calc.printSidesTotal;
        itemUpdate.paper_sheets_total = calc.paperSheetsTotal;
      }
      await this.client.from('order_items').update(itemUpdate).eq('order_id', orderId);
    }

    if (payload.assigneeId) {
      const staff = await this.getUserById(payload.assigneeId);
      if (staff) {
        await this.client.from('order_assignments').upsert(
          { order_id: orderId, assignee_id: staff.id, assignee_name: staff.full_name, assigned_by: actor.id },
          { onConflict: 'order_id' }
        );
      }
    }

    await this.client.from('order_status_history').insert({
      order_id: orderId,
      from_status: existing.status,
      to_status: payload.status,
      changed_by: actor.id,
      changed_by_name: actor.full_name,
      note: payload.note || `Status diubah menjadi ${payload.status}`,
    });

    await this.client.from('notifications').insert({
      user_id: existing.requester_id,
      title: `Status Order ${existing.order_number}: ${payload.status}`,
      message: `Permintaan Anda kini berstatus ${payload.status}.`,
      type: payload.status === 'Dibatalkan' ? 'error' : payload.status === 'Selesai' ? 'success' : 'info',
      related_order_id: orderId,
    });

    return (await this.getOrderById(actor, orderId))!;
  }

  async confirmGallonDelivery(
    actor: UserProfile,
    orderId: string,
    payload: { locationId: string; actualFilledSent: number; emptyReceived: number; note?: string }
  ): Promise<OrderRecord> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses konfirmasi pengiriman hanya untuk Admin Resources.');
    }
    const { error } = await this.client.rpc('rpc_confirm_gallon_delivery', {
      p_order_id: orderId,
      p_location_id: payload.locationId,
      p_actual_filled_sent: payload.actualFilledSent,
      p_empty_received: payload.emptyReceived,
      p_actor_id: actor.id,
      p_actor_name: actor.full_name,
      p_note: payload.note || '',
    });
    if (error) throw new Error(error.message);
    await this.logAudit(actor, 'CONFIRM_GALLON_DELIVERY', 'orders', orderId, payload);
    return (await this.getOrderById(actor, orderId))!;
  }

  async getAttachmentDownloadInfo(
    actor: UserProfile,
    attachmentId: string
  ): Promise<{ attachment: OrderAttachment; signedUrl?: string }> {
    const { data: att, error } = await this.client
      .from('order_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single();
    if (error || !att) throw new Error('Lampiran tidak ditemukan.');
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin_resources';
    if (!isAdmin && att.uploaded_by !== actor.id) {
      throw new Error('Akses berkas dibatasi hanya untuk pemesan dan petugas Resources.');
    }
    const { data: signed, error: signErr } = await this.client.storage
      .from(att.bucket_name as string)
      .createSignedUrl(att.storage_path as string, 60);
    if (signErr) throw new Error(signErr.message);
    return { attachment: att as OrderAttachment, signedUrl: signed.signedUrl };
  }

  async getInventoryOverview(actor: UserProfile) {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses inventaris ditolak.');
    }
    const [{ data: locs }, { data: bals }, { data: rcvs }, { data: opnames }, txPage] = await Promise.all([
      this.client.from('inventory_locations').select('*').eq('is_active', true),
      this.client
        .from('inventory_balances')
        .select('*, inventory_locations(name, code), inventory_items(min_stock_threshold)'),
      this.client
        .from('inventory_receipts')
        .select('*, inventory_locations(name)')
        .order('created_at', { ascending: false })
        .limit(50),
      this.client
        .from('inventory_stock_opnames')
        .select('*, inventory_locations(name), inventory_stock_opname_items(*)')
        .order('created_at', { ascending: false })
        .limit(30),
      this.listInventoryTransactions(actor, { page: 1, pageSize: 15 }),
    ]);

    const balances: InventoryBalance[] = (bals || []).map((b) => {
      const l = Array.isArray(b.inventory_locations) ? b.inventory_locations[0] : b.inventory_locations;
      const it = Array.isArray(b.inventory_items) ? b.inventory_items[0] : b.inventory_items;
      return {
        id: b.id as string,
        item_id: b.item_id as string,
        location_id: b.location_id as string,
        location_name: (l as { name?: string })?.name || '-',
        location_code: (l as { code?: string })?.code || '-',
        qty_filled: Number(b.qty_filled),
        qty_empty: Number(b.qty_empty),
        qty_damaged: Number(b.qty_damaged),
        qty_lost: Number(b.qty_lost),
        qty_allocated: Number(b.qty_allocated),
        available_filled: calculateAvailableGallons(Number(b.qty_filled), Number(b.qty_allocated)),
        min_stock_threshold: Number((it as { min_stock_threshold?: number })?.min_stock_threshold ?? 15),
        updated_at: b.updated_at as string,
      };
    });

    const receipts: InventoryReceipt[] = (rcvs || []).map((r) => {
      const l = Array.isArray(r.inventory_locations) ? r.inventory_locations[0] : r.inventory_locations;
      return {
        ...(r as unknown as InventoryReceipt),
        location_name: (l as { name?: string })?.name || '-',
      };
    });

    const mappedOpnames: StockOpnameRecord[] = (opnames || []).map((o) => {
      const l = Array.isArray(o.inventory_locations) ? o.inventory_locations[0] : o.inventory_locations;
      return {
        ...(o as unknown as StockOpnameRecord),
        location_name: (l as { name?: string })?.name || '-',
        items: (o.inventory_stock_opname_items || []) as StockOpnameRecord['items'],
      };
    });

    return {
      locations: (locs || []) as InventoryLocation[],
      balances,
      receipts,
      opnames: mappedOpnames,
      transactions: txPage,
      monthlyTrend: [],
    };
  }

  async listInventoryTransactions(
    actor: UserProfile,
    params: { page: number; pageSize: number; locationId?: string; txType?: string; dateFrom?: string; dateTo?: string }
  ): Promise<PaginatedResponse<InventoryTransaction>> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(5, params.pageSize || 15));
    const from = (page - 1) * pageSize;

    let q = this.client
      .from('inventory_transactions')
      .select('*, inventory_locations(name)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (params.locationId && params.locationId !== 'ALL') q = q.eq('location_id', params.locationId);
    if (params.txType && params.txType !== 'ALL') q = q.eq('tx_type', params.txType);
    if (params.dateFrom) q = q.gte('created_at', `${params.dateFrom}T00:00:00.000Z`);
    if (params.dateTo) q = q.lte('created_at', `${params.dateTo}T23:59:59.999Z`);

    const { data, count, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const total = count ?? 0;

    return {
      items: (data || []).map((t) => {
        const l = Array.isArray(t.inventory_locations) ? t.inventory_locations[0] : t.inventory_locations;
        return {
          ...(t as unknown as InventoryTransaction),
          location_name: (l as { name?: string })?.name || '-',
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async recordGallonReceipt(
    actor: UserProfile,
    payload: { receiptDate: string; supplier: string; locationId: string; qtyFilled: number; qtyEmpty: number; documentNo: string; notes: string }
  ): Promise<InventoryReceipt> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const { data: bal } = await this.client
      .from('inventory_balances')
      .select('id, item_id, qty_filled, qty_empty')
      .eq('location_id', payload.locationId)
      .single();
    if (!bal) throw new Error('Lokasi gudang tidak ditemukan.');

    const rcvNo = `RCV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const { data: rcv, error } = await this.client
      .from('inventory_receipts')
      .insert({
        receipt_number: rcvNo,
        receipt_date: payload.receiptDate,
        supplier: payload.supplier,
        location_id: payload.locationId,
        qty_filled: payload.qtyFilled,
        qty_empty: payload.qtyEmpty,
        document_no: payload.documentNo,
        notes: payload.notes,
        created_by: actor.id,
        created_by_name: actor.full_name,
      })
      .select('*, inventory_locations(name)')
      .single();
    if (error) throw new Error(error.message);

    await this.client
      .from('inventory_balances')
      .update({
        qty_filled: Number(bal.qty_filled) + payload.qtyFilled,
        qty_empty: Number(bal.qty_empty) + payload.qtyEmpty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bal.id);

    await this.client.from('inventory_transactions').insert({
      tx_number: `TX-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      tx_type: 'RECEIPT',
      item_id: bal.item_id,
      location_id: payload.locationId,
      qty_filled_delta: payload.qtyFilled,
      qty_empty_delta: payload.qtyEmpty,
      reference_no: rcvNo,
      supplier_name: payload.supplier,
      actor_id: actor.id,
      actor_name: actor.full_name,
      notes: payload.notes,
    });

    return rcv as unknown as InventoryReceipt;
  }

  async recordEmptyReturn(
    actor: UserProfile,
    payload: { locationId: string; qtyEmpty: number; unitId?: string; referenceNo: string; notes: string }
  ): Promise<InventoryTransaction> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const { data: bal } = await this.client
      .from('inventory_balances')
      .select('id, item_id, qty_empty')
      .eq('location_id', payload.locationId)
      .single();
    if (!bal) throw new Error('Lokasi stok tidak ditemukan.');

    await this.client
      .from('inventory_balances')
      .update({ qty_empty: Number(bal.qty_empty) + payload.qtyEmpty, updated_at: new Date().toISOString() })
      .eq('id', bal.id);

    const { data: tx, error } = await this.client
      .from('inventory_transactions')
      .insert({
        tx_number: `TX-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        tx_type: 'EMPTY_RETURN',
        item_id: bal.item_id,
        location_id: payload.locationId,
        qty_empty_delta: payload.qtyEmpty,
        reference_no: payload.referenceNo,
        actor_id: actor.id,
        actor_name: actor.full_name,
        notes: payload.notes,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return tx as unknown as InventoryTransaction;
  }

  async recordManualAdjustment(
    actor: UserProfile,
    payload: { locationId: string; stockType: StockType; qtyDelta: number; reason: string }
  ): Promise<InventoryTransaction> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const { data: bal } = await this.client
      .from('inventory_balances')
      .select('*')
      .eq('location_id', payload.locationId)
      .single();
    if (!bal) throw new Error('Lokasi tidak ditemukan.');

    const col = `qty_${payload.stockType}`;
    const nextVal = Number(bal[col]) + payload.qtyDelta;
    if (nextVal < 0) throw new Error('Stok tidak boleh menjadi negatif.');

    await this.client.from('inventory_balances').update({ [col]: nextVal, updated_at: new Date().toISOString() }).eq('id', bal.id);

    const { data: tx, error } = await this.client
      .from('inventory_transactions')
      .insert({
        tx_number: `TX-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        tx_type: 'MANUAL_ADJUSTMENT',
        item_id: bal.item_id,
        location_id: payload.locationId,
        [`qty_${payload.stockType}_delta`]: payload.qtyDelta,
        reference_no: `ADJ-${payload.stockType.toUpperCase()}`,
        actor_id: actor.id,
        actor_name: actor.full_name,
        notes: payload.reason,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return tx as unknown as InventoryTransaction;
  }

  async createOrUpdateOpnameDraft(
    actor: UserProfile,
    payload: {
      opnameId?: string;
      opnameDate: string;
      locationId: string;
      notes: string;
      items: Array<{ stockType: StockType; physicalQty: number; varianceReason: string; notes?: string }>;
    }
  ): Promise<StockOpnameRecord> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const { data: bal } = await this.client
      .from('inventory_balances')
      .select('qty_filled, qty_empty, qty_damaged, qty_lost')
      .eq('location_id', payload.locationId)
      .single();
    if (!bal) throw new Error('Lokasi tidak ditemukan.');

    const sysByType: Record<StockType, number> = {
      filled: Number(bal.qty_filled),
      empty: Number(bal.qty_empty),
      damaged: Number(bal.qty_damaged),
      lost: Number(bal.qty_lost),
    };

    let opnameId = payload.opnameId;
    if (!opnameId) {
      const opNo = `OPN-${new Date().toISOString().slice(0, 7).replace('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const { data: created, error } = await this.client
        .from('inventory_stock_opnames')
        .insert({
          opname_number: opNo,
          opname_date: payload.opnameDate,
          location_id: payload.locationId,
          status: 'Draft',
          inspector_id: actor.id,
          inspector_name: actor.full_name,
          notes: payload.notes,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      opnameId = created.id as string;
    } else {
      await this.client
        .from('inventory_stock_opnames')
        .update({ opname_date: payload.opnameDate, notes: payload.notes, updated_at: new Date().toISOString() })
        .eq('id', opnameId)
        .eq('status', 'Draft');
      await this.client.from('inventory_stock_opname_items').delete().eq('opname_id', opnameId);
    }

    await this.client.from('inventory_stock_opname_items').insert(
      payload.items.map((it) => ({
        opname_id: opnameId,
        stock_type: it.stockType,
        system_qty: sysByType[it.stockType],
        physical_qty: it.physicalQty,
        variance_qty: it.physicalQty - sysByType[it.stockType],
        variance_reason: it.varianceReason,
        notes: it.notes || '',
      }))
    );

    const { data: full } = await this.client
      .from('inventory_stock_opnames')
      .select('*, inventory_locations(name), inventory_stock_opname_items(*)')
      .eq('id', opnameId)
      .single();
    const l = Array.isArray(full?.inventory_locations) ? full?.inventory_locations[0] : full?.inventory_locations;
    return {
      ...(full as unknown as StockOpnameRecord),
      location_name: (l as { name?: string })?.name || '-',
      items: (full?.inventory_stock_opname_items || []) as StockOpnameRecord['items'],
    };
  }

  async finalizeStockOpname(actor: UserProfile, opnameId: string): Promise<StockOpnameRecord> {
    if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') throw new Error('Akses ditolak.');
    const { error } = await this.client.rpc('rpc_finalize_stock_opname', {
      p_opname_id: opnameId,
      p_actor_id: actor.id,
      p_actor_name: actor.full_name,
    });
    if (error) throw new Error(error.message);
    const { data: full } = await this.client
      .from('inventory_stock_opnames')
      .select('*, inventory_locations(name), inventory_stock_opname_items(*)')
      .eq('id', opnameId)
      .single();
    const l = Array.isArray(full?.inventory_locations) ? full?.inventory_locations[0] : full?.inventory_locations;
    return {
      ...(full as unknown as StockOpnameRecord),
      location_name: (l as { name?: string })?.name || '-',
      items: (full?.inventory_stock_opname_items || []) as StockOpnameRecord['items'],
    };
  }

  async getUnitPhotocopyReport(
    actor: UserProfile,
    params: { unitId?: string; month: number; year: number }
  ): Promise<PhotocopyReportResponse> {
    let targetUnitId = params.unitId;
    if (actor.role === 'kepala_unit') {
      if (!actor.head_unit_ids.length) throw new Error('Unit Kepala Unit belum diatur.');
      if (!targetUnitId || !actor.head_unit_ids.includes(targetUnitId)) targetUnitId = actor.head_unit_ids[0];
    } else if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses laporan unit ditolak.');
    }

    const { data: unit } = await this.client.from('units').select('*').eq('id', targetUnitId).single();
    if (!unit) throw new Error('Unit tidak ditemukan.');

    const startIso = new Date(Date.UTC(params.year, params.month - 1, 1)).toISOString();
    const endIso = new Date(Date.UTC(params.year, params.month, 1)).toISOString();

    const { data: orders } = await this.client
      .from('orders')
      .select('order_number, created_at, requester_name, requester_email, status, order_items(*)')
      .eq('service_code', 'FOTOKOPI')
      .eq('unit_id', unit.id)
      .neq('status', 'Dibatalkan')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false });

    let totalBwSides = 0;
    let totalColorSides = 0;
    let totalSheets = 0;
    const reqMap = new Map<
      string,
      { requesterName: string; requesterEmail: string; orders: number; bwSides: number; colorSides: number; sheets: number }
    >();

    const rows = (orders || []).map((o) => {
      const it = Array.isArray(o.order_items) ? o.order_items[0] : o.order_items;
      const sides = Number(it?.print_sides_total || 0);
      const sheets = Number(it?.paper_sheets_total || 0);
      const isColor = it?.print_color === 'Warna';
      if (isColor) totalColorSides += sides;
      else totalBwSides += sides;
      totalSheets += sheets;

      const cur = reqMap.get(o.requester_email as string) ?? {
        requesterName: o.requester_name as string,
        requesterEmail: o.requester_email as string,
        orders: 0,
        bwSides: 0,
        colorSides: 0,
        sheets: 0,
      };
      cur.orders += 1;
      if (isColor) cur.colorSides += sides;
      else cur.bwSides += sides;
      cur.sheets += sheets;
      reqMap.set(o.requester_email as string, cur);

      return {
        orderNumber: o.order_number as string,
        createdAt: o.created_at as string,
        requesterName: o.requester_name as string,
        docName: (it?.doc_name as string) || '-',
        printColor: (it?.print_color as string) || 'Hitam Putih',
        paperSize: (it?.paper_size as string) || 'A4',
        pageCount: Number(it?.page_count || 0),
        copyCount: Number(it?.copy_count || 0),
        isDuplex: Boolean(it?.is_duplex),
        printSidesTotal: sides,
        paperSheetsTotal: sheets,
        status: o.status as OrderStatus,
      };
    });

    return {
      periodMonth: params.month,
      periodYear: params.year,
      unitId: unit.id as string,
      unitName: unit.name as string,
      headName: (unit.head_name as string) || '',
      headEmail: (unit.head_email as string) || '',
      summary: {
        totalOrders: rows.length,
        totalBwSides,
        totalColorSides,
        totalSheets,
      },
      byRequester: Array.from(reqMap.values()).sort((a, b) => b.sheets - a.sheets),
      monthlyTrend: [
        {
          monthLabel: `${MONTH_NAMES_ID[params.month - 1].slice(0, 3)} ${params.year}`,
          bwSides: totalBwSides,
          colorSides: totalColorSides,
          sheets: totalSheets,
        },
      ],
      rows,
    };
  }

  async listReportDeliveryLogs(actor: UserProfile, month?: number, year?: number): Promise<ReportDeliveryLog[]> {
    let q = this.client.from('report_delivery_logs').select('*').order('sent_at', { ascending: false });
    if (actor.role === 'kepala_unit') {
      q = q.in('unit_id', actor.head_unit_ids.length ? actor.head_unit_ids : ['00000000-0000-0000-0000-000000000000']);
    } else if (actor.role !== 'super_admin' && actor.role !== 'admin_resources') {
      throw new Error('Akses ditolak.');
    }
    if (month) q = q.eq('period_month', month);
    if (year) q = q.eq('period_year', year);
    const { data, error } = await q.limit(100);
    if (error) throw new Error(error.message);
    return (data || []) as ReportDeliveryLog[];
  }

  async dispatchMonthlyPhotocopyReports(
    actor: UserProfile | null,
    params: { month: number; year: number; unitId?: string; forceResend?: boolean }
  ): Promise<ReportDeliveryLog[]> {
    const units = await this.listUnits(false);
    const targets = units.filter((u) => u.head_email && (!params.unitId || u.id === params.unitId));
    const systemActor: UserProfile = actor || {
      id: 'system',
      email: 'system@lazuardi.sch.id',
      full_name: 'System Scheduler',
      role: 'super_admin',
      is_active: true,
      unit_ids: [],
      primary_unit_id: null,
      head_unit_ids: [],
      last_login_at: null,
    };

    const results: ReportDeliveryLog[] = [];
    for (const unit of targets) {
      const { data: existing } = await this.client
        .from('report_delivery_logs')
        .select('*')
        .eq('report_type', 'MONTHLY_PHOTOCOPY')
        .eq('period_month', params.month)
        .eq('period_year', params.year)
        .eq('unit_id', unit.id)
        .maybeSingle();

      if (existing && existing.status === 'Berhasil' && !params.forceResend) {
        results.push(existing as ReportDeliveryLog);
        continue;
      }

      const reportData = await this.getUnitPhotocopyReport(systemActor, {
        unitId: unit.id,
        month: params.month,
        year: params.year,
      });

      const sendRes = await sendMonthlyPhotocopyEmail({
        recipientEmail: unit.head_email,
        recipientName: unit.head_name,
        unitName: unit.name,
        periodMonth: params.month,
        periodYear: params.year,
        ...reportData.summary,
        byRequester: reportData.byRequester,
      });

      const { data: logRow } = await this.client
        .from('report_delivery_logs')
        .upsert(
          {
            report_type: 'MONTHLY_PHOTOCOPY',
            period_month: params.month,
            period_year: params.year,
            unit_id: unit.id,
            unit_name: unit.name,
            recipient_email: unit.head_email,
            status: sendRes.ok ? 'Berhasil' : 'Gagal',
            summary_json: reportData.summary,
            error_message: sendRes.error || null,
            sent_by: actor?.id || null,
            sent_at: new Date().toISOString(),
          },
          { onConflict: 'report_type,period_month,period_year,unit_id' }
        )
        .select()
        .single();

      if (logRow) results.push(logRow as ReportDeliveryLog);
    }
    return results;
  }

  async getAnalyticsReport(
    actor: UserProfile,
    params: { reportType: string; dateFrom?: string; dateTo?: string; unitId?: string; serviceCode?: string; status?: string }
  ): Promise<{ rows: Array<Record<string, unknown>>; summary: Record<string, unknown> }> {
    const page = await this.listOrders(actor, {
      page: 1,
      pageSize: 50,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      unitId: params.unitId,
      status: (params.status as OrderStatus | 'ALL') || 'ALL',
    });
    return {
      rows: page.items.map((o) => ({
        nomor_order: o.order_number,
        layanan: o.service_code,
        unit: o.unit_name,
        pemesan: o.requester_name,
        status: o.status,
        tanggal: o.created_at.slice(0, 10),
      })),
      summary: { total_baris: page.total },
    };
  }

  async listNotifications(actor: UserProfile): Promise<NotificationItem[]> {
    const roleFilter =
      actor.role === 'super_admin' ? 'target_role.in.(admin_resources,super_admin)' : `target_role.eq.${actor.role}`;
    const { data } = await this.client
      .from('notifications')
      .select('*')
      .or(`user_id.eq.${actor.id},${roleFilter}`)
      .order('created_at', { ascending: false })
      .limit(30);
    return (data || []) as NotificationItem[];
  }

  async markNotificationRead(actor: UserProfile, notificationId: string | 'ALL'): Promise<void> {
    if (notificationId === 'ALL') {
      await this.client.from('notifications').update({ is_read: true }).eq('user_id', actor.id);
    } else {
      await this.client.from('notifications').update({ is_read: true }).eq('id', notificationId);
    }
  }

  async listAuditLogs(actor: UserProfile, page: number, pageSize: number): Promise<PaginatedResponse<AuditLogEntry>> {
    if (actor.role !== 'super_admin') throw new Error('Hanya Super Admin yang berwenang melihat Audit Log.');
    const p = Math.max(1, page || 1);
    const ps = Math.min(50, Math.max(10, pageSize || 20));
    const from = (p - 1) * ps;
    const { data, count, error } = await this.client
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + ps - 1);
    if (error) throw new Error(error.message);
    const total = count ?? 0;
    return {
      items: (data || []) as AuditLogEntry[],
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.max(1, Math.ceil(total / ps)),
    };
  }

  private async notifyNewOrder(orderId: string, orderNumber: string, svc: ServiceCode, actor: UserProfile, unitName: string) {
    await this.client.from('notifications').insert([
      {
        target_role: 'admin_resources',
        title: `Order Baru: ${orderNumber}`,
        message: `${actor.full_name} (${unitName}) membuat permintaan layanan ${svc}.`,
        type: 'info',
        related_order_id: orderId,
      },
      {
        user_id: actor.id,
        title: `Order ${orderNumber} Diterima`,
        message: 'Permintaan Anda telah masuk antrean Divisi Resources.',
        type: 'success',
        related_order_id: orderId,
      },
    ]);
  }

  private async logAudit(
    actor: UserProfile,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>
  ) {
    await this.client.from('audit_logs').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata_json: metadata,
    });
  }

  private mapOrderRow(row: Record<string, unknown>): OrderRecord {
    const itemsArr = Array.isArray(row.order_items) ? row.order_items : row.order_items ? [row.order_items] : [];
    const assignArr = Array.isArray(row.order_assignments)
      ? row.order_assignments
      : row.order_assignments
      ? [row.order_assignments]
      : [];
    const firstAssign = assignArr[0] as { assignee_id?: string; assignee_name?: string } | undefined;

    return {
      id: row.id as string,
      order_number: row.order_number as string,
      service_code: row.service_code as ServiceCode,
      requester_id: row.requester_id as string,
      requester_name: row.requester_name as string,
      requester_email: row.requester_email as string,
      unit_id: row.unit_id as string,
      unit_name: row.unit_name as string,
      location_id: (row.location_id as string | null) ?? null,
      location_label: (row.location_label as string) || '',
      status: row.status as OrderStatus,
      needed_date: row.needed_date as string,
      needed_time: (row.needed_time as string | null) ?? null,
      notes: (row.notes as string) || '',
      internal_notes: (row.internal_notes as string) || '',
      cancel_reason: (row.cancel_reason as string | null) ?? null,
      cancelled_at: (row.cancelled_at as string | null) ?? null,
      completed_at: (row.completed_at as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      assignee_id: firstAssign?.assignee_id ?? null,
      assignee_name: firstAssign?.assignee_name ?? null,
      item: (itemsArr[0] as OrderRecord['item']) ?? null,
      attachments: (row.order_attachments as OrderAttachment[]) || [],
      history: (row.order_status_history as OrderRecord['history']) || [],
    };
  }
}
