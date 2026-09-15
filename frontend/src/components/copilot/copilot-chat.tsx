"use client";

import { useRef, useState } from "react";
import { Send, Sparkles, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

type Message = { role: "user" | "assistant"; content: string };

export function CopilotChat({ context, suggestions }: { context: unknown; suggestions: string[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sessionIdRef = useRef<string>(`copilot-${Date.now()}`);
  const scrollerRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const resp = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionIdRef.current, message: text, context }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.text();
        throw new Error(`Αποτυχία (${resp.status}): ${err.slice(0, 120)}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "delta" && typeof ev.content === "string") {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.role !== "assistant") return prev;
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, content: last.content + ev.content };
                return updated;
              });
              queueMicrotask(() => {
                scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
              });
            } else if (ev.type === "error") {
              throw new Error(ev.message || "Σφάλμα από τον server");
            }
          } catch {
            // ignore malformed frames
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          updated[updated.length - 1] = { ...last, content: `⚠️ ${msg}` };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="flex h-[calc(100vh-260px)] min-h-[500px] flex-col overflow-hidden">
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4" data-testid="copilot-messages">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-lg text-center">
              <Sparkles className="mx-auto mb-3 size-8 text-primary" />
              <h3 className="text-lg font-semibold">Γεια σου! Είμαι το Copilot Λογιστηρίου.</h3>
              <p className="mt-2 text-sm text-muted-foreground">Ρωτήστε μας για τα ανοιχτά τιμολόγια, τη ρευστότητα, την ενηλικίωση των απαιτήσεων ή για θέματα συμμόρφωσης με myDATA και ΕΛΠ.</p>
              <p className="mt-3 text-xs text-muted-foreground">Υποστηρίζεται από <strong>Claude (Anthropic)</strong></p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.role === "user" ? <User className="size-4" /> : <Sparkles className="size-4" />}
                  </div>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`} data-testid={`msg-${m.role}-${i}`}>
                    {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="size-4 animate-spin" /> : null)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t bg-card p-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ρώτησε με σχετικά με τα οικονομικά…"
              className="min-h-[44px] max-h-32 flex-1 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              disabled={streaming}
              data-testid="copilot-input"
            />
            <Button type="submit" disabled={streaming || !input.trim()} data-testid="copilot-send-btn">
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <Card className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Δοκιμάστε</h3>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void send(s)}
                disabled={streaming}
                className="rounded-lg border bg-card p-3 text-left text-sm transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                data-testid={`suggestion-${i}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-4 text-xs text-muted-foreground">
          <h3 className="mb-1 font-semibold text-foreground">Τι βλέπει το Copilot</h3>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Ανοιχτά τιμολόγια & ποσά</li>
            <li>Aging απαιτήσεων ανά διάστημα</li>
            <li>Υπόλοιπο ταμείου/τραπεζών</li>
            <li>Top 5 οφειλέτες</li>
            <li>Προμηθευτές & πληρωτέα</li>
          </ul>
          <p className="mt-2">Δεν αποθηκεύεται καμία απάντηση.</p>
        </Card>
      </div>
    </div>
  );
}
