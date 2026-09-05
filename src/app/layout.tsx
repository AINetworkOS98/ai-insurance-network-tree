import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Insurance Network Tree — ระบบบริหารเครือข่ายตัวแทน",
  description: "บริหารผู้สนใจ ผู้สมัคร สมาชิก ต้นไม้ฐานกว้าง 5 คน ผลงาน รายได้ และเอกสารทางการเงินอย่างโปร่งใส",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&family=Noto+Sans+Thai:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-[#f6f8fb] text-slate-800" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
        {children}
      </body>
    </html>
  );
}
