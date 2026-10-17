@echo off
REM เปิดโปรแกรม Keyman CRM & Tax 2569 (Windows)
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo ยังไม่มี venv — กำลังสร้างและติดตั้งไลบรารี...
  uv venv .venv --python 3.12
  uv pip install --python .venv\Scripts\python.exe -r requirements.txt
)
start "" http://localhost:8501
.venv\Scripts\python.exe -m streamlit run app.py --server.port 8501 --server.address 127.0.0.1 --browser.gatherUsageStats false
