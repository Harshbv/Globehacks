import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DispatchIQ — Fleet Intelligence Platform',
  description: 'AI-native fleet operations for Trucker Path NavPro',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      </head>
      <body>{children}</body>
    </html>
  );
}
