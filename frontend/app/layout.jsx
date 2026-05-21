import { DM_Sans, DM_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { Providers } from './providers';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata = {
  title: 'CRM 1 — Trading Telesales',
  description: 'Financial trading telesales platform — ARK conversions.',
  icons: { icon: '/favicon.svg' },
};

export const viewport = {
  themeColor: '#0B1120',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                fontSize: '13px',
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                borderRadius: '8px',
                padding: '10px 14px',
                border: '1px solid hsl(var(--border))',
                boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
              },
              success: { iconTheme: { primary: '#10B981', secondary: '#0F172A' } },
              error: { iconTheme: { primary: '#EF4444', secondary: '#0F172A' } },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
