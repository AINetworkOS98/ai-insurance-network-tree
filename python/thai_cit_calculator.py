#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thai_cit_calculator.py — เครื่องคำนวณภาษีเงินได้นิติบุคคล (Corporate Income Tax) v1.0.0
---------------------------------------------------------------------------------------
อ้างอิงกรมสรรพากร (rd.go.th):
  • นิติบุคคลทั่วไป ร้อยละ 20 ของกำไรสุทธิ (มาตรา 67)
  • อัตรา SME (ทุนจดทะเบียนที่ชำระแล้ว ≤ 5 ล้านบาท และรายได้จากการขายสินค้า/ให้บริการ ≤ 30 ล้านบาท):
    กำไรสุทธิไม่เกิน 300,000 บาท ยกเว้น · 300,001–3,000,000 ร้อยละ 15 · เกิน 3,000,000 ร้อยละ 20
  • เงินบริจาคหักได้ไม่เกินร้อยละ 2 ของกำไรสุทธิ (มาตรา 65 ตรี (3)) · ขาดทุนยกไปได้ 5 รอบบัญชี
  • ภ.ง.ด.51 ครึ่งปี (ร้อยละ 50 ของภาษีประมาณการ ภายใน 31 ส.ค.) · ภ.ง.ด.50 ภายใน 150 วัน (31 พ.ค.)
  • ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้ (1% ขนส่ง · 2% โฆษณา · 3% บริการ · 5% ค่าเช่า) เป็นเครดิตได้

วิธีใช้:
    python thai_cit_calculator.py --demo                 # ตัวอย่าง 3 กรณี
    python thai_cit_calculator.py --selftest             # ตรวจกับชุดทดสอบ (testcases_thai_cit.json)
    python thai_cit_calculator.py --json-in case.json --json-out result.json
    python thai_cit_calculator.py                        # ถาม-ตอบทีละช่อง

คู่กันกับเอนจินฝั่งเว็บ: src/lib/tax/thaiCit.ts (แก้ที่หนึ่งต้องแก้ให้ตรงกัน)
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

VERSION = "1.0.0"
YEAR = 2568

STANDARD_RATE = 0.20
SME_BRACKETS: List[tuple] = [(300_000, 0.0), (3_000_000, 0.15), (float("inf"), 0.20)]
LIMITS = {
    "sme_capital": 5_000_000,
    "sme_revenue": 30_000_000,
    "sme_exempt_profit": 300_000,
    "donation_rate": 0.02,
    "loss_carry_years": 5,
    "half_year_rate": 0.50,
}

SOURCES = [
    "อัตราภาษีและการคำนวณภาษีเงินได้นิติบุคคล: https://www.rd.go.th/841.html",
    "คู่มือภาษีเงินได้นิติบุคคลสำหรับผู้ประกอบการ SME: "
    "https://www.rd.go.th/fileadmin/user_upload/SMEs/infographic/guidelines_SME_290965.pdf",
    "หน้าดาวน์โหลดแบบ ภ.ง.ด.50 / ภ.ง.ด.51: https://www.rd.go.th/67335.html",
    "อัตราภาษีเงินได้นิติบุคคลร้อยละ 20 (มาตรา 67)",
]

DISCLAIMER = ("ตัวเลขนี้เป็นการประมาณการเพื่อวางแผนภาษีตามหลักเกณฑ์กรมสรรพากร "
              "ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — กรณีมีรายการปรับปรุงทางภาษีเฉพาะราย "
              "โปรดปรึกษาสำนักงานสรรพากร (โทร. 1161) หรือผู้สอบบัญชี")


def r2(v: float) -> float:
    return round(float(v or 0) + 0.0, 2)


def n(v: Any) -> float:
    try:
        x = float(v or 0)
    except (TypeError, ValueError):
        return 0.0
    return x if x > 0 else 0.0


@dataclass
class CitInput:
    revenue: float = 0.0
    other_income: float = 0.0
    expenses: float = 0.0
    loss_carry_forward: float = 0.0
    donations: float = 0.0
    capital_paid_up: float = 0.0
    withholding: float = 0.0
    pnd51_paid: float = 0.0
    boi_promoted: bool = False

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CitInput":
        return cls(
            revenue=n(d.get("revenue")), other_income=n(d.get("other_income")),
            expenses=n(d.get("expenses")), loss_carry_forward=n(d.get("loss_carry_forward")),
            donations=n(d.get("donations")), capital_paid_up=n(d.get("capital_paid_up")),
            withholding=n(d.get("withholding")), pnd51_paid=n(d.get("pnd51_paid")),
            boi_promoted=bool(d.get("boi_promoted")),
        )


def sme_tax(taxable_profit: float) -> Dict[str, Any]:
    """ภาษีตามอัตรา SME (ขั้นบันได 3 ขั้น)"""
    steps: List[Dict[str, Any]] = []
    tax = 0.0
    lower = 0.0
    for upper, rate in SME_BRACKETS:
        if taxable_profit <= lower:
            break
        amount = min(taxable_profit, upper) - lower
        if amount <= 0:
            break
        t = amount * rate
        tax += t
        if upper == float("inf"):
            rng = f"เกิน {lower:,.0f} บาทขึ้นไป"
        elif lower == 0:
            rng = f"ไม่เกิน {upper:,.0f} บาท"
        else:
            rng = f"เกิน {lower:,.0f} แต่ไม่เกิน {upper:,.0f} บาท"
        steps.append({"range": rng, "rate": rate, "amount": r2(amount), "tax": r2(t)})
        lower = upper
    return {"steps": steps, "tax": r2(tax)}


def compute_cit(data: Any) -> Dict[str, Any]:
    p = data if isinstance(data, CitInput) else CitInput.from_dict(data)

    total_revenue = p.revenue + p.other_income
    profit_before_loss = max(0.0, total_revenue - p.expenses)
    loss_carry = min(p.loss_carry_forward, profit_before_loss)
    profit_after_loss = max(0.0, profit_before_loss - loss_carry)

    cap = profit_after_loss * LIMITS["donation_rate"]
    donations_allowed = min(p.donations, cap)
    taxable_profit = r2(max(0.0, profit_after_loss - donations_allowed))

    is_sme = p.capital_paid_up <= LIMITS["sme_capital"] and p.revenue <= LIMITS["sme_revenue"]
    if is_sme:
        sme_reason = (f"เข้าเกณฑ์ SME: ทุนจดทะเบียนที่ชำระแล้ว {p.capital_paid_up:,.0f} บาท "
                      f"(≤ {LIMITS['sme_capital']:,.0f}) และรายได้จากการขาย/ให้บริการ {p.revenue:,.0f} บาท "
                      f"(≤ {LIMITS['sme_revenue']:,.0f})")
    elif p.capital_paid_up > LIMITS["sme_capital"]:
        sme_reason = (f"ไม่เข้าเกณฑ์ SME เพราะทุนจดทะเบียนที่ชำระแล้ว {p.capital_paid_up:,.0f} บาท "
                      f"เกิน {LIMITS['sme_capital']:,.0f} บาท")
    else:
        sme_reason = (f"ไม่เข้าเกณฑ์ SME เพราะรายได้จากการขาย/ให้บริการ {p.revenue:,.0f} บาท "
                      f"เกิน {LIMITS['sme_revenue']:,.0f} บาท")

    sme = sme_tax(taxable_profit)
    tax_sme = sme["tax"]
    tax_standard = r2(taxable_profit * STANDARD_RATE)
    tax_payable = tax_sme if is_sme else tax_standard
    rate_used = (tax_payable / taxable_profit) if taxable_profit else 0.0
    marginal = (sme["steps"][-1]["rate"] if (is_sme and sme["steps"]) else (STANDARD_RATE if not is_sme else 0.0))
    saving = r2(tax_standard - tax_sme) if is_sme else 0.0

    half_year_due = r2(tax_payable * LIMITS["half_year_rate"])
    net_payable = r2(tax_payable - p.withholding - p.pnd51_paid)

    notes: List[str] = []
    if p.donations > donations_allowed:
        notes.append(f"เงินบริจาค {p.donations:,.0f} บาท หักได้เพียง {donations_allowed:,.2f} บาท "
                     f"(ไม่เกินร้อยละ 2 ของกำไรสุทธิ {profit_after_loss:,.2f} บาท) — ส่วนเกินห้ามหัก")
    if p.loss_carry_forward > loss_carry:
        notes.append(f"ขาดทุนยกมา {p.loss_carry_forward:,.0f} บาท หักได้เพียง {loss_carry:,.0f} บาท "
                     f"(หักไม่เกินกำไรของรอบนี้) · ขาดทุนยกไปได้ไม่เกิน 5 รอบระยะเวลาบัญชี")
    if p.boi_promoted:
        notes.append("กิจการที่ได้รับส่งเสริมการลงทุน (BOI): รายได้ที่ได้รับยกเว้นตามบัตรส่งเสริมไม่ต้องนำมารวม "
                     "ในกำไรสุทธิทางภาษี — ให้แยกคำนวณเฉพาะรายได้ที่ไม่ได้รับยกเว้น")
    notes.append("ค่าใช้จ่ายที่ห้ามนำมาหัก: เงินสำรองต่าง ๆ (นอกจากที่กฎหมายระบุ) · ค่าปรับ/เงินเพิ่มภาษี · เงินลงทุน · "
                 "รายจ่ายส่วนตัวที่ไม่เกี่ยวกับกิจการ · ค่าตอบแทนกรรมการที่ไม่ได้หัก ณ ที่จ่าย (มาตรา 65 ตรี)")

    return {
        "program": "thai_cit_calculator.py", "version": VERSION, "year": YEAR,
        "revenue": r2(p.revenue), "other_income": r2(p.other_income), "total_revenue": r2(total_revenue),
        "expenses": r2(p.expenses),
        "profit_before_loss": r2(profit_before_loss),
        "loss_carry_forward": r2(loss_carry),
        "profit_after_loss": r2(profit_after_loss),
        "donations_paid": r2(p.donations), "donations_allowed": r2(donations_allowed),
        "donations_note": f"หักได้ไม่เกินร้อยละ 2 ของกำไรสุทธิ = {r2(cap):,.2f} บาท",
        "taxable_profit": taxable_profit,
        "is_sme": is_sme, "sme_reason": sme_reason, "sme_steps": sme["steps"],
        "tax_sme": tax_sme, "tax_standard": tax_standard,
        "tax_payable": tax_payable, "rate_used": rate_used, "marginal_rate": marginal,
        "better_option": "SME" if (is_sme and tax_sme < tax_standard) else "อัตราคงที่ร้อยละ 20",
        "saving_vs_standard": saving,
        "half_year_due": half_year_due,
        "withholding": r2(p.withholding), "pnd51_paid": r2(p.pnd51_paid),
        "net_payable": net_payable,
        "result": ("ต้องชำระภาษีเพิ่ม" if net_payable > 0.5
                   else ("ชำระไว้เกิน — ขอคืนภาษีได้" if net_payable < -0.5 else "ไม่มีภาษีต้องชำระเพิ่ม/ขอคืน")),
        "deadlines": [
            {"form": "ภ.ง.ด.50",
             "due": "ภายใน 150 วันนับแต่วันสุดท้ายของรอบระยะเวลาบัญชี (รอบ ม.ค.–ธ.ค. → 31 พฤษภาคม)",
             "detail": "แบบแสดงรายการภาษีเงินได้นิติบุคคลประจำรอบระยะเวลาบัญชี พร้อมงบการเงิน"},
            {"form": "ภ.ง.ด.51",
             "due": "ภายใน 2 เดือนนับแต่วันสุดท้ายของ 6 เดือนแรกของรอบบัญชี (รอบ ม.ค.–ธ.ค. → 31 สิงหาคม)",
             "detail": "แบบแสดงรายการภาษีเงินได้นิติบุคคลสำหรับครึ่งรอบระยะเวลาบัญชี จ่ายร้อยละ 50 ของภาษีประมาณการทั้งปี"},
            {"form": "ภ.พ.30 / ภ.ง.ด.53, 54", "due": "ภายในวันที่ 15 และ 7 ของเดือนถัดไป",
             "detail": "ภาษีมูลค่าเพิ่ม (ภ.พ.30) ภายในวันที่ 15 · ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.53 นิติบุคคล / 54 บุคคลธรรมดา) ภายในวันที่ 7"},
        ],
        "notes": notes, "sources": SOURCES, "disclaimer": DISCLAIMER,
    }


# ───────────────────────────── แสดงผล ─────────────────────────────
def line(ch: str = "─", k: int = 96) -> str:
    return ch * k


def format_report(r: Dict[str, Any]) -> str:
    b: List[str] = []
    b.append(line("="))
    b.append(f" ภาษีเงินได้นิติบุคคล · รอบระยะเวลาบัญชี {r['year']} · {r['program']} v{r['version']}")
    b.append(line("="))
    b.append(f" {'รายได้จากการขายสินค้า/ให้บริการ':<52}{r['revenue']:>20,.2f}")
    if r["other_income"]:
        b.append(f" {'รายได้อื่น':<52}{r['other_income']:>20,.2f}")
        b.append(f" {'รวมรายได้':<52}{r['total_revenue']:>20,.2f}")
    b.append(f" {'หัก ค่าใช้จ่ายที่หักได้':<52}{-r['expenses']:>20,.2f}")
    b.append(f" {'กำไรสุทธิก่อนรายการอื่น':<52}{r['profit_before_loss']:>20,.2f}")
    if r["loss_carry_forward"]:
        b.append(f" {'หัก ขาดทุนยกมา (≤5 รอบบัญชี)':<52}{-r['loss_carry_forward']:>20,.2f}")
    if r["donations_paid"]:
        b.append(f" {'หัก เงินบริจาค (≤2% ของกำไรสุทธิ)':<52}{-r['donations_allowed']:>20,.2f}")
    b.append(f" {'กำไรสุทธิทางภาษี (taxable profit)':<52}{r['taxable_profit']:>20,.2f}")
    b.append(line())
    b.append(f" สถานะ: {r['sme_reason']}")
    b.append(f" ภาษีตามอัตรา SME: {r['tax_sme']:,.2f} บาท · ภาษีตามอัตราคงที่ 20%: {r['tax_standard']:,.2f} บาท")
    b.append(f" → ภาษีที่ต้องชำระทั้งปี ({r['better_option']}): {r['tax_payable']:,.2f} บาท "
             f"(อัตราที่แท้จริง {r['rate_used'] * 100:.2f}% · ขั้นสูงสุด {r['marginal_rate'] * 100:.0f}%)")
    for s in r["sme_steps"]:
        b.append(f"    • {s['range']:<56}{s['amount']:>16,.2f} × {s['rate'] * 100:>4.0f}% = {s['tax']:>14,.2f}")
    if r["saving_vs_standard"]:
        b.append(f"    ประหยัดกว่าอัตราคงที่ 20%: {r['saving_vs_standard']:,.2f} บาท")
    b.append(line())
    b.append(f" ภ.ง.ด.51 (ครึ่งปี · ร้อยละ 50 ของภาษีประมาณการ): {r['half_year_due']:,.2f} บาท")
    if r["withholding"]:
        b.append(f" หัก ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้: {r['withholding']:,.2f} บาท")
    if r["pnd51_paid"]:
        b.append(f" หัก ภาษีที่ชำระตาม ภ.ง.ด.51 แล้ว: {r['pnd51_paid']:,.2f} บาท")
    b.append(f" → {'ต้องชำระเพิ่ม' if r['net_payable'] > 0.5 else ('ขอคืนภาษี' if r['net_payable'] < -0.5 else 'ไม่มีภาษีต้องชำระเพิ่ม/ขอคืน')}"
             f" ตาม ภ.ง.ด.50: {abs(r['net_payable']):,.2f} บาท")
    b.append(line())
    for d in r["deadlines"]:
        b.append(f" • {d['form']}: {d['due']}")
    for nt in r["notes"]:
        b.append(f" ⚠ {nt}")
    b.append(f" {r['disclaimer']}")
    b.append(line("="))
    return "\n".join(b)


def demo() -> int:
    cases = [
        {"name": "SME ร้านค้า กำไร 1.5 ล้าน (ทุน 3 ล้าน)", "input": {"revenue": 8_000_000, "expenses": 6_500_000, "capital_paid_up": 3_000_000}},
        {"name": "บริษัททั่วไป กำไร 8 ล้าน (ทุน 10 ล้าน)", "input": {"revenue": 50_000_000, "expenses": 42_000_000, "capital_paid_up": 10_000_000}},
        {"name": "SME กำไร 3.5 ล้าน (เข้า 3 ขั้น)", "input": {"revenue": 25_000_000, "expenses": 21_500_000, "capital_paid_up": 4_000_000}},
        {"name": "เกินเกณฑ์รายได้ 35 ล้าน → 20%", "input": {"revenue": 35_000_000, "expenses": 33_000_000, "capital_paid_up": 3_000_000}},
    ]
    for c in cases:
        print(f"\n### {c['name']}")
        print(format_report(compute_cit(c["input"])))
    return 0


# ───────────────────────────── ชุดทดสอบ ─────────────────────────────
def load_testcases(path: Optional[str] = None) -> List[Dict[str, Any]]:
    p = Path(path) if path else Path(__file__).with_name("testcases_thai_cit.json")
    return json.loads(p.read_text(encoding="utf-8"))["cases"]


def selftest(path: Optional[str] = None) -> int:
    cases = load_testcases(path)
    print(line("="))
    print(f" ตรวจความถูกต้องเครื่องคำนวณภาษีเงินได้นิติบุคคล · {len(cases)} กรณี (ตัวเลข expect คำนวณตามเกณฑ์กรมสรรพากร)")
    print(line("="))
    ok = 0
    bad: List[str] = []
    for c in cases:
        got = compute_cit(c["input"])
        wrong = []
        for k, v in c["expect"].items():
            g = got.get(k)
            if isinstance(v, bool):
                if bool(g) != v:
                    wrong.append(f"{k}: ได้ {g} · ควรเป็น {v}")
            elif isinstance(g, (int, float)):
                if abs(float(g) - float(v)) > 0.51:
                    wrong.append(f"{k}: ได้ {g:,.2f} · ควรเป็น {float(v):,.2f}")
            elif g != v:
                wrong.append(f"{k}: ได้ {g} · ควรเป็น {v}")
        if wrong:
            bad.append(f"✗ {c['name']}\n    " + "\n    ".join(wrong))
            print(f"✗ {c['name']}")
            for w in wrong:
                print(f"    {w}")
        else:
            ok += 1
            print(f"✓ {c['name']} — ภาษีทั้งปี {got['tax_payable']:,.2f} · ต้องชำระเพิ่มตาม ภ.ง.ด.50 {got['net_payable']:,.2f} บาท")
    print(line("─"))
    print(f"ผ่าน {ok}/{len(cases)} กรณี")
    return 0 if ok == len(cases) else 1


def interactive() -> Dict[str, Any]:
    def q(label: str, default: float = 0.0) -> float:
        raw = input(f"{label} [{(default):,.0f}]: ").strip().replace(",", "")
        return float(raw) if raw else default

    print(line("="))
    print(" เครื่องคำนวณภาษีเงินได้นิติบุคคล · กรอกข้อมูล (กด Enter เพื่อใช้ค่าเริ่มต้น)")
    print(line("="))
    d: Dict[str, Any] = {}
    d["revenue"] = q("รายได้จากการขายสินค้า/ให้บริการทั้งปี", 8_000_000)
    d["other_income"] = q("รายได้อื่น (ดอกเบี้ย/เงินปันผล ฯลฯ)", 0)
    d["expenses"] = q("ค่าใช้จ่ายที่หักได้ (รวมค่าเสื่อมราคา)", 6_500_000)
    d["loss_carry_forward"] = q("ขาดทุนสะสมยกมา (≤5 รอบบัญชี)", 0)
    d["donations"] = q("เงินบริจาคที่จ่ายในรอบบัญชี", 0)
    d["capital_paid_up"] = q("ทุนจดทะเบียนที่ชำระแล้ว", 3_000_000)
    d["withholding"] = q("ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้", 0)
    d["pnd51_paid"] = q("ภาษีที่ชำระตาม ภ.ง.ด.51 แล้ว", 0)
    ans = input("ได้รับส่งเสริมการลงทุน BOI หรือไม่? (y/n) [n]: ").strip().lower()
    d["boi_promoted"] = ans == "y"
    return d


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="คำนวณภาษีเงินได้นิติบุคคล (ตามหลักเกณฑ์กรมสรรพากร)")
    ap.add_argument("--demo", action="store_true", help="แสดงตัวอย่าง 4 กรณี")
    ap.add_argument("--selftest", action="store_true", help="ตรวจกับชุดทดสอบมาตรฐาน")
    ap.add_argument("--cases", help="ไฟล์ชุดทดสอบ (JSON)")
    ap.add_argument("--json-in", help="ไฟล์ JSON อินพุต")
    ap.add_argument("--json-out", help="ไฟล์ JSON ผลลัพธ์")
    a = ap.parse_args(argv)

    if a.selftest:
        return selftest(a.cases)
    if a.demo:
        return demo()
    if a.json_in:
        data = json.loads(Path(a.json_in).read_text(encoding="utf-8"))
        res = compute_cit(data.get("input", data))
        if a.json_out:
            Path(a.json_out).write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"เขียนผลลัพธ์: {a.json_out}")
        else:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    print(format_report(compute_cit(interactive())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
