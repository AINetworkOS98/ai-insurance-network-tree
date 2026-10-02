import type { Metadata } from 'next';
import NetworkSimulator from '@/components/NetworkSimulator';

export const metadata: Metadata = {
  title: '1 แตก 5 – Future Network Simulator | เครือข่ายตัวแทน',
  description:
    'โปรแกรมทดลองจำลองโครงสร้างเครือข่ายแบบ 1 แตก 5 และแผนรายได้ เพื่อวางแผนและทดลองความเป็นไปได้ของโครงสร้างสมาชิก — ข้อมูลจำลองทั้งหมด แยกจากข้อมูลจริง ไม่ใช่การรับประกันรายได้',
};

export default function NetworkSimulatorPage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <NetworkSimulator />
    </main>
  );
}
