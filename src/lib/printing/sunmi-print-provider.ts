import type { ReceiptDocument, ReceiptPrintSession, SunmiReceiptBridge } from '@/types/printing';

function getSunmiBridge(): SunmiReceiptBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.SunmiPrinter?.printReceipt ? window.SunmiPrinter : null;
}

export function hasSunmiPrinterBridge() {
  return Boolean(getSunmiBridge());
}

export function openSunmiReceiptPrintSession(): ReceiptPrintSession {
  return {
    async print(document) {
      const bridge = getSunmiBridge();
      if (!bridge) {
        throw new Error('No se detectó el puente de impresión SUNMI.');
      }
      if (bridge.isAvailable) {
        const available = await bridge.isAvailable();
        if (!available) {
          throw new Error('La impresora SUNMI no está disponible en este momento.');
        }
      }
      await bridge.printReceipt(document);
    },
    cancel() {
    },
  };
}
