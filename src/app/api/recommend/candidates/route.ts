// n8n WF04 เรียก URL นี้ตรง ๆ: GET /api/recommend/candidates?windowHours=24&limit=50
// ตรรกะทั้งหมดอยู่ใน GET /api/recommend (ไฟล์แม่) — ที่นี่ re-export เพื่อไม่ให้มีโค้ดซ้ำสองที่
export { GET } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
