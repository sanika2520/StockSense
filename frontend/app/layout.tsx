import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockSensePro - Smart Stock Analysis Made Simple",
  description: "AI-driven stock market insights and analytics platform for informed investment decisions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      background: '#0a0a0f',
                      surface: '#13131a',
                      'surface-elevated': '#1a1a24',
                      foreground: '#e8e8f0',
                      primary: '#6366f1',
                      'primary-dark': '#4f46e5',
                      secondary: '#8b5cf6',
                      accent: '#ec4899',
                      success: '#10b981',
                      warning: '#f59e0b',
                      error: '#ef4444',
                      info: '#3b82f6',
                    },
                    backgroundImage: {
                      'gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      'gradient-secondary': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    },
                    animation: {
                      'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }
                  }
                }
              }
            `
          }}
        />
      </head>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}


