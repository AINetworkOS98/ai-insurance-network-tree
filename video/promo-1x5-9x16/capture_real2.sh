#!/usr/bin/env bash
# แคปหน้าจริงของระบบ (หน้า public ที่ไม่ต้องล็อกอิน) เป็นภาพ 1080x1920 สำหรับประกอบวิดีโอ
set -u
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
OUT="C:/Users/User/ai-insurance-network-tree/video/promo-1x5-9x16/out/real"
BASE="https://ai-insurance-network-tree.vercel.app"

cap() { # $1 = slug , $2 = path , $3 = extra height px (default 1920)
  local slug="$1" path="$2" h="${3:-1920}"
  local udd="$LOCALAPPDATA/Temp/chrome-real-$slug-$$"
  rm -rf "$udd"
  timeout 90 "$CHROME" --headless=new --disable-gpu --no-first-run --disable-extensions \
    --hide-scrollbars --force-device-scale-factor=1 --window-size=1080,"$h" \
    --user-data-dir="$udd" --virtual-time-budget=9000 \
    --screenshot="$OUT/$slug.png" "$BASE$path" 2>&1 | grep -oE "[0-9]+ bytes written to file .*"
  rm -rf "$udd"
}

cap ai-visual      "/ai-network-visual.html" 2400
cap search-landing "/search_landing"
cap criteria       "/criteria"
echo "--- done ---"
ls -la /c/Users/User/ai-insurance-network-tree/video/promo-1x5-9x16/out/real
