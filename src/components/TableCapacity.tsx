type TableCapacityProps = {
  capacity: number;
  compact?: boolean;
};

export function TableCapacity({ capacity, compact }: TableCapacityProps) {
  const label = capacity > 0 ? `Para ${capacity} ${capacity === 1 ? 'persona' : 'personas'}` : 'Capacidad sin definir';

  if (compact) {
    return (
      <span className="inline-block rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
        {label}
      </span>
    );
  }

  return (
    <span className="inline-block rounded-lg bg-indigo-100 px-2 py-1 text-sm font-bold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
      {label}
    </span>
  );
}
