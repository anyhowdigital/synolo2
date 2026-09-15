/** Κείμενα email προς πελάτες (αποστολή παραστατικού, υπενθύμιση) σε EL/EN/DE/IT. */
import type { DocumentLanguage } from "./languages";

interface EmailText {
  dear: (name: string) => string;
  sendingQuote: string;
  sendingDocument: (doc: string) => string;
  datedTotal: (date: string, total: string) => string;
  dueDate: (date: string) => string;
  paymentDetails: string;
  paymentRef: (rf: string) => string;
  attachedPdf: string;
  attachedPdfXml: string;
  transmitted: (mark: string) => string;
  regards: string;
  quoteSubject: (number: string, org: string) => string;
  docSubject: (doc: string, number: string, org: string) => string;
  quoteTitle: (number: string) => string;
  viewAccept: string;
  viewDocument: string;
  reminderSubject: (number: string, org: string) => string;
  reminderTitle: string;
  reminderBody: (number: string, date: string, remaining: string) => string;
  overdueBy: (days: number, due: string) => string;
  dueOn: (date: string) => string;
  reminderPayRef: (rf: string) => string;
  reminderPayNumber: (number: string) => string;
  alreadyPaid: string;
}

const T: Record<DocumentLanguage, EmailText> = {
  el: {
    dear: (n) => `Αγαπητέ/ή ${n || "πελάτη"},`,
    sendingQuote: "Σας αποστέλλουμε την προσφορά μας",
    sendingDocument: (doc) => `Σας αποστέλλουμε το παραστατικό <strong>${doc}</strong>`,
    datedTotal: (date, total) => `με ημερομηνία ${date} και συνολικό ποσό <strong>${total}</strong>.`,
    dueDate: (date) => ` Προθεσμία πληρωμής: <strong>${date}</strong>.`,
    paymentDetails: "Στοιχεία πληρωμής",
    paymentRef: (rf) => `Κωδικός πληρωμής (RF): <strong>${rf}</strong> – αναγράψτε τον στην αιτιολογία.`,
    attachedPdf: "Το παραστατικό επισυνάπτεται σε PDF.",
    attachedPdfXml: "Το παραστατικό επισυνάπτεται σε PDF μαζί με το XML myDATA.",
    transmitted: (mark) => `Το παραστατικό έχει διαβιβαστεί στην ΑΑΔΕ (myDATA) με MARK ${mark}.`,
    regards: "Με εκτίμηση,",
    quoteSubject: (number, org) => `Προσφορά ${number} – ${org}`,
    docSubject: (doc, number, org) => `${doc} ${number} – ${org}`,
    quoteTitle: (number) => `Προσφορά ${number}`,
    viewAccept: "Προβολή & αποδοχή προσφοράς",
    viewDocument: "Προβολή παραστατικού",
    reminderSubject: (number, org) => `Υπενθύμιση πληρωμής – ${number} – ${org}`,
    reminderTitle: "Υπενθύμιση πληρωμής",
    reminderBody: (number, date, remaining) => `Σας υπενθυμίζουμε ότι το παραστατικό <strong>${number}</strong> (${date}) με υπόλοιπο <strong>${remaining}</strong> `,
    overdueBy: (days, due) => `είναι ληξιπρόθεσμο κατά ${days} ημέρες (προθεσμία ${due}).`,
    dueOn: (date) => `λήγει στις ${date}.`,
    reminderPayRef: (rf) => `Παρακαλούμε αναγράψτε στην αιτιολογία τον κωδικό πληρωμής <strong>${rf}</strong>.`,
    reminderPayNumber: (number) => `Παρακαλούμε αναγράψτε στην αιτιολογία τον αριθμό ${number}.`,
    alreadyPaid: "Εάν έχετε ήδη εξοφλήσει, παρακαλούμε αγνοήστε το παρόν.",
  },
  en: {
    dear: (n) => `Dear ${n || "customer"},`,
    sendingQuote: "Please find our quotation",
    sendingDocument: (doc) => `Please find attached <strong>${doc}</strong>`,
    datedTotal: (date, total) => `dated ${date} for a total of <strong>${total}</strong>.`,
    dueDate: (date) => ` Payment due by <strong>${date}</strong>.`,
    paymentDetails: "Payment details",
    paymentRef: (rf) => `Payment reference (RF): <strong>${rf}</strong> – please quote it with your transfer.`,
    attachedPdf: "The document is attached as PDF.",
    attachedPdfXml: "The document is attached as PDF together with the myDATA XML.",
    transmitted: (mark) => `The document has been transmitted to the Greek tax authority (AADE myDATA) with MARK ${mark}.`,
    regards: "Kind regards,",
    quoteSubject: (number, org) => `Quotation ${number} – ${org}`,
    docSubject: (doc, number, org) => `${doc} ${number} – ${org}`,
    quoteTitle: (number) => `Quotation ${number}`,
    viewAccept: "View & accept quotation",
    viewDocument: "View document",
    reminderSubject: (number, org) => `Payment reminder – ${number} – ${org}`,
    reminderTitle: "Payment reminder",
    reminderBody: (number, date, remaining) => `This is a reminder that document <strong>${number}</strong> (${date}) with an outstanding balance of <strong>${remaining}</strong> `,
    overdueBy: (days, due) => `is ${days} days overdue (due date ${due}).`,
    dueOn: (date) => `is due on ${date}.`,
    reminderPayRef: (rf) => `Please quote the payment reference <strong>${rf}</strong> with your transfer.`,
    reminderPayNumber: (number) => `Please quote the document number ${number} with your transfer.`,
    alreadyPaid: "If you have already paid, please disregard this message.",
  },
  de: {
    dear: (n) => `Sehr geehrte Damen und Herren${n ? ` (${n})` : ""},`,
    sendingQuote: "anbei erhalten Sie unser Angebot",
    sendingDocument: (doc) => `anbei erhalten Sie das Dokument <strong>${doc}</strong>`,
    datedTotal: (date, total) => `vom ${date} über insgesamt <strong>${total}</strong>.`,
    dueDate: (date) => ` Zahlbar bis <strong>${date}</strong>.`,
    paymentDetails: "Zahlungsinformationen",
    paymentRef: (rf) => `Zahlungsreferenz (RF): <strong>${rf}</strong> – bitte im Verwendungszweck angeben.`,
    attachedPdf: "Das Dokument ist als PDF beigefügt.",
    attachedPdfXml: "Das Dokument ist als PDF zusammen mit dem myDATA-XML beigefügt.",
    transmitted: (mark) => `Das Dokument wurde an die griechische Steuerbehörde (AADE myDATA) übermittelt, MARK ${mark}.`,
    regards: "Mit freundlichen Grüßen,",
    quoteSubject: (number, org) => `Angebot ${number} – ${org}`,
    docSubject: (doc, number, org) => `${doc} ${number} – ${org}`,
    quoteTitle: (number) => `Angebot ${number}`,
    viewAccept: "Angebot ansehen & annehmen",
    viewDocument: "Dokument ansehen",
    reminderSubject: (number, org) => `Zahlungserinnerung – ${number} – ${org}`,
    reminderTitle: "Zahlungserinnerung",
    reminderBody: (number, date, remaining) => `wir möchten Sie daran erinnern, dass das Dokument <strong>${number}</strong> (${date}) mit einem offenen Betrag von <strong>${remaining}</strong> `,
    overdueBy: (days, due) => `seit ${days} Tagen überfällig ist (fällig am ${due}).`,
    dueOn: (date) => `am ${date} fällig ist.`,
    reminderPayRef: (rf) => `Bitte geben Sie die Zahlungsreferenz <strong>${rf}</strong> im Verwendungszweck an.`,
    reminderPayNumber: (number) => `Bitte geben Sie die Dokumentnummer ${number} im Verwendungszweck an.`,
    alreadyPaid: "Sollten Sie bereits bezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.",
  },
  it: {
    dear: (n) => `Gentile ${n || "cliente"},`,
    sendingQuote: "Le inviamo il nostro preventivo",
    sendingDocument: (doc) => `Le inviamo il documento <strong>${doc}</strong>`,
    datedTotal: (date, total) => `del ${date} per un importo totale di <strong>${total}</strong>.`,
    dueDate: (date) => ` Scadenza pagamento: <strong>${date}</strong>.`,
    paymentDetails: "Dati per il pagamento",
    paymentRef: (rf) => `Riferimento pagamento (RF): <strong>${rf}</strong> – da indicare nella causale.`,
    attachedPdf: "Il documento è allegato in PDF.",
    attachedPdfXml: "Il documento è allegato in PDF insieme all'XML myDATA.",
    transmitted: (mark) => `Il documento è stato trasmesso all'autorità fiscale greca (AADE myDATA) con MARK ${mark}.`,
    regards: "Cordiali saluti,",
    quoteSubject: (number, org) => `Preventivo ${number} – ${org}`,
    docSubject: (doc, number, org) => `${doc} ${number} – ${org}`,
    quoteTitle: (number) => `Preventivo ${number}`,
    viewAccept: "Visualizza e accetta il preventivo",
    viewDocument: "Visualizza documento",
    reminderSubject: (number, org) => `Sollecito di pagamento – ${number} – ${org}`,
    reminderTitle: "Sollecito di pagamento",
    reminderBody: (number, date, remaining) => `Le ricordiamo che il documento <strong>${number}</strong> (${date}) con saldo residuo di <strong>${remaining}</strong> `,
    overdueBy: (days, due) => `è scaduto da ${days} giorni (scadenza ${due}).`,
    dueOn: (date) => `scade il ${date}.`,
    reminderPayRef: (rf) => `La preghiamo di indicare nella causale il riferimento <strong>${rf}</strong>.`,
    reminderPayNumber: (number) => `La preghiamo di indicare nella causale il numero ${number}.`,
    alreadyPaid: "Se ha già provveduto al pagamento, La preghiamo di ignorare questo messaggio.",
  },
};

export function emailText(lang: DocumentLanguage): EmailText {
  return T[lang] ?? T.el;
}
