import { redirect } from "next/navigation";

/** Τα δελτία αποστολής ζουν στη λίστα παραστατικών με φίλτρο· η διεύθυνση διατηρείται για ευκολία. */
export default function DeliveryNotesPage() {
  redirect("/invoices?kind=delivery");
}
