export const paperWidths = [57, 58, 76, 80, 112] as const;
export type PaperWidth = typeof paperWidths[number];
const storageKey = 'printer.paper-width-mm';

export function paperWidth(value: unknown): PaperWidth {
  return paperWidths.find(width => width === Number(value)) ?? 80;
}

export function readPaperWidth(): PaperWidth {
  try { return paperWidth(localStorage.getItem(storageKey)); } catch { return 80; }
}

export function savePaperWidth(width: PaperWidth) {
  localStorage.setItem(storageKey, String(width));
}
