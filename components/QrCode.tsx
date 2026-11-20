// A QR code drawn as one SVG path on a white square with the standard quiet zone (PP7, Settings > Hub).
import { qrMatrix, qrSvgPath } from '@/lib/qr';

export default function QrCode({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const m = qrMatrix(text);
  const side = m.length + 8;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${side} ${side}`} shapeRendering="crispEdges" style={{ display: 'block' }}>
      <rect width={side} height={side} fill="#ffffff" />
      <path d={qrSvgPath(m)} fill="#000000" />
    </svg>
  );
}
