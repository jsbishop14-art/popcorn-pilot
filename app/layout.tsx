// Fonts are bundled with the app (no font CDN at run time; the hub may have no internet at times).
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/500.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'Popcorn Pilot' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F3F5F9' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
