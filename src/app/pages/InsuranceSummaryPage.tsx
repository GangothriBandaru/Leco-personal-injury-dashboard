import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Shield, FileText, Upload, Search, CheckCircle, AlertCircle, XCircle, ChevronDown, ChevronUp, ArrowRight, SlidersHorizontal, Download, Trash2, Plus, Loader2, X, Info, ArrowDown, Circle,
  CalendarClock, Users, Landmark, ShieldCheck, ShieldAlert, FileSearch, Scale, Flag, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { CaseDocument } from "../types/case";
import { InsuranceBreadcrumb, AttorneyDisclaimer } from "../insurance/InsuranceShared";
import {
  buildCaseInsurance, buildSampleInsurance, useInsuranceInput, setIssueStatus, addPolicy, removePolicy, addDependent, removeDependent,
  fmtMoney, fmtIso, type Policy, type Party, type Issue, type Severity, type IssueStatus, type CoverageStatus, type CoverageReading,
  type Layer, type Dependent, type LienStatus,
} from "../insurance/caseInsurance";
import { defendantsForCase } from "../defendants/defendantData";
import { governingLawSummary, stateOfJurisdiction } from "../jurisdiction/jurisdictionData";
import { rulesForState } from "../liability/liabilityRules";
import { useLiabilityInputs } from "../liability/liabilityStore";
import { useTracker } from "../tracker/trackerStore";
import { putMediaFile, getMediaFile, downloadMediaFile } from "../intake/mediaFileStore";

// ── Insurance Policy Analysis ─────────────────────────────────────────────────
// Header and upload action; a sample-data notice with the data switch; an
// overview of six vertical KPIs beside the defendants, each holding its own
// policy cards; then six detail tabs.
//
// Two data sets, never merged: the case record, and the illustrative example
// (two defendants, three policies) that shows the full layout. Case-level
// content — SOL, Illinois rules, the lien framework — always reads the case.

const TABS = [
  ["policy", "Policy Details"], ["triggers", "Coverage Triggers"], ["jurisdiction", "Jurisdiction"],
  ["liens", "Lien Framework"], ["badfaith", "Bad Faith"], ["flags", "All Flags"],
] as const;
type Tab = (typeof TABS)[number][0];
type View = "sample" | "case";
/** Case issues that hold whichever policy data set is shown. */
const CASE_LEVEL_ISSUES = ["incident-date", "health-coverage"];

const SEV_PILL: Record<Severity, string> = { High: "pill pill-risk", Medium: "pill pill-progress", Low: "pill pill-neutral" };
const SEV_BAR: Record<Severity, string> = { High: "border-l-[#DC2626]", Medium: "border-l-[#D97706]", Low: "border-l-[#CBD7DE]" };
const COV_PILL: Record<CoverageStatus, string> = {
  Applicable: "pill pill-complete", "Potentially Applicable": "pill pill-complete", "Under Review": "pill pill-progress",
  "Not Applicable": "pill pill-neutral", "Missing Information": "pill pill-risk",
};
const LIEN_PILL: Record<LienStatus, string> = { Applies: "pill pill-complete", "Pending verification": "pill pill-progress", "Not applicable": "pill pill-neutral", "To be confirmed": "pill pill-neutral" };
type Cond = "Satisfied" | "Not satisfied" | "Needs verification";
const LAYER_BADGE: Record<Layer, string> = {
  Primary: "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]", Umbrella: "bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]",
  Excess: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]", "Not determined": "bg-wash text-[#5B6B78] border-line",
};
const SEV_ORDER: Severity[] = ["High", "Medium", "Low"];
const input = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const select = "w-full h-9 bg-white border border-line rounded-lg px-2.5 text-sm text-ink focus:outline-none focus:border-brand";
const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnP = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const NOF = <span className="text-[#8A98A3]">Not on file</span>;
/** Relevant but not available. */
const PV = <span className="text-[#B45309]">Pending verification</span>;
/** Marks illustrative sample data: never a case fact. */
const SampleTag = () => <span className="pill pill-progress whitespace-nowrap !py-0 !px-1.5 text-[10.5px]" title="Illustrative sample data — not an Estate of Miller fact">Illustrative</span>;
const LayerBadge = ({ layer }: { layer: Layer }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${LAYER_BADGE[layer]}`}>{layer === "Not determined" ? "Layer pending" : layer}</span>
);

function TabPane({ id, title, sub, right, children }: { id: string; title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={`tab-${id}`} className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="card-title">{title}</h3>
          {sub && <p className="secondary-text mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/**
 * One snapshot metric, as in the Analysis Complete panel: heading and icon, the
 * value, then one short supporting line. Every value uses the same ink colour,
 * so no metric reads as an alarm by colour alone.
 */
function Kpi({ id, icon: Icon, label, value, sub, action, children }: { id?: string; icon: LucideIcon; label: string; value: ReactNode; sub: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div id={id} className="rounded-xl bg-tint border border-[#D6F2F7] px-3.5 py-2.5 min-h-[80px] scroll-mt-[96px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78] leading-tight">{label}</span>
        <Icon className="w-4 h-4 text-brand shrink-0" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="mt-1 text-[17px] font-semibold leading-snug text-ink tabular-nums break-words">{value}</div>
      <div className="mt-0.5 flex items-start justify-between gap-3">
        <p className="text-[11px] text-[#8A98A3] leading-snug line-clamp-2">{sub}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A snapshot card in the KPI style: heading and icon, then its content. */
function SnapCard({ id, icon: Icon, label, lead, open, onToggle, children }: {
  id?: string; icon: LucideIcon; label: string;
  /** Collapsible cards: `lead` always shows, `children` only when open. */
  lead?: ReactNode; open?: boolean; onToggle?: () => void; children?: ReactNode;
}) {
  const heading = <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78] leading-tight">{label}</h3>;
  return (
    <section id={id} aria-label={label} className="rounded-xl bg-tint border border-[#D6F2F7] px-3.5 py-2.5 scroll-mt-[96px]">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!!open} aria-controls={`${id}-body`}
          className="-mx-1.5 -my-1 px-1.5 py-1 w-[calc(100%+12px)] rounded-md flex items-center justify-between gap-3 text-left hover:bg-white/60 transition-colors">
          {heading}
          <span className="flex items-center gap-1 shrink-0">
            <Icon className="w-4 h-4 text-brand" strokeWidth={1.75} aria-hidden />
            {open ? <ChevronUp className="w-4 h-4 text-brand" aria-hidden /> : <ChevronDown className="w-4 h-4 text-brand" aria-hidden />}
          </span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3">
          {heading}
          <Icon className="w-4 h-4 text-brand shrink-0" strokeWidth={1.75} aria-hidden />
        </div>
      )}
      {lead}
      {(!onToggle || open) && (onToggle ? <div id={`${id}-body`}>{children}</div> : children)}
    </section>
  );
}
/** A small label–value line; `wide` gives the label the room (for defendant and layer names). */
const PoolRow = ({ k, wide, children }: { k: string; wide?: boolean; children: ReactNode }) => (
  <div className={`grid ${wide ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[88px_minmax(0,1fr)]"} gap-x-3 text-[11px] leading-snug`}>
    <span className={wide ? "text-ink break-words min-w-0" : "text-[#8A98A3]"}>{k}</span>
    <span className="text-ink min-w-0 break-words text-right">{children}</span>
  </div>
);
/** Individual vs organization, from the party's entity type. */
const entityClass = (kind: string) => (/individual/i.test(kind) ? "Individual" : /not identified/i.test(kind) ? "Not identified" : "Organization");


const period = (p: Policy) => (p.periodStart && p.periodEnd ? `${fmtIso(p.periodStart)} – ${fmtIso(p.periodEnd)}` : undefined);
const limitText = (p: Policy) => (p.perOccurrence ? `${fmtMoney(p.perOccurrence)}${p.aggregate ? ` / ${fmtMoney(p.aggregate)} agg.` : ""}` : undefined);
const compact = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${+(n / 1_000).toFixed(1)}K` : fmtMoney(n));
const LAYER_ORDER: Layer[] = ["Primary", "Excess", "Umbrella", "Not determined"];
const policyTitle = (p: Policy) => p.name ?? (p.type && p.type !== "Not stated" ? p.type : p.layer === "Not determined" ? `${p.insurer} policy` : `${p.layer} policy`);
/** Occurrence or claims-made, only when stated as such. */
const formOf = (p: Policy) => (/^occurrence$/i.test(p.trigger) ? "Occurrence" : /^claims-made$/i.test(p.trigger) ? "Claims-made" : undefined);
const VIEW_KEY = "leco.insurance.view";

export function InsuranceSummaryPage({
  caseName, caseData, documents = [], backLabel = "Back to Analysis", onBack, embedded = false, initialSection,
}: {
  embedded?: boolean;
  caseName: string;
  backLabel?: string;
  /** The case being viewed: its jurisdiction and parties come from it. */
  caseData?: any;
  documents?: CaseDocument[];
  onBack: () => void;
  /** Kept for callers that still pass it; the detail lives on this page. */
  onOpenDetail?: () => void;
  /** Section to open at, e.g. "ins-policy". */
  initialSection?: string;
}) {
  const caseId: string = caseData?.caseId ?? "PI-2024-001";
  const saved = useInsuranceInput(caseId);
  const caseIns = useMemo(() => buildCaseInsurance(caseId, documents, saved), [caseId, documents, saved]);
  const sampleIns = useMemo(() => buildSampleInsurance(caseIns.incident), [caseIns.incident]);
  const defendants = defendantsForCase(caseId);
  const liabilityInputs = useLiabilityInputs(caseId);
  const tracker = useTracker(caseId);
  const jurisdiction: string | undefined = caseData?.jurisdiction;
  const rules = rulesForState(stateOfJurisdiction(jurisdiction));
  const law = governingLawSummary(caseId, jurisdiction);

  // Which policy data set is shown. The demo case opens on the illustrative example.
  const [view, setViewState] = useState<View>(() => {
    try { const v = localStorage.getItem(`${VIEW_KEY}.${caseId}`); if (v === "sample" || v === "case") return v; } catch { /* storage unavailable */ }
    return caseId === "PI-2024-001" ? "sample" : "case";
  });
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(`${VIEW_KEY}.${caseId}`, v); } catch { /* storage unavailable */ } };
  const sample = view === "sample";
  const data = sample ? sampleIns : caseIns;
  const issues: Issue[] = sample ? [...sampleIns.issues, ...caseIns.issues.filter((i) => CASE_LEVEL_ISSUES.includes(i.id))] : caseIns.issues;

  const [tab, setTab] = useState<Tab>("policy");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const issueStatus = (id: string): IssueStatus => saved.issues[id]?.status ?? "Open";
  const openIssues = issues.filter((i) => issueStatus(i.id) !== "Resolved");
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  /** "Details" on a policy opens its card in the Policy Details tab. */
  const showPolicy = (id: string) => { setTab("policy"); setFolded((f) => ({ ...f, [id]: false })); window.setTimeout(() => go(`pol-${id}`), 40); };
  useEffect(() => { if (initialSection) window.setTimeout(() => go(initialSection === "ins-policy" ? "ins-detail" : initialSection), 80); }, [initialSection]);
  useEffect(() => {
    if (!uploadOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setUploadOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [uploadOpen]);

  const partyName = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? "—";
  const coverageOf = (id: string) => data.coverage.find((c) => c.policyId === id)!;
  const policiesOf = (partyId: string) => data.policies.filter((p) => p.partyId === partyId).sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
  const insuredParties = data.parties.filter((party) => data.policies.some((p) => p.partyId === party.id));
  const responds = (p: Policy) => ["Applicable", "Potentially Applicable"].includes(coverageOf(p.id).status);

  // Snapshot figures. The pool sums applicable limits only — never raw policy limits.
  // Each layer's applicable limit is already net of retention and sits above the
  // layer below it, so adding layers counts nothing twice. On the case record a
  // policy counts only when its coverage may respond and its applicable limit is stated.
  const counted = (p: Policy) => !!p.applicable && (sample || (!p.sample && responds(p)));
  const poolParts = data.policies.filter(counted);
  const pool = poolParts.reduce((n, p) => n + p.applicable!.amount, 0);
  const poolEstimate = poolParts.some((p) => p.applicable?.estimate);
  const poolPending = data.policies.length - poolParts.length;
  /** A share of the pool: the counted applicable limits of these policies, with any not yet counted noted. */
  const shareText = (ps: Policy[]) => {
    const c = ps.filter(counted);
    const pend = ps.length - c.length;
    if (!c.length) return <span className="text-[#B45309]">Pending verification</span>;
    return (<>
      <span className="font-semibold tabular-nums">{fmtMoney(c.reduce((n, p) => n + p.applicable!.amount, 0))}{c.some((p) => p.applicable?.estimate) ? " est." : ""}</span>
      {pend > 0 && <span className="block text-[10.5px] text-[#B45309]">+{pend} pending</span>}
    </>);
  };
  const [snapOpen, setSnapOpen] = useState({ defendants: false, jurisdiction: false, pool: false });
  const toggleSnap = (k: keyof typeof snapOpen) => setSnapOpen((s) => ({ ...s, [k]: !s[k] }));
  const entityCounts = (["Individual", "Organization", "Not identified"] as const).map((k) => [k, data.parties.filter((p) => entityClass(p.kind) === k).length] as const);
  const county = jurisdiction?.match(/^\s*([^,]*\bCounty)\b/i)?.[1];
  const state = stateOfJurisdiction(jurisdiction);
  /** "Cook County, Illinois" from the case venue; the state alone when no county is stated. */
  const jurisdictionName = county && state ? `${county}, ${state}` : state ?? jurisdiction;
  const jurisdictionType = state ? (county ? "State Law – County Venue" : "State Law") : undefined;
  const solDays = caseIns.sol ? Math.ceil((new Date(`${caseIns.sol.iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000) : undefined;
  const sevCount = SEV_ORDER.map((s) => [s, openIssues.filter((i) => i.severity === s).length] as const).filter(([, n]) => n);

  return (
    <div className={embedded ? "space-y-6" : "min-h-screen bg-wash"}>
      <InsuranceBreadcrumb
        embedded={embedded}
        backLabel={backLabel}
        onBack={onBack}
        trail={[{ label: "Case Intake" }, { label: caseName, onClick: onBack }, { label: "Insurance Policy Analysis" }]}
      />

      <div className={embedded ? "space-y-6" : "max-w-[1400px] mx-auto px-4 sm:px-8 py-8 space-y-6"}>
        {/* 1 — Header */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="page-title">Insurance Policy Analysis</h1>
            <p className="secondary-text mt-1">Defendants, their policies, coverage triggers, liens and risks.</p>
          </div>
          <button type="button" onClick={() => setUploadOpen(true)} className="btn btn-primary gap-2 shrink-0"><Upload className="w-4 h-4" strokeWidth={1.75} /> Add Insurance Document</button>
        </div>

        {/* 2 — Which data is shown */}
        <div role="note" className={`rounded-lg border px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap ${sample ? "border-[#FDE6C8] bg-[#FFF7ED]" : "border-line bg-white"}`}>
          <p className="text-sm text-ink flex items-start gap-2 min-w-0">
            <Info className={`w-4 h-4 shrink-0 mt-0.5 ${sample ? "text-[#B45309]" : "text-deep"}`} strokeWidth={1.75} />
            {sample
              ? <span><b className="font-semibold">Illustrative Sample Data.</b> Defendants and policies below are an example, not Estate of Miller facts. SOL, jurisdiction and liens are from the case record.</span>
              : <span><b className="font-semibold">Case record.</b> Policies from documents on file and the Defendant Analysis. Missing terms read Pending verification.</span>}
          </p>
          <div role="radiogroup" aria-label="Policy data shown" className="inline-flex rounded-lg border border-line bg-white p-0.5 shrink-0">
            {([["sample", "Illustrative sample"], ["case", "Case record"]] as [View, string][]).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${view === k ? "bg-brand text-white" : "text-[#5B6B78] hover:text-ink"}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* 3 — Overview: snapshot beside the defendants and their policies */}
        <div className="grid grid-cols-1 lg:grid-cols-[312px_minmax(0,1fr)] gap-6 items-start">
          <section id="ins-overview" aria-labelledby="ins-overview-t" className="lg-card !p-4 lg:sticky lg:top-[96px] lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto scroll-mt-[80px]">
            <div className="flex items-center gap-2.5 mb-3 px-0.5">
              <span className="w-8 h-8 rounded-full bg-tint flex items-center justify-center shrink-0"><Shield className="w-4 h-4 text-deep" strokeWidth={1.75} /></span>
              <h2 id="ins-overview-t" className="text-[15px] font-semibold text-ink leading-tight">Analysis Snapshot</h2>
            </div>
            {/* 1 — Defendants and their policies, 2 — Jurisdiction, then the KPI cards */}
            <div className="space-y-2">
              <SnapCard id="snap-defendants" icon={Users} label="Defendants overview" open={snapOpen.defendants} onToggle={() => toggleSnap("defendants")}
                lead={<>
                  {/* Total across the full width, then individuals and organizations side by side,
                      so every label fits in full on one line */}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {([
                      [data.parties.length === 1 ? "Total Defendant" : "Total Defendants", data.parties.length],
                      [entityCounts[0][1] === 1 ? "Individual" : "Individuals", entityCounts[0][1]],
                      [entityCounts[1][1] === 1 ? "Organization" : "Organizations", entityCounts[1][1]],
                    ] as const).map(([k, n], i) => (
                      <div key={i} className={`min-w-0 rounded-lg bg-white border border-[#D6F2F7] px-2.5 py-1.5 flex items-baseline gap-1.5 ${i === 0 ? "col-span-2" : ""}`}>
                        <span className="text-[16px] font-semibold text-ink tabular-nums leading-tight">{n}</span>
                        <span className="text-[11px] font-medium text-[#5B6B78] leading-tight whitespace-nowrap">{k}</span>
                      </div>
                    ))}
                  </div>
                  {entityCounts[2][1] > 0 && <p className="mt-1 text-[11px] text-[#8A98A3]">{entityCounts[2][1]} not yet identified</p>}
                </>}>
                <ul className="mt-2.5 space-y-2.5">
                  {data.parties.map((party) => {
                    const ps = policiesOf(party.id);
                    return (
                      <li key={party.id} className="border-t border-[#D6F2F7] pt-2">
                        <div className="text-xs leading-snug break-words">
                          <span className="font-semibold text-ink">{party.name}</span>
                          <span className="text-[#8A98A3]"> — {entityClass(party.kind)}</span>
                        </div>
                        <div className="text-[11px] text-[#8A98A3] leading-snug">{ps.length ? `${ps.length} ${ps.length === 1 ? "policy" : "policies"}` : "No policies identified"}</div>
                        {ps.length > 0 && (
                          <ul className="mt-1.5 space-y-1.5">
                            {ps.map((p) => (
                              <li key={p.id} className="rounded-lg border border-line bg-white px-2.5 py-1.5 space-y-0.5">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-semibold text-ink leading-snug break-words min-w-0">{policyTitle(p)}</span>
                                  <span className="shrink-0"><LayerBadge layer={p.layer} /></span>
                                </div>
                                <PoolRow k="Insurer">{p.insurer || <span className="text-[#B45309]">Pending verification</span>}</PoolRow>
                                <PoolRow k="Policy no.">{p.number ? <span className="mono-ref break-all">{p.number}</span> : <span className="text-[#B45309]">Pending verification</span>}</PoolRow>
                                <PoolRow k="Applicable limit">
                                  {p.applicable
                                    ? <span className={`tabular-nums ${counted(p) ? "font-semibold" : "text-[#8A98A3]"}`}>{fmtMoney(p.applicable.amount)}{p.applicable.estimate ? " est." : ""}</span>
                                    : <span className="text-[#B45309]">Pending verification</span>}
                                </PoolRow>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {sample && <p className="mt-2 text-[11px] text-[#B45309] leading-snug">Illustrative sample, not Estate of Miller defendants or policies.</p>}
              </SnapCard>

              <SnapCard id="snap-jurisdiction" icon={Landmark} label="Jurisdiction overview" open={snapOpen.jurisdiction} onToggle={() => toggleSnap("jurisdiction")}
                lead={!snapOpen.jurisdiction && (
                  <div className="mt-1.5">
                    <p className="text-[13px] font-semibold text-ink leading-snug break-words">{jurisdictionName ?? <span className="text-[#B45309] font-medium">Pending verification</span>}</p>
                    <p className="text-[11px] text-[#5B6B78] leading-snug">{jurisdictionType ?? <span className="text-[#B45309]">Type pending verification</span>}</p>
                  </div>
                )}>
                <dl className="mt-1.5 space-y-1.5">
                  <div>
                    <dt className="text-[11px] text-[#8A98A3] leading-snug">Jurisdiction</dt>
                    <dd className="text-[13px] font-semibold text-ink leading-snug break-words">{jurisdictionName ?? <span className="text-[#B45309] font-medium">Pending verification</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[#8A98A3] leading-snug">Jurisdiction type</dt>
                    <dd className="text-[13px] font-semibold text-ink leading-snug break-words">{jurisdictionType ?? <span className="text-[#B45309] font-medium">Pending verification</span>}</dd>
                  </div>
                </dl>
              </SnapCard>
            </div>

            {/* 3 — KPI cards */}
            <div className="mt-2 space-y-2">
              <Kpi icon={CalendarClock} label="SOL remaining" value={solDays === undefined ? "Not determined" : `${solDays} days`}
                sub={caseIns.sol ? `${fmtIso(caseIns.sol.iso)} · Unconfirmed` : "No deadline on record"} />
              <Kpi id="snap-pool" icon={ShieldCheck} label="Total coverage pool" value={pool ? `${compact(pool)}${poolEstimate ? " est." : ""}` : "Not determined"}
                sub={`${data.policies.length} ${sample ? "illustrative " : ""}${data.policies.length === 1 ? "policy" : "policies"}`}
                action={data.policies.length > 0 && (
                  <button type="button" onClick={() => toggleSnap("pool")} aria-expanded={snapOpen.pool} aria-controls="snap-pool-body" className="text-[11px] font-semibold text-brand hover:text-deep whitespace-nowrap inline-flex items-center gap-0.5">
                    {snapOpen.pool ? "Hide breakdown" : "View breakdown"}{snapOpen.pool ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}>
                {snapOpen.pool && data.policies.length > 0 && (
                  <div id="snap-pool-body" className="mt-2.5 border-t border-[#D6F2F7] pt-2.5 space-y-2.5">
                    <div>
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#5B6B78] mb-1">Coverage by defendant</div>
                      <div className="space-y-1">
                        {insuredParties.map((party) => (
                          <PoolRow key={party.id} k={party.name} wide>{shareText(policiesOf(party.id))}</PoolRow>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#5B6B78] mb-1">Coverage by policy layer</div>
                      <div className="space-y-1">
                        {LAYER_ORDER.filter((l) => data.policies.some((p) => p.layer === l)).map((l) => (
                          <PoolRow key={l} k={l === "Not determined" ? "Layer pending" : `${l} coverage`} wide>{shareText(data.policies.filter((p) => p.layer === l))}</PoolRow>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-[#D6F2F7] pt-2 space-y-0.5">
                      <PoolRow k="Total applicable" wide><span className="font-semibold tabular-nums">{pool ? `${fmtMoney(pool)}${poolEstimate ? " est." : ""}` : "Not determined"}</span></PoolRow>
                      {(sample || poolPending > 0) && (
                        <p className="pt-0.5 text-[11px] text-[#B45309] leading-snug">
                          {sample ? "Illustrative estimate · not verified" : `${poolPending} ${poolPending === 1 ? "policy" : "policies"} pending verification`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </Kpi>
              <Kpi icon={ShieldAlert} label="Coverage gap" value="Not determined" sub="Exposure assessment pending" />
              <Kpi icon={FileSearch} label="Lien risk" value="Pending verification" sub="Health coverage unresolved" />
              <Kpi icon={Scale} label="Bad faith opportunity" value="Not determined" sub="Further evaluation required" />
              <Kpi icon={Flag} label="Open flags" value={openIssues.length}
                sub={sevCount.length ? sevCount.map(([s, n]) => `${n} ${s}`).join(" · ") : "None unresolved"} />
            </div>
          </section>

          <section id="ins-parties" aria-labelledby="ins-parties-t" className="lg-card !p-0 min-w-0 scroll-mt-[80px]">
            <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="ins-parties-t" className="section-header">Defendants &amp; Policies</h2>
                <p className="secondary-text mt-0.5">Each policy sits under the defendant it insures.</p>
              </div>
              <span className="text-xs text-[#5B6B78] whitespace-nowrap mt-1 tabular-nums">{data.parties.length} {data.parties.length === 1 ? "defendant" : "defendants"} · {data.policies.length} {data.policies.length === 1 ? "policy" : "policies"}</span>
            </div>
            <div className="p-4 space-y-4">
              {data.parties.map((party) => (
                <DefendantGroup key={party.id} party={party} policies={policiesOf(party.id)} coverageOf={coverageOf} sample={sample}
                  underlyingOf={(p) => data.policies.find((q) => q.id === p.underlyingPolicyId)} onDetails={showPolicy} />
              ))}
            </div>
          </section>
        </div>

        {/* 4 — Six detail tabs; only this card's content changes */}
        <section id="ins-detail" aria-label="Insurance analysis detail" className="lg-card !p-0 scroll-mt-[80px]">
          <div className="px-6 pt-4 pb-3 border-b border-line">
            <div role="tablist" aria-label="Insurance analysis detail" className="flex gap-1.5 overflow-x-auto bg-wash rounded-xl p-1.5">
              {TABS.map(([k, label]) => (
                <button key={k} id={`tab-ins-${k}`} type="button" role="tab" aria-selected={tab === k} aria-controls={`ins-${k}`} onClick={() => setTab(k)}
                  className={`flex-1 min-w-max px-4 py-2 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${tab === k ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-white"}`}>
                  {label}
                  {k === "flags" && openIssues.length > 0 && <span className={`text-[11px] rounded-full px-1.5 tabular-nums ${tab === k ? "bg-white/25" : "bg-track"}`}>{openIssues.length}</span>}
                </button>
              ))}
            </div>
          </div>

          {tab === "policy" && (
            <TabPane id="ins-policy" title="Policy Details" sub="Exclusions, endorsements, conditions, source documents and the layer stack, by defendant."
              right={data.policies.length > 0 && (
                <button type="button" className={btn} onClick={() => { const anyOpen = data.policies.some((p) => !folded[p.id]); setFolded(Object.fromEntries(data.policies.map((p) => [p.id, anyOpen]))); }}>
                  {data.policies.some((p) => !folded[p.id]) ? "Collapse all" : "Expand all"}
                </button>
              )}>
              <div className="space-y-5">
                {insuredParties.length ? insuredParties.map((party) => {
                  const own = policiesOf(party.id);
                  return (
                    <section key={party.id} aria-label={party.name} className="rounded-2xl border border-line bg-[#FAFCFD]">
                      {/* Defendant header: name, type and how many policies sit under it */}
                      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <h4 className="text-[15px] font-semibold text-ink leading-snug flex items-center gap-2 flex-wrap">{party.name}{sample && <SampleTag />}</h4>
                          <p className="text-xs text-[#5B6B78] mt-0.5">{entityClass(party.kind)} · {own.length} {own.length === 1 ? "policy" : "policies"}</p>
                        </div>
                        <span className="flex items-center gap-1.5 flex-wrap">{LAYER_ORDER.filter((l) => own.some((p) => p.layer === l)).map((l) => <LayerBadge key={l} layer={l} />)}</span>
                      </div>
                      <div className="p-3 sm:p-4 space-y-3">
                        {own.map((p) => (
                          <PolicyDeepCard key={p.id} p={p} c={coverageOf(p.id)} caseId={caseId} open={!folded[p.id]} onToggle={() => setFolded((f) => ({ ...f, [p.id]: !f[p.id] }))} />
                        ))}
                        <LayerStack party={party.name} stack={own} />
                      </div>
                    </section>
                  );
                }) : <p className="secondary-text">No policies identified. Use Add Insurance Document to add one.</p>}
                {!sample && <Dependents caseId={caseId} deps={caseIns.dependents} parties={caseIns.parties} policies={caseIns.policies} />}
              </div>
            </TabPane>
          )}

          {tab === "triggers" && (
            <TabPane id="ins-triggers" title="Coverage Triggers" sub="Whether each policy may respond to the incident. A preliminary reading, not a final coverage determination.">
              {(() => {
                // Ordered by defendant, so a defendant's layers sit together.
                const ordered = data.parties.flatMap((party) => policiesOf(party.id));
                const results = ordered.map((p) => assessTrigger(p, coverageOf(p.id), caseIns.incident,
                  p.layer === "Umbrella" || p.layer === "Excess" ? data.policies.find((q) => q.id === p.underlyingPolicyId) ?? data.policies.find((q) => q.partyId === p.partyId && q.layer === "Primary") : undefined));
                return (
              <div className="space-y-4">
                <TriggerSummary results={results} incident={caseIns.incident} />
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                  {results.map((r) => <TriggerCard key={r.p.id} r={r} party={partyName(r.p.partyId)} onOpen={() => showPolicy(r.p.id)} />)}
                </div>
                {/* Layered policies: how each upper layer depends on the one below */}
                {(() => {
                  const notes = results.filter((r) => r.underlying).map((r) => `${partyName(r.p.partyId)}: ${policyTitle(r.p)} attaches above ${policyTitle(r.underlying!)} and responds only once that layer is exhausted.`);
                  return notes.length ? (
                    <div className="rounded-lg border border-line bg-wash px-3.5 py-2.5 text-xs text-[#5B6B78]">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78] mb-1">Multi-policy notes</p>
                      <ul className="space-y-0.5">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
                    </div>
                  ) : null;
                })()}
              </div>
                );
              })()}
            </TabPane>
          )}

          {tab === "jurisdiction" && (
            <TabPane id="ins-jurisdiction" title="Jurisdiction" sub={`${jurisdiction ?? "Jurisdiction not provided"} · from the case record. Each rule stays Unverified until an attorney checks it.`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] table-fixed text-sm">
                  <colgroup><col className="w-[200px]" /><col /><col className="w-[190px]" /><col className="w-[196px]" /></colgroup>
                  <thead className="bg-wash border-y border-line">
                    <tr>{["Consideration", "Position", "Reference", "Verification"].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(() => {
                      const a = (id: string) => rules?.authorities.find((x) => x.id === id);
                      // [consideration, position, reference, verification: authority id | "unverified" | "record"]
                      const rows: [string, string | undefined, string | undefined, string][] = [
                        ["Jurisdiction", `${jurisdiction ?? "Not provided"} · ${law.value}${law.note ? ` · ${law.note}` : ""}`, "Case record · Jurisdiction review", "record"],
                        ["Fault system", "Fault-based tort claim; no no-fault threshold applies to a malpractice claim", "Illinois tort law", "unverified"],
                        ["Comparative fault", a("il-2-1116")?.summary ?? "No rules recorded for this state", a("il-2-1116")?.citation, "il-2-1116"],
                        ["Joint and several liability", a("il-2-1117")?.summary, a("il-2-1117")?.citation, "il-2-1117"],
                        ["Noneconomic damages cap", "No applicable cap confirmed (same as Valuation)", "No verified legal source on file", "record"],
                        ["Collateral source rule", "A malpractice judgment against a licensed hospital or physician may be reduced by certain collateral benefits, except where a lien or subrogation right exists. Whether it reaches the facility is not determined.", "735 ILCS 5/2-1205", "unverified"],
                        ["Bad faith standard", "Insurer's duty to settle within limits (the claim belongs to the insured); statutory remedy for vexatious and unreasonable delay", "215 ILCS 5/155 · Illinois common law", "il-215-155"],
                        ["Statute of limitations", defendants?.sources.find((s) => s.id === "jurisdiction-review")?.facts.find((f) => f.at === "Deadline")?.text ?? a("il-13-212")?.summary, a("il-13-212")?.citation, "il-13-212"],
                        ["Malpractice pre-suit requirement", a("il-2-622")?.summary, a("il-2-622")?.citation, "il-2-622"],
                        ["UM/UIM rules", "Not indicated · these apply to motor vehicle policies, and no vehicle is involved in this incident", "215 ILCS 5/143a", "unverified"],
                      ];
                      return rows.filter(([, v]) => v).map(([k, v, ref, ver]) => {
                        const check = ver !== "record" && ver !== "unverified" ? liabilityInputs.authorityChecks[ver] : undefined;
                        return (
                          <tr key={k} className="align-top hover:bg-[#FAFCFD]">
                            <th scope="row" className="px-4 py-3.5 text-left text-[13.5px] font-semibold text-ink leading-snug">{k}</th>
                            <td className="px-4 py-3.5 text-[13.5px] text-ink leading-relaxed break-words">{v}</td>
                            <td className="px-4 py-3.5 mono-ref text-xs leading-relaxed break-words">{ref ?? "—"}</td>
                            <td className="px-4 py-3.5">{ver === "record" ? <span className="pill pill-neutral whitespace-nowrap">From the case record</span> : check ? <span className="pill pill-complete whitespace-nowrap">Verified by attorney</span> : <span className="pill pill-progress whitespace-nowrap">Unverified · attorney review</span>}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </TabPane>
          )}

          {tab === "liens" && (
            <TabPane id="ins-liens" title="Lien Framework" sub="Which liens may attach to the client's recovery, from the case record.">
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-wash border-y border-line">
                      <tr>{["Lien type", "Governing law", "Status", "Notes"].map((h) => <th key={h} className="eyebrow text-left px-3 py-2.5">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {caseIns.liens.map((l) => (
                        <tr key={l.category} className="align-top">
                          <td className="px-3 py-2.5 font-semibold text-ink whitespace-nowrap">{l.category}</td>
                          <td className="px-3 py-2.5 mono-ref text-xs">{l.law}</td>
                          <td className="px-3 py-2.5"><span className={`${LIEN_PILL[l.status]} whitespace-nowrap`}>{l.status}</span></td>
                          <td className="px-3 py-2.5 text-xs"><span className="text-[#5B6B78]">{l.source}.</span> <span className="text-ink">{l.followUp}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="lg-zone lg-zone-grey px-4 py-3 text-sm text-ink flex items-start gap-2">
                  <Info className="w-4 h-4 text-deep shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>Lien amounts, made-whole calculations and net recovery belong in the Damages module.</span>
                </p>
              </div>
            </TabPane>
          )}

          {tab === "badfaith" && (
            <TabPane id="ins-badfaith" title="Bad Faith" sub="Readiness for a policy-limits demand, by insurer. No insurer conduct is labelled bad faith here.">
              <div className="space-y-4">
                {/* Jurisdiction-specific legal standard, set apart from the insurer cards */}
                <div className="rounded-xl border border-[#D6F2F7] bg-tint px-4 py-3 flex items-start gap-3 flex-wrap">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0"><Scale className="w-4 h-4 text-brand" strokeWidth={1.75} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78]">Illinois bad faith standard</p>
                    <p className="text-sm text-ink leading-snug mt-0.5">Insurer's duty to settle within limits, and the statutory remedy for vexatious and unreasonable delay.</p>
                    <p className="mono-ref text-xs mt-0.5">215 ILCS 5/155 · Illinois common law</p>
                  </div>
                  <span className="pill pill-progress whitespace-nowrap self-center">Unverified · attorney review</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                  {data.policies.map((p) => <BadFaithCard key={p.id} p={p} party={partyName(p.partyId)} coverage={coverageOf(p.id).status} docs={documents} caseId={caseId} requests={tracker.requests} />)}
                </div>
              </div>
            </TabPane>
          )}

          {tab === "flags" && (
            <TabPane id="ins-flags" title="All Flags" sub={sample ? "Illustrative policy flags, plus the case's own open issues." : "Every insurance issue on the case record, with its impact and required action."}>
              <Flags caseId={caseId} issues={issues} statusOf={issueStatus} />
            </TabPane>
          )}
        </section>

        {/* 5 — Add Insurance Document */}
        {uploadOpen && (
          <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) setUploadOpen(false); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="ins-upload-t" className="lg-card !p-0 w-full max-w-[880px] my-auto">
              <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4">
                <div>
                  <h2 id="ins-upload-t" className="section-header">Add Insurance Document</h2>
                  <p className="secondary-text mt-0.5">Upload a policy, link it to a defendant on the case record, and review its fields before saving.</p>
                </div>
                <button type="button" onClick={() => setUploadOpen(false)} aria-label="Close" className="p-2 rounded-lg hover:bg-tint"><X className="w-5 h-5 text-[#5B6B78]" /></button>
              </div>
              <div className="p-6">
                <UploadPolicy caseId={caseId} parties={caseIns.parties} onSaved={(id) => { setUploadOpen(false); setView("case"); window.setTimeout(() => showPolicy(id), 30); }} />
              </div>
            </div>
          </div>
        )}

        <AttorneyDisclaimer />
      </div>
    </div>
  );
}

// ── Defendants & Policies: one container per defendant, its policies inside ──
function DefendantGroup({ party, policies, coverageOf, sample, underlyingOf, onDetails }: {
  party: Party; policies: Policy[]; coverageOf: (id: string) => CoverageReading; sample: boolean;
  underlyingOf: (p: Policy) => Policy | undefined; onDetails: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const statuses = policies.map((p) => coverageOf(p.id).status);
  const [status, pill] = !policies.length ? ["Pending verification", "pill pill-progress"]
    : statuses.every((s) => s === "Applicable" || s === "Potentially Applicable") ? [sample ? "Covered" : "Potentially covered", "pill pill-complete"]
    : statuses.every((s) => s === "Not Applicable") ? ["Not covered", "pill pill-neutral"]
    : ["Pending verification", "pill pill-progress"];
  // A defendant total only when every layer has a supported applicable limit; layers stack, so they add without overlap.
  const total = policies.length > 1 && policies.every((p) => p.applicable) ? policies.reduce((n, p) => n + p.applicable!.amount, 0) : undefined;
  const est = policies.some((p) => p.applicable?.estimate);
  const retention = policies.find((p) => p.sir);
  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-4 py-3 bg-wash flex items-center justify-between gap-x-3 gap-y-2 flex-wrap text-left hover:bg-[#EEF4F7]">
        <span className="min-w-0">
          <span className="flex items-center gap-2 flex-wrap"><span className="text-[15px] font-semibold text-ink leading-snug">{party.name}</span>{sample && <SampleTag />}</span>
          <span className="block text-xs text-[#5B6B78] mt-0.5">{party.kind} · {party.role}</span>
        </span>
        <span className="flex items-center gap-2.5 shrink-0">
          <span className={`${pill} whitespace-nowrap`}>{status}</span>
          <span className="text-xs text-[#5B6B78] whitespace-nowrap tabular-nums">{policies.length} {policies.length === 1 ? "policy" : "policies"}</span>
          <ChevronDown className={`w-4 h-4 text-deep transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t border-line">
          {policies.length ? policies.map((p) => <PolicyCard key={p.id} p={p} c={coverageOf(p.id)} underlying={underlyingOf(p)} onDetails={() => onDetails(p.id)} />)
            : <p className="px-1 py-1 text-sm text-[#5B6B78]">No policy identified · <span className="text-[#B45309]">Pending verification</span></p>}
        </div>
      )}
      {open && total !== undefined && (
        <div className="px-4 py-2.5 border-t border-line bg-wash flex items-center justify-between gap-3 text-sm">
          <span className="text-[#5B6B78]">{party.name} — total applicable{retention ? ` (net ${retention.sir} SIR)` : ""}</span>
          <span className="font-bold text-ink tabular-nums">{fmtMoney(total)}{est ? " est." : ""}</span>
        </div>
      )}
    </div>
  );
}

/** Fields shown for a policy: common ones, then those its layer and form call for. */
function policyFields(p: Policy, c: CoverageReading, underlying?: Policy): [string, ReactNode][] {
  const m = (n?: number) => (n ? fmtMoney(n) : PV);
  const retention = p.sir ? `SIR ${p.sir}` : p.deductible ?? undefined;
  const form = formOf(p);
  const a = c.inPeriodRecord, b = c.inPeriodEvidence;
  const trigger = a === undefined || b === undefined ? PV
    : a && b ? <span className="pill pill-complete whitespace-nowrap">✓ In period</span>
    : !a && !b ? <span className="pill pill-risk whitespace-nowrap">Outside period</span>
    : <span className="pill pill-progress whitespace-nowrap">Check dates</span>;
  const common: [string, ReactNode][] = [
    ["Policy type", p.layer === "Umbrella" || p.layer === "Excess" || !form ? (p.type && p.type !== "Not stated" ? p.type : PV) : `${form} · ${p.type}`],
    ["Policy period", period(p) ?? PV],
    ["Trigger status", trigger],
  ];
  const defense: [string, ReactNode] = ["Defense treatment", p.defense ?? PV];
  if (p.layer === "Umbrella") return [...common,
    ["Umbrella limit", m(p.perOccurrence)], ["Attachment point", p.attachmentPoint ?? PV], ["Drop-down provision", p.dropDown ?? PV],
    ["Underlying policy", underlying ? policyTitle(underlying) : PV], ["SIR / deductible", retention ?? PV], defense, ["Umbrella type", p.umbrellaType ?? PV]];
  if (p.layer === "Excess") return [...common,
    ["Excess limit", m(p.perOccurrence)], ["Attachment point", p.attachmentPoint ?? PV], ["Underlying policy", underlying ? policyTitle(underlying) : PV],
    ["Retention / deductible", retention ?? PV], defense];
  if (form === "Claims-made") return [...common,
    ["Retroactive date", p.retroDate ? fmtIso(p.retroDate) : PV], ["Reporting requirements", p.reporting ?? PV],
    ["Per-claim limit", m(p.perOccurrence)], ["Aggregate limit", m(p.aggregate)], ["SIR / deductible", retention ?? PV], defense];
  return [...common,
    ["Per-occurrence limit", m(p.perOccurrence)], ["Aggregate limit", m(p.aggregate)], ["Aggregate remaining", m(p.aggregateRemaining)],
    p.sir ? ["Self-insured retention", p.sir] : ["SIR / deductible", retention ?? PV],
    ...(p.sir ? [["Defense below SIR", p.defenseBelowSir ?? PV] as [string, ReactNode]] : []),
    defense];
}

function PolicyCard({ p, c, underlying, onDetails }: { p: Policy; c: CoverageReading; underlying?: Policy; onDetails: () => void }) {
  const fields = policyFields(p, c, underlying);
  return (
    <div className="rounded-lg border border-line bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-x-3 gap-y-1.5 flex-wrap border-b border-line">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink leading-snug">{policyTitle(p)}</p>
          <p className="text-xs text-[#5B6B78] mt-0.5">{p.number ? <>Policy <span className="mono-ref">#{p.number}</span></> : "Policy number pending verification"} · {p.insurer}</p>
        </div>
        <span className="flex items-center gap-3 shrink-0">
          <LayerBadge layer={p.layer} />
          <button type="button" onClick={onDetails} className="text-xs font-semibold text-deep hover:text-ink">Details</button>
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3">
        {fields.map(([k, v], i) => (
          // The last field fills its row, so a short row leaves no empty cell.
          <div key={k} className={`px-4 py-2.5 border-b border-line min-w-0 ${i === fields.length - 1 ? `${fields.length % 3 === 1 ? "sm:col-span-3" : fields.length % 3 === 2 ? "sm:col-span-2" : "sm:col-span-1"}` : ""}`}>
            <dt className="eyebrow !text-[10.5px] mb-0.5">{k}</dt>
            <dd className="text-sm font-medium text-ink tabular-nums leading-snug break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 py-2.5 bg-tint border-t-2 border-brand -mt-px flex items-center justify-between gap-x-4 gap-y-1 flex-wrap">
        <div className="min-w-0">
          <div className="eyebrow !text-deep !text-[10.5px]">Applicable limit</div>
          <p className="text-xs text-[#5B6B78] mt-0.5">{p.applicable?.note ?? "Needs verified limits, retention and coverage"}</p>
        </div>
        <span className={`tabular-nums shrink-0 ${p.applicable ? "text-[18px] font-bold text-deep" : "text-sm font-semibold text-[#5B6B78]"}`}>
          {p.applicable ? `${fmtMoney(p.applicable.amount)}${p.applicable.estimate ? " est." : ""}` : "Not determined"}
        </span>
      </div>
    </div>
  );
}

// ── Policy Details: the deeper examination of each policy ──
const exclusionTone = (s: string) => (/verify|not confirmed|pending/i.test(s) ? "text-[#B45309]" : /^n\/a/i.test(s) ? "text-[#8A98A3]" : "text-[#5B6B78]");

/** A small section heading inside a policy card. */
const CardHead = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 mb-1.5">
    <h5 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78]">{children}</h5>
    {aside && <span className="text-[11px] text-[#8A98A3]">{aside}</span>}
  </div>
);

/**
 * The terms that apply to this policy's form and layer. A field appears only where it
 * applies: a retroactive date for claims-made forms, attachment and drop-down for
 * umbrella or excess, a retention only on a layer that can carry one. Applicable but
 * missing terms read Pending verification.
 */
function policyTerms(p: Policy): [string, ReactNode][] {
  const form = formOf(p);
  const upper = p.layer === "Umbrella" || p.layer === "Excess";
  const t: [string, ReactNode][] = [
    ["Named insured", p.namedInsured ?? PV],
    ["Policy form", form ?? (p.trigger && p.trigger !== "Not stated" ? p.trigger : PV)],
    ["Policy period", period(p) ?? PV],
  ];
  if (form === "Claims-made") t.push(["Retroactive date", p.retroDate ? fmtIso(p.retroDate) : PV]);
  t.push([p.layer === "Umbrella" ? "Umbrella limit" : p.layer === "Excess" ? "Excess limit" : "Limits", limitText(p) ?? PV]);
  if (p.aggregateRemaining !== undefined) t.push(["Aggregate remaining", fmtMoney(p.aggregateRemaining)]);
  if (p.sir) t.push(["Self-insured retention", p.sir]);
  else if (p.deductible) t.push(["Deductible", p.deductible]);
  else if (!upper) t.push(["Retention / deductible", PV]);
  t.push(["Defense treatment", p.defense ?? PV]);
  if (p.sir && p.defenseBelowSir) t.push(["Defense within SIR", p.defenseBelowSir]);
  if (upper) {
    t.push(["Attachment point", p.attachmentPoint ?? PV]);
    if (p.layer === "Umbrella") {
      t.push(["Umbrella type", p.umbrellaType ?? PV]);
      t.push(["Drop-down provision", p.dropDown ?? PV]);
    } else if (p.dropDown) t.push(["Drop-down provision", p.dropDown]);
  }
  if (p.statusOnLoss) t.push(["Status on date of loss", p.statusOnLoss]);
  return t;
}

function PolicyDeepCard({ p, c, caseId, open, onToggle }: { p: Policy; c: CoverageReading; caseId: string; open: boolean; onToggle: () => void }) {
  const endorsements = [...(p.endorsements ?? []), ...p.additionalInsureds.map((a) => `Additional insured · ${a}`)];
  const conditions = [...p.conditions, ...p.provisions, ...(p.reporting ? [`Reporting · ${p.reporting}`] : [])];
  const terms = policyTerms(p);
  const list = (items: string[]) => (items.length
    ? <ul className="space-y-1">{items.map((e) => <li key={e} className="flex gap-2"><span className="mt-[7px] w-1 h-1 rounded-full bg-[#8A98A3] shrink-0" />{e}</li>)}</ul>
    : <p>{PV}</p>);
  return (
    <div id={`pol-${p.id}`} className={`rounded-xl border border-line border-l-[3px] ${STACK_BAR[p.layer] ?? STACK_BAR["Not determined"]} bg-white scroll-mt-[90px]`}>
      {/* Header: policy name, insurer and number; classification and coverage reading */}
      <button type="button" onClick={onToggle} aria-expanded={open} className={`w-full px-4 py-3 flex items-center justify-between gap-x-3 gap-y-2 flex-wrap text-left hover:bg-wash ${open ? "rounded-tr-xl border-b border-line" : "rounded-r-xl"}`}>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink leading-snug">{policyTitle(p)}</span>
          <span className="block text-xs text-[#5B6B78] mt-0.5 break-words">{p.insurer} · {p.number ? <span className="mono-ref">#{p.number}</span> : <span className="text-[#B45309]">Policy no. pending verification</span>}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <LayerBadge layer={p.layer} />
          <span className={`${COV_PILL[c.status]} whitespace-nowrap`}>{c.status}</span>
          <ChevronDown className={`w-4 h-4 text-deep transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <>
          {/* 1 — Policy terms */}
          <div className="px-4 py-3">
            <CardHead>Policy terms</CardHead>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2.5">
              {terms.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] text-[#8A98A3] leading-snug">{k}</dt>
                  <dd className="text-sm font-medium text-ink leading-snug tabular-nums break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {/* 2 — Exclusions | endorsements and conditions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-line lg:divide-x divide-line">
            <div className="px-4 py-3">
              <CardHead aside={p.exclusions.length ? `${p.exclusions.length} listed` : undefined}>Exclusions</CardHead>
              {p.exclusions.length ? (
                <ul className="divide-y divide-line">
                  {p.exclusions.map((e) => (
                    <li key={e.name} className="py-1.5 flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-ink min-w-0">{e.name}</span>
                      <span className={`text-xs text-right shrink-0 max-w-[45%] ${exclusionTone(e.status)}`}>{e.status}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm">{p.source.kind === "document" ? <span className="text-[#5B6B78]">None on the declarations page · full form not on file</span> : PV}</p>}
            </div>
            <div className="px-4 py-3 border-t lg:border-t-0 border-line space-y-3 text-sm text-ink leading-snug">
              <div><CardHead>Endorsements</CardHead>{list(endorsements)}</div>
              <div><CardHead>Special conditions</CardHead>{list(conditions)}</div>
            </div>
          </div>
          {/* 3 — Source document, then the preliminary reading */}
          <div className="px-4 py-2.5 border-t border-line flex items-center justify-between gap-3 flex-wrap text-sm">
            <span className="min-w-0 flex items-baseline gap-3 flex-wrap">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78]">Supporting document</span>
              {p.source.file && <span className="mono-ref text-xs break-all">{p.source.file}</span>}
              <span className="text-xs text-[#5B6B78]">{p.source.label}</span>
            </span>
            {(p.source.storageKey || p.source.kind === "attorney") && (
              <span className="flex gap-2">
                {p.source.storageKey && <button type="button" className={btn} onClick={async () => { if (!(await downloadMediaFile(p.source.storageKey, p.source.file ?? "policy"))) toast.error("The file is not stored in this browser"); }}><Download className="w-3.5 h-3.5" />Download</button>}
                {p.source.kind === "attorney" && <button type="button" className={btn} onClick={() => { removePolicy(caseId, p.id); toast("Policy removed"); }}><Trash2 className="w-3.5 h-3.5" />Remove</button>}
              </span>
            )}
          </div>
          <div className="mx-4 mb-4 rounded-lg bg-wash border border-line px-3 py-2 flex items-start gap-2.5 flex-wrap text-xs">
            <span className="eyebrow !text-[10.5px] pt-0.5">Preliminary reading</span>
            <span className={`${COV_PILL[c.status]} whitespace-nowrap !py-0`}>{c.status}</span>
            <span className="text-[#5B6B78] leading-snug min-w-0 flex-1">{c.reason} {c.attachment}. Not a final coverage determination.</span>
          </div>
        </>
      )}
    </div>
  );
}

/** The defendant's layers in the order they respond: retention, primary, then umbrella and excess. */
const STACK_BAR: Record<string, string> = { Retention: "border-l-[#D97706]", Primary: "border-l-[#0369A1]", Umbrella: "border-l-[#6D28D9]", Excess: "border-l-[#B45309]", "Not determined": "border-l-[#CBD7DE]" };
function LayerStack({ party, stack }: { party: string; stack: Policy[] }) {
  if (!stack.length) return null;
  const retention = stack.find((q) => q.sir);
  const rows: { kind: string; name: string; amount: string; note?: string }[] = [
    ...(retention ? [{ kind: "Retention", name: `Self-insured retention · ${party}`, amount: retention.sir! }] : []),
    ...stack.map((q, i) => ({
      kind: q.layer,
      name: policyTitle(q),
      amount: limitText(q) ?? "Pending verification",
      note: i === 0 ? (retention ? "Responds once the retention is exhausted" : undefined) : stack[i - 1].layer === "Primary" ? "Attaches once the primary is exhausted" : "Attaches once the layer below is exhausted",
    })),
  ];
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="eyebrow">Layer stack · {party}</span>
        {!stack.some((q) => q.layer === "Excess" || q.layer === "Umbrella") && <span className="text-[11px] text-[#8A98A3]">No excess or umbrella identified</span>}
      </div>
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li key={`${r.kind}-${i}`}>
            {i > 0 && r.note && <div className="pl-[104px] py-0.5 text-[11px] text-[#8A98A3] flex items-center gap-1"><ArrowDown className="w-3 h-3" />{r.note}</div>}
            <div className={`grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-line border-l-[3px] ${STACK_BAR[r.kind] ?? STACK_BAR["Not determined"]} bg-white px-3 py-2 text-sm`}>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78]">{r.kind === "Not determined" ? "Layer pending" : r.kind}</span>
              <span className="text-ink truncate">{r.name}</span>
              <span className={`text-right tabular-nums whitespace-nowrap ${/pending/i.test(r.amount) ? "text-[#B45309] text-xs" : "font-semibold text-ink"}`}>{r.amount}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Coverage Triggers: one assessment feeds the cards and the summary banner ──
type TriggerRow = { label: string; value: ReactNode; status?: Cond };
type TriggerResult = { p: Policy; c: CoverageReading; rows: TriggerRow[]; overall: "Triggered" | "Needs verification" | "Not triggered"; underlying?: Policy };
type IncidentDates = { recordIso?: string; evidenceIso?: string };
const OVERALL_PILL: Record<TriggerResult["overall"], string> = { Triggered: "pill pill-complete", "Needs verification": "pill pill-progress", "Not triggered": "pill pill-risk" };

/** The conditions each policy must meet, by its form and layer. */
function assessTrigger(p: Policy, c: CoverageReading, incident: IncidentDates, underlying?: Policy): TriggerResult {
  const form = formOf(p);
  const hasPeriod = !!(p.periodStart && p.periodEnd);
  const a = c.inPeriodRecord, b = c.inPeriodEvidence;
  const rows: TriggerRow[] = [
    { label: "Policy type", value: form ? `${form} · ${p.type}` : p.type && p.type !== "Not stated" ? p.type : PV, status: form ? undefined : "Needs verification" },
    { label: "Policy period", value: period(p) ?? PV, status: hasPeriod ? undefined : "Needs verification" },
    { label: "Incident in period", value: incident.recordIso === incident.evidenceIso || !incident.evidenceIso ? fmtIso(incident.recordIso) : `${fmtIso(incident.recordIso)} record · ${fmtIso(incident.evidenceIso)} evidence`, status: !hasPeriod ? "Needs verification" : a && b ? "Satisfied" : a === false && b === false ? "Not satisfied" : "Needs verification" },
  ];
  if (form === "Claims-made") {
    rows.push({ label: "Retroactive date", value: p.retroDate ? fmtIso(p.retroDate) : PV, status: !p.retroDate ? "Needs verification" : incident.evidenceIso && p.retroDate <= incident.evidenceIso ? "Satisfied" : "Not satisfied" });
    rows.push({ label: "Claim reported in period", value: p.reporting ?? "No claim notice on record", status: "Needs verification" });
  }
  rows.push({ label: "Named insured", value: p.insuredUnlinked ? `${p.namedInsured ?? "Insured"} · not tied to the incident` : p.namedInsured ?? PV, status: p.insuredUnlinked || !p.namedInsured ? "Needs verification" : "Satisfied" });
  if (p.sir) rows.push({ label: "SIR requirement", value: `${p.sir} · exhaustion not documented`, status: "Needs verification" });
  else if (p.deductible && !/^none/i.test(p.deductible)) rows.push({ label: "Deductible", value: `${p.deductible} · owed by the insured` });
  if (p.layer === "Umbrella" || p.layer === "Excess") {
    const ok = !!underlying?.perOccurrence;
    rows.push({ label: "Underlying policy", value: underlying ? policyTitle(underlying) : PV, status: ok ? "Satisfied" : "Needs verification" });
    rows.push({ label: "Attachment point", value: p.attachmentPoint ?? (underlying?.perOccurrence ? `Above ${fmtMoney(underlying.perOccurrence)}` : PV) });
    if (p.dropDown) rows.push({ label: "Drop-down", value: p.dropDown });
  } else if (p.layer === "Not determined") {
    rows.push({ label: "Layer", value: PV, status: "Needs verification" });
  }
  const overall = rows.some((r) => r.status === "Not satisfied") ? "Not triggered" : rows.some((r) => r.status === "Needs verification") ? "Needs verification" : "Triggered";
  return { p, c, rows, overall, underlying };
}

const COND_ICON: Record<Cond, ReactNode> = {
  Satisfied: <CheckCircle className="w-3.5 h-3.5 text-[#15803D] shrink-0" strokeWidth={2} />,
  "Needs verification": <AlertCircle className="w-3.5 h-3.5 text-[#B45309] shrink-0" strokeWidth={2} />,
  "Not satisfied": <XCircle className="w-3.5 h-3.5 text-[#B91C1C] shrink-0" strokeWidth={2} />,
};

/** Overall result across every policy shown, worded from the actual assessments. */
function TriggerSummary({ results, incident }: { results: TriggerResult[]; incident: IncidentDates }) {
  const n = results.length;
  const failed = results.filter((r) => r.overall === "Not triggered");
  const open = results.filter((r) => r.overall === "Needs verification");
  const noun = (k: number) => (k === 1 ? "policy" : "policies");
  // Up to two open conditions per policy, failures first; acronyms keep their case.
  const firstOpen = (r: TriggerResult) => [...r.rows.filter((x) => x.status === "Not satisfied"), ...r.rows.filter((x) => x.status === "Needs verification")]
    .slice(0, 2).map((x) => (/^[A-Z]{2,}/.test(x.label) ? x.label : x.label.toLowerCase())).join(", ");
  const [tone, title, sub] = !n
    ? ["border-line bg-wash", "No policies identified", "Add an insurance document to assess its trigger."]
    : failed.length
      ? ["border-[#FECACA] bg-[#FEF2F2]", `${failed.length} of ${n} ${noun(n)} may not respond`, failed.map((r) => `${policyTitle(r.p)}: ${firstOpen(r)}`).join(" · ")]
      : open.length
        ? ["border-[#FDE6C8] bg-[#FFF7ED]", `${open.length} of ${n} ${noun(n)} need${open.length === 1 ? "s" : ""} verification`, open.slice(0, 3).map((r) => `${policyTitle(r.p)}: ${firstOpen(r)}`).join(" · ") + (open.length > 3 ? ` · and ${open.length - 3} more` : "")]
        : ["border-[#BBF7D0] bg-[#F0FDF4]", `All ${n} identified ${noun(n)} are within the policy period`, "Every trigger condition is met on the record. Preliminary, pending attorney review of each form."];
  const Icon = !n ? Info : failed.length ? XCircle : open.length ? AlertCircle : CheckCircle;
  const iconTone = !n ? "text-deep" : failed.length ? "text-[#B91C1C]" : open.length ? "text-[#B45309]" : "text-[#15803D]";
  return (
    <div role="status" className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-x-6 gap-y-2 flex-wrap ${tone}`}>
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${iconTone}`} strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-[#5B6B78] mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="text-xs text-[#5B6B78] text-right shrink-0">
        <p>Incident <b className="font-semibold text-ink">{fmtIso(incident.recordIso)}</b> record · <b className="font-semibold text-ink">{fmtIso(incident.evidenceIso)}</b> evidence</p>
        <p className="mt-0.5 flex items-center justify-end gap-2.5">
          {(["Satisfied", "Needs verification", "Not satisfied"] as Cond[]).map((s) => <span key={s} className="inline-flex items-center gap-1">{COND_ICON[s]}{s}</span>)}
        </p>
      </div>
    </div>
  );
}

function TriggerCard({ r, party, onOpen }: { r: TriggerResult; party: string; onOpen: () => void }) {
  const { p, c, rows, overall } = r;
  return (
    <div className={`rounded-xl border border-line border-l-[3px] ${STACK_BAR[p.layer] ?? STACK_BAR["Not determined"]} bg-white flex flex-col`}>
      <div className="px-3.5 py-2.5 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="text-sm font-semibold text-ink hover:text-deep text-left leading-snug inline-flex items-center gap-1.5 flex-wrap">{policyTitle(p)}{p.sample && <SampleTag />}</button>
          <p className="text-xs text-[#5B6B78] leading-snug break-words">{party} · {p.insurer}</p>
        </div>
        <span className="flex flex-col items-end gap-1 shrink-0"><LayerBadge layer={p.layer} /><span className={`${OVERALL_PILL[overall]} whitespace-nowrap !py-0`}>{overall}</span></span>
      </div>
      <dl className="px-3.5 py-1.5 divide-y divide-line flex-1">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[124px_minmax(0,1fr)] gap-x-3 py-1.5 text-xs">
            <dt className="text-[#8A98A3] leading-snug">{row.label}</dt>
            <dd className="text-ink leading-snug flex items-start gap-1.5 min-w-0">
              {row.status && <span className="mt-px" title={row.status}>{COND_ICON[row.status]}<span className="sr-only">{row.status}: </span></span>}
              <span className="min-w-0 break-words">{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-3.5 py-2 border-t border-line bg-[#FAFCFD] rounded-br-xl flex items-start gap-2 text-xs">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78] shrink-0 pt-px">Preliminary</span>
        <span className="text-[#5B6B78] leading-snug min-w-0">{c.reason}</span>
      </div>
    </div>
  );
}

// ── Dependents ──
function Dependents({ caseId, deps, parties, policies }: { caseId: string; deps: Dependent[]; parties: { id: string; name: string }[]; policies: Policy[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", relationship: "", partyId: "", policyId: "", coverage: "Not determined" as Dependent["coverage"] });
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.name.trim() || !f.relationship.trim()) return setErr("Add the dependent's name and relationship.");
    if (f.coverage === "Confirmed by attorney" && !f.policyId) return setErr("Choose the policy that covers them.");
    const ok = addDependent(caseId, { id: `dep-${Date.now()}`, name: f.name.trim(), relationship: f.relationship.trim(), partyId: f.partyId || undefined, policyId: f.policyId || undefined, coverage: f.coverage });
    toast(ok ? "Dependent recorded" : "Recorded for this session only. The browser didn't save it.");
    setF({ name: "", relationship: "", partyId: "", policyId: "", coverage: "Not determined" }); setOpen(false); setErr("");
  };
  return (
    <div className="border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="eyebrow">Dependents covered under these policies <span className="normal-case tracking-normal font-normal text-[#5B6B78]">· {deps.length} identified</span></h4>
        <button type="button" className={btn} onClick={() => setOpen(!open)}><Plus className="w-3.5 h-3.5" />Record dependent</button>
      </div>
      {open && (
        <div className="rounded-xl border border-brand ring-2 ring-tint p-4 mb-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="block"><span className="eyebrow block mb-1">Name</span><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block"><span className="eyebrow block mb-1">Relationship</span><input className={input} value={f.relationship} placeholder="e.g. spouse of insured" onChange={(e) => setF({ ...f, relationship: e.target.value })} /></label>
          <label className="block"><span className="eyebrow block mb-1">Related party</span><select className={select} value={f.partyId} onChange={(e) => setF({ ...f, partyId: e.target.value })}><option value="">None</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="block"><span className="eyebrow block mb-1">Policy</span><select className={select} value={f.policyId} onChange={(e) => setF({ ...f, policyId: e.target.value })}><option value="">None</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.insurer}</option>)}</select></label>
          <label className="block"><span className="eyebrow block mb-1">Coverage</span><select className={select} value={f.coverage} onChange={(e) => setF({ ...f, coverage: e.target.value as Dependent["coverage"] })}><option>Not determined</option><option>Confirmed by attorney</option><option>Not covered</option></select></label>
          {err && <p role="alert" className="md:col-span-5 text-xs text-[#B91C1C]">{err}</p>}
          <div className="md:col-span-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => { setOpen(false); setErr(""); }}>Cancel</button><button type="button" className={btnP} onClick={save}>Save dependent</button></div>
        </div>
      )}
      {deps.length ? (
        <table className="w-full text-sm">
          <thead className="bg-wash border-y border-line"><tr>{["Name", "Relationship", "Related party", "Policy", "Coverage", ""].map((h) => <th key={h} className="eyebrow text-left px-3 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {deps.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 font-semibold text-ink">{d.name}</td><td className="px-3 py-2">{d.relationship}</td>
                <td className="px-3 py-2">{parties.find((p) => p.id === d.partyId)?.name ?? "—"}</td>
                <td className="px-3 py-2">{policies.find((p) => p.id === d.policyId)?.insurer ?? "—"}</td>
                <td className="px-3 py-2"><span className={`pill ${d.coverage === "Confirmed by attorney" ? "pill-complete" : "pill-neutral"}`}>{d.coverage}</span></td>
                <td className="px-3 py-2 text-right"><button type="button" aria-label={`Remove ${d.name}`} onClick={() => removeDependent(caseId, d.id)} className="p-1 rounded hover:bg-tint"><X className="w-3.5 h-3.5 text-[#5B6B78]" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[#5B6B78]">None identified on the record. The defendants are entities or staff, and the plaintiff is living; the caption's “Estate of” wording is unresolved (Evidence Conflicts EC-02).</p>
      )}
    </div>
  );
}

// ── Bad faith readiness, per insurer ──
function BadFaithCard({ p, party, coverage, docs, caseId, requests }: { p: Policy; party: string; coverage: CoverageStatus; docs: CaseDocument[]; caseId: string; requests: { id: string; to: string; status: string; title?: string; demo?: boolean }[] }) {
  const rec = defendantsForCase(caseId);
  const cand = rec?.candidates.find((c) => c.name === party);
  const breach = cand?.elements.some((e) => e.kind === "breach" && e.status === "Shown");
  const medFiles = (rec?.sources ?? []).filter((s) => /hospital|imaging|rehab/.test(s.id)).flatMap((s) => s.files);
  const medOnFile = medFiles.some((f) => docs.some((d) => d.name === f));
  const limitsOk = !!p.perOccurrence && !p.sample;
  const checks: [string, boolean, string][] = [
    ["Liability supported", !!breach, breach ? "Breach shown in the Defendant Analysis; causation not yet known" : "No breach shown for this party"],
    ["Medical records complete", medOnFile, medOnFile ? "Stroke records on file" : "Stroke-related records are cited but not on file"],
    ["Policy limits confirmed", limitsOk, p.sample ? "Illustrative sample value, not confirmed" : p.perOccurrence ? `${fmtMoney(p.perOccurrence)} per occurrence on file` : "Limits not on file"],
    ["Coverage established", coverage === "Applicable" || coverage === "Potentially Applicable", `Coverage status: ${coverage}`],
  ];
  const comms = requests.filter((r) => r.to.toLowerCase().includes(p.insurer.toLowerCase().split(" ")[0]));
  const bf = p.badFaith;
  const list = bf?.checks ?? checks;
  const met = list.filter(([, ok]) => ok).length;
  const status = bf?.status ?? "Demand not ready";
  const concerns = bf?.concerns ?? "None on record. No delay, denial or refusal to settle is documented.";
  const evidence = bf?.evidence ?? (comms.length ? comms.map((r) => `${r.id} ${r.title ?? "request"} · ${r.status}${r.demo ? " · sample" : ""}`).join("; ") : "No insurer communications in the Document Tracker");
  const action = bf?.action ?? (limitsOk ? "Serve a policy-limits demand once liability and damages are documented, with a stated deadline." : "Obtain the policy before any limits demand.");
  return (
    <article className="rounded-xl border border-line bg-white flex flex-col">
      {/* Insurer and policy, with limit and defendant directly below */}
      <header className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-ink leading-snug flex items-center gap-1.5 flex-wrap">{policyTitle(p)}{p.sample && <SampleTag />}</h4>
          <p className="text-xs text-[#5B6B78] mt-0.5 break-words">{p.insurer} · {party}</p>
          <p className="text-xs text-[#5B6B78]">Policy limit <b className="font-semibold text-ink tabular-nums">{p.perOccurrence ? fmtMoney(p.perOccurrence) : <span className="text-[#B45309] font-medium">Pending verification</span>}</b></p>
        </div>
        <span className={`pill ${bf?.tone === "ok" ? "pill-neutral" : "pill-progress"} shrink-0 whitespace-nowrap`}>{status}</span>
      </header>
      <div className="px-4 py-3 space-y-3 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <section className="rounded-lg border border-line bg-[#FAFCFD] px-3 py-2.5">
            <CardHead>Potential insurer-related concerns</CardHead>
            <p className="text-sm text-[#5B6B78] leading-snug">{concerns}</p>
          </section>
          <section className="rounded-lg border border-line bg-[#FAFCFD] px-3 py-2.5">
            <CardHead>Supporting evidence</CardHead>
            <p className="text-sm text-[#5B6B78] leading-snug break-words">{evidence}</p>
          </section>
        </div>
        <section>
          <CardHead aside={`${met} of ${list.length} met`}>Documentation readiness</CardHead>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.map(([k, ok, note]) => (
              <li key={k} className="px-3 py-2 flex items-start gap-2.5 text-sm">
                {ok ? <CheckCircle className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" strokeWidth={1.75} aria-label="Met" /> : <Circle className="w-4 h-4 text-[#CBD7DE] shrink-0 mt-0.5" strokeWidth={2} aria-label="Not met" />}
                <span className="min-w-0">
                  <span className="block font-semibold text-ink leading-snug">{k}</span>
                  <span className="block text-xs text-[#5B6B78] leading-snug">{note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex items-center gap-3 flex-wrap">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78]">Demand readiness</span>
          <span className="flex-1 min-w-[80px] h-1.5 rounded-full bg-track overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={met} aria-label="Prerequisites met">
            <span className="block h-full bg-brand rounded-full" style={{ width: `${list.length ? (met / list.length) * 100 : 0}%` }} />
          </span>
          <span className="text-xs text-ink font-medium tabular-nums">{met} of {list.length} prerequisites</span>
          {!bf && <span className="basis-full text-xs text-[#5B6B78]">No policy-limits demand served.</span>}
        </section>
      </div>
      <footer className="px-4 py-2.5 border-t border-[#D6F2F7] bg-tint rounded-b-xl flex items-start gap-2 text-sm">
        <ArrowRight className="w-4 h-4 text-brand shrink-0 mt-0.5" strokeWidth={1.75} />
        <span className="min-w-0"><b className="font-semibold text-ink">Recommended next action:</b> <span className="text-ink">{action}</span></span>
      </footer>
    </article>
  );
}

// ── All Flags ──
const STATUS_OPTIONS: [IssueStatus, string][] = [["Open", "Open"], ["In progress", "In Progress"], ["Resolved", "Resolved"]];
type FlagFilter = { sev: string; st: string };
const NO_FLAG_FILTER: FlagFilter = { sev: "All", st: "All" };

/** One group of choices in the filter popover. */
function FilterChips({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="eyebrow mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${value === v ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-soft"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function Flags({ caseId, issues, statusOf }: { caseId: string; issues: Issue[]; statusOf: (id: string) => IssueStatus }) {
  const [applied, setApplied] = useState<FlagFilter>(NO_FLAG_FILTER);
  const [draft, setDraft] = useState<FlagFilter>(NO_FLAG_FILTER);
  const [panel, setPanel] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setPanel(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [panel]);
  const active = (applied.sev !== "All" ? 1 : 0) + (applied.st !== "All" ? 1 : 0);
  const rank = (id: string) => (statusOf(id) === "Resolved" ? 1 : 0);
  const sorted = [...issues].sort((a, b) => rank(a.id) - rank(b.id) || SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const open = issues.filter((i) => statusOf(i.id) !== "Resolved");
  const shown = sorted.filter((i) => (applied.sev === "All" || i.severity === applied.sev) && (applied.st === "All" || statusOf(i.id) === applied.st) && (!q.trim() || `${i.title} ${i.related} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase())));
  const set = (id: string, s: IssueStatus) => { const ok = setIssueStatus(caseId, id, s); toast(ok ? `Marked ${s.toLowerCase()}` : "Saved for this session only. The browser didn't store it."); };
  const clear = () => { setApplied(NO_FLAG_FILTER); setDraft(NO_FLAG_FILTER); setPanel(false); };
  const stLabel = (v: string) => STATUS_OPTIONS.find(([k]) => k === v)?.[1] ?? v;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {SEV_ORDER.map((s) => { const n = open.filter((i) => i.severity === s).length; return n ? <span key={s} className={SEV_PILL[s]}>{n} {s}</span> : null; })}
          <span className="text-xs text-[#5B6B78]">{open.length} open of {issues.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 h-9 bg-white border border-line rounded-lg px-3 focus-within:border-brand w-52"><Search className="w-4 h-4 text-[#8A98A3]" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flags" aria-label="Search flags" className="flex-1 min-w-0 text-sm bg-transparent outline-none" /></label>
          <div ref={wrap} className="relative">
            <button type="button" aria-haspopup="dialog" aria-expanded={panel} onClick={() => { setDraft(applied); setPanel((o) => !o); }}
              className={`h-9 flex items-center gap-2 px-3.5 rounded-lg border text-sm font-medium transition-colors ${active ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-soft"}`}>
              <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} /> Filter
              {active > 0 && <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-brand text-white">{active}</span>}
            </button>
            {panel && (
              <div role="dialog" aria-label="Filter flags" className="absolute right-0 top-full mt-2 z-30 w-[280px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-white shadow-lg p-4 space-y-4">
                <FilterChips label="Severity" value={draft.sev} options={[["All", "All"], ...SEV_ORDER.map((s) => [s, s] as [string, string])]} onChange={(v) => setDraft({ ...draft, sev: v })} />
                <FilterChips label="Status" value={draft.st} options={[["All", "All"], ...STATUS_OPTIONS]} onChange={(v) => setDraft({ ...draft, st: v })} />
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-line">
                  <button type="button" onClick={clear} className="text-xs font-medium text-[#5B6B78] hover:text-ink inline-flex items-center gap-1"><X className="w-3 h-3" strokeWidth={2} />Clear Filters</button>
                  <button type="button" onClick={() => { setApplied(draft); setPanel(false); }} className={btnP}>Apply Filters</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {(active > 0 || q.trim()) && (
        <p className="text-xs text-[#5B6B78]">
          Showing {shown.length} of {issues.length} flags
          {applied.sev !== "All" && <> · Severity: <b className="font-semibold text-ink">{applied.sev}</b></>}
          {applied.st !== "All" && <> · Status: <b className="font-semibold text-ink">{stLabel(applied.st)}</b></>}
          {active > 0 && <> · <button type="button" onClick={clear} className="text-xs font-semibold text-deep hover:underline">Clear filters</button></>}
        </p>
      )}
      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((i) => {
            const resolved = statusOf(i.id) === "Resolved";
            return (
              <li key={i.id} className={`rounded-xl border border-line border-l-4 ${SEV_BAR[i.severity]} bg-white ${resolved ? "opacity-75" : ""}`}>
                {/* Header: severity, title, defendant/policy, status */}
                <div className={`px-4 py-3 flex items-start gap-3 flex-wrap sm:flex-nowrap ${resolved ? "" : "border-b border-line"}`}>
                  <span className={`${SEV_PILL[i.severity]} shrink-0 w-[68px] justify-center`}>{i.severity}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink leading-snug flex items-center gap-1.5 flex-wrap">{i.title}{i.sample && <SampleTag />}</p>
                    <p className="text-xs text-[#5B6B78] mt-0.5 break-words">{i.related}</p>
                  </div>
                  <label className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[#8A98A3]">Status</span>
                    <select aria-label={`Status of ${i.title}`} value={statusOf(i.id)} onChange={(e) => set(i.id, e.target.value as IssueStatus)} className="h-8 bg-white border border-line rounded-lg px-2 text-xs text-ink focus:outline-none focus:border-brand">
                      {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                </div>
                {/* Body: issue, impact, action */}
                {!resolved && (
                  <dl className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-line text-sm">
                    {([["Issue", i.description, ""], ["Potential impact", i.impact, ""], ["Required action", i.action, "font-semibold"]] as const).map(([k, v, cls]) => (
                      <div key={k} className="px-4 py-2.5 min-w-0">
                        <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6B78] mb-1">{k}</dt>
                        <dd className={`text-ink leading-snug break-words ${cls}`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="rounded-xl border border-line px-4 py-6 text-center text-sm text-[#5B6B78]">No flags match these filters.</p>}
    </div>
  );
}

// ── Upload and review ──
// Honest steps: the file is stored and checked here; text extraction is not
// connected, so the fields are entered by the attorney and saved as such.
type Step = "idle" | "uploading" | "processing" | "review" | "done" | "failed";
const CATEGORIES: [string, Layer][] = [["Primary policy or declarations page", "Primary"], ["Excess policy", "Excess"], ["Umbrella policy", "Umbrella"]];
const ACCEPTED = /\.(pdf|docx?|jpe?g|png)$/i;
function UploadPolicy({ caseId, parties, onSaved }: { caseId: string; parties: { id: string; name: string }[]; onSaved: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [partyId, setPartyId] = useState("");
  const [cat, setCat] = useState(CATEGORIES[0][0]);
  const [step, setStep] = useState<Step>("idle");
  const [key, setKey] = useState<string | undefined>();
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const blank = { name: "", attachmentPoint: "", insurer: "", type: "", number: "", trigger: "Occurrence", start: "", end: "", perOccurrence: "", aggregate: "", deductible: "", sir: "", defense: "", namedInsured: "" };
  const [f, setF] = useState(blank);
  const [savedId, setSavedId] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const reset = () => { setFile(null); setStep("idle"); setKey(undefined); setErr(""); setSavedId(undefined); setF(blank); };
  const pick = (fl?: File | null) => {
    if (!fl) return;
    if (!ACCEPTED.test(fl.name)) return setErr("Use a PDF, DOCX, JPG or PNG file.");
    if (fl.size > 50 * 1024 * 1024) return setErr("Files up to 50 MB.");
    setErr(""); setFile(fl);
  };
  const upload = async () => {
    if (!file) return setErr("Choose a document first.");
    if (!partyId) return setErr("Choose the party this policy belongs to.");
    setErr(""); setStep("uploading");
    try {
      const k = await putMediaFile(file);
      setKey(k); setStep("processing");
      // Processing here is what the app can do: confirm the stored file reads back.
      const ok = k && (await fetchable(k));
      if (!ok) throw new Error("not stored");
      setF((x) => ({ ...x, namedInsured: parties.find((p) => p.id === partyId)?.name ?? "" }));
      setStep("review");
    } catch { setStep("failed"); }
  };
  const num = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const save = () => {
    if (!f.insurer.trim()) return setErr("Enter the insurer.");
    if (f.start && f.end && f.end <= f.start) return setErr("The period must end after it starts.");
    const id = `att:${Date.now()}`;
    const ok = addPolicy(caseId, {
      id, partyId, name: f.name.trim() || undefined, attachmentPoint: f.attachmentPoint.trim() || undefined, insurer: f.insurer.trim(), type: f.type.trim() || "Not stated", number: f.number.trim() || undefined,
      layer: CATEGORIES.find(([c]) => c === cat)?.[1] ?? "Primary", trigger: f.trigger, periodStart: f.start || undefined, periodEnd: f.end || undefined,
      perOccurrence: num(f.perOccurrence), aggregate: num(f.aggregate), deductible: f.deductible.trim() || undefined, sir: f.sir.trim() || undefined, defense: f.defense.trim() || undefined,
      policyholder: f.namedInsured.trim() || undefined, namedInsured: f.namedInsured.trim() || undefined, additionalInsureds: [], exclusions: [], conditions: [], provisions: [],
      source: { kind: "attorney", label: "Added by the attorney · fields entered from the document", file: file?.name, storageKey: key },
    });
    toast(ok ? "Policy saved. Every section now includes it." : "Saved for this session only. The browser didn't store it.");
    setSavedId(id); setStep("done"); setErr("");
  };
  const steps: [string, "done" | "active" | "skipped" | "todo" | "failed"][] = [
    ["Upload", step === "uploading" ? "active" : step === "failed" ? "failed" : step === "idle" ? "todo" : "done"],
    ["Stored in this browser", step === "processing" ? "active" : step === "review" || step === "done" ? "done" : "todo"],
    ["Automatic extraction · not connected", step === "review" || step === "done" ? "skipped" : "todo"],
    ["Review fields", step === "review" ? "active" : step === "done" ? "done" : "todo"],
    ["Saved", step === "done" ? "done" : "todo"],
  ];
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" aria-label="Upload progress">
        {steps.map(([s, state], i) => (
          <li key={s} className={`flex items-center gap-1.5 ${state === "done" || state === "active" ? "text-deep font-semibold" : state === "failed" ? "text-[#B91C1C] font-semibold" : "text-[#8A98A3]"}`}>
            {state === "done" ? <CheckCircle className="w-4 h-4" strokeWidth={2} /> : state === "active" ? <Loader2 className="w-4 h-4 animate-spin" /> : state === "failed" ? <X className="w-4 h-4" /> : <Circle className="w-4 h-4" strokeWidth={2} />}
            <span className={state === "skipped" ? "line-through" : ""}>{s}</span>{i < steps.length - 1 && <span className="w-5 h-px bg-line ml-1" />}
          </li>
        ))}
      </ol>

      {(step === "idle" || step === "uploading" || step === "processing" || step === "failed") && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${drag ? "border-brand bg-tint" : "border-line bg-wash"}`}>
            <FileText className="w-7 h-7 text-deep mx-auto mb-2" strokeWidth={1.5} />
            {file ? <p className="text-sm font-semibold text-ink break-all">{file.name} <span className="font-normal text-[#5B6B78]">· {(file.size / 1024 / 1024).toFixed(1)} MB</span></p> : <p className="text-sm text-ink">Drag a policy document here, or</p>}
            <button type="button" className={`${btn} mt-2`} onClick={() => fileRef.current?.click()}>{file ? "Choose another file" : "Choose file"}</button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <p className="text-xs text-[#5B6B78] mt-2">PDF, DOCX, JPG or PNG · up to 50 MB · stored in this browser</p>
          </div>
          <div className="space-y-3">
            <label className="block"><span className="eyebrow block mb-1">Party</span><select className={select} value={partyId} onChange={(e) => setPartyId(e.target.value)}><option value="">Choose…</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="block"><span className="eyebrow block mb-1">Document category</span><select className={select} value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map(([c]) => <option key={c}>{c}</option>)}</select></label>
            <button type="button" className={`${btnP} w-full justify-center h-9`} disabled={step === "uploading" || step === "processing"} onClick={upload}>
              {step === "uploading" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</> : step === "processing" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing…</> : <><Upload className="w-3.5 h-3.5" />Upload</>}
            </button>
            {step === "failed" && <p role="alert" className="text-xs text-[#B91C1C]">The file couldn't be stored in this browser. Try again or use a smaller file.</p>}
            {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-[#FDE6C8] bg-[#FFF7ED] px-3.5 py-2.5 text-sm text-ink"><b className="font-semibold">Needs review.</b> {file?.name} is stored. Automatic extraction isn't connected in this prototype, so enter the fields from the document. They are saved as attorney-entered.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([["name", "Policy name"], ["insurer", "Insurer *"], ["type", "Policy type"], ["number", "Policy number"], ["namedInsured", "Named insured"], ["perOccurrence", "Per-occurrence limit ($)"], ["aggregate", "Aggregate limit ($)"], ["deductible", "Deductible"], ["sir", "Self-insured retention"], ["defense", "Defense costs"], ...(cat === CATEGORIES[0][0] ? [] : [["attachmentPoint", "Attachment point"]])] as [keyof typeof f, string][]).map(([k, l]) => (
              <label key={k} className="block"><span className="eyebrow block mb-1">{l}</span><input className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={k === "perOccurrence" || k === "aggregate" ? "numeric" : undefined} /></label>
            ))}
            <label className="block"><span className="eyebrow block mb-1">Trigger</span><select className={select} value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value })}><option>Occurrence</option><option>Claims-made</option><option>Not stated</option></select></label>
            <label className="block"><span className="eyebrow block mb-1">Period start</span><input type="date" className={input} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
            <label className="block"><span className="eyebrow block mb-1">Period end</span><input type="date" className={input} value={f.end} min={f.start || undefined} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
          </div>
          {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={reset}>Cancel</button><button type="button" className={btnP} onClick={save}>Save policy</button></div>
        </div>
      )}

      {step === "done" && (
        <div className="lg-zone p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink"><CheckCircle className="inline w-4 h-4 text-[#15803D] mr-1.5 -mt-0.5" strokeWidth={1.75} /><b className="font-semibold">{f.insurer}</b> saved for {parties.find((p) => p.id === partyId)?.name}. Mapping, coverage, totals and flags now include it.</p>
          <div className="flex gap-2"><button type="button" className={btn} onClick={() => savedId && onSaved(savedId)}>View policy</button><button type="button" className={btnP} onClick={reset}>Add another</button></div>
        </div>
      )}
    </div>
  );
}

/** Whether a stored file can be read back. */
async function fetchable(key: string): Promise<boolean> {
  try { return !!(await getMediaFile(key)); } catch { return false; }
}
