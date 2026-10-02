// ประกาศชนิดสำหรับโมดูล 'pg' (ไม่ติดตั้ง @types/pg เพื่อลด dependency)
// ใช้ใน src/lib/sqlLite.ts ผ่าน dynamic import + กำหนด any เองอยู่แล้ว
declare module 'pg';
