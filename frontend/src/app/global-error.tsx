"use client";

/** Έσχατο δίχτυ ασφαλείας όταν αποτύχει το ίδιο το root layout· αντικαθιστά ολόκληρο το έγγραφο. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="el">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#fafafa", color: "#111" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Κάτι πήγε στραβά</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Η εφαρμογή δεν μπόρεσε να φορτώσει. Δοκιμάστε ξανά σε λίγο.</p>
          {error.digest ? <p style={{ color: "#888", fontSize: 12 }}>Κωδικός αναφοράς: {error.digest}</p> : null}
          <button onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>
            Δοκιμή ξανά
          </button>
        </div>
      </body>
    </html>
  );
}
