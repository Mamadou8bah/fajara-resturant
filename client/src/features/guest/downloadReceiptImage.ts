'use client';

import type { GuestReceipt } from '@/features/guest/api';

/** Capture a DOM node and download it as a PNG image. */
export async function downloadElementAsPng(
  element: HTMLElement,
  filename: string,
) {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(element, {
    backgroundColor: '#f3ece0',
    scale: Math.min(2, window.devicePixelRatio || 2),
    useCORS: true,
    logging: false,
  });

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not create receipt image'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      'image/png',
    );
  });
}

export function receiptImageFilename(receipt: GuestReceipt) {
  const safe = receipt.transactionNumber.replace(/[^\w.-]+/g, '-');
  return `receipt-${safe}.png`;
}
