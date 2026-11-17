import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  FREE: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  OCCUPIED: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',
  RESERVED: 'bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',
  OPEN: 'bg-slate-500/12 text-slate-700 ring-slate-400/25 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-400/30',
  IN_PREPARATION: 'bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-500/30',
  READY: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30',
  LOW: 'bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30',
  OK: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30',
  PENDING: 'bg-slate-500/12 text-slate-700 ring-slate-400/25 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-400/30',
  ASSIGNED: 'bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',
  ON_ROUTE: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',
  DELIVERED: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30',
  ALTA: 'bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30',
  MEDIA: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',
  BAJA: 'bg-slate-500/12 text-slate-700 ring-slate-400/25 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-400/30',
  OPENING: 'bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',
  ENTRY: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30',
  SALE: 'bg-indigo-500/12 text-indigo-700 ring-indigo-500/25 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-500/30',
  EXPENSE: 'bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30',
  WITHDRAWAL: 'bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-500/30',
};

const labels: Record<string, string> = {
  FREE: 'Libre',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
  OPEN: 'Abierta',
  IN_PREPARATION: 'En preparación',
  READY: 'Listo',
  LOW: 'Bajo',
  OK: 'Correcto',
  PENDING: 'Pendiente',
  ASSIGNED: 'Asignado',
  ON_ROUTE: 'En ruta',
  DELIVERED: 'Entregado',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
  OPENING: 'Apertura',
  ENTRY: 'Entrada',
  SALE: 'Venta',
  EXPENSE: 'Gasto',
  WITHDRAWAL: 'Retiro',
};

type StatusBadgeProps = {
  value: string;
  className?: string;
};

export function StatusBadge({ value, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ring-inset',
        styles[value] || 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-zinc-200 dark:ring-white/15',
        className,
      )}
    >
      {labels[value] || value.split('_').join(' ')}
    </span>
  );
}
