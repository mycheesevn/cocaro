import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/caro/AuthProvider";
import { ICON_VERSION } from "@/lib/caro/iconSvg";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const SITE_URL = "https://cocaro.synerworlds.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "✖️ Cờ Ca-rô — Chơi Cờ Ca-rô Online Miễn Phí",
  description:
    "Chơi cờ ca-rô (Gomoku) với máy tính 12 cấp độ trên bàn 10×10, 15×15, 20×20. Miễn phí, song ngữ Việt/Anh. Play Gomoku online free.",
  keywords: ["cờ ca-rô", "caro", "gomoku", "play gomoku online", "cờ caro online", "free gomoku"],
  openGraph: {
    title: "✖️ Cờ Ca-rô",
    description: "Chơi cờ ca-rô với máy 12 cấp độ. Song ngữ Việt/Anh, miễn phí.",
    type: "website",
    url: SITE_URL,
  },
  alternates: { canonical: SITE_URL },
  // Versioned icon URLs (see ICON_VERSION in lib/caro/iconSvg):
  // home-screen shortcuts snapshot the icon at install time, so a new
  // artwork needs a new URL.
  icons: {
    icon: [{ url: `/icon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" }],
    apple: [{ url: `/apple-icon?v=${ICON_VERSION}`, sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        {GA_ID && (
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
        )}
        {GA_ID && (
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        )}
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
      <Script id="sw-register" strategy="afterInteractive">
        {`if ("serviceWorker" in navigator) {
          if (document.readyState === "complete") {
            navigator.serviceWorker.register("/sw.js").catch(function () {});
          } else {
            window.addEventListener("load", function () {
              navigator.serviceWorker.register("/sw.js").catch(function () {});
            });
          }
        }`}
      </Script>
    </html>
  );
}
