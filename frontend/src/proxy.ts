import { NextResponse, type NextRequest } from "next/server";

/**
 * Σε serverless deployment χωρίς απομακρυσμένη βάση, κάθε αίτημα οδηγείται στη σελίδα /setup με οδηγίες.
 * Χωρίς αυτό, κάθε instance θα είχε δική του εφήμερη SQLite και η εφαρμογή θα φαινόταν «χαλασμένη»
 * (αποσύνδεση σε κάθε κλικ, δεδομένα που εξαφανίζονται).
 */
export function proxy(req: NextRequest) {
  const hasDb = !!(process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL);
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const { pathname } = req.nextUrl;
  if (!hasDb && serverless && pathname !== "/setup") {
    const url = req.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.rewrite(url, { status: 503 });
  }
  if (hasDb && pathname === "/setup") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/health).*)"],
};
