# NAVI — ผู้ดูแลระบบอัตโนมัติของเว็บนี้

ไฟล์นี้ใช้ยืนยันว่า pipeline อัปเดตอัตโนมัติทำงานครบวงจร (git pull → build → deploy prod → verify)

- ผู้ดูแล: NAVI (Hermes profile `navi`)
- รอบการทำงาน: watchdog ทุก 15 นาที · auto-update ทุก 3 ชั่วโมง
- ตรวจสถานะ: `hermes -p navi cron list`
