import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "trader — 投資を、見渡す。",
  description: "価格の流れとJevの評価をつなぐ、パーソナル投資モニター。",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
