import { NextResponse } from 'next/server';
export async function GET(){ return NextResponse.json({ ok:true, prospects:[{id:'P-1001',name:'อานนท์',status:'NEW',score:72},{id:'P-1002',name:'พิมพ์ใจ',status:'CONTACTED',score:85}], note:'Prospect ไม่นับในต้นไม้' }); }
export async function POST(req:Request){ const b=await req.json(); return NextResponse.json({ok:true, created:b}); }
