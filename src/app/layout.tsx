import type { Metadata } from 'next';
import { Archivo, Hanken_Grotesk } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], weight: ['600','700','800'], variable: '--font-archivo' });
const hanken  = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken' });

export const metadata: Metadata = {
  title: 'XLeats — for food trucks',
  description: 'Run your truck: menu, schedule, posts, and one-tap live status.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${hanken.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
