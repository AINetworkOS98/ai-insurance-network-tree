# Runbook — ย้าย ai-insurance-network-tree ขึ้น VPS (KVM 2) แบบไม่แตะข้อมูลเดิม

> เป้าหมาย: แอป Next.js + Postgres + cron/n8n อยู่เครื่องเดียวกับฐานข้อมูล → ล็อกอิน Google และ route หนัก ๆ ทำงานได้
> กติกาเหล็ก: **ห้ามลบ Supabase ภายใน 1 สัปดาห์หลังย้ายสำเร็จ** · **ห้ามเปลี่ยน `AUTH_SECRET`** (เปลี่ยน = สมาชิกทุกคนหลุดล็อกอิน) · ห้ามรีเซ็ตข้อมูลเดิม

## 0) เตรียมของบนเครื่องนี้ (ทำแล้ว)
- สำรองข้อมูลแล้ว: `backups/supabase-<stamp>/` (93 ตาราง · 338 แถว · CSV ต่อตาราง + `manifest.json`)
  - ทำใหม่ได้: `cd C:/Users/User/ai-insurance-network-tree && node scripts/db-full-backup.mjs`
- คีย์ SSH: `C:/Users/User/.ssh/hostinger_vps` (public key ลงทะเบียนตอนสั่งซื้อแล้ว)
- สคริปต์กู้ข้อมูล: `scripts/db-restore-csv.mjs`

## 1) เข้าเครื่อง + ติดตั้ง Postgres 17
```bash
ssh -i C:/Users/User/.ssh/hostinger_vps root@<VPS_IP>
apt-get update && apt-get -y upgrade
apt-get -y install curl ca-certificates gnupg lsb-release
install -d /usr/share/postgresql-common/pgdg
curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update && apt-get -y install postgresql-17
systemctl enable --now postgresql
# สร้าง role + ฐานข้อมูล (ตั้งรหัสผ่านด้วยสุ่มเก็บใน /root/.pgpass_local — ห้ามพิมพ์ในแชท)
su - postgres -c "psql -c \"create role ains with login password '<<ตั้งรหัสใหม่>>' superuser;\""
su - postgres -c "createdb -O ains ains_prod"
# ให้แอปในเครื่องเชื่อมผ่าน localhost ได้
sed -i "s/^#listen_addresses.*/listen_addresses = 'localhost'/" /etc/postgresql/17/main/postgresql.conf
systemctl restart postgresql
```
> หมายเหตุ: `superuser` จำเป็นชั่วคราวสำหรับ `session_replication_role` ตอนกู้ข้อมูล — ลดสิทธิ์กลับได้หลังโหลดเสร็จ

## 2) ติดตั้ง Node 22 + เครื่องมือ
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get -y install nodejs git nginx
node -v && npm -v
```

## 3) วางโค้ด + สร้างโครงตาราง
```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/AINetworkOS98/ai-insurance-network-tree.git ains
cd ains && npm ci
# ไฟล์ .env — ดึงค่าจาก Hostinger (script บนเครื่องนี้เขียนให้ ไม่พิมพ์ค่าในแชท)
npx prisma migrate deploy        # สร้างโครง 93 ตารางจาก prisma/migrations
```

## 4) กู้ข้อมูลเข้า VPS
บนเครื่องนี้ (Windows):
```bash
scp -i C:/Users/User/.ssh/hostinger_vps -r "C:/Users/User/ai-insurance-network-tree/backups/supabase-<stamp>" root@<VPS_IP>:/root/backup
```
บน VPS:
```bash
cd /var/www/ains && npm i pg --no-save
PGURL="postgres://ains:<รหัส>@127.0.0.1:5432/ains_prod" node scripts/db-restore-csv.mjs /root/backup/supabase-<stamp>
# ตรวจว่าแถวตรงกับ manifest.json (338 แถว / 93 ตาราง)
PGURL="postgres://ains:<รหัส>@127.0.0.1:5432/ains_prod" node scripts/db-baseline.mjs
```

## 5) รันแอปเป็น service
```bash
cd /var/www/ains && npm run build      # ใช้ next build --webpack (Turbopack panic บน container)
cat >/etc/systemd/system/ains.service <<'UNIT'
[Unit]
Description=AI Insurance Network Tree
After=network.target postgresql.service
[Service]
WorkingDirectory=/var/www/ains
EnvironmentFile=/var/www/ains/.env
ExecStart=/usr/bin/node scripts/start.js
Restart=always
User=root
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now ains
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```
> ต้องมี env `PORT=3000` และค่าที่จำเป็นใน `.env` (ดูข้อ 6)

## 6) env ที่ต้องมีบน VPS (คัดจาก Hostinger ทั้งชุด)
`DATABASE_URL`(ชี้ VPS ใหม่) `DIRECT_URL` `AUTH_SECRET`(**ค่าเดิมเท่านั้น**) `CRON_SECRET` `APP_BASE_URL` `NEXT_PUBLIC_APP_URL` `NEXT_PUBLIC_BASE_URL` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `NEXT_PUBLIC_FIREBASE_*` `EMAIL_*` `SMTP_*` `LINE_*` `DISABLE_FIRESTORE_MIRROR=1`
- ดึงทั้งชุดจาก hPanel API: `GET .../nodejs/builds/settings/env` (ค่าต้องไม่ถูกพิมพ์ออกแชท — เขียนลงไฟล์บนเซิร์ฟเวอร์เท่านั้น)
- **อย่าใส่** `NEXT_SKIP_TS_BUILD` / `BUILD_STANDALONE` บน VPS (มีแรมพอให้ตรวจ type + ไม่ต้อง standalone)

## 7) nginx + TLS + โดเมน
```bash
cat >/etc/nginx/sites-available/ains <<'NG'
server {
  listen 80; server_name <โดเมนจริง หรือ VPS_IP>;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; }
}
NG
ln -sf /etc/nginx/sites-available/ains /etc/nginx/sites-enabled/ains && nginx -t && systemctl reload nginx
apt-get -y install certbot python3-certbot-nginx && certbot --nginx -d <โดเมนจริง>   # หลังชี้ DNS แล้ว
```
> **สำคัญ**: ต้องส่ง `Host` + `X-Forwarded-Host` ให้แอป (Hostinger proxy ไม่ส่ง ทำให้เกิดบั๊ก `0.0.0.0:3000` มาก่อน)
> Google Cloud Console: เพิ่ม redirect URI `https://<โดเมน>/auth/callback` + JS origin `https://<โดเมน>`

## 8) cron / n8n
- cron ในแอป: `vercel.json` มีรายการอยู่แล้ว → ย้ายเป็น crontab ของ VPS
  ```bash
  (crontab -l 2>/dev/null; echo "0 * * * * curl -s -H \"Authorization: Bearer \$CRON_SECRET\" http://127.0.0.1:3000/api/cron/email-sync >/dev/null"; echo "0 2 * * * curl -s -H \"Authorization: Bearer \$CRON_SECRET\" http://127.0.0.1:3000/api/cron/backup >/dev/null") | crontab -
  ```
- n8n บนพีซี (พอร์ต 5679): เปลี่ยน URL จากโฮสต์เดิม → `https://<โดเมน>` หรือย้าย n8n ขึ้น VPS ด้วย (มีแรม 8GB พอ)

## 9) ตรวจรับ (ต้องผ่านทุกข้อก่อนบอกว่าเสร็จ)
1. `curl -s https://<โดเมน>/` → 200 + title "AI Insurance Network Tree — ระบบบริหารเครือข่ายตัวแทน"
2. `curl -s https://<โดเมน>/login` → 200
3. ล็อกอิน Google จริง → เข้า `/` สำเร็จ + มี cookie `token`
4. `curl -s https://<โดเมน>/api/ai/status` → `{ok:true}`
5. ล็อกอินอีเมลปลอม → **401** (ไม่ใช่ 500) ⇒ DB ต่อติด
6. Footer แสดงจำนวนสมาชิก/ผู้เข้าชมเท่ากับก่อนย้าย
7. เทียบ row count: `scripts/db-baseline.mjs` ก่อน/หลัง ต้องเท่ากันเป๊ะ (338 แถว / 93 ตาราง)
8. cron ยิงเองได้: `/api/cron/backup` ด้วย Bearer → 200
9. `/api/auth/google` → 307 ไป Google ด้วย `redirect_uri` ของโดเมนใหม่

## 10) เมื่อผ่านแล้ว / ถอยกลับ
- ผ่านครบ: ค่อย ๆ ย้ายโดเมนจริง (DNS) → ทดสอบซ้ำ → **เว้น 1 สัปดาห์** จึงค่อยลบโปรเจกต์ Supabase / Cloud Startup
- ถอยกลับได้เสมอ: ชี้ `DATABASE_URL` กลับไป Supabase (ข้อมูลเดิมไม่ถูกแตะ) + ปิด service บน VPS
