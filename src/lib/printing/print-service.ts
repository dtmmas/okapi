import { openBrowserReceiptPrintSession, printReceiptInBrowser } from '@/lib/printing/browser-print-provider';
import { hasSunmiPrinterBridge, openSunmiReceiptPrintSession } from '@/lib/printing/sunmi-print-provider';
import type { ReceiptDocument, ReceiptPrintSession } from '@/types/printing';

export function openReceiptPrintSession(): ReceiptPrintSession {
  if (hasSunmiPrinterBridge()) {
    return openSunmiReceiptPrintSession();
  }
  return openBrowserReceiptPrintSession();
}

export async function printReceipt(document: ReceiptDocument) {
  if (hasSunmiPrinterBridge()) {
    const session = openSunmiReceiptPrintSession();
    await session.print(document);
    return;
  }

  await printReceiptInBrowser(document);
}
