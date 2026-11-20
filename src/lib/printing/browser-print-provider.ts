import { buildReceiptHtml } from '@/lib/printing/receipt-builders';
import type { ReceiptDocument, ReceiptPrintSession } from '@/types/printing';

function openPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=420,height=700');
  if (!printWindow) {
    return null;
  }
  try {
    printWindow.opener = null;
  } catch {
  }
  return printWindow;
}

function renderPrintWindow(printWindow: Window, document: ReceiptDocument) {
  printWindow.document.open();
  printWindow.document.write(buildReceiptHtml(document));
  printWindow.document.close();
  printWindow.focus();
}

export function openBrowserReceiptPrintSession(): ReceiptPrintSession {
  const printWindow = openPrintWindow();

  return {
    async print(document) {
      if (!printWindow) {
        throw new Error('El navegador bloqueó la ventana de impresión.');
      }
      renderPrintWindow(printWindow, document);
    },
    cancel() {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
    },
  };
}

export async function printReceiptInBrowser(document: ReceiptDocument) {
  const session = openBrowserReceiptPrintSession();
  try {
    await session.print(document);
  } catch (error) {
    session.cancel();
    throw error;
  }
}
