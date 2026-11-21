export function TableCapacity({ capacity }: { capacity: number }) {
  return (
    <span className="inline-block rounded-lg bg-indigo-100 px-2 py-1 text-sm font-bold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
      {capacity > 0 ? `Para ${capacity} ${capacity === 1 ? 'persona' : 'personas'}` : 'Capacidad sin definir'}
    </span>
  );
}
