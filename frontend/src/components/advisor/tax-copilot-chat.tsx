"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MD_CLASS =
  "space-y-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_table]:my-1 [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_strong]:font-semibold";

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className={MD_CLASS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

const STARTERS = [
  "Πόσο θα γλιτώσω αν γίνω ΙΚΕ φέτος;",
  "Ποιες ευκαιρίες εξοικονόμησης έχω τώρα;",
  "Τι ισχύει για μένα ως νέο επαγγελματία;",
];

type Msg = { role: "user" | "assistant"; content: string };

export function TaxCopilotChat({ context }: { context: Record<string, unknown> }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<string>(`tax-${Math.random().toString(36).slice(2)}`);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/copilot/tax-advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionRef.current, question, context }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.ok ? data.answer : data.detail || "Σφάλμα επικοινωνίας με τον Σύμβουλο." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Δεν ήταν δυνατή η σύνδεση με τον Σύμβουλο." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="tax-copilot-chat">
      <div className="max-h-[360px] space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Ρωτήστε τον Σύμβουλο για νόμιμη εξοικονόμηση — με βάση τα δικά σας δεδομένα.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted" data-testid="tax-copilot-starter">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""} data-testid={`tax-copilot-msg-${m.role}`}>
              <div className={`inline-block max-w-[92%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "whitespace-pre-line bg-primary text-primary-foreground" : "border bg-muted/40 text-left"}`}>
                {m.role === "assistant" ? <MarkdownMessage content={m.content} /> : m.content}
              </div>
            </div>
          ))
        )}
        {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Ο Σύμβουλος σκέφτεται…</div> : null}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="flex items-center gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ρωτήστε τον Σύμβουλο…" disabled={loading} data-testid="tax-copilot-input" />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} data-testid="tax-copilot-send">
          <Send className="size-4" />
        </Button>
      </form>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="size-3" /> Ενδεικτικές προτάσεις — επιβεβαιώστε με τον λογιστή σας.</p>
    </div>
  );
}
