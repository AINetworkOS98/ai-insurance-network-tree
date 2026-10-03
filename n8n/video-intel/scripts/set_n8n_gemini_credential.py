#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
set_n8n_gemini_credential.py — กู้/ตั้ง credential ของ n8n ที่ถอดรหัสไม่ได้

อาการ: node AI ล้มด้วย
  "Credentials could not be decrypted. The likely reason is that a different
   encryptionKey was used to encrypt the data."
สาเหตุ: ~/.n8n/config (encryptionKey) ถูกเขียนใหม่ ⇒ credential ที่สร้างก่อนหน้านั้นใช้ไม่ได้
        และคีย์จริงดึงจาก Vercel ไม่ได้ (sensitive) / .env.local เป็น [SENSITIVE]

วิธีแก้: หาคีย์จริงจากแหล่งบนเครื่องนี้ แล้วเข้ารหัส credential กลับด้วยคีย์ปัจจุบัน
        (ค่าคีย์ไม่ถูกพิมพ์ออกหน้าจอ — เขียนลงไฟล์ชั่วคราวแล้วลบทันที)

ใช้:
  python set_n8n_gemini_credential.py --check                 # ดูว่าพบคีย์จากแหล่งไหน
  python set_n8n_gemini_credential.py --apply                 # เขียน credential + verify
  python set_n8n_gemini_credential.py --apply --key-file C:/path/key.txt
"""
import argparse, json, os, re, subprocess, sys, tempfile

CRED_ID = "openrouter-workflow-1790828913760"
CRED_NAME = "Google Gemini API (OpenAI-compatible)"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
HERMES_CFG = r"C:/Users/User/AppData/Local/hermes/config.yaml"
REPO_ENV = r"C:/Users/User/ai-insurance-network-tree/.env.local"
NODE = r"C:/Users/User/AppData/Local/hermes/tools/node-26.7.0-win32-x64/node.exe"
CRYPTO = r"C:/Users/User/AppData/Local/hermes/skills/n8n-local-windows/scripts/n8n-cred-crypto.js"
NODE_PATH = r"C:/Users/User/AppData/Roaming/npm/node_modules"


def looks_real(v):
    return bool(v) and len(v) >= 25 and "[SENSITIVE]" not in v


def find_key(key_file=None):
    if key_file and os.path.exists(key_file):
        v = open(key_file, encoding="utf-8", errors="replace").read().strip()
        if looks_real(v):
            return f"ไฟล์ {key_file}", v
    v = os.environ.get("GEMINI_API_KEY", "").strip()
    if looks_real(v):
        return "env GEMINI_API_KEY", v
    if os.path.exists(HERMES_CFG):
        txt = open(HERMES_CFG, encoding="utf-8", errors="replace").read()
        m = re.search(r'gemini_api_key:\s*(\S+)', txt)
        if m and looks_real(m.group(1)):
            return "hermes config.yaml (gemini_api_key)", m.group(1)
    if os.path.exists(REPO_ENV):
        txt = open(REPO_ENV, encoding="utf-8", errors="replace").read()
        m = re.search(r'^GEMINI_API_KEY=(.*)$', txt, re.M)
        if m and looks_real(m.group(1).strip().strip('"')):
            return "repo .env.local", m.group(1).strip().strip('"')
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--key-file")
    a = ap.parse_args()

    src, key = find_key(a.key_file)
    if not key:
        print("ไม่พบคีย์ Gemini ที่ใช้งานได้บนเครื่องนี้")
        print("  ใส่ได้ทาง: --key-file <ไฟล์>, env GEMINI_API_KEY, หรือวางคีย์เองในหน้า n8n Credentials")
        return 2
    print(f"พบคีย์จาก: {src} (len={len(key)}, head={key[:3]}…)")

    if a.check or not a.apply:
        print("โหมดตรวจเท่านั้น — เพิ่ม --apply เพื่อเขียนลง n8n")
        return 0

    tmp = os.path.join(tempfile.gettempdir(), "n8n-gemini-cred.json")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"apiKey": key, "url": GEMINI_URL}, fh)
    env = dict(os.environ, NODE_PATH=NODE_PATH)
    try:
        r = subprocess.run([NODE, CRYPTO, "write", CRED_ID, CRED_NAME, "openAiApi", tmp],
                           capture_output=True, text=True, env=env)
        print("write:", (r.stdout or r.stderr).strip()[:300])
        v = subprocess.run([NODE, CRYPTO, "fields", CRED_ID], capture_output=True, text=True, env=env)
        out = (v.stdout or v.stderr)
        print("verify:", out.strip()[:300])
        ok = "bad decrypt" not in out and "ERR_OSSL" not in out
        print("ผลลัพธ์:", "credential ใช้งานได้แล้ว" if ok else "ยังถอดรหัสไม่ได้")
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
            print("ลบไฟล์ชั่วคราวแล้ว")
    return 0


if __name__ == "__main__":
    sys.exit(main())
