import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'BenchFinder - Discover the World\'s Best Benches',
  description: 'Find and share the most beautiful bench locations around the globe.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
