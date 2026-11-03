import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mongolian Students in Italy",
  description:
    "A little help from home for Mongolian students studying in Italy.",
  icons: {
    icon: "/msai-logo.png",
    apple: "/msai-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f3eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
