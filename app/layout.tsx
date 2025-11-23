import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "KOWiz - Wikimedia Commons Converter",
    template: "%s | KOWiz",
  },
  description: "Convert media files to Wikimedia Commons-compatible formats. Upload images, videos, and audio files for automatic conversion to Commons standards.",
  keywords: [
    "Wikimedia Commons",
    "media converter",
    "file conversion",
    "HEIC to JPEG",
    "video converter",
    "audio converter",
    "RAW converter",
    "Commons upload",
  ],
  authors: [{ name: "KOWiz" }],
  creator: "KOWiz",
  publisher: "KOWiz",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://kowiz.tsensei.dev"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "KOWiz - Wikimedia Commons Converter",
    description: "Convert media files to Wikimedia Commons-compatible formats. Upload images, videos, and audio files for automatic conversion to Commons standards.",
    siteName: "KOWiz",
  },
  twitter: {
    card: "summary_large_image",
    title: "KOWiz - Wikimedia Commons Converter",
    description: "Convert media files to Wikimedia Commons-compatible formats. Upload images, videos, and audio files for automatic conversion to Commons standards.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
