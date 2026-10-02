import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ytcuepcwxpogqmlntjks.supabase.co',
  'sb_publishable_Dil4q88IBcTGuEIOVCe09A_mA_c496W'
);

async function createAllTables() {
  console.log('🚀 เริ่มสร้างตารางทั้งหมด...\n');

  // วิธีที่ 1: ลองใช้ supabase.rpc กับฟังก์ชัน pg_temp.create_table
  const methods = [
    // วิธี A: ใช้ pg_temp
    async () => {
      const { error } = await supabase.rpc('pg_temp.create_table', {
        table_name: 'provinces',
        definition: 'id INT PRIMARY KEY, name_th TEXT, name_en TEXT, geography_id INT'
      });
      return error?.message;
    },
    // วิธี B: ใช้ SQL ผ่าน查询直接
    async () => {
      const { error } = await supabase
        .from('_supabase_meta')
        .insert({ key: 'test' });
      return error?.message;
    },
    // วิธี C: ลองใช้ supabase จากตารางที่ยังไม่มี
    async () => {
      const { error } = await supabase
        .from('provinces')
        .insert({ id: 1, name_th: 'ทดสอบ', name_en: 'Test' });
      return error?.message;
    }
  ];

  for (let i = 0; i < methods.length; i++) {
    const method = methods[i];
    const label = ['pg_temp.create_table', 'จากตาราง _supabase_meta', 'supabase.from().insert'][i];
    console.log(`วิธี ${i + 1}: ${label}...`);
    try {
      const result = await method();
      console.log(`  → ${result || 'สำเร็จ!'}`);
    } catch(e) {
      console.log(`  → Error: ${e.message}`);
    }
  }
}

createAllTables();
