import type { RestaurantTable } from '@/types/restaurant';
import { useId, useRef } from 'react';
import { StatusBadge } from './StatusBadge';

export function TableStatusControl({ table }: { table: RestaurantTable }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  if (table.status !== 'RESERVED') return <StatusBadge value={table.status} className="pointer-events-none relative z-10" />;
  const info = table.reservation;
  return (
    <>
      <button type="button" className="relative z-10 inline-flex rounded-full focus-visible:outline-sky-600"
        aria-haspopup="dialog" aria-label={`Reservada: ver reserva de la mesa ${table.code}`}
        onClick={() => dialog.current?.showModal()}>
        <StatusBadge value="RESERVED" />
      </button>
      <dialog ref={dialog} aria-labelledby={title} className="m-auto w-[min(24rem,92vw)] rounded-2xl bg-white p-5 text-left text-slate-900 shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-white">
        <h2 id={title} className="text-lg font-bold">Reserva de la mesa {table.code}</h2>
        {info ? <dl className="my-4 grid gap-3 break-words text-sm">
          <div><dt className="font-semibold">Nombre</dt><dd>{info.name}</dd></div>
          <div><dt className="font-semibold">Personas</dt><dd>{info.guests}</dd></div>
          <div><dt className="font-semibold">Dirección</dt><dd>{info.address || 'No registrada'}</dd></div>
          <div><dt className="font-semibold">Origen de la reserva</dt><dd>{info.source === 'ADMIN' ? 'Administración' : 'Kiosco'}</dd></div>
        </dl> : <p className="my-4 text-sm">Reserva sin datos registrados.</p>}
        <button type="button" className="w-full rounded-xl border py-2 font-semibold" onClick={() => dialog.current?.close()}>Cerrar</button>
      </dialog>
    </>
  );
}
