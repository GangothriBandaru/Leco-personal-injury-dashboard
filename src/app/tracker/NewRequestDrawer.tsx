import { useEffect, useState } from "react";
import { X, Plus, Check, ArrowRight, Send, Clock } from "lucide-react";
import { type CaseCtx, TAX, METHODS, CHANNELS, OWNERS, APPROVAL_THRESHOLD, taxOf, dateRanges, addDays, today, fmtDate, iso, money } from "./trackerData";
import { createRequest } from "./trackerStore";
import { CatIcon, Avatar, NotConnected } from "./TrackerShared";

interface Form {
  cat: string; type: string; othertype: string; to: string; docs: string[]; other: string;
  range: string; method: string; channel: string; owner: string; cost: string; auto: boolean;
  priority: "High" | "Medium" | "Low"; notes: string;
  recipientType: string; contactName: string; email: string; phone: string;
  authRequired: boolean; instructions: string; requestDate: string; due: string;
}

const RECIPIENT_TYPES = ["Medical provider", "Hospital", "Our client", "Defendant", "Insurer", "Employer", "Government agency", "Court", "Expert", "Other"];

const input = "w-full bg-white border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`;
const tileCls = (on: boolean) => `rounded-xl border bg-white transition-colors ${on ? "border-brand ring-2 ring-tint" : "border-line hover:border-[#CBD7DE]"}`;

/** Recipients suggested from the case record itself. */
function suggestions(ctx: CaseCtx) {
  const out: { label: string; name: string; set: Partial<Form> }[] = [];
  if (ctx.plaintiff) out.push({ label: `${ctx.plaintiff} (our client)`, name: ctx.plaintiff, set: { recipientType: "Our client", cat: "Client documents", type: "Client records", docs: ["Medical records"], method: "Client request", channel: "Email" } });
  for (const p of ctx.providers ?? []) out.push({ label: `${p} (treating provider)`, name: p, set: { recipientType: "Medical provider", cat: "Medical records", type: "Hospital and ER", docs: ["Complete medical chart", "Itemized billing ledger"], method: "Authorization", channel: "Fax" } });
  if (ctx.defendant) out.push({ label: `${ctx.defendant} (defendant)`, name: ctx.defendant, set: { recipientType: "Defendant", cat: "Defendant discovery", type: "Document production", docs: ["Facility policies and protocols", "Staffing records"], method: "Discovery request", channel: "Email" } });
  if (ctx.insurer) out.push({ label: `${ctx.insurer} (insurer)`, name: ctx.insurer, set: { recipientType: "Insurer", cat: "Insurance & prior claims", type: "Claims database", docs: ["Insurance policy", "Declarations page"], method: "Request to adjuster", channel: "Email" } });
  if (ctx.jurisdiction) out.push({ label: `Clerk of court, ${ctx.jurisdiction}`, name: `Clerk of court, ${ctx.jurisdiction}`, set: { recipientType: "Court", cat: "Court communications", type: "Court records", docs: ["Docket and pleadings"], method: "Vendor order", channel: "Email" } });
  return out;
}

export function NewRequestDrawer({ ctx, onClose, onCreated }: { ctx: CaseCtx; onClose: () => void; onCreated: (id: string, msg: string) => void }) {
  const ranges = dateRanges(ctx);
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [f, setF] = useState<Form>({
    cat: TAX[0][0], type: "", othertype: "", to: "", docs: TAX[0][2].slice(0, 2), other: "",
    range: ranges[0], method: "Subpoena", channel: CHANNELS[0], owner: OWNERS[0].n, cost: "0", auto: true,
    priority: "Medium", notes: "",
    recipientType: "", contactName: "", email: "", phone: "", authRequired: false, instructions: "",
    requestDate: iso(today()), due: "",
  });
  const set = (p: Partial<Form>) => { setErr(""); setF((x) => ({ ...x, ...p })); };
  const tax = taxOf(f.cat);
  const type = f.type || tax[1][0];
  // The due date follows the method from the request date until the user sets one.
  const defaultDue = iso(addDays(f.requestDate ? new Date(f.requestDate) : today(), METHODS[f.method] ?? 14));
  const dueIso = f.due || defaultDue;
  const due = fmtDate(dueIso);
  const emailBad = !!f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
  const needsApproval = (+f.cost || 0) > APPROVAL_THRESHOLD;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const next = () => {
    if (step === 1 && !f.to.trim()) return setErr("Add who you're requesting from.");
    if (step === 1 && emailBad) return setErr("Enter a valid email address.");
    if (step === 1 && type === "Other" && !f.othertype.trim()) return setErr("Describe the request type.");
    if (step === 2 && !f.docs.length && !f.other.trim()) return setErr("Pick at least one document or describe the records.");
    setStep(step + 1);
  };
  const submit = (mode: "draft" | "send") => {
    if (!f.to.trim()) { setStep(1); return setErr("Add who you're requesting from."); }
    if (emailBad) { setStep(1); return setErr("Enter a valid email address."); }
    if (mode === "send" && !f.docs.length && !f.other.trim()) { setStep(2); return setErr("Pick at least one document or describe the records."); }
    if (mode === "send" && (!f.requestDate || !dueIso)) return setErr("Set the request and due dates.");
    if (dueIso < f.requestDate) return setErr("The due date can't be before the request date.");
    const id = createRequest(ctx, {
      cat: f.cat, type: type === "Other" ? f.othertype.trim() || "Other" : type, to: f.to.trim(),
      docs: [...f.docs, ...(f.other.trim() ? [f.other.trim()] : [])], range: f.range.trim() || ranges[0],
      method: f.method, channel: f.channel, owner: f.owner, cost: Math.max(0, +f.cost || 0), auto: f.auto,
      priority: f.priority, notes: f.notes.trim() || undefined,
      recipientType: f.recipientType || undefined, contactName: f.contactName.trim() || undefined, contact: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined, authRequired: f.authRequired, instructions: f.instructions.trim() || undefined,
      requestDate: mode === "send" ? f.requestDate : undefined, due: dueIso,
    }, mode);
    onCreated(id, mode === "draft" ? "Draft saved" : needsApproval ? "Approval request recorded" : "Request created and recorded as sent. Email isn't connected, so send the letter yourself.");
  };

  const sug = suggestions(ctx);
  let body: React.ReactNode;
  if (step === 1) body = (
    <>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">What kind of records?</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TAX.map(([cat, , docs]) => (
            <button key={cat} type="button" aria-pressed={cat === f.cat} onClick={() => set({ cat, type: "", docs: docs.slice(0, 2) })} className={`${tileCls(cat === f.cat)} flex flex-col items-center gap-2 px-2 py-3 text-xs font-semibold text-ink text-center`}>
              <CatIcon cat={cat} size={32} />{cat}
            </button>
          ))}
        </div>
        <span className="block text-xs text-[#5B6B78]">Type within {f.cat}</span>
        <div className="flex flex-wrap gap-1.5">
          {[...tax[1], ...(tax[1].includes("Other") ? [] : ["Other"])].map((y) => (
            <button key={y} type="button" aria-pressed={type === y} onClick={() => set({ type: y })} className={chip(type === y)}>{y}</button>
          ))}
        </div>
        {type === "Other" && <input className={input} value={f.othertype} onChange={(e) => set({ othertype: e.target.value })} placeholder="Describe the type, for example: School records" aria-label="Request type" />}
      </section>
      <section className="space-y-2.5">
        <label htmlFor="nr-to" className="text-sm font-semibold text-ink">Who are you requesting from?</label>
        <input id="nr-to" autoFocus className={`${input} text-[15px]`} value={f.to} onChange={(e) => set({ to: e.target.value })} placeholder="Provider, agency, employer, or party" autoComplete="off" />
        {sug.length > 0 && (
          <>
            <span className="block text-xs text-[#5B6B78]">Suggested from this case</span>
            <div className="flex flex-wrap gap-1.5">
              {sug.map((g) => (
                <button key={g.label} type="button" onClick={() => set({ to: g.name, ...g.set })} className={chip(f.to === g.name)}><Plus className="w-3 h-3" />{g.label}</button>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="eyebrow block mb-1">Recipient type</span>
          <select className={input} value={f.recipientType} onChange={(e) => set({ recipientType: e.target.value })}>
            <option value="">Choose…</option>{RECIPIENT_TYPES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block"><span className="eyebrow block mb-1">Contact person</span><input className={input} value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="Optional" /></label>
        <label className="block"><span className="eyebrow block mb-1">Email</span><input className={input} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" /></label>
        <label className="block"><span className="eyebrow block mb-1">Phone</span><input className={input} type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Optional" /></label>
      </section>
    </>
  );
  if (step === 2) body = (
    <>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">Which documents?</span>
        <div className="flex flex-wrap gap-1.5">
          {tax[2].map((d) => {
            const on = f.docs.includes(d);
            return <button key={d} type="button" aria-pressed={on} onClick={() => set({ docs: on ? f.docs.filter((x) => x !== d) : [...f.docs, d] })} className={chip(on)}>{on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{d}</button>;
          })}
        </div>
        <label htmlFor="nr-other" className="block text-xs text-[#5B6B78]">Anything else</label>
        <input id="nr-other" className={input} value={f.other} onChange={(e) => set({ other: e.target.value })} placeholder="Optional: describe other records" />
      </section>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">Time period</span>
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((x) => <button key={x} type="button" aria-pressed={f.range === x} onClick={() => set({ range: x })} className={chip(f.range === x)}>{x}</button>)}
        </div>
        <input className={input} value={f.range} onChange={(e) => set({ range: e.target.value })} aria-label="Custom date range" />
      </section>
      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={f.authRequired} onChange={(e) => set({ authRequired: e.target.checked })} className="w-4 h-4 accent-[#3FB5D7]" />
        A signed authorization is required
      </label>
      <label className="block space-y-2.5"><span className="text-sm font-semibold text-ink">Additional instructions</span>
        <textarea className={`${input} min-h-[64px]`} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="For the recipient; included in the letter" />
      </label>
      <label className="block space-y-2.5"><span className="text-sm font-semibold text-ink">Internal note</span>
        <textarea className={`${input} min-h-[56px]`} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="For the team only; not part of the letter" />
      </label>
    </>
  );
  if (step === 3) body = (
    <>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">How will you request it?</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.keys(METHODS).map((m) => (
            <button key={m} type="button" aria-pressed={m === f.method} onClick={() => set({ method: m })} className={`${tileCls(m === f.method)} text-left px-3 py-2.5`}>
              <b className="block text-sm font-semibold text-ink">{m}</b><span className="text-xs text-[#5B6B78]">Response in {METHODS[m]} days</span>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">Send by</span>
        <div className="flex flex-wrap gap-1.5">{CHANNELS.map((x) => <button key={x} type="button" aria-pressed={x === f.channel} onClick={() => set({ channel: x })} className={chip(x === f.channel)}>{x}</button>)}</div>
      </section>
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <span className="text-sm font-semibold text-ink">Owner</span>
          <div className="flex flex-wrap gap-1.5">{OWNERS.map((o) => <button key={o.n} type="button" aria-pressed={o.n === f.owner} onClick={() => set({ owner: o.n })} className={chip(o.n === f.owner)}><Avatar name={o.n} />{o.n}</button>)}</div>
        </div>
        <label className="space-y-2.5 block"><span className="text-sm font-semibold text-ink">Estimated cost ($)</span>
          <input className={input} type="number" min={0} value={f.cost} onChange={(e) => set({ cost: e.target.value })} />
        </label>
      </section>
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <span className="text-sm font-semibold text-ink">Priority</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priority">{(["High", "Medium", "Low"] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={x === f.priority} aria-pressed={x === f.priority} onClick={() => set({ priority: x })} className={chip(x === f.priority)}>{x}</button>)}</div>
        </div>
      </section>
      <section className="grid sm:grid-cols-2 gap-4">
        <label className="space-y-2.5 block"><span className="text-sm font-semibold text-ink">Request date</span>
          <input className={input} type="date" value={f.requestDate} onChange={(e) => set({ requestDate: e.target.value })} />
        </label>
        <label className="space-y-2.5 block"><span className="text-sm font-semibold text-ink">Due date</span>
          <input className={input} type="date" value={dueIso} min={f.requestDate || undefined} onChange={(e) => set({ due: e.target.value })} />
        </label>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-wash border border-line rounded-xl px-3.5 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink"><Clock className="w-4 h-4 text-deep" />Response due <b>{due}</b></span>
        <label className="inline-flex items-center gap-2 cursor-pointer text-ink">
          Automatic reminders
          <input type="checkbox" role="switch" checked={f.auto} onChange={(e) => set({ auto: e.target.checked })} className="w-4 h-4 accent-[#3FB5D7]" />
        </label>
      </div>
      {needsApproval && (
        <div className="rounded-xl px-3.5 py-3 text-sm bg-[#FFF7ED] border border-[#FDE6C8] text-[#854F0B]">
          <b className="block">Needs attorney approval</b>Over {money(APPROVAL_THRESHOLD)}, so the supervising attorney must approve before the request goes out. An approval request is recorded instead.
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-deep">Preview the request letter</summary>
        <pre className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed bg-offwhite border border-line rounded-xl p-3.5 text-ink font-sans">
{`To: ${f.to || "[recipient]"}${f.contactName ? `, attn. ${f.contactName}` : ""}\nRe: ${ctx.caseName}${ctx.caseId ? ` · ${ctx.caseId}` : ""}\n\nPlease produce, for ${f.range}:\n${[...f.docs, ...(f.other ? [f.other] : [])].map((d) => "• " + d).join("\n") || "• [documents]"}\n${f.authRequired ? "\nA signed authorization is enclosed.\n" : ""}${f.instructions ? `\n${f.instructions}\n` : ""}\nPlease respond by ${due}.\n${f.owner} · LexGuard Injury Intel`}
        </pre>
      </details>
      <NotConnected />
    </>
  );

  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="nr-title" className="fixed top-0 right-0 bottom-0 z-[70] w-full max-w-[560px] bg-white shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <div className="eyebrow text-deep">Step {step} of 3 · {["Recipient", "Documents", "Delivery"][step - 1]}</div>
            <h2 id="nr-title" className="section-header mt-0.5">New document request</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-tint"><X className="w-5 h-5 text-[#5B6B78]" /></button>
        </div>
        <div className="h-[3px] bg-track mx-6 rounded-full overflow-hidden"><span className="block h-full bg-brand transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {body}
          {err && <p role="alert" className="text-sm text-[#B91C1C]">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-line">
          {step > 1
            ? <button type="button" onClick={() => { setErr(""); setStep(step - 1); }} className="h-9 px-4 rounded-lg border border-line text-sm font-semibold text-ink hover:bg-wash">Back</button>
            : <button type="button" onClick={() => submit("draft")} className="h-9 px-4 rounded-lg border border-line text-sm font-semibold text-ink hover:bg-wash">Save as draft</button>}
          {step < 3
            ? <button type="button" onClick={next} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold">Continue <ArrowRight className="w-4 h-4" /></button>
            : <span className="flex items-center gap-2">
                <button type="button" onClick={() => submit("draft")} className="h-9 px-4 rounded-lg border border-line text-sm font-semibold text-ink hover:bg-wash">Save as draft</button>
                <button type="button" onClick={() => submit("send")} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold"><Send className="w-4 h-4" />{needsApproval ? "Request approval" : "Create request"}</button>
              </span>}
        </div>
      </aside>
    </>
  );
}
