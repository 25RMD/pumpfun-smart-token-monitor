import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Pump.fun Migration Monitor",
  description: "Real-time monitoring and scam detection for Pump.fun migrated tokens on Solana",
  keywords: ["pump.fun", "solana", "crypto", "token", "migration", "scam detection"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-50 dark:bg-gray-900 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
