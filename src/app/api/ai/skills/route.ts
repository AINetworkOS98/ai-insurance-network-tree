import { NextResponse } from 'next/server';
import { skills, matchSkills } from '@/lib/ai/skills';
import { allTools } from '@/lib/ai/tools';

export const runtime = 'nodejs';
export async function GET(req: Request){
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
  const matched = q ? matchSkills(q) : skills;
  return NextResponse.json({
    ok:true, os:'AI อัจฉริยะ',
    skills: matched.map(s=> ({ name:s.name, description:s.description, triggers:s.triggers, hint:s.hint })),
    tools: Object.keys(allTools()),
    totalSkills: skills.length,
    query: q || undefined,
  });
}
