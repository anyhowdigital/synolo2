"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { normalizeTags, tagHue } from "@/lib/services/custom-fields";
import { cn } from "@/lib/utils";

export function TagChip({ tag, onRemove, className }: { tag: string; onRemove?: () => void; className?: string }) {
  const hue = tagHue(tag);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border-transparent font-normal", className)}
      style={{ backgroundColor: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 45% 28%)` }}
    >
      {tag}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="-mr-1 rounded-full p-0.5 hover:bg-black/10" aria-label={`Αφαίρεση ετικέτας ${tag}`}>
          <X className="size-3" />
        </button>
      ) : null}
    </Badge>
  );
}

export function TagList({ tags, className, max = 4 }: { tags: string[]; className?: string; max?: number }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {shown.map((t) => (
        <TagChip key={t} tag={t} className="px-1.5 py-0 text-[11px]" />
      ))}
      {tags.length > max ? <span className="text-xs text-muted-foreground">+{tags.length - max}</span> : null}
    </span>
  );
}

/**
 * Πεδίο ετικετών: chips + πληκτρολόγηση (Enter/κόμμα προσθέτει). Αν δοθεί `name`, γράφει την τιμή
 * σε hidden input ως JSON array για υποβολή με FormData. Διαφορετικά χρησιμοποιήστε `onChange`.
 */
export function TagInput({
  name,
  value,
  defaultValue = [],
  onChange,
  suggestions = [],
  placeholder = "Προσθήκη ετικέτας…",
  id,
}: {
  name?: string;
  value?: string[];
  defaultValue?: string[];
  onChange?: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
}) {
  const [internal, setInternal] = useState<string[]>(defaultValue);
  const tags = value ?? internal;
  const [draft, setDraft] = useState("");
  const set = (next: string[]) => {
    const clean = normalizeTags(next);
    if (value === undefined) setInternal(clean);
    onChange?.(clean);
  };
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    set([...tags, t]);
    setDraft("");
  };
  const available = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()) && (!draft || s.toLowerCase().includes(draft.toLowerCase()))).slice(0, 8);

  return (
    <div className="grid gap-1.5">
      {name ? <input type="hidden" name={name} value={JSON.stringify(tags)} /> : null}
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-transparent px-2 py-1">
        {tags.map((t) => (
          <TagChip key={t} tag={t} onRemove={() => set(tags.filter((x) => x !== t))} />
        ))}
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              set(tags.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={tags.length ? "" : placeholder}
          className="h-7 min-w-[8rem] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>
      {available.length ? (
        <div className="flex flex-wrap gap-1">
          {available.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
