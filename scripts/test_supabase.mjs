import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ytcuepcwxpogqmlntjks.supabase.co',
  'sb_publishable_Dil4q88IBcTGuEIOVCe09A_mA_c496W'
);

async function main() {
  console.log('=== 1. ทดสอบเชื่อมต่อ ===');
  try {
    const { data, error } = await supabase.from('provinces').select('id').limit(1);
    if (error) {
      console.log('Error (ไม่มีตาราง):', error.message);
    } else {
      console.log('มีข้อมูลใน provinces:', data);
    }
  } catch(e) { console.log('Error:', e.message); }

  console.log('\n=== 2. ลองสร้างตารางผ่าน RPC exec_sql ===');
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `CREATE TABLE IF NOT EXISTS test_temp (id INT PRIMARY KEY, name TEXT)`
    });
    if (error) console.log('Error:', error.message);
    else console.log('Success:', data);
  } catch(e) { console.log('Catch:', e.message); }

  console.log('\n=== 3. ลองสร้างตารางผ่าน REST API โดยตรง ===');
  try {
    const res = await fetch('https://ytcuepcwxpogqmlntjks.supabase.co/rest/v1/sql', {
      method: 'POST',
      headers: {
        'apikey': 'sb_publishable_Dil4q88IBcTGuEIOVCe09A_mA_c496W',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `CREATE TABLE IF NOT EXISTS provinces (id INT PRIMARY KEY, name_th TEXT, name_en TEXT, geography_id INT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ)`
      })
    });
    const result = await res.json();
    console.log('Status:', res.status);
    console.log('Result:', JSON.stringify(result).substring(0, 500));
  } catch(e) { console.log('Fetch Error:', e.message); }
}

main();
