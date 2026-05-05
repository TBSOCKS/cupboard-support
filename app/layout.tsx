import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cupboard — Support',
  description: 'Customer support chat for Cupboard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
