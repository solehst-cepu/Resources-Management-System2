import { CheckCircle2, Clock, PackageCheck, Truck, XCircle } from 'lucide-react';
import type { OrderStatus } from '../../shared/types';

export function OrderStatusLabel({ status }: { status: OrderStatus }) {
  switch (status) {
    case 'Selesai':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Selesai</span>
        </span>
      );
    case 'Dibatalkan':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Dibatalkan</span>
        </span>
      );
    case 'Dalam Pengiriman':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Truck className="h-3.5 w-3.5 shrink-0" />
          <span>Dalam Pengiriman</span>
        </span>
      );
    case 'Siap Diambil':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1755CE] whitespace-nowrap">
          <PackageCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Siap Diambil</span>
        </span>
      );
    case 'Diproses':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Diproses</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>Menunggu Diproses</span>
        </span>
      );
  }
}

export function ServiceLabel({ code }: { code: string }) {
  if (code === 'AIR_GALON') return <span className="font-medium text-slate-800">Air Galon</span>;
  if (code === 'FOTOKOPI') return <span className="font-medium text-slate-800">Fotokopi</span>;
  if (code === 'LAMINATING') return <span className="font-medium text-slate-800">Laminating</span>;
  return <span>{code}</span>;
}
