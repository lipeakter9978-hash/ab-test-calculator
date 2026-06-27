import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AB/n 实验样本量计算器",
  description: "支持多对照组、多实验组和多重比较校正的 AB/n 实验样本量计算器。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
