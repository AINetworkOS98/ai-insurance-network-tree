// เพิ่มตาราง visitor_counts ลงใน Supabase
import { createClient } from '@supabase/supabase-js';

// ใช้ URL และ anon key จาก create-tables.mjs (same project)
const supabase = createClient(
  'https://ytcuepcwxpogqmlntjks.supabase.co',
  'sb_publishable_Dil4q88IBcTGuEIOVCe09A_mA_c496W'
);

async function createVisitorCountsTable() {
  console.log('🚀 สร้างตาราง visitor_counts...');

  // ลองสร้างตารางผ่าน SQL
  const { error } = await supabase.rpc('create_table', {
    name: 'visitor_counts',
    definition: 'id INT PRIMARY KEY, count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()'
  });

  if (error) {
    console.log('✗ สร้างตารางด้วย RPC ล้มเหลว:', error.message);
    console.log('⚠️ อาจจำเป็นต้องสร้างตารางผ่าน Supabase Dashboard แทน');
    console.log('📋 SQL: CREATE TABLE visitor_counts (id INT PRIMARY KEY, count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())');
  } else {
    console.log('✓ visitor_counts สร้างสำเร็จ');
  }
}

createVisitorCountsTable().catch(console.error);
