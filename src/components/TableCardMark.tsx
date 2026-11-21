import clsx from 'clsx';
import type { RestaurantTable } from '@/types/restaurant';
import { TableGlyph } from '@/components/TableGlyph';

function tableCardIconTone(status: RestaurantTable['status']) {
  switch (status) {
    case 'FREE':
      return 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100';
    case 'OCCUPIED':
      return 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100';
    case 'RESERVED':
      return 'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-100';
  }
}

type TableCardMarkProps = {
  status: RestaurantTable['status'];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  xs: { box: 'h-8 w-8 rounded-lg', glyph: 'h-4 w-4' },
  sm: { box: 'h-10 w-10 rounded-xl', glyph: 'h-5 w-5' },
  md: { box: 'h-12 w-12 rounded-2xl', glyph: 'h-6 w-6' },
  lg: { box: 'h-14 w-14 rounded-2xl', glyph: 'h-7 w-7' },
} as const;

export function TableCardMark({ status, size = 'md', className }: TableCardMarkProps) {
  const dimensions = sizeClasses[size];

  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center border shadow-sm',
        dimensions.box,
        tableCardIconTone(status),
        className,
      )}
      aria-hidden="true"
    >
      <TableGlyph className={dimensions.glyph} />
    </div>
  );
}