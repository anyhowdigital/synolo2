export const OPP_STAGES = [
  { id: "lead", label: "Επαφή", color: "bg-slate-100 dark:bg-slate-900/60" },
  { id: "qualified", label: "Ενδιαφέρον", color: "bg-blue-100 dark:bg-blue-950/60" },
  { id: "quote", label: "Προσφορά", color: "bg-amber-100 dark:bg-amber-950/60" },
  { id: "negotiation", label: "Διαπραγμάτευση", color: "bg-purple-100 dark:bg-purple-950/60" },
  { id: "won", label: "Κέρδισα", color: "bg-emerald-100 dark:bg-emerald-950/60" },
  { id: "lost", label: "Χάθηκε", color: "bg-red-100 dark:bg-red-950/60" },
] as const;

export type OppStageId = typeof OPP_STAGES[number]["id"];
