import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Public_Sans, Noto_Sans_Ethiopic } from 'next/font/google';
import '../styles/globals.css';
import { AppProvider } from '../lib/session';
import { Gate } from '../components/Gate';
import { SwRegister } from '../components/SwRegister';

// Self-hosted at build time by next/font (no runtime request to Google).
const heading = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600'], variable: '--font-heading', display: 'swap' });
const body = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });
const ethiopic = Noto_Sans_Ethiopic({ subsets: ['ethiopic'], weight: ['400', '600'], variable: '--font-ethiopic', display: 'swap' });

export const metadata: Metadata = {
  title: 'Shop Ledger',
  description: 'Stock, sales and debts for small shops.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F6F8F7' }, { media: '(prefers-color-scheme: dark)', color: '#0E1519' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${ethiopic.variable}`}>
      <body>
        <AppProvider>
          <Gate>{children}</Gate>
          <SwRegister />
        </AppProvider>
      </body>
    </html>
  );
}
