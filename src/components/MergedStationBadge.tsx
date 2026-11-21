import { CakeSlice, CupSoda } from 'lucide-react';
import { stationGroup } from '../../shared/station-groups';
import type { KitchenOrder } from '@/types/restaurant';

export function MergedStationBadge({ layout, station }: { layout?: string; station: KitchenOrder['station'] }) {
  if (station === 'KITCHEN' || stationGroup(layout, station).length < 2) return null;
  const drink = station === 'BAR';
  const Icon = drink ? CupSoda : CakeSlice;
  return (
    <span className={`mb-3 inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-bold tracking-wide text-white ${
      drink ? 'bg-sky-700' : 'bg-violet-700'
    }`}>
      <Icon aria-hidden="true" size={18} />
      {drink ? 'BEBIDA' : 'POSTRE'}
    </span>
  );
}
