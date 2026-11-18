import { useSyncExternalStore } from "react";
import { defendantsForCase, type Candidate } from "../defendants/defendantData";
import { liabilityForCase } from "../liability/liabilityData";
import { getDocumentContent, type DocumentContent } from "../components/documentText";
import type { CaseDocument } from "../types/case";

// ── Insurance analysis, per case ──────────────────────────────────────────────
// One record behind every section of the Insurance Policy Analysis: the parties
// (from the Defendant Analysis), the policies (read from the case's policy
// document, recorded by the analysis, or added by the attorney), the coverage
// reading of each policy, liens, and one list of issues that both the Action
// Items and All Flags views present.
//
// Rules this module keeps:
// - A figure comes from a document or an attorney entry. Where neither gives
//   it, the value is left undefined and the page says Not determined. The
//   illustrative example (buildSampleInsurance) is a separate data set, marked
//   `sample`, and is never merged into the case record.
// - Policy limits are never presented as available recovery.
// - No coverage is marked Applicable without an attorney confirming it.
// - A dependent is only linked to a policy when the attorney records that link.

export type Severity = "High" | "Medium" | "Low";
export type CoverageStatus = "Applicable" | "Potentially Applicable" | "Under Review" | "Not Applicable" | "Missing Information";
export type IssueStatus = "Open" | "In progress" | "Resolved";
export type Layer = "Primary" | "Excess" | "Umbrella" | "Not determined";
export type LienStatus = "Applies" | "Pending verification" | "Not applicable" | "To be confirmed";

export interface Party {
  id: string;
  name: string;
  /** Entity type: entity, individual, individuals by role, or not yet identified. */
  kind: string;
  role: string;
  /** Defendant Analysis candidate this party is; undefined for a party only on a policy. */
  candidateId?: string;
  recommendation?: string;
}

export interface Exclusion { name: string; status: string }

export interface Policy {
  id: string;
  partyId: string;
  insurer: string;
  type: string;
  number?: string;
  layer: Layer;
  /** Occurrence or claims-made, as the document states it — or what the record suggests. */
  trigger: string;
  periodStart?: string;
  periodEnd?: string;
  /** Retroactive date, for a claims-made form. */
  retroDate?: string;
  perOccurrence?: number;
  aggregate?: number;
  deductible?: string;
  sir?: string;
  defense?: string;
  policyholder?: string;
  namedInsured?: string;
  additionalInsureds: string[];
  exclusions: Exclusion[];
  conditions: string[];
  provisions: string[];
  /** Coverage status on the date of loss, as the document states it. */
  statusOnLoss?: string;
  /** Where the record comes from. */
  source: { kind: "document" | "record" | "attorney"; label: string; file?: string; storageKey?: string };
  /** The named insured's tie to the incident is not established on the record. */
  insuredUnlinked?: boolean;
  /** Illustrative sample data: shown labelled, never counted as a case fact. */
  sample?: boolean;
  /** Policy name as the declarations state it, e.g. "Personal Auto Policy". */
  name?: string;
  aggregateRemaining?: number;
  /** Who controls the defense below a self-insured retention. */
  defenseBelowSir?: string;
  /** Claims-made reporting requirement. */
  reporting?: string;
  /** Umbrella / excess terms. */
  attachmentPoint?: string;
  dropDown?: string;
  umbrellaType?: string;
  underlyingPolicyId?: string;
  /** Net amount available from this policy — only when the terms support computing it. */
  applicable?: { amount: number; estimate?: boolean; note: string };
  /** Demand-readiness facts supplied with the illustrative example. */
  badFaith?: { status: string; tone: "warn" | "ok"; concerns: string; evidence: string; checks: [string, boolean, string][]; action: string };
  endorsements?: string[];
}

export interface Dependent {
  id: string;
  name: string;
  relationship: string;
  partyId?: string;
  policyId?: string;
  /** Only "Confirmed by attorney" when the attorney says so. */
  coverage: "Not determined" | "Confirmed by attorney" | "Not covered";
}

export interface Lien {
  category: string;
  law: string;
  status: LienStatus;
  amount?: string;
  source: string;
  followUp: string;
}

export interface Issue {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  related: string;
  impact: string;
  action: string;
  /** Part of the illustrative example, not the case record. */
  sample?: boolean;
}

export interface CoverageReading {
  policyId: string;
  inPeriodRecord?: boolean;
  inPeriodEvidence?: boolean;
  status: CoverageStatus;
  reason: string;
  attachment: string;
  exclusionsNote: string;
}

export interface CaseInsurance {
  parties: Party[];
  policies: Policy[];
  dependents: Dependent[];
  liens: Lien[];
  issues: Issue[];
  coverage: CoverageReading[];
  incident: { recordIso?: string; evidenceIso?: string; recordSource?: string; evidenceSource?: string };
  /** Per-occurrence limits documented across all policies, summed only for display. */
  documentedLimits: { perOccurrence: number; aggregate: number; policies: number };
  /** Sample limits on the demo case, kept apart from documented ones. */
  sampleLimits: { perOccurrence: number; policies: number };
  /** The working limitations deadline the Jurisdiction review records, if any. */
  sol?: { iso: string; text: string };
}

// ── Browser-kept attorney input ──
interface Saved {
  issues: Record<string, { status: IssueStatus; at: string; by: string }>;
  policies: Policy[];
  dependents: Dependent[];
}
const KEY = "leco.insurance.v1";
const EMPTY: Saved = { issues: {}, policies: [], dependents: [] };
const listeners = new Set<() => void>();
function load(): Record<string, Saved> {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch { return {}; }
}
let db: Record<string, Saved> = typeof window === "undefined" ? {} : load();
/** Saves; false when the browser would not store it (it still holds for this session). */
function update(caseId: string, fn: (s: Saved) => Saved): boolean {
  db = { ...db, [caseId]: fn(db[caseId] ?? EMPTY) };
  listeners.forEach((l) => l());
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}
export function useInsuranceInput(caseId: string): Saved {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => db[caseId] ?? EMPTY);
}
export const ATTORNEY = "Jennifer Davis";
export const setIssueStatus = (caseId: string, id: string, status: IssueStatus) =>
  update(caseId, (s) => ({ ...s, issues: { ...s.issues, [id]: { status, at: new Date().toISOString(), by: ATTORNEY } } }));
export const addPolicy = (caseId: string, p: Policy) => update(caseId, (s) => ({ ...s, policies: [...s.policies, p] }));
export const removePolicy = (caseId: string, id: string) => update(caseId, (s) => ({ ...s, policies: s.policies.filter((p) => p.id !== id) }));
export const addDependent = (caseId: string, d: Dependent) => update(caseId, (s) => ({ ...s, dependents: [...s.dependents, d] }));
export const removeDependent = (caseId: string, id: string) => update(caseId, (s) => ({ ...s, dependents: s.dependents.filter((d) => d.id !== id) }));

// ── Reading the policy document on file ──
const money = (v?: string) => { const n = v ? Number(v.replace(/[^0-9.]/g, "")) : NaN; return Number.isFinite(n) && n > 0 ? n : undefined; };
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoOf(text?: string): string | undefined {
  const m = text && /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (!m || !MONTHS[m[1].toLowerCase()]) return undefined;
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
function fieldsOf(c: DocumentContent) {
  const f = new Map<string, string>();
  for (const b of c.blocks) if (b.type === "fields") for (const [k, v] of b.pairs) if (!f.has(k)) f.set(k, v);
  return f;
}
/** A line saying no exclusion applies is a provision, not an exclusion. */
const isExclusion = (e: string) => /exclusion/i.test(e) && !/^no\b/i.test(e);
function policyFromDocument(doc: CaseDocument, partyId: string, unlinked: boolean): Policy | undefined {
  const c = getDocumentContent(doc);
  const f = fieldsOf(c);
  if (!f.get("Carrier") && !f.get("Insurer")) return undefined;
  const heading = (c.blocks.find((b) => b.type === "heading") as { text: string } | undefined)?.text ?? "";
  const type = heading.replace(/\s*[—-]\s*DECLARATIONS\s*$/i, "").toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()) || "Not stated";
  const [start, end] = (f.get("Policy Period") ?? "").split(/\s*[–-]\s*/);
  const endorsements = (c.blocks.find((b, i) => b.type === "list" && c.blocks[i - 1]?.type === "heading" && /ENDORSEMENT/i.test((c.blocks[i - 1] as { text: string }).text)) as { items: string[] } | undefined)?.items ?? [];
  const named = f.get("Named Insured");
  return {
    id: `doc:${doc.name}`, partyId, insurer: f.get("Carrier") ?? f.get("Insurer")!, type,
    number: f.get("Policy No.") ?? f.get("Policy Number"), layer: "Primary",
    trigger: f.get("Each Occurrence Limit") ? "Occurrence (per the each-occurrence limit) · policy form not on file" : "Not stated",
    periodStart: isoOf(start), periodEnd: isoOf(end),
    perOccurrence: money(f.get("Each Occurrence Limit")), aggregate: money(f.get("General Aggregate")),
    deductible: f.get("Deductible"),
    policyholder: named, namedInsured: named,
    additionalInsureds: endorsements.filter((e) => /additional insured/i.test(e)).map((e) => e.replace(/^Additional insured\s*[—-]\s*/i, "").replace(/\.$/, "")),
    exclusions: endorsements.filter(isExclusion).map((e) => ({ name: e.replace(/\.$/, ""), status: "As stated on the declarations page" })),
    conditions: [], provisions: endorsements.filter((e) => !/additional insured/i.test(e) && !isExclusion(e)).map((e) => e.replace(/\.$/, "")),
    statusOnLoss: f.get("Status on Date of Loss"),
    source: { kind: "document", label: "Declarations page on file", file: doc.name },
    insuredUnlinked: unlinked,
  };
}

export const fmtMoney = (n: number) => "$" + n.toLocaleString("en-US");

type Incident = CaseInsurance["incident"];
/** Coverage reading: the period against both incident dates, then what the record leaves open. */
export function readCoverage(policies: Policy[], incident: Incident): CoverageReading[] {
  const within = (p: Policy, iso?: string) => (iso && p.periodStart && p.periodEnd ? iso >= p.periodStart && iso < p.periodEnd : undefined);
  return policies.map((p) => {
    const a = within(p, incident.recordIso), b = within(p, incident.evidenceIso);
    const hasPeriod = !!(p.periodStart && p.periodEnd);
    let status: CoverageStatus, reason: string;
    const limit = p.perOccurrence ?? p.applicable?.amount;
    if (!hasPeriod) { status = "Missing Information"; reason = "The policy period is not on file."; }
    else if (a === false && b === false) { status = "Not Applicable"; reason = "Neither incident date falls within the policy period."; }
    else if (a !== b && (a === false || b === false)) { status = "Under Review"; reason = "Only one of the two incident dates falls within the period."; }
    else if (p.insuredUnlinked) { status = "Under Review"; reason = "In period, but no record ties the named insured to the incident."; }
    else if (!limit) { status = "Under Review"; reason = "In period; the limits are not on file."; }
    // An excess or umbrella layer responds only above a primary layer that is known (from the same data set).
    else if ((p.layer === "Excess" || p.layer === "Umbrella") && !policies.some((q) => q.partyId === p.partyId && q.layer === "Primary" && q.perOccurrence && !!q.sample === !!p.sample)) { status = "Under Review"; reason = "Attaches above a primary layer whose limits are not documented."; }
    else { status = "Potentially Applicable"; reason = "In period, with limits stated. Not confirmed until the attorney reviews the form."; }
    return {
      policyId: p.id, inPeriodRecord: a, inPeriodEvidence: b, status, reason,
      attachment: p.layer === "Primary" ? "Primary · responds first" : p.layer === "Not determined" ? "Not determined" : `${p.layer} · ${p.attachmentPoint ?? "attaches above the primary layer"}`,
      exclusionsNote: p.exclusions.length ? `${p.exclusions.length} listed` : p.source.kind === "document" ? "None listed on the declarations page; the full form is not on file" : "Not on file",
    };
  });
}

export function buildCaseInsurance(caseId: string | undefined, documents: CaseDocument[], saved: Saved): CaseInsurance {
  const record = defendantsForCase(caseId);
  const liability = liabilityForCase(caseId ?? "");
  const incident = {
    recordIso: liability?.incidentOnRecord.iso, evidenceIso: liability?.incidentInEvidence.iso,
    recordSource: liability?.incidentOnRecord.source, evidenceSource: liability?.incidentInEvidence.source,
  };

  // Parties: the Defendant Analysis candidates, in its order.
  const parties: Party[] = (record?.candidates ?? []).map((c: Candidate) => ({
    id: c.id, name: c.name, candidateId: c.id, role: c.role, recommendation: c.recommendation,
    kind: c.identified === "Named" ? "Entity" : /not identified/i.test(c.role) ? "Not identified" : "Individuals (role only)",
  }));
  const findParty = (re: RegExp) => parties.find((p) => re.test(p.name));

  // Policies: the declarations on file, then a carrier the analysis records, then the attorney's.
  const policies: Policy[] = [];
  const policyDoc = documents.find((d) => { const f = fieldsOf(getDocumentContent(d)); return !!(f.get("Carrier") || f.get("Insurer")); });
  if (policyDoc) {
    const named = fieldsOf(getDocumentContent(policyDoc)).get("Named Insured") ?? "";
    let party = parties.find((p) => named && p.name.toLowerCase().startsWith(named.toLowerCase().replace(/\.$/, "")));
    if (!party && named) { party = { id: `insured:${named}`, name: named, kind: "Entity", role: "Named insured on the policy on file" }; parties.push(party); }
    // Its named insured has no shown tie to the incident when the analysis says so.
    const cand = record?.candidates.find((c) => c.id === party?.candidateId);
    const unlinked = !!cand && cand.elements.some((e) => e.kind === "duty" && e.status === "Not yet known");
    const p = party && policyFromDocument(policyDoc, party.id, unlinked);
    if (p) policies.push(p);
  }
  const carrier = record?.sources.find((s) => s.id === "analysis-summary")?.facts.find((f) => f.at === "Carrier")?.text;
  const facility = findParty(/facility/i);
  if (carrier && facility && !policies.some((p) => p.insurer === carrier)) {
    const base: Policy = {
      id: "record:facility-carrier", partyId: facility.id, insurer: carrier,
      type: /professional liability/i.test(carrier) ? "Professional liability (per the carrier's name)" : "Not stated",
      layer: "Not determined", trigger: "Not stated · policy not on file",
      additionalInsureds: [], exclusions: [], conditions: [], provisions: [],
      source: { kind: "record", label: "Recorded by the Defendant Analysis · policy not on file" },
    };
    policies.push(base);
  }
  policies.push(...saved.policies);

  const coverage = readCoverage(policies, incident);

  // Liens: categories with the governing law, all to be confirmed. Nothing here is an amount.
  const hospitalOnRecord = record?.sources.some((s) => s.id === "hospital-admission");
  const liens: Lien[] = [
    { category: "Medicare (Parts A/B)", law: "42 U.S.C. § 1395y(b)", status: "To be confirmed", source: "No Medicare information on file", followUp: "Confirm whether the client is Medicare-entitled." },
    { category: "Medicare Advantage", law: "42 U.S.C. § 1395w-22", status: "To be confirmed", source: "No plan information on file", followUp: "Confirm any Medicare Advantage enrollment." },
    { category: "Medicaid", law: "305 ILCS 5/11-22 · not verified", status: "Pending verification", source: "No Medicaid information on file", followUp: "Confirm whether Medicaid paid for care or facility residence." },
    { category: "ERISA self-funded plan", law: "29 U.S.C. § 1001 et seq.", status: "To be confirmed", source: "Health plan not identified", followUp: "Identify the client's health plan; request the plan document if employer-sponsored." },
    { category: "Fully insured health plan", law: "Illinois law · not verified", status: "To be confirmed", source: "Health plan not identified", followUp: "Same request as above." },
    { category: "Workers' compensation", law: "820 ILCS 305 · not verified", status: "Not applicable", source: "No work-related injury on the record", followUp: "None unless the record changes." },
    { category: "Hospital / provider liens", law: "770 ILCS 23 (Health Care Services Lien Act) · not verified", status: hospitalOnRecord ? "Pending verification" : "To be confirmed", source: hospitalOnRecord ? "Hospital admission cited by the Defendant Analysis" : "No hospital records on file", followUp: "Request lien notices and itemized bills from the treating providers." },
    { category: "Attorney's lien", law: "770 ILCS 5 (Attorneys Lien Act) · not verified", status: "Applies", source: "Contingency fee under the retainer", followUp: "Fee is computed from the recovery; serve notice per the Act if required." },
  ];

  // Issues: one record each; Action Items and All Flags both read this list.
  const issues: Issue[] = [];
  const pol = (fn: (p: Policy) => boolean) => policies.find(fn);
  const facilityPolicy = facility && pol((p) => p.partyId === facility.id && p.source.kind !== "attorney");
  if (facility && (!facilityPolicy || facilityPolicy.sample || !facilityPolicy.perOccurrence)) issues.push({
    id: "facility-policy", severity: "High", title: `${facility.name}: liability policy not on file`,
    description: !facilityPolicy ? "No carrier or policy is on record for the lead defendant."
      : facilityPolicy.sample ? `The Defendant Analysis records ${facilityPolicy.insurer}; the terms shown are sample data, not the policy.`
      : `The Defendant Analysis records ${facilityPolicy.insurer}; no policy, number or limits are on file.`,
    related: `${facility.name}${facilityPolicy ? ` · ${facilityPolicy.insurer}` : ""}`, impact: "Coverage for the lead defendant is unknown, so available coverage cannot be estimated.",
    action: "Request the facility's declarations page and policy, including any excess or umbrella.",
  });
  const unlinked = pol((p) => !!p.insuredUnlinked);
  if (unlinked) issues.push({
    id: "unlinked-insured", severity: "High", title: "Policy on file insures a party not tied to the incident",
    description: `${unlinked.insurer} insures ${unlinked.namedInsured}; no record links it to the facility or her care.`,
    related: `${unlinked.namedInsured} · ${unlinked.insurer}`, impact: "Its limits may not respond to this claim at all.",
    action: `Establish ${unlinked.namedInsured}'s connection to the facility before relying on this policy (see Evidence Conflicts EC-03).`,
  });
  const docPolicy = pol((p) => p.source.kind === "document");
  if (facilityPolicy && docPolicy && docPolicy.insurer !== facilityPolicy.insurer) issues.push({
    id: "carrier-conflict", severity: "Medium", title: "Case records name different carriers",
    description: `The Defendant Analysis names ${facilityPolicy.insurer}; the policy on file is from ${docPolicy.insurer}.`,
    related: "Insurance carrier", impact: "Notice and any demand could go to the wrong insurer.",
    action: "Confirm the facility's carrier with the facility or its broker (see Evidence Conflicts EC-05).",
  });
  if (facilityPolicy?.sample && /claims-made/i.test(facilityPolicy.trigger)) issues.push({
    id: "claims-made-notice", severity: "High", title: "Claims-made form: report the claim in the policy period",
    description: "The facility's policy is sampled as claims-made; a claim made after the period ends may not be covered.",
    related: `${facility!.name} · ${facilityPolicy.insurer}`, impact: "A late notice of claim could leave the lead defendant uninsured for this loss.",
    action: "Send a notice of claim to the facility and its carrier now, and confirm the form once the policy is obtained.",
  });
  if (incident.recordIso && incident.evidenceIso && incident.recordIso !== incident.evidenceIso) issues.push({
    id: "incident-date", severity: "Medium", title: "Incident date unresolved",
    description: `Case record ${fmtIso(incident.recordIso)}; evidence ${fmtIso(incident.evidenceIso)}.`,
    related: "All policies", impact: "Notice deadlines and any claims-made trigger run from the correct date.",
    action: "Confirm the date in the Liability Analysis, then re-check each policy period.",
  });
  issues.push({
    id: "health-coverage", severity: "Medium", title: "Lien framework incomplete",
    description: "The client's health coverage, Medicare and Medicaid status are not on file.",
    related: "Client · liens", impact: "Lien amounts and priority can't be set, so net recovery can't be estimated.",
    action: "Ask the client for health insurance details and any Medicare or Medicaid enrollment.",
  });
  if (docPolicy) issues.push({
    id: "policy-form", severity: "Low", title: "Only the declarations page is on file",
    description: `Exclusions, conditions and defense-cost terms for ${docPolicy.insurer} are not on file.`,
    related: `${docPolicy.namedInsured ?? docPolicy.insurer} · ${docPolicy.number ?? "policy"}`, impact: "An exclusion could remove coverage without being visible here.",
    action: "Request the complete policy with all endorsements.",
  });
  const staff = findParty(/staff/i);
  if (staff) issues.push({
    id: "staff-insured", severity: "Low", title: "Coverage for caregiving staff not determined",
    description: "Whether staff on duty were employees (likely insureds under the facility's policy) or agency staff is not documented.",
    related: staff.name, impact: "Agency staff may carry separate coverage through the agency.",
    action: "Request staffing and employment records for Feb 7, 2026.",
  });
  for (const p of saved.policies) if (!p.perOccurrence) issues.push({
    id: `limits:${p.id}`, severity: "Medium", title: `${p.insurer}: limits not entered`,
    description: "The policy was added without a per-occurrence limit.", related: `${p.insurer} · ${p.number ?? "added policy"}`,
    impact: "It can't be counted in the documented limits.", action: "Enter the limits from the declarations page.",
  });

  // Sample limits are kept apart: they are never documented limits.
  const withLimits = policies.filter((p) => p.perOccurrence && !p.sample);
  const sampled = policies.filter((p) => p.perOccurrence && p.sample);
  const deadline = record?.sources.find((s) => s.id === "jurisdiction-review")?.facts.find((f) => f.at === "Deadline")?.text;
  const solIso = isoOf(deadline);
  return {
    parties, policies, dependents: saved.dependents, liens, issues, coverage, incident,
    sol: solIso && deadline ? { iso: solIso, text: deadline } : undefined,
    documentedLimits: { perOccurrence: withLimits.reduce((n, p) => n + (p.perOccurrence ?? 0), 0), aggregate: withLimits.reduce((n, p) => n + (p.aggregate ?? 0), 0), policies: withLimits.length },
    sampleLimits: { perOccurrence: sampled.reduce((n, p) => n + (p.perOccurrence ?? 0), 0), policies: sampled.length },
  };
}

/** Policy and issue counts for the cards that open the analysis. */
export function useInsuranceSummary(caseId: string | undefined, documents: CaseDocument[]) {
  const saved = useInsuranceInput(caseId ?? "");
  const ins = buildCaseInsurance(caseId, documents, saved);
  const open = ins.issues.filter((i) => (saved.issues[i.id]?.status ?? "Open") !== "Resolved").length;
  return { policies: ins.policies.length, openIssues: open, meta: `${ins.policies.length} ${ins.policies.length === 1 ? "policy" : "policies"} · ${open} open ${open === 1 ? "issue" : "issues"}` };
}

export function fmtIso(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Illustrative sample ──────────────────────────────────────────────────────
// The original module's two-defendant, three-policy example, used only to show
// the full layout (primary, umbrella, SIR, applicable limits). Every record is
// marked `sample`, kept in its own data set and never merged with the case
// record. Its parties, insurers, numbers and limits are not case facts.
const SAMPLE_SRC = { kind: "record" as const, label: "Illustrative sample · original Insurance Analysis reference" };
export function buildSampleInsurance(incident: CaseInsurance["incident"]) {
  const parties: Party[] = [
    { id: "sample:chen", name: "David Chen", kind: "Individual", role: "Individual driver" },
    { id: "sample:abc", name: "ABC Logistics Inc.", kind: "Corporation", role: "Employer / fleet owner" },
  ];
  const base = { additionalInsureds: [], conditions: [], provisions: [], sample: true, source: SAMPLE_SRC };
  const policies: Policy[] = [
    {
      ...base, id: "sample:sf-auto", partyId: "sample:chen", name: "State Farm Personal Auto Policy", insurer: "State Farm Mutual Automobile Insurance Co.",
      type: "Personal auto", number: "SF-78234-NY", layer: "Primary", trigger: "Occurrence", periodStart: "2024-01-01", periodEnd: "2027-01-01",
      perOccurrence: 100_000, aggregate: 300_000, aggregateRemaining: 300_000, deductible: "None / $0", defense: "Outside limits · not eroded",
      namedInsured: "David Chen", policyholder: "David Chen",
      exclusions: [{ name: "Intentional acts", status: "Standard · applies" }, { name: "Criminal acts", status: "Standard · applies" }, { name: "DUI exclusion rider", status: "Not confirmed · verify" }, { name: "Commercial use", status: "N/A · personal vehicle" }],
      applicable: { amount: 100_000, note: "Net available · no SIR · defense outside limits" },
      badFaith: {
        status: "Premature · demand not served", tone: "warn",
        concerns: "Damages may exceed the $100,000 limit; no refusal to settle is on record.",
        evidence: "None yet. Medical records and special damages are incomplete.",
        checks: [["Medical records complete", false, "Treatment ongoing"], ["Special damages quantified", false, "Not until treatment ends"], ["Liability supported", true, "Driver at fault per the example"], ["Expert / IME reports", false, "Not obtained"], ["Policy limit confirmed", true, "$100,000 per the declarations"]],
        action: "Complete the medical record, then serve a policy-limits demand with a stated deadline.",
      },
    },
    {
      ...base, id: "sample:trv-auto", partyId: "sample:abc", name: "Travelers Commercial Auto", insurer: "Travelers Indemnity Company",
      type: "Commercial auto", number: "TRV-COM-99341-NY", layer: "Primary", trigger: "Occurrence", periodStart: "2025-04-01", periodEnd: "2026-04-01",
      perOccurrence: 1_000_000, aggregate: 1_000_000, aggregateRemaining: 1_000_000, sir: "$50,000", defenseBelowSir: "ABC Logistics controls", defense: "Outside limits · not eroded",
      namedInsured: "ABC Logistics Inc.", policyholder: "ABC Logistics Inc.", exclusions: [],
      applicable: { amount: 950_000, estimate: true, note: "Net of $50K SIR · insurer controls after the SIR is exhausted" },
      badFaith: {
        status: "Not indicated · limits above exposure", tone: "ok",
        concerns: "None. Total coverage exceeds the example's estimated exposure.",
        evidence: "No insurer communications in the example.",
        checks: [["Liability supported", true, "Employer of the driver"], ["Policy limit confirmed", true, "$1,000,000 per the declarations"], ["SIR exhaustion documented", false, "Process not confirmed"]],
        action: "Settle within available limits; serve demands above $50K on both ABC Logistics and Travelers.",
      },
    },
    {
      ...base, id: "sample:trv-umb", partyId: "sample:abc", name: "Travelers True Umbrella", insurer: "Travelers Indemnity Company",
      type: "True umbrella", layer: "Umbrella", trigger: "Occurrence", periodStart: "2025-04-01", periodEnd: "2026-04-01",
      perOccurrence: 5_000_000, deductible: "None", defense: "Outside limits · not eroded", attachmentPoint: "Excess of $1M primary",
      dropDown: "Yes · drops down", umbrellaType: "True umbrella, not excess-only", underlyingPolicyId: "sample:trv-auto",
      namedInsured: "ABC Logistics Inc.", policyholder: "ABC Logistics Inc.", exclusions: [],
      applicable: { amount: 5_000_000, note: "Attaches above the $1M primary" },
      badFaith: {
        status: "Not indicated · limits above exposure", tone: "ok",
        concerns: "None on record.", evidence: "No insurer communications in the example.",
        checks: [["Underlying primary identified", true, "Travelers Commercial Auto"], ["Umbrella limit confirmed", true, "$5,000,000"]],
        action: "Revisit only if the injury evidence suggests exposure near the full tower.",
      },
    },
  ];
  const issues: Issue[] = [
    { id: "sample:bf-premature", severity: "Medium", sample: true, title: "Bad faith demand premature · medical records incomplete", related: "David Chen · State Farm ($100,000)", description: "The $100,000 limit may be exceeded, but the medical record is incomplete, so a proper limits demand cannot be served yet.", impact: "The demand deadline has not started; delay pushes back any bad faith timeline.", action: "Complete the medical record, then serve a policy-limits demand with a stated deadline." },
    { id: "sample:sir", severity: "Medium", sample: true, title: "$50,000 self-insured retention controls early defense", related: "ABC Logistics Inc. · Travelers Commercial Auto", description: "ABC Logistics controls its defense below the SIR; Travelers steps in only once it is exhausted.", impact: "Offers under $50K come from ABC directly; two sets of counsel may need coordinating.", action: "Confirm the SIR exhaustion process and serve demands above $50K on both ABC Logistics and Travelers." },
    { id: "sample:dui-rider", severity: "Low", sample: true, title: "DUI exclusion rider not confirmed", related: "David Chen · State Farm", description: "Whether the personal auto policy carries a DUI exclusion rider is not confirmed.", impact: "A rider could narrow coverage if impairment is alleged.", action: "Request the full policy with all endorsements." },
  ];
  return { parties, policies, issues, coverage: readCoverage(policies, incident) };
}
