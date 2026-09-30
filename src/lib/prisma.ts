import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
// แคชบน globalThis ทุก environment (รวม production) — Next สร้างโมดูลแยกต่อ route bundle ถ้าไม่แคช
// แต่ละ route จะสร้าง PrismaClient ใหม่ → query แรกของ route นั้นต้องสร้าง client + ต่อ connection ใหม่
// บนโฮสต์แรมจำกัด/ดิสก์ช้า (Hostinger Cloud Startup) เคสนี้ทำให้ /auth/callback ค้างจน proxy ตัดเป็น 504
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;
