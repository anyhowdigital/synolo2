"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="synolo-password-wrap"><Input {...props} type={visible ? "text" : "password"} /><button type="button" className="synolo-password-toggle" aria-label={visible ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"} aria-pressed={visible} aria-controls={props.id} data-testid={`${props.id}-visibility-button`} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</button></div>;
}
