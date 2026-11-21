export const layouts = ['SEPARATE', 'BAR_PASTRY', 'KITCHEN_BAR', 'KITCHEN_PASTRY', 'ALL'] as const;
export type StationLayout = typeof layouts[number];
const stations = ['KITCHEN', 'BAR', 'PASTRY'] as const;
type Station = typeof stations[number];
const merged: Record<StationLayout, readonly Station[]> = {
  SEPARATE: [], BAR_PASTRY: ['BAR', 'PASTRY'], KITCHEN_BAR: ['KITCHEN', 'BAR'],
  KITCHEN_PASTRY: ['KITCHEN', 'PASTRY'], ALL: stations,
};
export function isStation(value: unknown): value is Station {
  return stations.some(station => value === station);
}
export function stationGroup(layout: string | undefined, station: Station): readonly Station[] {
  const group = layouts.includes(layout as StationLayout) ? merged[layout as StationLayout] : [];
  return group.includes(station) ? group : [station];
}
