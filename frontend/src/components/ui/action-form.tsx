"use client";

import { startTransition, type ComponentProps, type FormEvent } from "react";

type Props = Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
};

/**
 * Φόρμα για server actions που ΔΕΝ καθαρίζει τα πεδία μετά την υποβολή.
 * Το React 19 επαναφέρει τις μη ελεγχόμενες φόρμες όταν η action καλείται μέσω `<form action>`,
 * οπότε σε αποτυχία επικύρωσης ο χρήστης έχανε ό,τι είχε πληκτρολογήσει.
 * Εδώ η action καλείται χειροκίνητα μέσα σε transition, ώστε οι τιμές να παραμένουν.
 */
export function ActionForm({ action, ...props }: Props) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(form, submitter instanceof HTMLElement ? submitter : undefined);
    startTransition(() => action(formData));
  }
  // method="post" ώστε μια υποβολή πριν την ενυδάτωση (hydration) να μη στείλει ποτέ τα πεδία ως παραμέτρους URL.
  return <form method="post" {...props} onSubmit={onSubmit} />;
}
