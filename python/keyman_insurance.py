#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
keyman_insurance.py — ประกันคีย์แมน (Keyman Insurance) v1.0.0
------------------------------------------------------------
คำนวณ 2 เรื่อง:
  1) วงเงินคุ้มครองที่ธุรกิจควรมี (3 วิธี: ทดแทนกำไร · ต้นทุนทดแทน · ภาระผูกพัน) แล้วเลือกค่าสูงสุด
  2) ผลทางภาษีของเบี้ยประกันที่บริษัทจ่าย — ใช้เอนจินเดิมของโปรเจกต์
     • ภาษีเงินได้นิติบุคคล: from thai_cit_calculator import compute_cit
     • ภาษีเงินได้บุคคลธรรมดาของบุคคลสำคัญ: from thai_tax_calculator import compute_pit, Person

ที่มา (หนังสือตอบข้อหารือกรมสรรพากร):
  กค 0706/5249 · กค 0706/8707 · กค 0702/9358 · กค 0811/408 · กค 0702/10407 · กค 0706/397
  สรุป: เบี้ยที่บริษัทจ่ายแทนกรรมการ/พนักงาน "ทุกคนเป็นการทั่วไปตามระเบียบ" → หักเป็นรายจ่ายได้
        (ไม่ต้องห้าม มาตรา 65 ตรี (3),(13)) · แต่นับเป็นเงินได้ 40(1)/(2) ของกรรมการ/พนักงาน
        · จ่ายเฉพาะผู้ถือหุ้น/กรรมการรายเดียว → หักไม่ได้ (รายจ่ายส่วนตัว มาตรา 65 ตรี (3))
        · สินไหมที่ครอบครัว/ทายาทรับ → ยกเว้นตามมาตรา 42(13) · ที่บริษัทรับ → เป็นรายได้ของบริษัท (มาตรา 65)
        · เงินที่นำไปซื้อหุ้นคืนจากทายาท → รายจ่ายลงทุน หักไม่ได้ (มาตรา 65 ตรี (5))

วิธีใช้:
    python keyman_insurance.py --demo          # ตัวอย่าง 4 กรณี
    python keyman_insurance.py --selftest      # ตรวจกับชุดทดสอบในเครื่อง (testcases_keyman.json)
    python keyman_insurance.py --json          # พิมพ์ผลลัพธ์ JSON (ใช้เทียบกับเว็บ)
    python keyman_insurance.py --json-in in.json [--json-out out.json]

คู่กันกับเอนจินฝั่งเว็บ: src/lib/tax/keyman.ts
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).parent))

from thai_cit_calculator import compute_cit          # noqa: E402
from thai_tax_calculator import compute_pit, Person  # noqa: E402

VERSION = "1.0.0"
YEAR = 2568

SOURCES = [
    "กค 0706/5249 (21 มิ.ย. 2549) บริษัทจ่ายเบี้ยประกันชีวิตแทนกรรมการ: https://www.rd.go.th/31916.html",
    "กค 0706/8707 (17 ต.ค. 2549) จ่ายเบี้ยให้กรรมการ/ผู้ถือหุ้น + ซื้อหุ้นคืน: https://www.rd.go.th/32877.html",
    "กค 0702/9358 (12 พ.ย. 2552) เบี้ยประกันชีวิตให้กรรมการ: https://www.rd.go.th/42088.html",
    "กค 0811/408 (21 ม.ค. 2543) บริษัทจ่ายเบี้ยประกันชีวิตให้กรรมการผู้จัดการ: https://www.rd.go.th/23827.html",
    "กค 0702/10407 (21 ธ.ค. 2552) นายจ้างจ่ายเบี้ยประกันชีวิตให้พนักงาน: https://www.rd.go.th/42159.html",
    "กค 0706/397 (17 ม.ค. 2549) นายจ้างจ่ายเบี้ยประกันชีวิตให้พนักงาน: https://www.rd.go.th/30689.html",
    "อัตราภาษีเงินได้นิติบุคคล (ใช้คำนวณผลประหยัด): https://www.rd.go.th/841.html",
]

DISCLAIMER = ("เป็นการประมาณการเพื่อวางแผน ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — ผลทางภาษีขึ้นอยู่กับข้อเท็จจริง "
              "(ระเบียบของบริษัท ผู้รับประโยชน์ วัตถุประสงค์) โปรดตรวจสอบกับสำนักงานสรรพากร (โทร. 1161) หรือผู้สอบบัญชี")


def r2(v: float) -> float:
    return round(float(v or 0) + 0.0, 2)


def n(v: Any) -> float:
    try:
        x = float(v or 0)
    except (TypeError, ValueError):
        return 0.0
    return x if x > 0 else 0.0


def compute_keyman(data: Dict[str, Any]) -> Dict[str, Any]:
    d = data or {}
    profit, years = n(d.get("profit_per_year")), n(d.get("years_to_replace"))
    successor, rev_at_risk = n(d.get("successor_cost")), n(d.get("revenue_at_risk"))
    debt, buyout = n(d.get("guaranteed_debt")), n(d.get("share_buyout"))

    profit_need = r2(profit * years)
    replacement_need = r2(successor + rev_at_risk)
    obligation_need = r2(debt + buyout)
    recommended = max(profit_need, replacement_need, obligation_need)
    if recommended == profit_need and profit_need > 0:
        method = "ทดแทนกำไร (กำไรสุทธิ × จำนวนปี)"
    elif recommended == obligation_need and obligation_need > 0:
        method = "ภาระผูกพัน (หนี้ค้ำประกัน + ซื้อหุ้นคืนจากทายาท)"
    elif recommended == replacement_need and replacement_need > 0:
        method = "ต้นทุนทดแทน (สรรหาผู้สืบทอด + รายได้ที่หายไป)"
    else:
        method = "ยังไม่มีข้อมูลเพียงพอ"

    premium = n(d.get("premium"))
    deductible = d.get("deductible", True) is not False
    benefit = d.get("benefit_to_executive", True) is not False

    rev, exp, cap = n(d.get("company_revenue")), n(d.get("company_expenses")), n(d.get("company_capital"))
    cit_before = compute_cit({"revenue": rev, "expenses": exp, "capital_paid_up": cap})["tax_payable"]
    cit_after = compute_cit({"revenue": rev, "expenses": exp + (premium if deductible else 0),
                             "capital_paid_up": cap})["tax_payable"]
    cit_saving = r2(cit_before - cit_after)

    exec_income = n(d.get("executive_income"))
    pit_before = compute_pit([Person(salary=exec_income, personal=True)])["item12_total_tax"]
    pit_after = compute_pit([Person(salary=exec_income + (premium if benefit else 0), personal=True)])["item12_total_tax"]
    exec_tax_increase = r2(pit_after - pit_before)

    net_cost = r2(premium - cit_saving + exec_tax_increase)
    net_cost_per_cover = r2(net_cost / premium) if premium > 0 else 0.0

    # ── ภาษีที่บริษัท "ออกให้" — คำนวณเป็นทอด ๆ ตามคำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8) ──
    # "ให้นำเงินค่าภาษีที่นายจ้างออกแทนให้ไปรวมกับเงินเดือน ... แล้วคำนวณภาษีตามเกณฑ์ในมาตรา 48(1) ...
    #  จนกว่าจะไม่มีเงินค่าภาษีที่นายจ้างต้องออกแทนให้อีก" · มาตรา 39 นับภาษีที่ผู้อื่นออกแทนให้เป็นเงินได้พึงประเมิน
    pays_tax = d.get("company_pays_exec_tax", True) is not False
    gu_rounds_detail: List[Dict[str, Any]] = []
    gu_tax_borne = 0.0
    gu_converged = not pays_tax
    gu_marginal = 0.0
    for i in range(1, 61):
        if not pays_tax:
            break
        income_with_tax = r2(exec_income + (premium if benefit else 0) + gu_tax_borne)
        pit = compute_pit([Person(salary=income_with_tax, personal=True)])
        tax = r2(pit["item12_total_tax"])
        gu_marginal = pit["marginal_rate"]
        gu_rounds_detail.append({"round": i, "income_with_tax": income_with_tax, "tax": tax,
                                 "increase": r2(tax - gu_tax_borne)})
        if abs(tax - gu_tax_borne) <= 0.01:
            gu_tax_borne, gu_converged = tax, True
            break
        gu_tax_borne = tax

    gu_total_outlay = r2(premium + gu_tax_borne)
    cit_with_all = compute_cit({"revenue": rev,
                                "expenses": exp + (premium if deductible else 0) + (gu_tax_borne if deductible else 0),
                                "capital_paid_up": cap})["tax_payable"]
    gu_cit_saving = r2(cit_before - cit_with_all)
    gu_net_cost = r2(gu_total_outlay - gu_cit_saving)

    checklist = [
        {"ok": deductible, "item": "จ่ายให้กรรมการ/พนักงาน \"ทุกคนเป็นการทั่วไป\" ตามระเบียบ/มติที่ประชุมของบริษัท (ไม่ใช่เฉพาะผู้บริหารคนใดคนหนึ่ง)"},
        {"ok": deductible, "item": "ระเบียบ/มติที่ประชุม + วัตถุประสงค์เพื่อผลประโยชน์ของบริษัท ไม่ใช่รายจ่ายส่วนตัวหรือให้โดยเสน่หา (มาตรา 65 ตรี (3),(13))"},
        {"ok": True, "item": "ใบเสร็จรับเงินระบุว่าเบี้ยประกันนี้ \"จ่ายโดยบริษัท\" (ตามแนววินิจฉัย กค 0811/408)"},
        {"ok": benefit, "item": "รับรู้ว่าเบี้ยที่บริษัทจ่ายแทนกรรมการ/พนักงาน เป็นเงินได้พึงประเมิน 40(1)/(2) ที่ต้องนำไปยื่น ภ.ง.ด.90/91"},
        {"ok": True, "item": "ถ้าบริษัทเป็นผู้รับประโยชน์: เงินค่าสินไหมที่ได้รับต้องบันทึกเป็นรายได้ของบริษัท (มาตรา 65)"},
        {"ok": True, "item": "เงินค่าสินไหมที่นำไปซื้อหุ้นคืนจากทายาท เป็นรายจ่ายลงทุน — หักเป็นค่าใช้จ่ายไม่ได้ (มาตรา 65 ตรี (5))"},
    ]

    rules = [
        {"situation": "จ่ายเบี้ยให้ \"กรรมการ/พนักงานทุกคน\" เป็นการทั่วไปตามระเบียบของบริษัท",
         "deduct": "หักเป็นรายจ่ายได้ (ไม่ต้องห้าม มาตรา 65 ตรี (3),(13))",
         "income": "เป็นประโยชน์เพิ่ม/เงินได้พึงประเมิน 40(1) หรือ (2) ของกรรมการ-พนักงาน",
         "claim": "ค่าสินไหมที่บริษัท (ผู้รับประโยชน์) ได้รับ = รายได้ของบริษัท · ถ้าครอบครัว/ทายาทเป็นผู้รับประโยชน์ เงินได้นั้นได้รับยกเว้นตามมาตรา 42(13)",
         "source": "กค 0706/5249 · กค 0702/9358 · กค 0811/408"},
        {"situation": "จ่ายเบี้ยให้ \"ผู้ถือหุ้น/กรรมการเฉพาะราย\" ไม่เป็นธรรมเนียมทั่วไป",
         "deduct": "หักไม่ได้ — เป็นรายจ่ายส่วนตัวหรือให้โดยเสน่หา (มาตรา 65 ตรี (3))",
         "income": "ผู้ถือหุ้นมีเงินได้พึงประเมินตามมาตรา 39 ต้องนำไปรวมคำนวณภาษี",
         "claim": "เงินค่าสินไหมที่บริษัทนำไปซื้อหุ้นคืนจากทายาท = รายจ่ายลงทุน หักไม่ได้ (มาตรา 65 ตรี (5))",
         "source": "กค 0706/8707"},
        {"situation": "บริษัทจ่ายเบี้ยแทนพนักงานทุกคนตามระเบียบสวัสดิการ (กรมธรรม์สะสมทรัพย์ นายจ้างถือกรมธรรม์)",
         "deduct": "หักเป็นรายจ่ายได้ · ผลประโยชน์ที่ส่งมอบให้พนักงานตามระเบียบ (ถือเป็นส่วนหนึ่งของสัญญาจ้าง) หักได้ด้วย",
         "income": "เบี้ยและผลประโยชน์ที่พนักงานได้รับ = เงินได้พึงประเมิน 40(1)",
         "claim": "ผลประโยชน์ที่พนักงานผู้เอาประกันหรือทายาทได้รับตามกรมธรรม์ ได้รับยกเว้นตามมาตรา 42(13)",
         "source": "กค 0702/10407 · กค 0706/397"},
    ]

    notes: List[str] = []
    if not deductible:
        notes.append("กรณีนี้บริษัทหักเบี้ยเป็นค่าใช้จ่ายไม่ได้ → ไม่มีผลประหยัดภาษีนิติบุคคล และกรรมการ/ผู้ถือหุ้นยังมีเงินได้ที่ต้องนำไปยื่น → ต้นทุนสุทธิสูงกว่าที่จ่ายจริง")
    if benefit and exec_tax_increase > cit_saving:
        notes.append("ภาระภาษีบุคคลธรรมดาของบุคคลสำคัญสูงกว่าภาษีนิติบุคคลที่ประหยัดได้ → ต้นทุนสุทธิมากกว่าเบี้ยประกัน · ควรออกแบบเป็นสวัสดิการกลุ่ม/พิจารณาโครงสร้างให้เหมาะสม")
    if cit_saving > 0 and exec_tax_increase == 0:
        notes.append("บุคคลสำคัญมีเงินได้ไม่ถึงเกณฑ์เสียภาษี → เบี้ยที่จ่ายแทนยังไม่เกิดภาระภาษีบุคคลธรรมดา ทำให้ได้ประโยชน์ทางภาษีเต็มจำนวน")
    if gu_tax_borne > 0:
        notes.append(f"กรณีบริษัท \"ออกภาษีให้\" ด้วย: ต้องออกภาษีเงินได้บุคคลธรรมดาให้ทั้งสิ้น {gu_tax_borne:,.2f} บาท "
                     f"(คำนวณเป็นทอด ๆ {len(gu_rounds_detail)} ทอด ตามคำสั่งกรมสรรพากรที่ ป. 96/2543) · "
                     f"บริษัทหักได้ทั้งเบี้ยประกันและภาษีที่ออกให้ → ประหยัดภาษีนิติบุคคลรวม {gu_cit_saving:,.2f} บาท/ปี")
    notes.append("การหักภาษี ณ ที่จ่ายจาก \"ประโยชน์เพิ่ม\" ที่ไม่ใช่ตัวเงินเป็นเรื่องเฉพาะราย — ให้ตรวจกับสำนักงานสรรพากร (โทร. 1161) ก่อนนำส่ง")
    notes.append("วงเงินคุ้มครองที่แนะนำคือค่าสูงสุดของ 3 วิธี (ทดแทนกำไร · ต้นทุนทดแทน · ภาระผูกพัน) — บริษัทสามารถเลือกทำหลายกรมธรรม์รวมกันให้ครอบคลุมทุกด้านได้")

    return {
        "program": "keyman_insurance.py", "version": VERSION, "year": YEAR,
        "profit_need": profit_need, "replacement_need": replacement_need, "obligation_need": obligation_need,
        "recommended_cover": r2(recommended), "cover_method": method,
        "cover_per_premium": r2(recommended / premium) if premium > 0 else 0.0,
        "premium": premium, "deductible": deductible, "benefit_to_executive": benefit,
        "cit_before": r2(cit_before), "cit_after": r2(cit_after), "cit_saving": cit_saving,
        "pit_before": r2(pit_before), "pit_after": r2(pit_after), "exec_tax_increase": exec_tax_increase,
        "net_cost": net_cost, "net_cost_per_cover": net_cost_per_cover,
        "gu_tax_borne": r2(gu_tax_borne), "gu_total_outlay": gu_total_outlay,
        "gu_cit_saving": gu_cit_saving, "gu_net_cost": gu_net_cost,
        "gu_rounds": len(gu_rounds_detail), "gu_converged": gu_converged,
        "gu_marginal_rate": gu_marginal,
        "gu_employee_declared_income": r2(exec_income + (premium if benefit else 0) + gu_tax_borne),
        "gu_employee_gets": r2(exec_income + (premium if benefit else 0)),
        "gu_rounds_detail": gu_rounds_detail,
        "gu_note": ("คำนวณเป็นทอด ๆ ตามคำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8): นำภาษีที่บริษัทออกแทนให้ไปรวมเป็นเงินได้ "
                    "ของกรรมการ/พนักงาน แล้วคำนวณภาษีใหม่ ทำซ้ำจนไม่มีภาษีที่ต้องออกแทนอีก · เงินค่าภาษีอากรที่ออกแทนให้ "
                    "เป็นเงินได้พึงประเมินตามมาตรา 39 และเป็นรายจ่ายที่หักได้ของบริษัท (ไม่ต้องห้าม 65 ตรี (6) ตาม กค 0811/408)"),
        "result": ("ต้นทุนภาษีสุทธิเป็นศูนย์หรือติดลบ (ได้ประโยชน์ทางภาษีเต็มที่)" if net_cost <= 0
                   else f"ต้นทุนภาษีสุทธิ {net_cost:,.0f} บาท/ปี"),
        "checklist": checklist, "rules": rules, "notes": notes,
        "sources": SOURCES, "disclaimer": DISCLAIMER,
    }


# ─────────────────────────── แสดงผล ───────────────────────────
def line(ch: str = "─", k: int = 96) -> str:
    return ch * k


def format_report(r: Dict[str, Any]) -> str:
    b: List[str] = []
    b.append(line("="))
    b.append(f" ประกันคีย์แมน (Keyman Insurance) · รอบปี {r['year']} · {r['program']} v{r['version']}")
    b.append(line("="))
    b.append(" 1) วงเงินคุ้มครองที่ธุรกิจควรมี")
    b.append(f"    • ทดแทนกำไร: {r['profit_need']:>16,.2f}")
    b.append(f"    • ต้นทุนทดแทน (สรรหาผู้สืบทอด + รายได้ที่หาย): {r['replacement_need']:>14,.2f}")
    b.append(f"    • ภาระผูกพัน (หนี้ค้ำประกัน + ซื้อหุ้นคืน): {r['obligation_need']:>16,.2f}")
    b.append(f"    → แนะนำวงเงินคุ้มครอง {r['recommended_cover']:,.2f} บาท ({r['cover_method']})")
    if r["premium"]:
        b.append(f"      = {r['cover_per_premium']:,.2f} เท่าของเบี้ยประกัน {r['premium']:,.0f} บาท/ปี")
    b.append(line())
    b.append(" 2) ผลทางภาษี")
    b.append(f"    • ภาษีเงินได้นิติบุคคลก่อนหักเบี้ย: {r['cit_before']:>14,.2f}")
    b.append(f"    • ภาษีเงินได้นิติบุคคลหลังหักเบี้ย: {r['cit_after']:>14,.2f}")
    b.append(f"      → บริษัทประหยัดภาษี {r['cit_saving']:,.2f} บาท {'(หักเบี้ยได้)' if r['deductible'] else '(หักเบี้ยไม่ได้)'}")
    b.append(f"    • ภาษีเงินได้บุคคลธรรมดาของบุคคลสำคัญ: {r['pit_before']:>10,.2f} → {r['pit_after']:,.2f}")
    b.append(f"      → ภาระภาษีบุคคลธรรมดาเพิ่มขึ้น {r['exec_tax_increase']:,.2f} บาท "
             f"{'(เบี้ยเป็นเงินได้ 40(1) ของกรรมการ/พนักงาน)' if r['benefit_to_executive'] else ''}")
    b.append(f"    → ต้นทุนภาษีสุทธิของเบี้ย {r['premium']:,.0f} บาท = {r['net_cost']:,.2f} บาท/ปี · {r['result']}")
    b.append(line())
    b.append(" 2.1) กรณีบริษัท \"ออกภาษีให้\" — คำนวณเป็นทอด ๆ (คำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8))")
    b.append(f"    เบี้ยประกัน {r['premium']:,.0f} + ภาษีที่บริษัทออกให้ {r['gu_tax_borne']:,.2f} = จ่ายจริง {r['gu_total_outlay']:,.2f} บาท")
    b.append("    ลำดับทอด:")
    for g in r["gu_rounds_detail"][:12]:
        b.append(f"      ทอด {g['round']:>2}: เงินได้รวมภาษีที่ออกให้ {g['income_with_tax']:>14,.2f} → ภาษี {g['tax']:>12,.2f} "
                 f"(เพิ่มขึ้น {g['increase']:>10,.2f})")
    if len(r["gu_rounds_detail"]) > 12:
        b.append(f"      … รวม {r['gu_rounds']} ทอด (บรรจบเมื่อไม่มีภาษีต้องออกให้เพิ่ม)")
    b.append(f"    → ภาษีที่ต้องออกให้ทั้งสิ้น {r['gu_tax_borne']:,.2f} บาท (ขั้นภาษีสูงสุด {r['gu_marginal_rate'] * 100:.0f}%) "
             f"· เงินได้ที่กรรมการ/พนักงานต้องยื่น {r['gu_employee_declared_income']:,.2f} บาท")
    b.append(f"    → บริษัทหักได้ทั้งเบี้ยและภาษีที่ออกให้ ประหยัดภาษีนิติบุคคลรวม {r['gu_cit_saving']:,.2f} บาท · "
             f"ต้นทุนสุทธิของบริษัท {r['gu_net_cost']:,.2f} บาท/ปี")
    b.append(line())
    b.append(" 3) เช็กลิสต์เงื่อนไข (ตามหนังสือตอบข้อหารือ)")
    for c in r["checklist"]:
        b.append(f"    [{'✓' if c['ok'] else '✗'}] {c['item']}")
    b.append(line())
    b.append(" 4) หลักเกณฑ์แยกตามกรณี")
    for ru in r["rules"]:
        b.append(f"    • {ru['situation']}")
        b.append(f"        หักค่าใช้จ่าย: {ru['deduct']} | เงินได้: {ru['income']}")
        b.append(f"        ผลประโยชน์/สินไหม: {ru['claim']} ({ru['source']})")
    for nt in r["notes"]:
        b.append(f" ⚠ {nt}")
    b.append(f" {r['disclaimer']}")
    b.append(line("="))
    return "\n".join(b)


DEMO_CASES = [
    ("SME กำไร 1.5 ล้าน/ปี · ผู้บริหารได้ 2 ล้าน · จ่ายทุกคนตามระเบียบ",
     {"profit_per_year": 1_500_000, "years_to_replace": 3, "successor_cost": 500_000, "revenue_at_risk": 500_000,
      "guaranteed_debt": 2_000_000, "share_buyout": 3_000_000, "premium": 100_000, "deductible": True,
      "benefit_to_executive": True, "company_revenue": 8_000_000, "company_expenses": 6_500_000,
      "company_capital": 3_000_000, "executive_income": 2_000_000}),
    ("บริษัททั่วไป (CIT 20%) · ผู้บริหารได้ 1 ล้าน",
     {"profit_per_year": 8_000_000, "years_to_replace": 3, "successor_cost": 1_000_000, "revenue_at_risk": 2_000_000,
      "guaranteed_debt": 10_000_000, "share_buyout": 8_000_000, "premium": 100_000, "deductible": True,
      "benefit_to_executive": True, "company_revenue": 50_000_000, "company_expenses": 42_000_000,
      "company_capital": 10_000_000, "executive_income": 1_000_000}),
    ("จ่ายเฉพาะผู้ถือหุ้นรายเดียว → หักค่าใช้จ่ายไม่ได้",
     {"profit_per_year": 1_500_000, "years_to_replace": 3, "successor_cost": 500_000, "revenue_at_risk": 500_000,
      "guaranteed_debt": 2_000_000, "share_buyout": 3_000_000, "premium": 100_000, "deductible": False,
      "benefit_to_executive": True, "company_revenue": 8_000_000, "company_expenses": 6_500_000,
      "company_capital": 3_000_000, "executive_income": 2_000_000}),
    ("บริษัทหักได้ + ผู้บริหารเงินได้ต่ำ (ไม่เสียภาษีบุคคลธรรมดา)",
     {"profit_per_year": 1_500_000, "years_to_replace": 3, "successor_cost": 500_000, "revenue_at_risk": 500_000,
      "guaranteed_debt": 2_000_000, "share_buyout": 3_000_000, "premium": 100_000, "deductible": True,
      "benefit_to_executive": True, "company_revenue": 8_000_000, "company_expenses": 6_500_000,
      "company_capital": 3_000_000, "executive_income": 150_000}),
]


def demo() -> int:
    for title, inp in DEMO_CASES:
        print(f"\n### {title}")
        print(format_report(compute_keyman(inp)))
    return 0


def load_cases(path: Optional[str] = None) -> List[Dict[str, Any]]:
    p = Path(path) if path else Path(__file__).with_name("testcases_keyman.json")
    return json.loads(p.read_text(encoding="utf-8"))["cases"]


def selftest(path: Optional[str] = None) -> int:
    cases = load_cases(path)
    print(line("="))
    print(f" ตรวจความถูกต้องโปรแกรมประกันคีย์แมน · {len(cases)} กรณี (ตัวเลข expect ตามเกณฑ์สรรพากร + เอนจินภาษีเดิม)")
    print(line("="))
    ok = 0
    for c in cases:
        got = compute_keyman(c["input"])
        wrong = []
        for k, v in c["expect"].items():
            g = got.get(k)
            if isinstance(v, bool):
                if bool(g) != v:
                    wrong.append(f"{k}: ได้ {g} · ควรเป็น {v}")
            elif isinstance(g, (int, float)) and isinstance(v, (int, float)):
                if abs(float(g) - float(v)) > 0.51:
                    wrong.append(f"{k}: ได้ {float(g):,.2f} · ควรเป็น {float(v):,.2f}")
            elif g != v:
                wrong.append(f"{k}: ได้ {g} · ควรเป็น {v}")
        if wrong:
            print(f"✗ {c['name']}")
            for w in wrong:
                print(f"    {w}")
        else:
            ok += 1
            print(f"✓ {c['name']} — วงเงินแนะนำ {got['recommended_cover']:,.0f} · ต้นทุนสุทธิ {got['net_cost']:,.0f} บาท/ปี")
    print(line("─"))
    print(f"ผ่าน {ok}/{len(cases)} กรณี")
    return 0 if ok == len(cases) else 1


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="ประกันคีย์แมน: วงเงินคุ้มครอง + ผลทางภาษี (ตามแนววินิจฉัยกรมสรรพากร)")
    ap.add_argument("--demo", action="store_true", help="แสดงตัวอย่าง 4 กรณี")
    ap.add_argument("--selftest", action="store_true", help="ตรวจกับชุดทดสอบมาตรฐาน")
    ap.add_argument("--cases", help="ไฟล์ชุดทดสอบ (JSON)")
    ap.add_argument("--json", action="store_true", help="พิมพ์ผลลัพธ์ตัวอย่างแรกเป็น JSON")
    ap.add_argument("--json-in", help="ไฟล์ JSON อินพุต")
    ap.add_argument("--json-out", help="ไฟล์ JSON ผลลัพธ์")
    a = ap.parse_args(argv)

    if a.selftest:
        return selftest(a.cases)
    if a.demo:
        return demo()
    if a.json:
        print(json.dumps(compute_keyman(DEMO_CASES[0][1]), ensure_ascii=False, indent=2))
        return 0
    if a.json_in:
        data = json.loads(Path(a.json_in).read_text(encoding="utf-8"))
        res = compute_keyman(data.get("input", data))
        if a.json_out:
            Path(a.json_out).write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"เขียนผลลัพธ์: {a.json_out}")
        else:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0
    print(format_report(compute_keyman(DEMO_CASES[0][1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
