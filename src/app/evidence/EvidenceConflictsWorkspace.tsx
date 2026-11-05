import { Fragment, useMemo, useState, type ReactNode } from "react";
import { GitCompareArrows, Search, FileText, ArrowRight, RotateCcw, CheckSquare, Square, Quote, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { type CaseConflicts, type Conflict, type Side, type Source, type Statement, type Note, type Severity, type Effect, TOPICS, SEVERITIES, EFFECTS, SOURCE_GROUPS } from "./conflictData";
import { useConflictDecisions, recordConflictDecision, toggleConflictStep, when, type ConflictDecision } from "./conflictDecisions";
import { OWNERS } from "../tracker/trackerData";

// ── Evidence Conflicts ──────────────────────────────────────────────────────
// Header and metrics; Conflict Review (filters, a selectable list, and the
// selected conflict's full review) or the Fact × Source Matrix; and, beneath
// both, the Evidence & Source Library of the same sources the conflicts quote.

const DECISIONS = [
  "Use to impeach at deposition or trial",
  "Use in motion or mediation statement",
  "Investigate further",
  "Address with client (privileged)",
  "Disclose risk to carrier",
  "Not material",
];
/** Choices that need someone to follow up. */
const NEEDS_OWNER = ["Investigate further", "Address with client (privileged)"];

const SEVERITY_PILL: Record<Severity, string> = { Critical: "pill-risk", Major: "pill-progress", Minor: "pill-neutral" };
const EFFECT_PILL: Record<Effect, string> = { "Hurts our client": "pill-risk", "Helps our client": "pill-complete", Mixed: "pill-neutral" };
const SIDE: Record<Side, { title: string; accent: string; cell: string; legend: string }> = {
  plaintiff: { title: "Plaintiff's Version", accent: "border-t-[#F2B46B]", cell: "bg-[#FFF4E5] border-[#F6D9A8]", legend: "Plaintiff's side" },
  defendant: { title: "Defense Version", accent: "border-t-[#4FB97A]", cell: "bg-[#E9F8EF] border-[#BFE6CD]", legend: "Defendant's records" },
  record: { title: "Independent Records", accent: "border-t-[#8A98A3]", cell: "bg-[#F1F5F7] border-line", legend: "Independent records" },
};
const input = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const select = "w-full h-9 bg-white border border-line rounded-lg px-2.5 text-sm text-ink focus:outline-none focus:border-brand";
const Badge = ({ cls, children }: { cls: string; children: ReactNode }) => <span className={`pill ${cls} whitespace-nowrap`}>{children}</span>;
const sourceCount = (c: Conflict) => new Set(c.statements.map((s) => s.sourceId)).size;

function Metric({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="lg-card px-4 py-3 min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="text-[24px] font-semibold text-ink leading-8 tabular-nums">{value}</div>
      <div className="text-xs text-[#5B6B78] truncate" title={sub}>{sub}</div>
    </div>
  );
}

function Empty({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <Icon className="w-7 h-7 text-[#9BDAEC] mx-auto mb-2" strokeWidth={1.5} />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <p className="text-sm text-[#5B6B78] mt-1 max-w-md mx-auto">{children}</p>}
    </div>
  );
}

export function EvidenceConflictsWorkspace({ caseId, data }: { caseId: string; data: CaseConflicts }) {
  const dec = useConflictDecisions(caseId);
  const { conflicts, sources } = data;
  const [tab, setTab] = useState<"review" | "matrix">("review");
  const ALL = { topic: "All", severity: "All", effect: "All", status: "All" };
  const [f, setF] = useState(ALL);
  const [selId, setSelId] = useState<string | undefined>();

  const decided = (c: Conflict) => !!dec.items[c.id];
  const list = useMemo(() => conflicts.filter((c) =>
    (f.topic === "All" || c.topic === f.topic) && (f.severity === "All" || c.severity === f.severity) &&
    (f.effect === "All" || c.effect === f.effect) && (f.status === "All" || (f.status === "Decided") === !!dec.items[c.id])), [conflicts, f, dec]);
  const current = list.find((c) => c.id === selId) ?? list[0];
  const statementCount = new Set(conflicts.flatMap((c) => c.statements.map((s) => s.sourceId + s.text))).size;
  const decidedN = conflicts.filter(decided).length;
  const sevCount = (s: Severity) => conflicts.filter((c) => c.severity === s).length;
  const filtered = Object.values(f).some((v) => v !== "All");
  const open = (id: string) => {
    setSelId(id); setF(ALL); setTab("review");
    window.setTimeout(() => document.getElementById("conflict-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1" style={{ fontSize: "24px" }}>Evidence Conflicts</h1>
        <p className="secondary-text max-w-3xl">Factual statements in the case file are compared fact by fact. Each conflict shows the exact source text on each side, for attorney review.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Metric label="Conflicts found" value={conflicts.length} sub={`${sevCount("Critical")} critical · ${sevCount("Major")} major · ${sevCount("Minor")} minor`} />
        <Metric label="Hurts our client" value={conflicts.filter((c) => c.effect === "Hurts our client").length} sub="Our client's account contradicted" />
        <Metric label="Plaintiff self-contradictions" value={conflicts.filter((c) => c.selfContradiction).length} sub="Within the plaintiff's own statements" />
        <Metric label="Sources compared" value={sources.length} sub={`${statementCount} statements in conflicts`} />
        <Metric label="Decided" value={decidedN} sub={`${conflicts.length - decidedN} still open`} />
      </div>

      <div role="tablist" aria-label="Evidence conflicts views" className="lg-card p-1.5 flex items-center gap-1.5 overflow-x-auto">
        {([["review", "Conflict Review", conflicts.length], ["matrix", "Fact × Source Matrix", undefined]] as const).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex-1 min-w-max px-4 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${tab === k ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"}`}>
            {l}{n !== undefined && <span className={`text-[11px] rounded-full px-1.5 tabular-nums ${tab === k ? "bg-white/25" : "bg-tint"}`}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === "review" && (
        <div className="space-y-4">
          <div role="group" aria-label="Filter conflicts" className="lg-card px-4 py-3 flex flex-wrap items-end gap-x-4 gap-y-3">
            {([["topic", "Topic", TOPICS], ["severity", "Severity", SEVERITIES], ["effect", "Effect on case", EFFECTS], ["status", "Status", ["Open", "Decided"]]] as [keyof typeof f, string, readonly string[]][]).map(([k, l, opts]) => (
              <label key={k} className="block min-w-[150px] flex-1 sm:flex-none sm:w-44"><span className="eyebrow block mb-1">{l}</span>
                <select className={select} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{["All", ...opts].map((o) => <option key={o}>{o}</option>)}</select>
              </label>
            ))}
            {filtered && <button type="button" onClick={() => setF(ALL)} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink pb-2.5"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>}
            <span className="ml-auto text-sm text-[#5B6B78] pb-2 whitespace-nowrap" aria-live="polite">{list.length} of {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(270px,340px)_minmax(0,1fr)] gap-5 items-start">
            <section aria-label="Conflicts" className="min-w-0 lg:sticky lg:top-[150px]">
              <ul className="space-y-2 lg:max-h-[calc(100vh-180px)] overflow-y-auto p-0.5">
                {list.length ? list.map((c) => {
                  const on = current?.id === c.id;
                  const n = sourceCount(c);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => setSelId(c.id)} aria-pressed={on} className={`w-full text-left rounded-xl border bg-white px-4 py-3 transition-colors ${on ? "border-brand ring-2 ring-tint" : "border-line hover:border-[#CBD7DE]"}`}>
                        <span className="flex items-center gap-2 text-xs text-[#5B6B78]"><span className="mono-ref text-deep">{c.id}</span>{c.topic}<span className="ml-auto">{n} source{n === 1 ? "" : "s"}</span></span>
                        <span className="block text-sm font-semibold text-ink mt-1 leading-snug">{c.title}</span>
                        <span className="flex flex-wrap gap-1.5 mt-2">
                          <Badge cls={SEVERITY_PILL[c.severity]}>{c.severity}</Badge>
                          <Badge cls={EFFECT_PILL[c.effect]}>{c.effect}</Badge>
                          <Badge cls={decided(c) ? "pill-complete" : "pill-neutral"}>{decided(c) ? "Decided" : "Open"}</Badge>
                        </span>
                      </button>
                    </li>
                  );
                }) : (
                  <li className="lg-card"><Empty icon={Search} title={conflicts.length ? "No conflicts match these filters" : "No conflicts found"}>{conflicts.length ? "Change or reset a filter." : "Nothing in this case's record or documents on file contradicts anything else."}</Empty></li>
                )}
              </ul>
            </section>

            {current
              ? <ConflictDetail key={current.id} caseId={caseId} c={current} sources={sources} decision={dec.items[current.id]} steps={dec.steps} />
              : <div className="lg-card"><Empty icon={GitCompareArrows} title="Select a conflict">Its sources, context and decision appear here.</Empty></div>}
          </div>
        </div>
      )}

      {tab === "matrix" && <Matrix data={data} onOpen={open} />}
      {/* The sources behind both views, below them rather than as a third tab. */}
      <SourceLibrary data={data} onOpen={open} />
    </div>
  );
}

/** A quoted statement and where it came from. */
function StatementCard({ s, src }: { s: Statement; src?: Source }) {
  const meta = [s.at, src?.date, src?.submittedBy && `submitted by ${src.submittedBy}`].filter(Boolean).join(" · ");
  return (
    <div className="rounded-lg border border-line bg-white px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-[#5B6B78] mb-1.5 flex-wrap">
        <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
        <span className="font-semibold text-ink">{src?.type ?? "Source"}</span>
        <span className="mono-ref break-all">{src?.title}</span>
      </div>
      <blockquote className="text-sm text-ink leading-relaxed border-l-2 border-[#9BDAEC] pl-3 break-words">“{s.text}”</blockquote>
      {meta && <div className="text-xs text-[#5B6B78] mt-1.5 break-words">{meta}</div>}
      {src?.citedFiles?.length && !src.file ? <div className="mt-1.5"><Badge cls="pill-neutral">Cited, not on file</Badge></div> : null}
    </div>
  );
}

function Notes({ notes }: { notes: Note[] }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((n, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-ink leading-relaxed">
          {n.basis === "source"
            ? <Quote className="w-3.5 h-3.5 text-deep mt-1 shrink-0" strokeWidth={1.75} aria-label="From the records" />
            : <Sparkles className="w-3.5 h-3.5 text-[#8A98A3] mt-1 shrink-0" strokeWidth={1.75} aria-label="Analysis" />}
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ConflictDetail({ caseId, c, sources, decision, steps }: {
  caseId: string; c: Conflict; sources: Source[]; decision?: ConflictDecision; steps: Record<string, string>;
}) {
  const srcOf = (id: string) => sources.find((s) => s.id === id);
  const bySide = (side: Side) => c.statements.filter((s) => srcOf(s.sourceId)?.side === side);
  // Third-party records sit with the other facts from the records.
  const fromRecords: Note[] = [
    ...bySide("record").map((st) => { const src = srcOf(st.sourceId); return { basis: "source" as const, text: `${src?.title}${src?.date ? ` (${src.date})` : ""}: "${st.text}"` }; }),
    ...c.context.filter((n) => n.basis === "source"),
  ];
  const analysis = c.context.filter((n) => n.basis === "analysis");
  const stepsDone = c.steps.filter((s) => steps[`${c.id}:${s.id}`]).length;
  const n = sourceCount(c);

  return (
    <article id="conflict-detail" className="space-y-4 min-w-0 scroll-mt-[150px]">
      {/* A. Overview */}
      <header className="lg-card px-6 py-5">
        <div className="flex items-center gap-2 text-xs text-[#5B6B78]"><span className="mono-ref text-deep">{c.id}</span>{c.topic}<span className="ml-auto">{n} supporting source{n === 1 ? "" : "s"}</span></div>
        <h2 className="section-header mt-1">{c.title}</h2>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge cls={SEVERITY_PILL[c.severity]}>{c.severity}</Badge>
          <Badge cls={EFFECT_PILL[c.effect]}>{c.effect}</Badge>
        </div>
        <p className="text-sm text-ink mt-3 leading-relaxed">{c.summary}</p>
        {c.effect === "Hurts our client" && (
          <p className="mt-3 rounded-lg border border-[#FBD5D5] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-ink"><b className="text-[#B42318]">This conflict hurts our client.</b> Our client's account is contradicted by other evidence.</p>
        )}
      </header>

      {/* B. Plaintiff's and Defense versions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(["plaintiff", "defendant"] as const).map((side) => {
          const st = bySide(side);
          return (
            <section key={side} aria-label={SIDE[side].title} className={`lg-card border-t-4 ${SIDE[side].accent} p-4 space-y-2.5 min-w-0`}>
              <h3 className="eyebrow">{SIDE[side].title}</h3>
              {st.length ? st.map((s) => <StatementCard key={s.id} s={s} src={srcOf(s.sourceId)} />)
                : <p className="rounded-lg border border-dashed border-line bg-wash px-3.5 py-3 text-sm text-[#5B6B78]">
                    {side === "defendant" ? "No defendant statement on file." : "No evidence on file for this side."}
                  </p>}
            </section>
          );
        })}
      </div>

      {/* D. Context to weigh */}
      <section aria-labelledby={`ctx-${c.id}`} className="lg-card p-5">
        <h3 id={`ctx-${c.id}`} className="card-title">Context to Weigh</h3>
        <p className="secondary-text mt-0.5 mb-3">Evidence that affects how much weight a source gets</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg bg-wash border border-line p-3.5">
            <div className="eyebrow mb-2">From the records</div>
            {fromRecords.length ? <Notes notes={fromRecords} /> : <p className="text-sm text-[#8A98A3]">No further facts from the records.</p>}
          </div>
          <div className="rounded-lg bg-white border border-dashed border-[#CBD7DE] p-3.5">
            <div className="eyebrow mb-2">Analysis · for attorney review</div>
            {analysis.length ? <Notes notes={analysis} /> : <p className="text-sm text-[#8A98A3]">No analysis recorded.</p>}
          </div>
        </div>
      </section>

      {/* E. Why it matters / next steps */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <section aria-labelledby={`why-${c.id}`} className="lg-card p-5">
          <h3 id={`why-${c.id}`} className="card-title mb-2">Why It Matters</h3>
          <ul className="space-y-1.5">
            {c.why.map((w) => <li key={w} className="flex items-start gap-2 text-sm text-ink leading-relaxed"><Sparkles className="w-3.5 h-3.5 text-[#8A98A3] mt-1 shrink-0" strokeWidth={1.75} />{w}</li>)}
          </ul>
        </section>
        <section aria-labelledby={`steps-${c.id}`} className="lg-card p-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 id={`steps-${c.id}`} className="card-title">Suggested Next Steps</h3>
            <span className="text-xs text-[#5B6B78] tabular-nums">{stepsDone} of {c.steps.length} done</span>
          </div>
          <ul className="space-y-2">
            {c.steps.map((s) => {
              const k = `${c.id}:${s.id}`, done = !!steps[k];
              return (
                <li key={s.id}>
                  <button type="button" role="checkbox" aria-checked={done} onClick={() => { if (!toggleConflictStep(caseId, k)) toast("Saved for this session only. The browser didn't store it."); }}
                    className="flex items-start gap-2 text-sm text-left text-ink hover:text-deep">
                    {done ? <CheckSquare className="w-4 h-4 text-deep mt-0.5 shrink-0" /> : <Square className="w-4 h-4 text-[#8A98A3] mt-0.5 shrink-0" />}
                    <span className={done ? "line-through text-[#5B6B78]" : ""}>{s.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* F. Attorney decision */}
      <DecisionPanel caseId={caseId} conflictId={c.id} current={decision} />
    </article>
  );
}

/** Choose, assign, note, record. Nothing is recorded until Record Decision. */
function DecisionPanel({ caseId, conflictId, current }: { caseId: string; conflictId: string; current?: ConflictDecision }) {
  const [editing, setEditing] = useState(!current);
  const [choice, setChoice] = useState(current?.choice ?? "");
  const [owner, setOwner] = useState(current?.owner ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [tried, setTried] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const errs = { choice: !choice ? "Choose a decision." : undefined, owner: NEEDS_OWNER.includes(choice) && !owner ? "Assign the follow-up." : undefined };
  const id = `dec-${conflictId}`;
  const submit = () => {
    setTried(true);
    if (errs.choice || errs.owner) return;
    const stored = recordConflictDecision(caseId, conflictId, { choice, owner, note });
    toast(stored ? `Decision recorded for ${conflictId}` : `Decision recorded for ${conflictId} for this session only. The browser didn't save it.`);
    setEditing(false); setTried(false);
  };

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-xl border border-[#9BDAEC] bg-[#F6FDFF] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 id={`${id}-t`} className="card-title">Attorney Decision</h3>
        {current ? <Badge cls="pill-complete">Decided</Badge> : <Badge cls="pill-progress">Open</Badge>}
      </div>
      {!editing && current ? (
        <div className="space-y-2 text-sm">
          <p className="text-ink"><b className="font-semibold">{current.choice}</b>{current.owner && <span className="text-[#5B6B78]"> · follow-up: {current.owner}</span>}</p>
          {current.note && <p className="text-ink whitespace-pre-wrap break-words">{current.note}</p>}
          <p className="text-xs text-[#5B6B78]">Recorded by {current.by}, {when(current.at)}</p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button type="button" onClick={() => setHistOpen(!histOpen)} aria-expanded={histOpen} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">
              History ({current.history.length}) <ChevronDown className={`w-3.5 h-3.5 transition-transform ${histOpen ? "rotate-180" : ""}`} />
            </button>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash">Revisit decision</button>
          </div>
          {histOpen && (
            <ol className="space-y-1 text-xs text-[#5B6B78]">
              {[...current.history].reverse().map((h, i) => <li key={i}>{when(h.at)} · <span className="text-ink">{h.choice}</span>{h.owner ? ` · ${h.owner}` : ""} · {h.by}</li>)}
            </ol>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <fieldset>
            <legend className="sr-only">Attorney decision</legend>
            <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2" role="radiogroup" aria-label="Attorney decision">
              {DECISIONS.map((o) => (
                <label key={o} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${choice === o ? "border-brand bg-tint text-deep font-semibold" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`}>
                  <input type="radio" name={id} value={o} checked={choice === o} onChange={() => setChoice(o)} className="accent-[#3FB5D7]" />{o}
                </label>
              ))}
            </div>
            {tried && errs.choice && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{errs.choice}</p>}
          </fieldset>
          <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor={`${id}-owner`} className="eyebrow block mb-1">Assign follow-up to{NEEDS_OWNER.includes(choice) && <span className="text-[#B91C1C]"> *</span>}</label>
              <select id={`${id}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
                <option value="">No follow-up</option>
                {OWNERS.map((o) => <option key={o.n} value={o.n}>{o.n}</option>)}
              </select>
              {tried && errs.owner && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{errs.owner}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-note`} className="eyebrow block mb-1">Attorney note</label>
              <textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reasoning, what to ask, what to watch for" className={input} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {current && <button type="button" onClick={() => { setEditing(false); setChoice(current.choice); setOwner(current.owner ?? ""); setNote(current.note ?? ""); setTried(false); }} className="h-8 px-3 rounded-lg text-sm font-medium text-ink hover:bg-tint">Cancel</button>}
            <button type="button" onClick={submit} className="inline-flex items-center h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold">Record decision</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Matrix({ data, onOpen }: { data: CaseConflicts; onOpen: (id: string) => void }) {
  const [cell, setCell] = useState<{ c: string; g: string } | null>(null);
  const srcOf = (id: string) => data.sources.find((s) => s.id === id);
  if (!data.conflicts.length) return <div className="lg-card"><Empty icon={GitCompareArrows} title="No disputed facts">The matrix fills in when the case's sources disagree about a fact.</Empty></div>;
  const picked = cell && data.conflicts.find((c) => c.id === cell.c);
  const pickedSt = picked ? picked.statements.filter((s) => srcOf(s.sourceId)?.group === cell!.g) : [];
  return (
    <section className="lg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="section-header">What each source says about each disputed fact</h2>
          <p className="secondary-text mt-0.5">Select a cell to read the source text, or a fact to open its conflict.</p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5B6B78]" aria-label="Legend">
          {(Object.keys(SIDE) as Side[]).map((k) => <li key={k} className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded border ${SIDE[k].cell}`} />{SIDE[k].legend}</li>)}
          <li className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-dashed border-line bg-white" />No evidence</li>
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-wash text-left eyebrow px-4 py-2.5 border-b border-line w-[220px]">Disputed fact</th>
              {SOURCE_GROUPS.map((g) => <th key={g} scope="col" className="bg-wash text-left eyebrow px-2 py-2.5 border-b border-line">{g}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.conflicts.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="sticky left-0 z-10 bg-white text-left font-normal px-4 py-2 border-b border-line align-top">
                  <button type="button" onClick={() => onOpen(c.id)} className="text-left group">
                    <span className="mono-ref text-deep mr-1.5">{c.id}</span><span className="text-ink font-medium group-hover:text-deep">{c.fact}</span>
                    <ArrowRight className="inline w-3 h-3 ml-1 text-deep opacity-60" />
                  </button>
                </th>
                {SOURCE_GROUPS.map((g) => {
                  const ss = c.statements.filter((s) => srcOf(s.sourceId)?.group === g);
                  const side = ss.length ? srcOf(ss[0].sourceId)!.side : undefined;
                  const on = cell?.c === c.id && cell.g === g;
                  return (
                    <td key={g} className="px-1.5 py-1.5 border-b border-line align-top">
                      <button type="button" disabled={!ss.length} onClick={() => setCell(on ? null : { c: c.id, g })} aria-pressed={on}
                        className={`w-full min-h-[44px] rounded-md border px-2 py-1.5 text-left text-xs ${side ? SIDE[side].cell : "bg-white border-dashed border-line"} ${on ? "ring-2 ring-brand" : ""} ${ss.length ? "cursor-pointer" : "cursor-default"}`}>
                        {ss.length ? <><span className="block text-ink line-clamp-2">{ss[0].text}</span>{ss.length > 1 && <span className="text-[#5B6B78]">+{ss.length - 1} more</span>}</> : <span className="text-[#8A98A3]">—</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {picked && pickedSt.length > 0 && (
        <div className="px-6 py-4 border-t border-line bg-wash space-y-2.5" aria-live="polite">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="card-title">{picked.id} · {picked.fact} · {cell!.g}</h3>
            <button type="button" onClick={() => onOpen(picked.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">Open conflict <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          <ul className="space-y-1.5">{pickedSt.map((s) => <li key={s.id} className="text-sm text-ink">“{s.text}” <span className="text-xs text-[#5B6B78]">· {srcOf(s.sourceId)?.title}{s.at ? ` · ${s.at}` : ""}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

function SourceLibrary({ data, onOpen }: { data: CaseConflicts; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"title" | "type" | "statements" | "conflicts">("conflicts");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = data.sources.map((s) => {
    const conf = data.conflicts.filter((c) => c.statements.some((x) => x.sourceId === s.id));
    const st = [...new Map(conf.flatMap((c) => c.statements).filter((x) => x.sourceId === s.id).map((x) => [x.text, x])).values()];
    return { s, st, conf };
  }).filter((r) => !q.trim() || `${r.s.title} ${r.s.type} ${r.s.traits.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === "title" ? a.s.title.localeCompare(b.s.title) : sort === "type" ? a.s.type.localeCompare(b.s.type) : sort === "statements" ? b.st.length - a.st.length : b.conf.length - a.conf.length || b.st.length - a.st.length);
  const th = (k: typeof sort, l: string, right = false) => (
    <th scope="col" aria-sort={sort === k ? (k === "title" || k === "type" ? "ascending" : "descending") : undefined} className={`eyebrow px-4 py-2.5 ${right ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => setSort(k)} className={`eyebrow inline-flex items-center gap-1 hover:text-ink ${sort === k ? "!text-deep" : ""}`}>{l}</button>
    </th>
  );
  const toggle = (id: string) => setOpenId(openId === id ? null : id);
  return (
    <section className="lg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-header">Evidence &amp; Source Library</h2>
          <p className="secondary-text mt-0.5">Review the documents and records used to identify and compare factual conflicts in this case. Characteristics describe the kind of source, not its credibility.</p>
        </div>
        <label className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 focus-within:border-brand w-full sm:w-64">
          <Search className="w-4 h-4 text-[#8A98A3]" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sources" aria-label="Search sources" className="flex-1 min-w-0 py-2 text-sm bg-transparent outline-none" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-wash border-b border-line">
            <tr>{th("title", "Source")}{th("type", "Type")}<th scope="col" className="eyebrow px-4 py-2.5 text-left">Date</th><th scope="col" className="eyebrow px-4 py-2.5 text-left">Characteristics</th>{th("statements", "Statements", true)}{th("conflicts", "In conflicts", true)}<th className="w-10"><span className="sr-only">Details</span></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length ? rows.map((r) => (
              <Fragment key={r.s.id}>
                <tr className="hover:bg-wash cursor-pointer" onClick={() => toggle(r.s.id)}>
                  <td className="px-4 py-2.5"><span className={r.s.file ? "mono-ref text-ink break-all" : "font-semibold text-ink"}>{r.s.title}</span></td>
                  <td className="px-4 py-2.5 text-ink">{r.s.type}</td>
                  <td className="px-4 py-2.5 text-[#5B6B78] whitespace-nowrap">{r.s.date ?? "—"}</td>
                  <td className="px-4 py-2.5"><span className="flex flex-wrap gap-1">{r.s.traits.length ? r.s.traits.map((t) => <Badge key={t} cls="pill-neutral">{t}</Badge>) : <span className="text-[#8A98A3]">—</span>}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.st.length}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.conf.length ? <Badge cls="pill-progress">{r.conf.length}</Badge> : <span className="text-[#8A98A3]">0</span>}</td>
                  <td className="px-2"><button type="button" aria-expanded={openId === r.s.id} aria-label={`Show what ${r.s.title} is cited for`} onClick={(e) => { e.stopPropagation(); toggle(r.s.id); }} className="p-1 rounded hover:bg-tint"><ChevronDown className={`w-4 h-4 text-deep transition-transform ${openId === r.s.id ? "rotate-180" : ""}`} /></button></td>
                </tr>
                {openId === r.s.id && (
                  <tr><td colSpan={7} className="px-4 py-3 bg-wash">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {r.conf.map((c) => <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="pill pill-progress hover:brightness-95">{c.id} · {c.fact}</button>)}
                      </div>
                      <ul className="space-y-1">{r.st.map((x) => <li key={x.id} className="text-sm text-ink">“{x.text}”{x.at && <span className="text-xs text-[#5B6B78]"> · {x.at}</span>}</li>)}</ul>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            )) : <tr><td colSpan={7}><Empty icon={Search} title="No sources match">Change the search.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
