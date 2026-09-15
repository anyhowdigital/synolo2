"""Iteration 4 verification tests:
1) OCR endpoint accepts PNG (image→PDF conversion) at FastAPI :8001
2) AFM lookup demo fallback + modulo-11 rejection at Next.js :3000
3) mydata-sync cron endpoint at Next.js :3000
4) send-dunning-email server action file exists and exports sendDunningEmail
"""
import base64
import io
import os
import subprocess

import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BACKEND = "http://localhost:8001"
FRONTEND = "http://localhost:3000"


# ---------- 1. OCR image support ----------
def _make_greek_receipt_png() -> str:
    img = Image.new("RGB", (800, 500), "white")
    d = ImageDraw.Draw(img)
    # Try a font that supports Greek; fall back to default (which on Linux has DejaVu)
    font = None
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        if os.path.exists(path):
            font = ImageFont.truetype(path, 28)
            break
    lines = [
        "ΟΤΕ Α.Ε.",
        "ΑΦΜ: 094019245",
        "ΔΟΥ: ΦΑΕ ΑΘΗΝΩΝ",
        "Ημερομηνία: 15/09/2026",
        "Αριθμός: A-1234",
        "Καθαρή αξία: 119,35 EUR",
        "ΦΠΑ 24%: 28,65 EUR",
        "Σύνολο: 148,00 EUR",
    ]
    y = 30
    for line in lines:
        d.text((30, y), line, fill="black", font=font)
        y += 45
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def test_ocr_accepts_png_image():
    data_url = _make_greek_receipt_png()
    r = requests.post(f"{BACKEND}/api/ocr/expense", json={"file_data_url": data_url}, timeout=120)
    print("OCR status:", r.status_code)
    print("OCR body:", r.text[:1500])
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:500]}"
    data = r.json()
    assert data.get("ok") is True, data
    extracted = data.get("extracted") or {}
    # Do soft assertions on extracted fields (LLM may miss some)
    afm = str(extracted.get("supplier_afm") or "")
    gross = extracted.get("gross_value")
    date = extracted.get("issue_date") or ""
    print("Extracted afm/gross/date =", afm, gross, date)
    # At least AFM should be extracted correctly
    assert afm == "094019245", f"AFM mismatch: {afm!r} full={extracted}"
    # Gross may be 148 or 148.0
    if gross is not None:
        assert float(gross) == 148.0, f"gross={gross}"


# ---------- 3. AFM lookup ----------
def test_afm_lookup_demo_valid():
    r = requests.post(f"{FRONTEND}/api/afm/lookup", json={"afm": "094019245"}, timeout=30)
    print("AFM valid:", r.status_code, r.text[:300])
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["source"] == "demo"
    assert d["data"]["name"] == "ΟΤΕ Α.Ε."


def test_afm_lookup_invalid_modulo11():
    r = requests.post(f"{FRONTEND}/api/afm/lookup", json={"afm": "111111111"}, timeout=30)
    print("AFM invalid:", r.status_code, r.text[:300])
    assert r.status_code == 400
    d = r.json()
    assert d["ok"] is False
    assert "modulo" in d["error"].lower() or "μη έγκυρο" in d["error"].lower()


# ---------- 4. mydata-sync cron ----------
CRON_SECRET = "dev-cron-secret-change-me"


def test_mydata_sync_cron_unauthorized_without_bearer():
    r = requests.post(f"{FRONTEND}/api/cron/mydata-sync", timeout=30)
    assert r.status_code == 401


def test_mydata_sync_cron_post():
    headers = {"Authorization": f"Bearer {CRON_SECRET}"}
    r = requests.post(f"{FRONTEND}/api/cron/mydata-sync", headers=headers, timeout=60)
    print("cron status:", r.status_code, r.text[:500])
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert "ranAt" in d
    assert isinstance(d.get("orgs"), list)


def test_mydata_sync_cron_get():
    headers = {"Authorization": f"Bearer {CRON_SECRET}"}
    r = requests.get(f"{FRONTEND}/api/cron/mydata-sync", headers=headers, timeout=60)
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ---------- 2. send-dunning-email file check ----------
def test_send_dunning_email_file_exists_and_exports():
    path = "/app/frontend/src/app/actions/send-dunning-email.ts"
    assert os.path.exists(path)
    src = open(path).read()
    assert "export async function sendDunningEmail" in src
    assert "emailOutbox" in src
    # Must set status='logged' when RESEND_API_KEY not set
    assert 'RESEND_API_KEY' in src and '"logged"' in src


def test_dunning_ai_button_wired():
    path = "/app/frontend/src/components/invoices/dunning-ai-button.tsx"
    assert os.path.exists(path)
    src = open(path).read()
    assert "sendDunningEmail" in src
    assert "Αποστολή email" in src or "Αποστολή" in src


# ---------- crons.yml verification ----------
def test_crons_yml():
    path = "/app/.emergent/crons.yml"
    assert os.path.exists(path)
    txt = open(path).read()
    assert "mydata-request-docs-daily" in txt
    assert "reminders-daily" in txt
    assert "/api/cron/mydata-sync" in txt
