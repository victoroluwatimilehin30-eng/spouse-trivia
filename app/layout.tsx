import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'In Sync - Couple Trivia',
  description: 'A minimalist trivia match to test how well you know your spouse.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0F0E0C] text-[#F3EFE6] font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}