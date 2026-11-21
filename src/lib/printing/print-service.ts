import { openBrowserReceiptPrintSession } from '@/lib/printing/browser-print-provider';
import { hasSunmiPrinterBridge, openSunmiReceiptPrintSession } from '@/lib/printing/sunmi-print-provider';
import { useSessionStore } from '@/store/useSessionStore';
import { readPaperWidth } from './paper';
import type { ReceiptDocument, ReceiptPrintSession } from '@/types/printing';

async function prepareLogo(source: string | null | undefined, width: number) {
  if (!source?.startsWith('data:image/')) return undefined;
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(Math.min(448, (width - 10) * 8) / image.naturalWidth, 256 / image.naturalHeight);
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

export function receiptFormatter(logoOverride?: string | null) {
  const { token, user, snapshot } = useSessionStore.getState();
  const operator = token && user?.name.trim() || 'Sin identificar';
  const native = hasSunmiPrinterBridge();
  const width = Math.min(readPaperWidth(), native ? 80 : 112);
  let logo: Promise<string | undefined> | undefined;
  return async (document: ReceiptDocument): Promise<ReceiptDocument> => ({
      ...document,
      brandLines: (['slogan', 'address', 'phone'] as const).flatMap(key => {
        const value = (document.companyDetails ?? snapshot?.brand)?.[key]?.trim();
        return value ? [key === 'phone' ? `Teléfono: ${value}` : value] : [];
      }),
      paperWidthMm: width,
      logoPng: await (logo ??= prepareLogo(logoOverride === undefined ? snapshot?.brand.logoData : logoOverride, width)),
      footerLabel: [document.footerLabel, `Imprimió: ${operator}`].filter(Boolean).join('\n'),
  });
}

export function openReceiptPrintSession(logoOverride?: string | null): ReceiptPrintSession {
  const format = receiptFormatter(logoOverride);
  const session = hasSunmiPrinterBridge() ? openSunmiReceiptPrintSession() : openBrowserReceiptPrintSession();
  return {
    print: async document => session.print(await format(document)),
    cancel: () => session.cancel(),
  };
}

export async function printReceipt(document: ReceiptDocument, logoOverride?: string | null) {
  const session = openReceiptPrintSession(logoOverride);
  try {
    await session.print(document);
  } catch (error) {
    session.cancel();
    throw error;
  }
}
