-- ==============================================================================
-- LRMS (Lazuardi Resources Management System) — 003_rpc_functions.sql
-- Atomic Database Transactions & Locking RPC Functions
-- ==============================================================================

-- 1. Atomic Unique Order Number Generator (GAL-YYYYMM-0001, FCP-YYYYMM-0001, LAM-YYYYMM-0001)
CREATE OR REPLACE FUNCTION public.generate_order_number(p_service_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_ym TEXT;
  v_seq INTEGER;
BEGIN
  v_prefix := CASE p_service_code
    WHEN 'AIR_GALON' THEN 'GAL'
    WHEN 'FOTOKOPI' THEN 'FCP'
    WHEN 'LAMINATING' THEN 'LAM'
    ELSE 'ORD'
  END;

  v_ym := TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYYMM');

  INSERT INTO public.order_sequences (prefix, period_ym, last_seq)
  VALUES (v_prefix, v_ym, 1)
  ON CONFLICT (prefix, period_ym)
  DO UPDATE SET last_seq = public.order_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '-' || v_ym || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- 2. Atomic Gallon Delivery Confirmation (Prevents Double Deduction & Negative Stock)
CREATE OR REPLACE FUNCTION public.rpc_confirm_gallon_delivery(
  p_order_id UUID,
  p_location_id UUID,
  p_actual_filled_sent INTEGER,
  p_empty_received INTEGER,
  p_actor_id UUID,
  p_actor_name TEXT,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_balance RECORD;
  v_tx_no TEXT;
BEGIN
  IF p_actual_filled_sent < 0 OR p_empty_received < 0 THEN
    RAISE EXCEPTION 'Jumlah galon tidak boleh bernilai negatif.';
  END IF;

  -- Lock order row to prevent concurrent double-processing
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan.';
  END IF;

  IF v_order.service_code <> 'AIR_GALON' THEN
    RAISE EXCEPTION 'Order bukan layanan Air Galon.';
  END IF;

  IF v_order.status IN ('Selesai', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Order sudah berstatus % dan tidak dapat diproses ulang.', v_order.status;
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE order_id = p_order_id LIMIT 1;

  -- Lock inventory balance row for the chosen storage location
  SELECT * INTO v_balance
  FROM public.inventory_balances
  WHERE location_id = p_location_id
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lokasi stok galon tidak ditemukan.';
  END IF;

  IF v_balance.qty_filled < p_actual_filled_sent THEN
    RAISE EXCEPTION 'Stok galon isi tidak mencukupi (tersedia %, diminta %).', v_balance.qty_filled, p_actual_filled_sent;
  END IF;

  -- Update balances atomically
  UPDATE public.inventory_balances
  SET
    qty_filled = qty_filled - p_actual_filled_sent,
    qty_empty = qty_empty + p_empty_received,
    qty_allocated = GREATEST(0, qty_allocated - COALESCE(v_item.requested_qty, 0)),
    updated_at = NOW()
  WHERE id = v_balance.id;

  -- Update order item actuals
  UPDATE public.order_items
  SET
    actual_qty = p_actual_filled_sent,
    empty_returned_qty = p_empty_received,
    updated_at = NOW()
  WHERE id = v_item.id;

  -- Record inventory transaction
  v_tx_no := 'TX-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 4);

  INSERT INTO public.inventory_transactions (
    tx_number, tx_type, item_id, location_id, order_id,
    qty_filled_delta, qty_empty_delta, reference_no, actor_id, actor_name, notes
  ) VALUES (
    v_tx_no, 'DISTRIBUTION', v_balance.item_id, p_location_id, p_order_id,
    -p_actual_filled_sent, p_empty_received, v_order.order_number, p_actor_id, p_actor_name,
    COALESCE(NULLIF(p_note, ''), 'Distribusi galon isi dan penerimaan galon kosong')
  );

  -- Mark order as Selesai
  UPDATE public.orders
  SET status = 'Selesai', completed_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, changed_by_name, note
  ) VALUES (
    p_order_id, v_order.status, 'Selesai', p_actor_id, p_actor_name,
    'Pengiriman dikonfirmasi: ' || p_actual_filled_sent || ' galon isi dikirim, ' || p_empty_received || ' galon kosong diterima.'
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'tx_number', v_tx_no,
    'status', 'Selesai'
  );
END;
$$;

-- 3. Atomic Stock Opname Finalization (Locks Draft & Balance)
CREATE OR REPLACE FUNCTION public.rpc_finalize_stock_opname(
  p_opname_id UUID,
  p_actor_id UUID,
  p_actor_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opname RECORD;
  v_balance RECORD;
  v_item RECORD;
  v_filled_delta INTEGER := 0;
  v_empty_delta INTEGER := 0;
  v_damaged_delta INTEGER := 0;
  v_lost_delta INTEGER := 0;
  v_adj_no TEXT;
  v_tx_no TEXT;
BEGIN
  SELECT * INTO v_opname
  FROM public.inventory_stock_opnames
  WHERE id = p_opname_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumen stock opname tidak ditemukan.';
  END IF;

  IF v_opname.status <> 'Draft' THEN
    RAISE EXCEPTION 'Stock opname % sudah berstatus Final dan tidak dapat diubah.', v_opname.opname_number;
  END IF;

  SELECT * INTO v_balance
  FROM public.inventory_balances
  WHERE location_id = v_opname.location_id
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data saldo lokasi tidak ditemukan.';
  END IF;

  FOR v_item IN
    SELECT * FROM public.inventory_stock_opname_items WHERE opname_id = p_opname_id
  LOOP
    IF v_item.stock_type = 'filled' THEN
      v_filled_delta := v_item.physical_qty - v_balance.qty_filled;
      UPDATE public.inventory_balances SET qty_filled = v_item.physical_qty, updated_at = NOW() WHERE id = v_balance.id;
    ELSIF v_item.stock_type = 'empty' THEN
      v_empty_delta := v_item.physical_qty - v_balance.qty_empty;
      UPDATE public.inventory_balances SET qty_empty = v_item.physical_qty, updated_at = NOW() WHERE id = v_balance.id;
    ELSIF v_item.stock_type = 'damaged' THEN
      v_damaged_delta := v_item.physical_qty - v_balance.qty_damaged;
      UPDATE public.inventory_balances SET qty_damaged = v_item.physical_qty, updated_at = NOW() WHERE id = v_balance.id;
    ELSIF v_item.stock_type = 'lost' THEN
      v_lost_delta := v_item.physical_qty - v_balance.qty_lost;
      UPDATE public.inventory_balances SET qty_lost = v_item.physical_qty, updated_at = NOW() WHERE id = v_balance.id;
    END IF;

    IF (v_item.physical_qty - v_item.system_qty) <> 0 THEN
      v_adj_no := 'ADJ-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 4);
      INSERT INTO public.inventory_adjustments (
        adjustment_number, opname_id, location_id, stock_type, qty_delta, reason, approved_by, approved_by_name
      ) VALUES (
        v_adj_no, p_opname_id, v_opname.location_id, v_item.stock_type,
        (v_item.physical_qty - v_item.system_qty),
        COALESCE(NULLIF(v_item.variance_reason, ''), 'Hasil Stock Opname ' || v_opname.opname_number),
        p_actor_id, p_actor_name
      );
    END IF;
  END LOOP;

  IF v_filled_delta <> 0 OR v_empty_delta <> 0 OR v_damaged_delta <> 0 OR v_lost_delta <> 0 THEN
    v_tx_no := 'TX-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 4);
    INSERT INTO public.inventory_transactions (
      tx_number, tx_type, item_id, location_id,
      qty_filled_delta, qty_empty_delta, qty_damaged_delta, qty_lost_delta,
      reference_no, actor_id, actor_name, notes
    ) VALUES (
      v_tx_no, 'OPNAME_ADJUSTMENT', v_balance.item_id, v_opname.location_id,
      v_filled_delta, v_empty_delta, v_damaged_delta, v_lost_delta,
      v_opname.opname_number, p_actor_id, p_actor_name,
      'Penyesuaian otomatis finalisasi stock opname ' || v_opname.opname_number
    );
  END IF;

  UPDATE public.inventory_stock_opnames
  SET status = 'Final', finalized_at = NOW(), updated_at = NOW()
  WHERE id = p_opname_id;

  RETURN jsonb_build_object(
    'opname_id', p_opname_id,
    'opname_number', v_opname.opname_number,
    'status', 'Final'
  );
END;
$$;
