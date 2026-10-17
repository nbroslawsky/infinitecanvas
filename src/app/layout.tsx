import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Infinite canvas",
  description: "A private canvas for arranging images, labels, and frames.",
  icons: {
    icon: [
      { url: "/images/infinite-canvas-mark.svg", type: "image/svg+xml" },
      { url: "/images/infinite-canvas-mark.png", type: "image/png", sizes: "1024x1024" },
    ],
    apple: [{ url: "/images/infinite-canvas-mark.png", sizes: "1024x1024" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
