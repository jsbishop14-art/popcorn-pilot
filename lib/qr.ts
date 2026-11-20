// QR code for the hub address in Settings > Hub (PP7): point a phone camera at it to open the app.
import qrcode from 'qrcode-generator';

/** The QR modules for the text (true = dark), error correction M, smallest size that fits. */
export function qrMatrix(text: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/** One SVG path drawing every dark module, offset by the quiet zone (4 modules, as the QR standard asks). */
export function qrSvgPath(m: boolean[][], quiet = 4): string {
  const parts: string[] = [];
  m.forEach((row, r) => row.forEach((dark, c) => dark && parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`)));
  return parts.join('');
}
