import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { AppProvider } from '../lib/session';
import { Gate } from '../components/Gate';
import { SwRegister } from '../components/SwRegister';

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
    <html lang="en">
      <body>
        <AppProvider>
          <Gate>{children}</Gate>
          <SwRegister />
        </AppProvider>
      </body>
    </html>
  );
}
