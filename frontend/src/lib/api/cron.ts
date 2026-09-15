/**
 * Προστασία cron endpoints. Αν έχει οριστεί CRON_SECRET απαιτείται `Authorization: Bearer <secret>`
 * (ή `?secret=`). Χωρίς CRON_SECRET επιτρέπεται μόνο σε development.
 */
export function authorizeCron(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return null;
    return Response.json({ error: "CRON_SECRET δεν έχει οριστεί." }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const qs = new URL(req.url).searchParams.get("secret");
  if (header === `Bearer ${secret}` || qs === secret) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
