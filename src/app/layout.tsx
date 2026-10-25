import type { Metadata, Viewport } from "next";
import "./globals.css";
import Script from "next/script";
import VisitorCounter from "@/components/VisitorCounter";
import UtmCapture from "@/components/UtmCapture";
import AutoTranslate from "@/components/AutoTranslate";
import SiteAiAssistant from "@/components/SiteAiAssistant";
import PwaRegister from "@/components/PwaRegister";

// สีหลักของแอป (ต้องตรงกับ theme_color ใน manifest + apple status bar)
const PWA_THEME = "#475569";

export const metadata: Metadata = {
  title: "AI Insurance Network Tree — ระบบบริหารเครือข่ายตัวแทน",
  description: "บริหารผู้สนใจ ผู้สมัคร สมาชิก ต้นไม้ฐานกว้าง 5 คน ผลงาน รายได้ และเอกสารทางการเงินอย่างโปร่งใส",
  applicationName: "NAVI สแกนใบเสร็จ",
  // ไอคอน: Android/Chrome ใช้ manifest · iOS ต้องมี apple-touch-icon.png (180x180) ไม่งั้นหน้าจอโฮมได้ภาพหน้าจอแทนไอคอน
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS: เปิดจากหน้าจอโฮมแล้วเป็นแอปเต็มจอ (ไม่ติดแถบ Safari)
  appleWebApp: {
    capable: true,
    title: "NAVI สแกนใบเสร็จ",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PWA_THEME,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&family=Noto+Sans+Thai:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-soft-white text-slate-medium font-sans antialiased" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
        {children}
        {/* ผู้ช่วย AI ลอยได้ทุกหน้า (Hermes · DeepSeek) — ซ่อนเองในหน้าผู้ดูแลและหน้า /contact */}
        <SiteAiAssistant />
        <VisitorCounter />
        {/* ทำให้ทุกหน้าเป็นสากล: สลับข้อความไทย→อังกฤษตามเมนูภาษา (ไม่แตะหน้าตาเดิม) */}
        <AutoTranslate />
        {/* เก็บที่มาแคมเปญ (UTM / ttclid) ไว้ทั้ง session เพื่อแนบไปกับฟอร์มลีด */}
        <UtmCapture />
        {/* ลงทะเบียน service worker → เว็บติดตั้งเป็นแอป (PWA) ได้ */}
        <PwaRegister />
        {/* สคริปต์เก็บข้อมูลผู้เข้าชม — ทำงานเฉพาะเมื่อผู้ใช้กด "ยินยอม" เท่านั้น */}
        <Script src="/track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
