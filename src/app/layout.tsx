import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "WEB / OBJECT — つくったサイトを、飾ろう。",
  description:
    "ロリポップ！デプロイ nowのサイトをURLから自動撮影。SUZURIのアクリルブロックにして、あなたのものづくりを手元に。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
