#!/usr/bin/env python3
"""Seed QA55 fixtures for banking, employees, customers into demo org and print counts."""
import sqlite3, uuid, sys
from datetime import datetime, timezone

DB = "/app/frontend/data/timologio.db"
ORG = "fa82eab8-ce41-4d73-8a3f-05a0f63f1002"
PREFIX = "QA55_"
ISO = lambda d=None: (d or datetime.now(timezone.utc)).isoformat()

def seed():
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    # ----- 26 banking accounts -----
    kinds = ["bank", "cash", "card", "other"]
    accs = []
    for i in range(26):
        kind = kinds[i % 4]
        name = f"{PREFIX}Acc_{i:02d}"
        if i == 3:
            name = f"{PREFIX}Superlongnameunbreakabletoseehowitwrapsinsidecardheader_{i:02d}"
        iban = ""
        if kind == "bank":
            iban = f"GR16 0110 1250 0000 0001 2345 {i:03d}".replace(" ", "") if i == 5 else f"GR1601101250000000012345{i:03d}"
        bank = "ΕΘΝΙΚΗ" if kind == "bank" else ""
        active = 0 if i % 5 == 0 else 1
        accs.append((str(uuid.uuid4()), ORG, name, kind, iban, bank, "EUR", 100.0 * i, "2024-01-01", 0, active, ISO()))
    # Insert
    c.executemany(
        "INSERT INTO cash_accounts (id,org_id,name,kind,iban,bank_name,currency,opening_balance,opening_date,is_default,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        accs,
    )

    # ----- 26 employees -----
    emps = []
    specs = ["Λογιστής", "Πωλητής", "Οδηγός", "Γραμματέας"]
    firsts = ["Γιώργος", "Μαρία", "Νίκος", "Ελένη", "Κώστας"]
    lasts = ["Παπαδόπουλος", "Ιωάννου", "Δημητρίου", "Νικολάου", "Καραγιάννης"]
    for i in range(26):
        active = 0 if i % 4 == 0 else 1
        emp_id = str(uuid.uuid4())
        first = f"{PREFIX}{firsts[i % 5]}"
        last = f"{lasts[i % 5]}_{i:02d}"
        afm = f"9990{i:04d}"[:9]
        amka = f"010101{10000+i}"
        emps.append((
            emp_id, ORG, first, last, afm, amka, "", specs[i%4][:3].upper(), specs[i%4], "101",
            "full", "2020-01-01", None if active else "2023-12-31", 1200.0 + i*10, 40.0, 40.0, 0, "", active, ISO(),
            "", "", "", "0", "", "", "000", "ΑΔΤ", "", "0", "", "", "", ""
        ))
    c.executemany(
        "INSERT INTO employees (id,org_id,first_name,last_name,afm,amka,efka_am,specialty_code,specialty_name,kpk,contract_type,hire_date,end_date,gross_salary,daily_wage,hours_per_week,children,iban,active,created_at,portal_token,portal_pin,birth_date,sex,father_name,mother_name,nationality,id_type,id_number,marital_status,doy,education_level,email,phone) VALUES (" + ",".join(["?"]*34) + ")",
        emps,
    )

    # ----- 55 customers -----
    custs = []
    for i in range(55):
        cid = str(uuid.uuid4())
        name = f"{PREFIX}Customer_{i:02d}"
        custs.append((
            cid, ORG, "company", name, f"1000{i:04d}"[:9], "Α ΑΘΗΝΩΝ", "", "", "", "", "GR",
            f"c{i}@qa55.gr", "", "", "", "customer", None, ISO(),
            "[]", "{}", "el", None, None, None, None, 0.0, 0, "", "", "", "", "", "", "", None, None, "", "", None, 0.0, ""
        ))
    c.executemany(
        "INSERT INTO customers (id,org_id,kind,name,afm,doy,activity,address,city,postal_code,country,email,phone,contact_person,notes,stage,payment_terms_days,created_at,tags,custom_fields_json,language,salesperson_id,portal_token,portal_last_seen_at,price_list_id,discount_percent,public_entity,b2g_endpoint_id,b2g_buyer_reference,b2g_buyer_identifier,b2g_contract_adam,b2g_project_reference,b2g_order_reference,b2g_kae,stripe_customer_id,stripe_payment_method_id,card_brand,card_last4,card_saved_at,credit_limit,b2g_cpv) VALUES (" + ",".join(["?"]*41) + ")",
        custs,
    )

    conn.commit()
    for table, column in [("cash_accounts", "name"), ("employees", "first_name"), ("customers", "name")]:
        n = c.execute(f"SELECT COUNT(*) FROM {table} WHERE org_id=? AND {column} LIKE ?", (ORG, f"{PREFIX}%")).fetchone()[0]
        print(f"{table} QA55 count: {n}")
    conn.close()

def cleanup():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM cash_accounts WHERE org_id=? AND name LIKE 'QA55%'", (ORG,))
    a = c.rowcount
    c.execute("DELETE FROM employees WHERE org_id=? AND first_name LIKE 'QA55%'", (ORG,))
    e = c.rowcount
    c.execute("DELETE FROM customers WHERE org_id=? AND name LIKE 'QA55%'", (ORG,))
    cu = c.rowcount
    conn.commit()
    conn.close()
    print(f"Cleanup: cash_accounts={a} employees={e} customers={cu}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
        cleanup()
    else:
        seed()
