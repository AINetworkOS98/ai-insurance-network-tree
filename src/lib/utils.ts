import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function maskPhone(phone?: string | null) {
  if (!phone) return "-";
  const c = phone.replace(/[^0-9]/g,"");
  if (c.length < 7) return phone;
  return `${c.slice(0,3)}-XXX-${c.slice(-4)}`;
}
export function maskEmail(email?: string | null) {
  if (!email) return "-";
  const [a,b] = email.split("@");
  if (!a || !b) return email;
  return `${a[0]}***@${b}`;
}
export function formatTHB(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB"}).format(v||0);
}
export function toBangkok(date: string | Date) {
  return new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok", dateStyle:"medium", timeStyle:"short"}).format(new Date(date));
}
