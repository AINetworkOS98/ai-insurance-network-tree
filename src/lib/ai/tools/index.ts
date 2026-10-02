// src/lib/ai/tools/index.ts — Hermes-style Tool Registry (parallel-capable, verified)
export type ToolResult = { tool: string; ok: boolean; data: any; elapsedMs: number };
export type ToolDef = {
  name: string;
  description: string;
  run: (args: any, ctx: { userId?: string; query: string }) => Promise<any>;
};

export async function runToolsParallel(defs: ToolDef[], argsMap: Record<string, any>, ctx: { userId?: string; query: string }): Promise<ToolResult[]> {
  const tasks = defs.map(async (d) => {
    const t0 = Date.now();
    try {
      const data = await d.run(argsMap[d.name] ?? { query: ctx.query }, ctx);
      return { tool: d.name, ok: true, data, elapsedMs: Date.now()-t0 } as ToolResult;
    } catch (e:any) {
      return { tool: d.name, ok: false, data: { error: e?.message ?? String(e) }, elapsedMs: Date.now()-t0 } as ToolResult;
    }
  });
  return Promise.all(tasks);
}

const tools: Record<string, ToolDef> = {
  "Database Search": {
    name: "Database Search",
    description: "ค้นหาสมาชิก/ผู้สนใจ/ใบเสร็จ ในฐานข้อมูล",
    async run(args, ctx){
      const q = String(args.query ?? ctx.query ?? "").trim().slice(0,200);
      if (!q) return { count:0, hits:[] };
      try {
        const { prisma } = await import("@/lib/prisma");
        const hits:any[] = [];
        try {
          const users:any[] = await (prisma as any).user.findMany({
            where:{ OR:[{ email:{ contains:q, mode:"insensitive"}},{ firstName:{contains:q, mode:"insensitive"}},{ lastName:{contains:q, mode:"insensitive"}},{ memberCode:{contains:q, mode:"insensitive"}}]},
            take:5, select:{ id:true, email:true, firstName:true, lastName:true, memberCode:true, rankLevel:true, status:true }
          });
          for(const u of users) hits.push({ type:"user", ...u });
        } catch {}
        try {
          const prospects:any[] = await (prisma as any).prospect.findMany({ where:{ OR:[{ firstName:{contains:q, mode:"insensitive"}},{ lastName:{contains:q, mode:"insensitive"}},{ phone:{contains:q}}]}, take:5 });
          for(const p of prospects) hits.push({ type:"prospect", id:p.id, name:`${p.firstName} ${p.lastName}`, status:p.status });
        } catch {}
        return { query:q, count:hits.length, hits };
      } catch(e:any){ return { query:q, error:e.message, hits:[] } }
    }
  },
  "Member Engine": {
    name: "Member Engine",
    description: "ดึงสมาชิกตามรหัส/ชื่อ",
    async run(args,ctx){
      const q=String(args.query??ctx.query).trim();
      try{
        const { prisma } = await import("@/lib/prisma");
        let m:any=null;
        try{ m = await (prisma as any).memberProfile.findFirst({ where:{ memberId:q }, include:{ user:{ select:{ firstName:true, lastName:true, email:true, memberCode:true, rankLevel:true }}}}); }catch{}
        if(!m) try{ const u:any=await (prisma as any).user.findFirst({ where:{ OR:[{ memberCode:q },{ email:q }]}, select:{ id:true, firstName:true, lastName:true, email:true, memberCode:true, rankLevel:true }}); if(u) return { found:true, user:u }; }catch{}
        if(!m) return { found:false, query:q };
        return { found:true, memberId:m.memberId, status:m.status, user:m.user };
      }catch(e:any){ return { error:e.message } }
    }
  },
  "Network Engine": {
    name: "Network Engine",
    description: "สรุปผัง 1 แตก 5",
    async run(args,ctx){
      const q=String(args.query??ctx.query).trim();
      try{
        const { prisma } = await import("@/lib/prisma");
        let root:any=null;
        try{ root=await (prisma as any).user.findFirst({ where:{ OR:[{ memberCode:q },{ email:q }]}, select:{ id:true, memberCode:true, firstName:true, lastName:true, rankLevel:true }}); }catch{}
        if(!root){
          const roots:any[] = await (prisma as any).treeNode.findMany({ take:3, include:{ user:{ select:{ memberCode:true, firstName:true, lastName:true }}}});
          return { mode:"sample", nodes: roots.map((r:any)=> ({ level:r.level, directCount:r.directCount, user:r.user })) };
        }
        const placements:any[] = await (prisma as any).treePlacement.findMany({ where:{ parentId: root.id }, take:5 });
        const children:any[] = await (prisma as any).user.findMany({ where:{ placementParentId: root.id }, take:5, select:{ memberCode:true, firstName:true, lastName:true }});
        return { root, placements: placements.length, children };
      }catch(e:any){ return { error:e.message } }
    }
  },
  "Prospect Engine": {
    name:"Prospect Engine", description:"สรุปผู้สนใจ",
    async run(args,ctx){
      const q=String(args.query??ctx.query).trim();
      try{
        const { prisma } = await import("@/lib/prisma");
        const list:any[] = await (prisma as any).prospect.findMany({ where: q?{ OR:[{ firstName:{contains:q, mode:"insensitive"}},{ phone:{contains:q}}]}:{}, take:5, orderBy:{ createdAt:"desc" }, select:{ prospectId:true, firstName:true, lastName:true, status:true, phone:true }});
        const total:any = await (prisma as any).prospect.count().catch(()=> list.length);
        return { total, sample: list };
      }catch(e:any){ return { error:e.message } }
    }
  },
  "Receipt Validation": {
    name:"Receipt Validation", description:"ตรวจใบเสร็จล่าสุด",
    async run(args,ctx){
      try{
        const { prisma } = await import("@/lib/prisma");
        const rows:any[] = await (prisma as any).receiptFile.findMany({ take:5, orderBy:{ createdAt:"desc" }, select:{ id:true, originalName:true, status:true, fileHash:true, createdAt:true }});
        return { count: rows.length, receipts: rows };
      }catch(e:any){ return { error:e.message } }
    }
  },
  "Sales Calculation": {
    name:"Sales Calculation", description:"คำนวณยอด/เปรียบเทียบ",
    async run(args,ctx){
      const q=String(args.query??ctx.query);
      const nums = (q.match(/[0-9,]+(?:\.[0-9]+)?/g) ?? []).map((s:string)=> Number(s.replace(/,/g,""))).filter((n:number)=> !isNaN(n));
      if(nums.length>=2){
        const sum = nums.reduce((a:number,b:number)=>a+b,0);
        return { numbers: nums, sum, avg: sum/nums.length, max: Math.max(...nums), min: Math.min(...nums) };
      }
      try{
        const { prisma } = await import("@/lib/prisma");
        const period = new Date().toISOString().slice(0,7);
        const rows:any[] = await (prisma as any).performanceRecord.findMany({ where:{ period }, take:5, select:{ amount:true, period:true }});
        const total = rows.reduce((s:number,r:any)=> s+Number(r.amount),0);
        return { period, records: rows.length, total };
      }catch(e:any){ return { numbers:nums, error:e.message } }
    }
  },
  "Calculator": {
    name:"Calculator", description:"คำนวณเลขคณิตปลอดภัย",
    async run(args,ctx){
      const expr = String(args.expression ?? args.query ?? ctx.query).trim();
      const clean = expr.replace(/[^0-9+\-*/().%\s]/g,"").slice(0,120);
      if(!clean) return { error:"ไม่มีนิพจน์คำนวณ" };
      try{
        const safe = clean.replace(/%/g,"/100");
        const fn = new Function(`return (${safe})`);
        const result = fn();
        if(typeof result!=="number" || !isFinite(result)) return { expression: clean, error:"คำนวณไม่ได้" };
        return { expression: clean, result };
      }catch(e:any){ return { expression: clean, error:e.message } }
    }
  },
  "Report Generator": {
    name:"Report Generator", description:"สรุปยอดเพื่อทำรายงาน",
    async run(args,ctx){
      try{
        const { prisma } = await import("@/lib/prisma");
        const period = args.period ?? new Date().toISOString().slice(0,7);
        const incomes:any[] = await (prisma as any).incomeTransaction.findMany({ where:{ period }, take:5, select:{ type:true, grossAmount:true, netAmount:true, status:true }});
        const totalGross = incomes.reduce((s:number,r:any)=> s+Number(r.grossAmount??0),0);
        const totalNet = incomes.reduce((s:number,r:any)=> s+Number(r.netAmount??0),0);
        return { period, count: incomes.length, totalGross, totalNet, sample: incomes.slice(0,3) };
      }catch(e:any){ return { error:e.message } }
    }
  },
  "Web Search": {
    name:"Web Search", description:"ค้นเว็บผ่าน /api/search",
    async run(args,ctx){
      const q=String(args.query??ctx.query).trim().slice(0,200);
      if(!q) return { error:"no query" };
      try{
        const res = await fetch(`${process.env.APP_BASE_URL ?? "http://localhost:3000"}/api/search`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ query:q }) }).catch(()=> null);
        if(res && res.ok){ const j=await res.json(); return { query:q, links: j.links?.slice(0,5) ?? [] }; }
      }catch{}
      return { query:q, links:[{ title:`ค้นหา "${q}"`, url:`https://www.google.com/search?q=${encodeURIComponent(q)}`, source:"web" }] };
    }
  },
};

export function getTool(name: string): ToolDef | undefined { return tools[name]; }
export function allTools(){ return tools; }
