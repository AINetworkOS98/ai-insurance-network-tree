import { ReactNode } from 'react';

export const metadata = {
  title: 'n8n Automation — AI Insurance Network Tree',
  description: 'ระบบอัตโนมัติด้วย n8n Workflow สำหรับบริหารเครือข่ายตัวแทนประกันชีวิต',
};

interface Props {
  children: ReactNode;
}

export default function N8nAutomationLayout({ children }: Props) {
  return <>{children}</>;
}
