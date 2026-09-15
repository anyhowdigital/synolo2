"""iter56 seed: creates QA56 fixtures for office tasks, doc_requests, firm_fee_charges.
Usage:
  python3 iter56_seed.py seed
  python3 iter56_seed.py cleanup
"""
import json, sqlite3, sys, uuid
from datetime import datetime, timedelta, timezone

DB = "/app/frontend/data/timologio.db"
ORG_ID = "fa82eab8-ce41-4d73-8a3f-05a0f63f1002"   # authorized client for office@koletsas.gr
FIRM_UID = "0b70ab59-f6ab-4a18-904e-89099728de8e"  # office@koletsas.gr
TAG = "QA56"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def seed():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    today = datetime.now(timezone.utc).date()

    # ---------- 30 office_tasks (25 open, 5 done). Codes MUST NOT start with advisor: ----------
    # Ensure at least 4 overdue (dueDate < today AND status=open) and varied severities.
    severities = ["critical", "high", "medium", "low"]
    tasks_rows = []
    for i in range(30):
        tid = str(uuid.uuid4())
        status = "done" if i < 5 else "open"
        sev = severities[i % 4]
        # spread due dates: 6 in past (overdue when open), 24 in future
        if i in (5, 6, 7, 8, 9, 10):
            due = today - timedelta(days=(i - 4) * 2)
        else:
            due = today + timedelta(days=i)
        title = f"{TAG} task #{i:02d} — general check"
        if i == 12:
            title = (
                f"{TAG} task #12 — Ελεγχος αναλυτικών εγγραφών λογιστηρίου με υπερβολικά μακρύ τίτλο χωρίς κενά "
                f"ΓιαΝαΕλέγξουμεWordWrappingΚαιΤηνΕμφάνισηΣτηνΜπλεΚάρταΜεΠολύΜεγάληΛέξηWithoutSpacesTest1234567890"
            )
        code = f"{TAG}-manual-{i:03d}"  # NOT advisor:
        tasks_rows.append((tid, ORG_ID, code, title, sev, None, due.isoformat(), status, f"{TAG} note {i}", now_iso(), now_iso()))
    cur.executemany(
        "INSERT INTO office_tasks (id, org_id, code, title, severity, assignee_user_id, due_date, status, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        tasks_rows,
    )

    # ---------- 30 doc_requests. Statuses (via status/expiresAt/items): closed, expired, all-uploaded, partial ----------
    doc_rows = []
    for i in range(30):
        did = str(uuid.uuid4())
        token = f"{TAG}tok{i:03d}{uuid.uuid4().hex[:8]}"
        title = f"{TAG} docreq {i:02d}"
        # boundaries: i=0 createdAt yesterday 00:00, i=1 today 00:00, i=2 today 23:59
        if i == 0:
            created = (today - timedelta(days=1)).isoformat() + "T00:00:00.000Z"
        elif i == 1:
            created = today.isoformat() + "T00:00:00.000Z"
        elif i == 2:
            created = today.isoformat() + "T23:59:00.000Z"
        else:
            created = (today - timedelta(days=i)).isoformat() + "T12:00:00.000Z"
        # Status distribution: first 7 "closed", next 7 "expired" (open+past expires_at), next 8 "all-uploaded" (all items uploaded, not closed, future expires),
        # remaining 8 "partial" (some uploaded, open, future expires).
        if i < 7:
            status = "closed"
            expires = (today + timedelta(days=7)).isoformat() + "T00:00:00.000Z"
            items = [{"label": f"{TAG} item {i}-{k}", "uploaded": (k % 2 == 0)} for k in range(3)]
        elif i < 14:
            status = "open"
            expires = (today - timedelta(days=1)).isoformat() + "T00:00:00.000Z"  # past → expired
            items = [{"label": f"{TAG} item {i}-{k}", "uploaded": False} for k in range(3)]
        elif i < 22:
            status = "open"
            expires = (today + timedelta(days=7)).isoformat() + "T00:00:00.000Z"
            items = [{"label": f"{TAG} item {i}-{k}", "uploaded": True} for k in range(3)]  # all uploaded → complete
        else:
            status = "open"
            expires = (today + timedelta(days=7)).isoformat() + "T00:00:00.000Z"
            items = [{"label": f"{TAG} item {i}-{k}", "uploaded": (k == 0)} for k in range(3)]  # partial
        doc_rows.append((did, ORG_ID, token, title, json.dumps(items), f"{TAG} msg {i}", status, expires, created))
    cur.executemany(
        "INSERT INTO doc_requests (id, org_id, token, title, items_json, message, status, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        doc_rows,
    )

    # ---------- 205 firm_fee_charges. Month 2090-01 (well beyond generation history) ----------
    charge_rows = []
    for i in range(205):
        cid = str(uuid.uuid4())
        # Mix statuses: 100 unpaid, 105 paid — allows filter assertions.
        status = "unpaid" if i < 100 else "paid"
        paid_at = None if status == "unpaid" else now_iso()
        amount = 100.0 + (i % 40)
        month = "2090-01" if i < 200 else "2090-02"  # 200 in Jan (test-month), 5 in Feb → for chargeMonth filter test
        charge_rows.append((cid, FIRM_UID, ORG_ID, month, amount, status, paid_at, now_iso()))
    cur.executemany(
        "INSERT INTO firm_fee_charges (id, firm_user_id, org_id, month, amount, status, paid_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
        charge_rows,
    )

    con.commit()
    print(f"seeded: 30 tasks, 30 doc_requests, 205 firm_fee_charges (org={ORG_ID})")
    con.close()


def cleanup():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    c1 = cur.execute("DELETE FROM office_tasks WHERE code LIKE 'QA56-%'").rowcount
    c2 = cur.execute("DELETE FROM doc_requests WHERE title LIKE 'QA56 %'").rowcount
    c3 = cur.execute(
        "DELETE FROM firm_fee_charges WHERE firm_user_id=? AND month IN ('2090-01','2090-02')",
        (FIRM_UID,),
    ).rowcount
    con.commit()
    print(f"cleanup: removed {c1} tasks, {c2} doc_requests, {c3} firm_fee_charges")
    con.close()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "seed"
    if cmd == "seed":
        seed()
    elif cmd == "cleanup":
        cleanup()
    else:
        print("usage: python3 iter56_seed.py [seed|cleanup]")
