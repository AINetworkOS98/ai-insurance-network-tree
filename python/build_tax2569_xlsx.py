#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_tax2569_xlsx.py — สร้างไฟล์ Excel "โปรแกรมภาษี2569-คำนวณ.xlsx"
สูตรเดียวกับที่ดึงมาจาก โปรแกรมภาษี2569.xls (ดู python/TAX2569_CALCULATION.md)
แต่บังคับเพดานค่าใช้จ่าย/ลดหย่อนอัตโนมัติ และมีตารางออกภาษีให้ทุกทอด (gross-up) 16 รอบ

ทุกช่องผลลัพธ์เป็นสูตรจริง ⇒ แก้ช่องสีเหลืองแล้ว Excel คำนวณใหม่ทันที
"""
from __future__ import annotations

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = r"C:\Users\User\Desktop\โปรแกรมภาษี2569-คำนวณ.xlsx"

THIN = Side(style="thin", color="FFB9C2CC")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
F_TITLE = Font(name="Sarabun", size=16, bold=True, color="FF1F2937")
F_HEAD = Font(name="Sarabun", size=11, bold=True, color="FFFFFFFF")
F_SEC = Font(name="Sarabun", size=12, bold=True, color="FF0F4C81")
F_BODY = Font(name="Sarabun", size=11)
F_BOLD = Font(name="Sarabun", size=11, bold=True)
F_SMALL = Font(name="Sarabun", size=10, color="FF4B5563")
FILL_HEAD = PatternFill("solid", fgColor="FF0F4C81")
FILL_SEC = PatternFill("solid", fgColor="FFE8F1F8")
FILL_IN = PatternFill("solid", fgColor="FFFFF4C2")   # ช่องกรอก
FILL_CALC = PatternFill("solid", fgColor="FFF2F7FB")  # ช่องสูตร
FILL_TOTAL = PatternFill("solid", fgColor="FFE2EFDA")
MONEY = "#,##0.00"
PCT = "0.00%"

# ขอบขั้นภาษี 2569 (ขีดบนของแต่ละช่วง)
THRESHOLDS = [150_000, 300_000, 500_000, 750_000, 1_000_000, 2_000_000, 5_000_000]
BRACKETS = [  # (lo, hi_or_None, rate)
    (0, 150_000, 0.00),
    (150_000, 300_000, 0.05),
    (300_000, 500_000, 0.10),
    (500_000, 750_000, 0.15),
    (750_000, 1_000_000, 0.20),
    (1_000_000, 2_000_000, 0.25),
    (2_000_000, 5_000_000, 0.30),
    (5_000_000, None, 0.35),
]
ARR = "{" + ",".join(str(t) for t in THRESHOLDS) + "}"


def tax_formula(cell: str) -> str:
    """สูตรภาษีขั้นบันได 2569 จากเงินได้สุทธิใน cell (SUMPRODUCT วิธีผลต่างอัตรา 5%)"""
    return f"=SUMPRODUCT(({cell}>{ARR})*({cell}-{ARR}))*0.05"


def tax_expr(expr: str) -> str:
    """สูตรภาษีขั้นบันได 2569 จากนิพจน์ใด ๆ (ใช้กับตารางเปรียบเทียบลูกค้า)"""
    return f"=SUMPRODUCT((({expr})>{ARR})*(({expr})-{ARR}))*0.05"


def style_input(ws, cell: str) -> None:
    ws[cell].fill = FILL_IN
    ws[cell].border = BOX
    ws[cell].number_format = MONEY
    ws[cell].font = F_BODY


def style_calc(ws, cell: str) -> None:
    ws[cell].fill = FILL_CALC
    ws[cell].border = BOX
    ws[cell].number_format = MONEY
    ws[cell].font = F_BODY


def set_print(ws, last_col: str = "H") -> None:
    """ตั้งค่าพิมพ์: แนวนอน A4 ย่อพอดีความกว้าง 1 หน้า"""
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5


def build() -> str:
    wb = Workbook()

    # ═══ ชีต 1: คำนวณภาษี ═══════════════════════════════════════════════════
    ws = wb.active
    ws.title = "คำนวณภาษี"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 56
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 18
    ws.column_dimensions["E"].width = 16
    ws.column_dimensions["F"].width = 16
    ws.column_dimensions["G"].width = 16
    ws.column_dimensions["H"].width = 16

    ws["B2"] = "โปรแกรมคำนวณภาษีเงินได้บุคคลธรรมดา · ปีภาษี 2569"
    ws["B2"].font = F_TITLE
    ws["B3"] = "สูตรดึงจาก โปรแกรมภาษี2569.xls · เพดานค่าใช้จ่าย/ลดหย่อนบังคับอัตโนมัติ · ช่องสีเหลืองคือช่องกรอก"
    ws["B3"].font = F_SMALL

    # ── 1) ข้อมูลนำเข้า ──────────────────────────────────────────────────────
    r = 5
    ws[f"B{r}"] = "1) ข้อมูลนำเข้า (กรอกช่องสีเหลือง)"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:H{r}")
    ws[f"B{r}"].fill = FILL_SEC

    inputs = [
        ("เงินได้พึงประเมิน 40(1)(2) — เงินเดือน/ค่าจ้าง/commission", 2_500_000),
        ("เบี้ยประกันที่บริษัทจ่ายแทนกรรมการ", 500_000),
        ("ลดหย่อนส่วนตัว", 60_000),
        ("คู่สมรสที่ไม่มีเงินได้", 0),
        ("บุตร (ยอดรวม)", 0),
        ("อุปการะบิดามารดา (ยอดรวม)", 0),
        ("อุปการะคนพิการ/ทุพพลภาพ (ยอดรวม)", 0),
        ("เบี้ยประกันชีวิต (ตนเอง)", 0),
        ("เบี้ยประกันสุขภาพตนเอง", 0),
        ("เบี้ยประกันสุขภาพบิดามารดา (ยอดรวม)", 0),
        ("เบี้ยประกันชีวิตแบบบำนาญ", 0),
        ("กองทุนสำรองเลี้ยงชีพ / กบข.", 0),
        ("RMF / SSF", 0),
        ("Thai ESG", 0),
        ("เงินสมทบประกันสังคม ม.33", 0),
        ("กองทุนการออมแห่งชาติ (กอช.)", 0),
        ("ดอกเบี้ยเงินกู้ที่อยู่อาศัย", 0),
        ("ค่าติดตั้ง Solar Rooftop", 0),
        ("อื่น ๆ (ระบุ)", 0),
        ("บริจาคเพื่อการศึกษา", 0),
        ("บริจาคเพื่อการกีฬา", 0),
        ("บริจาคทั่วไป", 0),
    ]
    first_in = r + 1
    for i, (label, val) in enumerate(inputs):
        row = first_in + i
        ws[f"B{row}"] = label
        ws[f"B{row}"].font = F_BODY
        ws[f"C{row}"] = val
        style_input(ws, f"C{row}")
    IN = {k: f"C{first_in + i}" for i, k in enumerate([
        "income", "premium", "self", "spouse", "child", "parents", "disabled",
        "life", "health", "health_parents", "pension", "pvd", "rmf", "esg",
        "sso", "nsf", "home", "solar", "other", "don_edu", "don_sport", "don_gen"])}
    last_in = first_in + len(inputs) - 1

    # ── 2) ค่าใช้จ่าย/ลดหย่อนที่ใช้ได้จริง ───────────────────────────────────
    r = last_in + 2
    ws[f"B{r}"] = "2) ค่าใช้จ่ายและลดหย่อนที่ใช้ได้จริง (ตัดเพดานตามกฎหมาย 2569)"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:H{r}")
    ws[f"B{r}"].fill = FILL_SEC
    r += 1
    ws[f"C{r}"] = "จำนวนที่ใช้ได้"
    ws[f"C{r}"].font = F_HEAD
    ws[f"C{r}"].fill = FILL_HEAD
    ws[f"C{r}"].alignment = Alignment(horizontal="center")
    ws[f"C{r}"].border = BOX
    ws[f"D{r}"] = "เพดาน"
    ws[f"D{r}"].font = F_HEAD
    ws[f"D{r}"].fill = FILL_HEAD
    ws[f"D{r}"].alignment = Alignment(horizontal="center")
    ws[f"D{r}"].border = BOX

    rows2 = [
        ("ค่าใช้จ่ายเงินได้ 40(1)(2) (50%)", f"=MIN({IN['income']}*0.5,100000)", "100,000"),
        ("ลดหย่อนส่วนตัว", f"=MIN({IN['self']},60000)", "60,000"),
        ("คู่สมรสไม่มีเงินได้", f"=MIN({IN['spouse']},60000)", "60,000"),
        ("บุตร", f"={IN['child']}", "30,000/คน · 60,000 คนที่ 2+"),
        ("บิดามารดา", f"={IN['parents']}", "30,000/คน"),
        ("คนพิการ/ทุพพลภาพ", f"={IN['disabled']}", "60,000/คน"),
        ("ประกันชีวิต + สุขภาพตนเอง", f"=MIN({IN['life']}+MIN({IN['health']},25000),100000)", "รวม 100,000 (สุขภาพ 25,000)"),
        ("ประกันสุขภาพบิดามารดา", f"={IN['health_parents']}", "15,000/คน"),
        ("กลุ่มเกษียณ (บำนาญ + PVD + RMF/SSF)",
         f"=MIN(MIN({IN['pension']},MIN(200000,{IN['income']}*0.15))+MIN({IN['pvd']},500000)"
         f"+MIN({IN['rmf']},MIN(500000,{IN['income']}*0.30)),500000)",
         "รวม 500,000 (บำนาญ ≤15%≤200,000)"),
        ("Thai ESG", f"=MIN({IN['esg']},MIN(300000,{IN['income']}*0.30))", "300,000 (30%)"),
        ("ประกันสังคม ม.33", f"=MIN({IN['sso']},10500)", "10,500"),
        ("กอช.", f"=MIN({IN['nsf']},30000)", "30,000"),
        ("ดอกเบี้ยเงินกู้ที่อยู่อาศัย", f"=MIN({IN['home']},100000)", "100,000"),
        ("Solar Rooftop", f"=MIN({IN['solar']},200000)", "200,000"),
        ("อื่น ๆ", f"={IN['other']}", "—"),
    ]
    first2 = r + 1
    for i, (label, formula, cap) in enumerate(rows2):
        row = first2 + i
        ws[f"B{row}"] = label
        ws[f"B{row}"].font = F_BODY
        ws[f"C{row}"] = formula
        style_calc(ws, f"C{row}")
        ws[f"D{row}"] = cap
        ws[f"D{row}"].font = F_SMALL
        ws[f"D{row}"].alignment = Alignment(horizontal="left")
    last2 = first2 + len(rows2) - 1

    r = last2 + 1
    ws[f"B{r}"] = "รวมค่าใช้จ่าย + ค่าลดหย่อน"
    ws[f"B{r}"].font = F_BOLD
    ws[f"C{r}"] = f"={IN['income']}*0+SUM(C{first2}:C{last2})"
    ws[f"C{r}"].value = f"=SUM(C{first2}:C{last2})"
    style_calc(ws, f"C{r}")
    ws[f"C{r}"].fill = FILL_TOTAL
    ws[f"C{r}"].font = F_BOLD
    TOTAL_DED = f"C{r}"

    # ── 3) เงินได้สุทธิ + ภาษี ───────────────────────────────────────────────
    r += 2
    ws[f"B{r}"] = "3) เงินได้สุทธิและภาษี"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:H{r}")
    ws[f"B{r}"].fill = FILL_SEC

    r += 1
    ws[f"B{r}"] = "เงินได้สุทธิก่อนบริจาค"
    ws[f"C{r}"] = f"=MAX(0,{IN['income']}-{TOTAL_DED})"
    style_calc(ws, f"C{r}")
    NET_BEFORE_DON = f"C{r}"

    r += 1
    ws[f"B{r}"] = "หัก บริจาคการศึกษา (นับ 2 เท่า · ≤10%)"
    ws[f"C{r}"] = f"=MIN({IN['don_edu']}*2,{NET_BEFORE_DON}*0.1)"
    style_calc(ws, f"C{r}")
    D1 = f"C{r}"

    r += 1
    ws[f"B{r}"] = "หัก บริจาคการกีฬา (นับ 1.5 เท่า · ≤10%)"
    ws[f"C{r}"] = f"=MIN({IN['don_sport']}*1.5,{NET_BEFORE_DON}*0.1)"
    style_calc(ws, f"C{r}")
    D2 = f"C{r}"

    r += 1
    ws[f"B{r}"] = "หัก บริจาคทั่วไป (≤10%)"
    ws[f"C{r}"] = f"=MIN({IN['don_gen']},{NET_BEFORE_DON}*0.1)"
    style_calc(ws, f"C{r}")
    D3 = f"C{r}"

    r += 1
    ws[f"B{r}"] = "เงินได้สุทธิเพื่อคำนวณภาษี"
    ws[f"B{r}"].font = F_BOLD
    ws[f"C{r}"] = f"=MAX(0,{NET_BEFORE_DON}-{D1}-{D2}-{D3})"
    style_calc(ws, f"C{r}")
    ws[f"C{r}"].fill = FILL_TOTAL
    ws[f"C{r}"].font = F_BOLD
    NET = f"C{r}"

    r += 1
    ws[f"B{r}"] = "ภาษีที่ต้องชำระทั้งปี"
    ws[f"B{r}"].font = F_BOLD
    ws[f"C{r}"] = tax_formula(NET)
    style_calc(ws, f"C{r}")
    ws[f"C{r}"].fill = FILL_TOTAL
    ws[f"C{r}"].font = F_BOLD
    TAX = f"C{r}"

    r += 1
    ws[f"B{r}"] = "อัตราภาษีที่จ่ายจริงต่อเงินได้"
    ws[f"C{r}"] = f"=IFERROR({TAX}/{IN['income']},0)"
    style_calc(ws, f"C{r}")
    ws[f"C{r}"].number_format = PCT

    # ── 4) ตารางขั้นภาษี (เริ่มคอลัมน์ C เพื่อให้ตรงกับความกว้างจริง) ─────────
    r += 2
    ws[f"B{r}"] = "4) ภาษีแยกตามขั้น (2569)"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:H{r}")
    ws[f"B{r}"].fill = FILL_SEC
    r += 1
    heads = ["ขั้น", "ตั้งแต่", "ไม่เกิน", "อัตรา", "ภาษีขั้นนี้"]
    for i, head in enumerate(heads):
        c = ws.cell(row=r, column=3 + i, value=head)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.alignment = Alignment(horizontal="center")
        c.border = BOX
    first_br = r + 1
    for i, (lo, hi, rate) in enumerate(BRACKETS, start=1):
        row = first_br + i - 1
        c1 = ws.cell(row=row, column=3, value=i)
        c1.alignment = Alignment(horizontal="center")
        ws.cell(row=row, column=4, value=lo).number_format = MONEY
        if hi is None:
            c = ws.cell(row=row, column=5, value="ขึ้นไป")
            c.alignment = Alignment(horizontal="center")
            formula = f"=MAX(0,{NET}-D{row})*F{row}"
        else:
            ws.cell(row=row, column=5, value=hi).number_format = MONEY
            formula = f"=MAX(0,MIN({NET},E{row})-D{row})*F{row}"
        ws.cell(row=row, column=6, value=rate).number_format = PCT
        t = ws.cell(row=row, column=7, value=formula)
        t.number_format = MONEY
        for col in range(3, 8):
            cc = ws.cell(row=row, column=col)
            cc.border = BOX
            cc.font = F_BODY
    last_br = first_br + len(BRACKETS) - 1
    r = last_br + 1
    lab = ws.cell(row=r, column=3, value="รวม")
    lab.font = F_BOLD
    lab.fill = FILL_TOTAL
    lab.border = BOX
    tot = ws.cell(row=r, column=7, value=f"=SUM(G{first_br}:G{last_br})")
    tot.number_format = MONEY
    tot.font = F_BOLD
    tot.fill = FILL_TOTAL
    tot.border = BOX

    # ── 5) ออกภาษีให้ทุกทอด (gross-up) ──────────────────────────────────────
    r += 2
    ws[f"B{r}"] = "5) บริษัทออกภาษีให้ทุกทอด (gross-up) — ภาษีที่จ่ายแทนกลายเป็นเงินได้รอบถัดไป"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:H{r}")
    ws[f"B{r}"].fill = FILL_SEC
    r += 1
    heads5 = ["รอบ", "เงินได้รวม", "เงินได้สุทธิ", "ภาษี", "ภาษีเพิ่มขึ้น"]
    for i, head in enumerate(heads5):
        c = ws.cell(row=r, column=3 + i, value=head)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.alignment = Alignment(horizontal="center")
        c.border = BOX
    first_gu = r + 1
    for i in range(1, 17):
        row = first_gu + i - 1
        ws.cell(row=row, column=3, value=i).alignment = Alignment(horizontal="center")
        if i == 1:
            inc_formula = f"={IN['income']}+{IN['premium']}+{TAX}"
            add_formula = f"=F{row}-{TAX}"
        else:
            inc_formula = f"={IN['income']}+{IN['premium']}+F{row - 1}"
            add_formula = f"=F{row}-F{row - 1}"
        ws.cell(row=row, column=4, value=inc_formula).number_format = MONEY
        ws.cell(row=row, column=5, value=f"=MAX(0,D{row}-{TOTAL_DED})").number_format = MONEY
        ws.cell(row=row, column=6, value=tax_formula(f"E{row}")).number_format = MONEY
        ws.cell(row=row, column=7, value=add_formula).number_format = MONEY
        for col in range(3, 8):
            c = ws.cell(row=row, column=col)
            c.border = BOX
            c.font = F_BODY
            if col > 3:
                c.fill = FILL_CALC
    last_gu = first_gu + 15

    r = last_gu + 2
    ws[f"B{r}"] = "สรุป"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:H{r}")
    ws[f"B{r}"].fill = FILL_SEC
    summary = [
        ("ภาษีเมื่อไม่มีเบี้ยประกัน (PIT กรรมการ)", f"={TAX}"),
        ("ภาษีหัก ณ ที่จ่ายครั้งเดียว (รอบแรก)", f"=G{first_gu}"),
        ("ภาษีเมื่อออกให้ทุกทอด (ลู่เข้า)", f"=F{last_gu}"),
        ("เบี้ยประกันที่จ่ายแทน", f"={IN['premium']}"),
        ("เงินได้รวมสุดท้ายที่กรรมการได้รับ", f"=D{last_gu}"),
        ("รวมภาระของบริษัท (เบี้ย + ภาษีทุกทอด)", f"={IN['premium']}+F{last_gu}"),
    ]
    for i, (label, formula) in enumerate(summary):
        row = r + 1 + i
        ws[f"B{row}"] = label
        ws[f"B{row}"].font = F_BOLD if i in (2, 5) else F_BODY
        ws[f"C{row}"] = formula
        style_calc(ws, f"C{row}")
        if i in (2, 5):
            ws[f"C{row}"].fill = FILL_TOTAL
            ws[f"C{row}"].font = F_BOLD
    ws.freeze_panes = "A5"

    # ═══ ชีต 2: อัตราภาษี ═══════════════════════════════════════════════════
    w2 = wb.create_sheet("อัตราภาษี2569")
    w2.sheet_view.showGridLines = False
    w2.column_dimensions["B"].width = 6
    for col, wd in zip("CDEF", (18, 18, 12, 18)):
        w2.column_dimensions[col].width = wd
    w2["B2"] = "อัตราภาษีเงินได้บุคคลธรรมดา ปีภาษี 2569"
    w2["B2"].font = F_TITLE
    for i, head in enumerate(["ขั้น", "เงินได้สุทธิ ตั้งแต่", "ไม่เกิน", "อัตรา", "ภาษีสะสม"]):
        c = w2.cell(row=4, column=2 + i, value=head)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.alignment = Alignment(horizontal="center")
        c.border = BOX
    cum = 0.0
    for i, (lo, hi, rate) in enumerate(BRACKETS):
        row = 5 + i
        cum += (hi - lo) * rate if hi is not None else 0
        w2.cell(row=row, column=2, value=i + 1).alignment = Alignment(horizontal="center")
        w2.cell(row=row, column=3, value=lo).number_format = MONEY
        w2.cell(row=row, column=4, value=hi if hi is not None else "ขึ้นไป").number_format = MONEY
        w2.cell(row=row, column=5, value=rate).number_format = PCT
        w2.cell(row=row, column=6, value=round(cum, 2)).number_format = MONEY
        for col in range(2, 7):
            w2.cell(row=row, column=col).border = BOX
            w2.cell(row=row, column=col).font = F_BODY
    w2["B15"] = "เปลี่ยนจากกฎเดิม: ขั้น 30% กว้างถึง 5,000,000 บาท (เดิมถึง 4,000,000) ⇒ ภาษีสะสมที่ 5,000,000 = 1,265,000 บาท"
    w2["B15"].font = F_SMALL

    # ═══ ชีต 3: เพดานลดหย่อน ════════════════════════════════════════════════
    w3 = wb.create_sheet("เพดานลดหย่อน2569")
    w3.sheet_view.showGridLines = False
    w3.column_dimensions["B"].width = 58
    w3.column_dimensions["C"].width = 42
    w3["B2"] = "เพดานค่าใช้จ่าย/ค่าลดหย่อน ปีภาษี 2569"
    w3["B2"].font = F_TITLE
    for i, head in enumerate(["รายการ", "เพดาน"]):
        c = w3.cell(row=4, column=2 + i, value=head)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.border = BOX
    caps = [
        ("ค่าใช้จ่ายเงินได้ 40(1)(2)", "50% ของเงินได้ ไม่เกิน 100,000"),
        ("ลดหย่อนส่วนตัว", "60,000"),
        ("คู่สมรสที่ไม่มีเงินได้", "60,000"),
        ("บุตร", "30,000/คน · คนที่ 2+ เกิดตั้งแต่ 2561 = 60,000"),
        ("อุปการะบิดามารดา", "30,000/คน"),
        ("อุปการะคนพิการ/ทุพพลภาพ", "60,000/คน"),
        ("เบี้ยประกันชีวิต + สุขภาพตนเอง", "รวมไม่เกิน 100,000 (สุขภาพภายใน 25,000)"),
        ("เบี้ยประกันสุขภาพบิดามารดา", "15,000/คน"),
        ("เบี้ยประกันชีวิตแบบบำนาญ", "15% ของเงินได้ และไม่เกิน 200,000"),
        ("กองทุนสำรองเลี้ยงชีพ / กบข.", "ตามจ่ายจริง (กลุ่มเกษียณรวม ≤ 500,000)"),
        ("RMF / SSF", "30% ของเงินได้ (กลุ่มเกษียณรวม ≤ 500,000)"),
        ("Thai ESG", "30% ของเงินได้ ไม่เกิน 300,000 (นอกกลุ่มเกษียณ)"),
        ("เงินสมทบประกันสังคม ม.33", "10,500/ปี (875 × 12)"),
        ("กองทุนการออมแห่งชาติ (กอช.)", "30,000"),
        ("ดอกเบี้ยเงินกู้ที่อยู่อาศัย", "100,000"),
        ("ค่าติดตั้ง Solar Rooftop", "200,000 (มาตรการปีภาษี 2569)"),
        ("บริจาคการศึกษา", "นับ 2 เท่า ไม่เกิน 10% ของเงินได้สุทธิ"),
        ("บริจาคการกีฬา", "นับ 1.5 เท่า ไม่เกิน 10%"),
        ("บริจาคทั่วไป", "ไม่เกิน 10% (ผ่านระบบ e-Donation)"),
        ("LTF", "หมดสิทธิ์ลดหย่อนแล้ว"),
    ]
    for i, (label, cap) in enumerate(caps):
        row = 5 + i
        w3.cell(row=row, column=2, value=label).font = F_BODY
        w3.cell(row=row, column=3, value=cap).font = F_BODY
        w3.cell(row=row, column=2).border = BOX
        w3.cell(row=row, column=3).border = BOX

    # ═══ ชีต 4: หมายเหตุ ════════════════════════════════════════════════════
    w4 = wb.create_sheet("หมายเหตุ")
    w4.sheet_view.showGridLines = False
    w4.column_dimensions["B"].width = 110
    w4["B2"] = "หมายเหตุการสร้างไฟล์ (จาก โปรแกรมภาษี2569.xls)"
    w4["B2"].font = F_TITLE
    notes = [
        "1) สูตรทั้งหมดอ้างจากชีต 'คำนวณภาษี' และ 'PITrate' ของไฟล์ต้นฉบับ — ตรวจแล้วตรงกันทุกคอลัมน์ (C–S)",
        "2) ไฟล์ต้นฉบับไม่บังคับเพดานลดหย่อน (แถว 7–23 เป็นช่องพิมพ์ตัวเลข แล้วหักตรง ๆ) เวอร์ชันนี้บังคับเพดานด้วย MIN() ทุกบรรทัด",
        "3) ไฟล์ต้นฉบับเขียน 'ภาษีสะสมถึง 5,000,000 = 965,000' ซึ่งผิด — ที่ถูกคือ 1,265,000 (965,000 คือยอดสะสมที่ 4,000,000 ตามกฎเดิม)",
        "4) ช่วงขั้นที่ 2 ของไฟล์ต้นฉบับเขียน '150,001–300,000' แต่สูตรคิดที่ความกว้างเต็ม 150,000 (7,500 บาท) เวอร์ชันนี้ใช้ขอบจริง 150,000",
        "5) ตาราง gross-up 16 รอบ: รอบแรกตั้งต้นด้วยภาษีที่ยังไม่รวมเบี้ยประกัน (เหมือนคอลัมน์ C ของไฟล์เดิม) แล้ววนจนลู่เข้า",
        "6) ช่องสีเหลือง = กรอกเอง · ช่องสีฟ้า = สูตร (ห้ามพิมพ์ทับ) · แก้ตัวเลขแล้วผลลัพธ์คำนวณใหม่อัตโนมัติ",
    ]
    for i, note in enumerate(notes):
        c = w4.cell(row=4 + i, column=2, value=note)
        c.font = F_BODY
        c.alignment = Alignment(wrap_text=True, vertical="top")

    build_client_sheet(wb)
    build_plan_form(wb)
    build_cert_letter(wb)
    for sheet in wb.worksheets:
        set_print(sheet)
    cs = wb["เปรียบเทียบลูกค้า"]
    cs.page_setup.paperSize = cs.PAPERSIZE_A3
    cs.page_setup.fitToWidth = 2
    cs.print_title_rows = "4:4"
    wb.save(OUT)
    return OUT


# ═══ ชีตเปรียบเทียบลูกค้า 10–20 ราย ══════════════════════════════════════════
CLIENTS = 20


def build_client_sheet(wb: Workbook) -> None:
    ws = wb.create_sheet("เปรียบเทียบลูกค้า")
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 30
    for col in ("C", "D", "E", "F", "G"):
        ws.column_dimensions[col].width = 15
    for i in range(16):
        ws.column_dimensions[get_column_letter(8 + i)].width = 12
    for col in ("X", "Y", "Z"):
        ws.column_dimensions[col].width = 15
    ws.column_dimensions["AA"].width = 11

    ws["A1"] = "ตารางเปรียบเทียบภาษีลูกค้า/กรรมการ หลายราย · ปีภาษี 2569"
    ws["A1"].font = F_TITLE
    ws["A2"] = ("กรอกช่องสีเหลือง (เงินได้ / เบี้ยประกัน / ค่าใช้จ่าย+ลดหย่อนรวม) — คอลัมน์ ภาษีรอบ 1–16 "
                "คือการวนซ้ำ 'ออกภาษีให้ทุกทอด' จนลู่เข้า (ช่องสุดท้าย = คำตอบ)")
    ws["A2"].font = F_SMALL

    headers = ["#", "ชื่อ / เลขอ้างอิงลูกค้า", "เงินได้พึงประเมิน", "เบี้ยประกันจ่ายแทน",
               "ค่าใช้จ่าย+ลดหย่อนรวม", "เงินได้สุทธิ (ไม่มีเบี้ย)", "ภาษีไม่มีเบี้ย"]
    for i, h in enumerate(headers):
        c = ws.cell(row=4, column=1 + i, value=h)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.alignment = Alignment(horizontal="center", wrap_text=True)
        c.border = BOX
    for i in range(16):
        c = ws.cell(row=4, column=8 + i, value="ภาษีรอบ %d" % (i + 1))
        c.font = F_HEAD
        c.fill = PatternFill("solid", fgColor="FF6B8CAE")
        c.alignment = Alignment(horizontal="center", wrap_text=True)
        c.border = BOX
    for i, h in enumerate(["ภาษีออกให้ทุกทอด", "เงินได้รวมสุดท้าย", "ภาระรวม (เบี้ย+ภาษี)", "อัตราจ่ายจริง"]):
        c = ws.cell(row=4, column=24 + i, value=h)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.alignment = Alignment(horizontal="center", wrap_text=True)
        c.border = BOX
    ws.row_dimensions[4].height = 34

    samples = [
        ("ตัวอย่าง 1 · กรรมการเงินเดือน 2.5 ล้าน", 2_500_000, 500_000, 160_000),
        ("ตัวอย่าง 2 · ตัวแทนค่าคอมมิชชั่น 1.2 ล้าน", 1_200_000, 300_000, 160_000),
    ]
    first = 5
    for i in range(CLIENTS):
        r = first + i
        ws.cell(row=r, column=1, value=i + 1).alignment = Alignment(horizontal="center")
        name = ws.cell(row=r, column=2, value=samples[i][0] if i < len(samples) else None)
        name.font = F_BODY
        name.border = BOX
        for col in (3, 4, 5):
            v = samples[i][col - 2] if i < len(samples) else None
            c = ws.cell(row=r, column=col, value=v)
            c.fill = FILL_IN
            c.border = BOX
            c.number_format = MONEY
            c.font = F_BODY
        c = ws.cell(row=r, column=6, value=f"=MAX(0,C{r}-E{r})")
        c.number_format = MONEY
        c.border = BOX
        c.fill = FILL_CALC
        c = ws.cell(row=r, column=7, value=tax_formula(f"F{r}"))
        c.number_format = MONEY
        c.border = BOX
        c.fill = FILL_CALC
        prev = f"G{r}"
        for k in range(16):
            col = 8 + k
            letter = get_column_letter(col)
            f = tax_expr(f"$C{r}+$D{r}+{prev}-$E{r}")
            c = ws.cell(row=r, column=col, value=f)
            c.number_format = MONEY
            c.font = F_BODY
            c.border = BOX
            c.fill = FILL_CALC
            prev = f"{letter}{r}"
        for col, formula, strong in ((24, f"=W{r}", True), (25, f"=C{r}+D{r}+W{r}", False),
                                     (26, f"=D{r}+W{r}", True), (27, f"=IFERROR(W{r}/C{r},0)", False)):
            c = ws.cell(row=r, column=col, value=formula)
            c.border = BOX
            c.number_format = PCT if col == 27 else MONEY
            if strong:
                c.font = F_BOLD
                c.fill = FILL_TOTAL
            else:
                c.font = F_BODY
                c.fill = FILL_CALC

    tot = first + CLIENTS
    ws.cell(row=tot, column=2, value="รวมทั้งสิ้น").font = F_BOLD
    for col in (3, 4, 5, 7, 24, 25, 26):
        c = ws.cell(row=tot, column=col,
                    value=f"=SUM({get_column_letter(col)}{first}:{get_column_letter(col)}{tot - 1})")
        c.number_format = MONEY
        c.font = F_BOLD
    c = ws.cell(row=tot, column=27, value=f"=IFERROR(X{tot}/C{tot},0)")
    c.number_format = PCT
    c.font = F_BOLD
    for col in range(1, 28):
        cc = ws.cell(row=tot, column=col)
        cc.border = BOX
        cc.fill = FILL_TOTAL

    r = tot + 2
    ws.cell(row=r, column=1,
            value="วิธีใช้: ค่าใช้จ่าย+ลดหย่อนรวม = ค่าใช้จ่าย (50% ไม่เกิน 100,000) + ค่าใช้จ่ายอื่นตามประเภท "
                  "+ ค่าลดหย่อนทั้งหมด — ถ้าต้องการแยกลดหย่อนทีละรายการ ใช้ชีต 'คำนวณภาษี' แล้วคัดลอกยอดรวมมาใส่ช่อง E").font = F_SMALL
    ws.freeze_panes = "C5"


# ═══ ชีตฟอร์มวางแผนภาษี (กรอกได้จริง คำนวณอัตโนมัติ) ═══════════════════════════
def build_plan_form(wb: Workbook) -> None:
    ws = wb.create_sheet("ฟอร์มวางแผนภาษี")
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 52
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 18
    ws.column_dimensions["E"].width = 46

    ws["B2"] = "แบบฟอร์มวางแผนภาษี ปีภาษี 2569"
    ws["B2"].font = F_TITLE
    ws["B3"] = "ชื่อผู้เสียภาษี"
    ws["B3"].font = F_BODY
    ws["C3"] = ""
    ws["C3"].fill = FILL_IN
    ws["C3"].border = BOX
    ws["E3"] = "ปีภาษี 2569"
    ws["E3"].font = F_BOLD

    r = 5
    ws[f"B{r}"] = "1) ประเภทเงินได้ (กรอกช่องสีเหลือง)"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:E{r}")
    ws[f"B{r}"].fill = FILL_SEC
    r += 1
    for i, h in enumerate(["ประเภทเงินได้", "จำนวนเงิน/ปี", "หักค่าใช้จ่ายได้", "หลักการหักค่าใช้จ่าย"]):
        c = ws.cell(row=r, column=2 + i, value=h)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.border = BOX
        c.alignment = Alignment(horizontal="center")
    incomes = [
        ("เงินเดือน / ค่าจ้าง / โบนัส (40(1))", "เหมา 50% ไม่เกิน 100,000 (รวมกับข้อถัดไป)"),
        ("ค่านายหน้า / ค่าคอมมิชชั่น (40(2))", "เหมา 50% ไม่เกิน 100,000 (รวมกับข้อบน)"),
        ("ดอกเบี้ยเงินฝาก (40(4))", "ไม่มีค่าใช้จ่าย · เลือกหัก ณ ที่จ่าย 15% ได้"),
        ("เงินปันผล (40(4))", "ไม่มีค่าใช้จ่าย · ขอเครดิตภาษีคืนได้"),
        ("ค่าเช่าทรัพย์สิน (40(5))", "เหมา 30% หรือหักตามจริง"),
        ("วิชาชีพอิสระ (40(6))", "เหมา 30% (บางสาขา 60%) หรือตามจริง"),
        ("อื่น ๆ", "ตามประเภทเงินได้"),
    ]
    first_income = r + 1
    for i, (label, rule) in enumerate(incomes):
        row = first_income + i
        ws.cell(row=row, column=2, value=label).font = F_BODY
        c = ws.cell(row=row, column=3, value=0)
        style_input(ws, f"C{row}")
        ws.cell(row=row, column=5, value=rule).font = F_SMALL
        for col in (2, 5):
            ws.cell(row=row, column=col).border = BOX
    last_income = first_income + len(incomes) - 1
    for i in range(len(incomes)):
        row = first_income + i
        if i == 0:
            f = f"=MIN(0.5*(C{row}+C{row + 1}),100000)"
        elif i in (4, 5):
            f = f"=0.3*C{row}"
        else:
            f = "=0"
        d = ws.cell(row=row, column=4, value=f)
        style_calc(ws, f"D{row}")
    r = last_income + 1
    ws.cell(row=r, column=2, value="รวมเงินได้ / รวมค่าใช้จ่าย").font = F_BOLD
    for col in (3, 4):
        c = ws.cell(row=r, column=col,
                    value=f"=SUM({get_column_letter(col)}{first_income}:{get_column_letter(col)}{last_income})")
        style_calc(ws, c.coordinate)
        c.fill = FILL_TOTAL
        c.font = F_BOLD
    TOTAL_INCOME = f"C{r}"
    TOTAL_EXP = f"D{r}"
    r += 1
    ws.cell(row=r, column=2, value="เงินได้หลังหักค่าใช้จ่าย").font = F_BOLD
    aft = ws.cell(row=r, column=3, value=f"=MAX(0,{TOTAL_INCOME}-{TOTAL_EXP})")
    style_calc(ws, aft.coordinate)
    aft.fill = FILL_TOTAL
    aft.font = F_BOLD
    AFTER_EXP = f"C{r}"

    r += 2
    ws[f"B{r}"] = "2) ค่าลดหย่อน (ตัดเพดานอัตโนมัติ)"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:E{r}")
    ws[f"B{r}"].fill = FILL_SEC
    r += 1
    for i, h in enumerate(["รายการลดหย่อน", "จำนวนที่จ่ายจริง", "ใช้ได้จริง", "เพดาน"]):
        c = ws.cell(row=r, column=2 + i, value=h)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.border = BOX
        c.alignment = Alignment(horizontal="center")
    ded_items = [
        ("ลดหย่อนส่วนตัว", 60_000, ("cap", 60_000), "60,000"),
        ("คู่สมรสที่ไม่มีเงินได้", 0, ("cap", 60_000), "60,000"),
        ("บุตร (ยอดรวม)", 0, None, "30,000/คน (คนที่ 2+ 60,000)"),
        ("อุปการะบิดามารดา (ยอดรวม)", 0, None, "30,000/คน"),
        ("อุปการะคนพิการ (ยอดรวม)", 0, None, "60,000/คน"),
        ("เบี้ยประกันชีวิต", 0, ("life", None), "รวมชีวิต+สุขภาพ 100,000"),
        ("เบี้ยประกันสุขภาพตนเอง", 0, None, "ภายใน 25,000 (รวมใน 100,000)"),
        ("เบี้ยประกันสุขภาพบิดามารดา", 0, ("cap", 15_000), "15,000/คน"),
        ("เบี้ยประกันชีวิตแบบบำนาญ", 0, ("pension", None), "15% ≤ 200,000"),
        ("กองทุนสำรองเลี้ยงชีพ / กบข.", 0, ("cap", 500_000), "กลุ่มเกษียณรวม 500,000"),
        ("RMF / SSF", 0, ("rmf", None), "30% ≤ 500,000"),
        ("Thai ESG", 0, ("esg", None), "30% ≤ 300,000"),
        ("เงินสมทบประกันสังคม", 0, ("cap", 10_500), "10,500"),
        ("กอช.", 0, ("cap", 30_000), "30,000"),
        ("ดอกเบี้ยเงินกู้ที่อยู่อาศัย", 0, ("cap", 100_000), "100,000"),
        ("ค่าติดตั้ง Solar Rooftop", 0, ("cap", 200_000), "200,000"),
        ("อื่น ๆ", 0, None, "—"),
    ]
    first_ded = r + 1
    for i, (label, val, kind, cap) in enumerate(ded_items):
        row = first_ded + i
        ws.cell(row=row, column=2, value=label).font = F_BODY
        c = ws.cell(row=row, column=3, value=val)
        style_input(ws, f"C{row}")
        formula = None
        if kind:
            if kind[0] == "cap":
                formula = f"=MIN(C{row},{kind[1]})"
            elif kind[0] == "life":
                formula = f"=MIN(C{row}+MIN(C{row + 1},25000),100000)"
            elif kind[0] == "pension":
                formula = f"=MIN(C{row},MIN(200000,{AFTER_EXP}*0.15))"
            elif kind[0] == "rmf":
                formula = f"=MIN(C{row},MIN(500000,{AFTER_EXP}*0.30))"
            elif kind[0] == "esg":
                formula = f"=MIN(C{row},MIN(300000,{AFTER_EXP}*0.30))"
        if not formula:
            # บุตร / บิดามารดา / คนพิการ / อื่น ๆ = ใช้ยอดที่กรอกโดยตรง
            # ประกันสุขภาพตนเอง = 0 เพราะนับรวมในเพดานประกันชีวิต+สุขภาพด้านบนแล้ว
            formula = "=0" if label.startswith("เบี้ยประกันสุขภาพตนเอง") else f"=C{row}"
        d = ws.cell(row=row, column=4, value=formula)
        style_calc(ws, f"D{row}")
        ws.cell(row=row, column=5, value=cap).font = F_SMALL
        ws.cell(row=row, column=2).border = BOX
        ws.cell(row=row, column=5).border = BOX
    last_ded = first_ded + len(ded_items) - 1
    r = last_ded + 1
    ws.cell(row=r, column=2, value="รวมค่าลดหย่อน").font = F_BOLD
    tot = ws.cell(row=r, column=4, value=f"=SUM(D{first_ded}:D{last_ded})")
    style_calc(ws, tot.coordinate)
    tot.fill = FILL_TOTAL
    tot.font = F_BOLD
    TOTAL_DED = f"D{r}"

    r += 2
    ws[f"B{r}"] = "3) เงินบริจาค (ต้องผ่าน e-Donation)"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:E{r}")
    ws[f"B{r}"].fill = FILL_SEC
    base = f"MAX(0,{AFTER_EXP}-{TOTAL_DED})"
    r += 1
    don = [("บริจาคเพื่อการศึกษา (นับ 2 เท่า ≤10%)", f"=MIN({{x}}*2,{base}*0.1)"),
           ("บริจาคเพื่อการกีฬา (นับ 1.5 เท่า ≤10%)", f"=MIN({{x}}*1.5,{base}*0.1)"),
           ("บริจาคทั่วไป (≤10%)", f"=MIN({{x}},{base}*0.1)")]
    first_don = r
    for i, (label, tmpl) in enumerate(don):
        row = first_don + i
        ws.cell(row=row, column=2, value=label).font = F_BODY
        c = ws.cell(row=row, column=3, value=0)
        style_input(ws, f"C{row}")
        d = ws.cell(row=row, column=4, value=tmpl.format(x=f"C{row}"))
        style_calc(ws, f"D{row}")
        ws.cell(row=row, column=2).border = BOX
    last_don = first_don + len(don) - 1
    r = last_don + 1
    ws.cell(row=r, column=2, value="รวมเงินบริจาคที่หักได้").font = F_BOLD
    td = ws.cell(row=r, column=4, value=f"=SUM(D{first_don}:D{last_don})")
    style_calc(ws, td.coordinate)
    td.fill = FILL_TOTAL
    td.font = F_BOLD
    TOTAL_DON = f"D{r}"

    r += 2
    ws[f"B{r}"] = "4) สรุปภาษี"
    ws[f"B{r}"].font = F_SEC
    ws.merge_cells(f"B{r}:E{r}")
    ws[f"B{r}"].fill = FILL_SEC
    first4 = r + 1
    labels4 = ["เงินได้หลังหักค่าใช้จ่าย", "หัก ค่าลดหย่อน", "หัก เงินบริจาค",
               "เงินได้สุทธิเพื่อคำนวณภาษี", "ภาษีที่ต้องชำระทั้งปี", "อัตราภาษีที่จ่ายจริงต่อเงินได้"]
    for i, label in enumerate(labels4):
        ws.cell(row=first4 + i, column=2, value=label).font = F_BODY
    net_cell = f"C{first4 + 3}"
    tax_cell = f"C{first4 + 4}"
    ws[f"C{first4}"] = f"={AFTER_EXP}"
    ws[f"C{first4 + 1}"] = f"={TOTAL_DED}"
    ws[f"C{first4 + 2}"] = f"={TOTAL_DON}"
    ws[net_cell] = f"=MAX(0,{AFTER_EXP}-{TOTAL_DED}-{TOTAL_DON})"
    ws[tax_cell] = tax_formula(net_cell)
    ws[f"C{first4 + 5}"] = f"=IFERROR({tax_cell}/{TOTAL_INCOME},0)"
    for i in range(len(labels4)):
        style_calc(ws, f"C{first4 + i}")
    ws[net_cell].fill = FILL_TOTAL
    ws[net_cell].font = F_BOLD
    ws[tax_cell].fill = FILL_TOTAL
    ws[tax_cell].font = Font(name="Sarabun", size=13, bold=True, color="FFC00000")
    ws[f"C{first4 + 5}"].number_format = PCT

    r = first4 + len(labels4) + 1
    ws.cell(row=r, column=2, value="5) ข้อแนะนำเพิ่มเติม").font = F_SEC
    for i in range(1, 4):
        ws.cell(row=r + i, column=2, value=f"{i}> ").font = F_BODY
        for col in range(3, 6):
            ws.cell(row=r + i, column=col).border = BOX


# ═══ ชีตหนังสือรับรองการชำระเบี้ย ═════════════════════════════════════════════
def build_cert_letter(wb: Workbook) -> None:
    ws = wb.create_sheet("หนังสือรับรองชำระเบี้ย")
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 4
    ws.column_dimensions["C"].width = 40
    ws.column_dimensions["D"].width = 22
    ws.column_dimensions["E"].width = 20
    ws.column_dimensions["F"].width = 20

    ws["C2"] = "หนังสือขอให้ออกหนังสือรับรองการชำระเบี้ยประกัน"
    ws["C2"].font = F_TITLE
    ws["C4"] = "บริษัท"
    ws["D4"] = "................................................"
    ws["F4"] = "วันที่ ............/............/............"
    ws["C6"] = "เรื่อง"
    ws["D6"] = "ขอให้ออกหนังสือรับรองการชำระเบี้ยประกัน"
    ws["C7"] = "เรียน"
    ws["D7"] = "ฝ่ายบัญชี บริษัท ..........................................."
    for addr in ("C4", "D4", "F4", "C6", "D6", "C7", "D7"):
        ws[addr].font = F_BODY
    ws["C6"].font = F_BOLD
    ws["C7"].font = F_BOLD
    ws["C9"] = "ตามที่บริษัทฯ ได้ชำระเบี้ยประกันชีวิตให้กับกรรมการ คือ"
    ws["C9"].font = F_BODY
    ws.merge_cells("C9:F9")

    r = 11
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4)
    for col, text in ((3, "ชื่อ-นามสกุล / เลขประจำตัวผู้เสียภาษี"), (5, "กรมธรรม์เลขที่"), (6, "จำนวนเงิน (บาท)")):
        c = ws.cell(row=r, column=col, value=text)
        c.font = F_HEAD
        c.fill = FILL_HEAD
        c.border = BOX
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for i in range(3):
        row = r + 1 + i
        ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=4)
        for col in (3, 5, 6):
            c = ws.cell(row=row, column=col)
            c.fill = FILL_IN
            c.border = BOX
            c.font = F_BODY
        ws.cell(row=row, column=6).number_format = MONEY
    last_row = r + 3

    row = last_row + 1
    ws.cell(row=row, column=3, value="รวม").font = F_BOLD
    tot = ws.cell(row=row, column=6, value=f"=SUM(F{r + 1}:F{last_row})")
    tot.number_format = MONEY
    tot.font = F_BOLD
    tot.fill = FILL_TOTAL
    tot.border = BOX

    row += 2
    ws.cell(row=row, column=3, value="โดยชำระเป็นเช็คธนาคาร").font = F_BODY
    ws.cell(row=row, column=4, value="................................................").font = F_BODY
    ws.cell(row=row + 1, column=3, value="สาขา").font = F_BODY
    ws.cell(row=row + 1, column=4, value="................................................").font = F_BODY
    ws.cell(row=row + 1, column=5, value="เช็คเลขที่").font = F_BODY
    ws.cell(row=row + 1, column=6, value="..............................").font = F_BODY
    ws.cell(row=row + 2, column=3, value="ลงวันที่").font = F_BODY
    ws.cell(row=row + 2, column=4, value="......../......../........").font = F_BODY
    ws.cell(row=row + 2, column=5, value="จำนวนเงิน").font = F_BODY
    ws.cell(row=row + 2, column=6, value="..................... บาท").font = F_BODY

    row += 4
    ws.cell(row=row, column=3,
            value="ใคร่ขอให้บริษัทฯ ได้ออกหนังสือรับรองการชำระเบี้ยประกันดังกล่าว เพื่อเป็นหลักฐานในการบันทึกบัญชี")
    ws.cell(row=row, column=3).font = F_BODY
    ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=6)
    ws.cell(row=row + 2, column=3, value="จึงเรียนมาเพื่อโปรดดำเนินการ").font = F_BODY
    ws.cell(row=row + 4, column=5, value="ขอแสดงความนับถือ").font = F_BODY
    ws.cell(row=row + 6, column=5, value="ลงชื่อ ............................................").font = F_BODY
    ws.cell(row=row + 7, column=5, value="( .............................................. )").font = F_BODY
    ws.cell(row=row + 8, column=5, value="กรรมการ").font = F_BODY
    ws.cell(row=row + 9, column=3, value="แนบ: สำเนาเช็ค / หนังสือรับรองการหักภาษี ณ ที่จ่าย (ถ้ามี)").font = F_SMALL
    ws.page_setup.orientation = "portrait"


if __name__ == "__main__":
    print("saved:", build())
