# Σύνολο ERP — έλεγχοι πρώτης δημόσιας παρουσίασης

## Scope
Η νέα εργασία αφορά landing/login/business signup/accountant signup UI και περιεχόμενο. Backend auth/session/password/2FA/passkeys/invitations και επιχειρηματικά δεδομένα δεν αλλάζουν. Το γενικό JWT/FastAPI playbook δεν αντικαθιστά την υπάρχουσα αρχιτεκτονική Next16/Drizzle/cookie session.

## Test requirements
- Τρέχον preview μόνο από frontend/.env REACT_APP_BACKEND_URL. Το /?preview=1 επιτρέπει προβολή landing και από συνδεδεμένο χρήστη.
- Credentials από memory/test_credentials.md. Ο πραγματικός owner kkoletsas@gmail.com δεν αλλάζει.
- Login στο πραγματικό UI demo@timologio.gr/demo1234, χωρίς injected session ή DB bypass. Submit περιμένει hydration πλέον: useSyncExternalStore server=false client=true στο AuthForms SubmitButton. Παραμένει POST ώστε τα credentials να μη βρεθούν σε URL.
- Λάθος password μία φορά και σωστό μετά: εμφανίζεται σφάλμα, μένουν οι τιμές, σωστό redirect/dashboard. Μην εξαντλήσετε throttle.
- Business signup: required/email/password feedback, visibility toggle, ήδη χρησιμοποιούμενο email -> πραγματικό server action σφάλμα χωρίς νέα εγγραφή/email. Invite hidden fields και read-only email διατηρούνται.
- Accountant signup: όλα τα υφιστάμενα fields, ίδιο action, ίδιο min8 password policy. Duplicate email test χωρίς νέα εγγραφή, χωρίς ενεργοποίηση υπηρεσιών.
- Μη δημιουργείτε νέες credentials χωρίς να τις γράψετε αμέσως στο memory/test_credentials.md. Μη στείλετε πραγματικά emails/πληρωμές/υποβολές. Happy-path registration μπορεί να δοκιμαστεί απομονωμένα με απόκλειση email, όχι σε owner.
- Login link, registration choice, forgot password link/page, passkey button availability, 2FA UI μη χαθούν. Μην ισχυριστείτε βιομετρική ταυτοποίηση χωρίς virtual authenticator.
- Desktop μόνο1920×800 και mobile μόνο390×844. Πραγματικές εικόνες landing και auth μετά hydration, full_page=False. Δείτε καταστάσεις error και υποχρεωτικά πεδία.
- Latest mobile request: body15–16px, auth inputs16px, labels15px, buttons14–15px, helper copy>=13px. Διακοσμητική προεπισκόπηση πιο συμπαγής11–13px, ρητά ενδεικτική. Ελέγξτε πραγματικά computed styles και document overflow σε ΟΛΕΣ τις νέες οθόνες, όχι μόνο πρώτο hero.
- Feature filters18 items (όλα/sales/money/office), persona toggle, mobile menu anchors, FAQ native details, pricing monthly/yearly με πραγματικά PLANS ποσά χωρίς checkout.
- Καμία ετικέτα pending/coming soon στην παρουσίαση δυνατοτήτων. Future own-provider/universal bridges αναφέρονται ως σχεδιασμός/στόχος, χωρίς ψευδή τρέχουσα πιστοποίηση ή εγγυημένη συμβατότητα.
- Μην επεκτείνετε τον έλεγχο σε paused financial/accounting backlog. Αναφέρετε χωριστά τυχόν προϋπάρχον σφάλμα, μην το χαρακτηρίσετε νέο regression χωρίς απόδειξη.
