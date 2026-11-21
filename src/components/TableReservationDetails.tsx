import type { RestaurantTable } from '@/types/restaurant';
import { useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

type TableStatusControlProps = {
  table: RestaurantTable;
  badgeClassName?: string;
};

export function TableStatusControl({ table, badgeClassName }: TableStatusControlProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  if (table.status !== 'RESERVED') {
    return <StatusBadge value={table.status} className={cn('pointer-events-none relative z-10', badgeClassName)} />;
  }
  const info = table.reservation;
  return (
    <>
      <button
        type="button"
        className="pointer-events-auto relative z-20 inline-flex rounded-full focus-visible:outline-sky-600"
        aria-haspopup="dialog"
        aria-label={`Reservada: ver reserva de la mesa ${table.code}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dialog.current?.showModal();
        }}
      >
        <StatusBadge value="RESERVED" className={badgeClassName} />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        className="pointer-events-auto m-auto w-[min(20rem,92vw)] rounded-xl bg-white p-4 text-left text-slate-900 shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-white"
      >
        <h2 id={title} className="text-base font-bold">Mesa {table.code}</h2>
        {info ? <dl className="my-3 grid gap-2 break-words text-sm">
          <div><dt className="font-semibold">Nombre</dt><dd>{info.name}</dd></div>
          {info.phone ? (
            <div><dt className="font-semibold">Teléfono</dt><dd>{info.phone}</dd></div>
          ) : null}
          <div><dt className="font-semibold">Personas</dt><dd>{info.guests}</dd></div>
          <div><dt className="font-semibold">Dirección</dt><dd>{info.address || 'No registrada'}</dd></div>
          {info.observations ? (
            <div><dt className="font-semibold">Observaciones</dt><dd>{info.observations}</dd></div>
          ) : null}
          <div><dt className="font-semibold">Origen de la reserva</dt><dd>{info.source === 'ADMIN' ? 'Administración' : 'Kiosco'}</dd></div>
        </dl> : <p className="my-4 text-sm">Reserva sin datos registrados.</p>}
        <button type="button" className="w-full rounded-xl border py-2 font-semibold" onClick={() => dialog.current?.close()}>Cerrar</button>
      </dialog>
    </>
  );
}
