import { defendantsForCase } from "../defendants/defendantData";
import { getDocumentContent, type DocumentContent } from "../components/documentText";
import type { CaseDocument } from "../types/case";

// ── Evidence conflicts, read from the case's own record ──────────────────────
// Every statement here is quoted from something the case already holds: the
// case record and caption, the Stage 2 analysis, the sources the Defendant
// Analysis cites, and the text of the documents on file. Nothing is written to
// fill a side. A conflict is listed only when two of those sources actually
// disagree; where the defendant's own account is not on file, its side stays
// empty and says so. Context notes are either facts read from those sources
// ("source") or the existing jurisdiction / liability analysis ("analysis").

export type Topic = "Incident" | "Parties" | "Injury" | "Insurance";
export type Severity = "Critical" | "Major" | "Minor";
export type Effect = "Hurts our client" | "Helps our client" | "Mixed";
/** Whose account a source gives: ours, the defendant's, or a third party's record. */
export type Side = "plaintiff" | "defendant" | "record";

export const TOPICS: Topic[] = ["Incident", "Parties", "Injury", "Insurance"];
export const SEVERITIES: Severity[] = ["Critical", "Major", "Minor"];
export const EFFECTS: Effect[] = ["Hurts our client", "Helps our client", "Mixed"];

/** Matrix columns: kinds of source, in the order they are read. */
export const SOURCE_GROUPS = ["Case record", "Our analysis", "Documents on file", "Facility records", "Medical records"] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

export interface Source {
  id: string;
  title: string;
  type: string;
  group: SourceGroup;
  side: Side;
  date?: string;
  /** The case document it is read from, when it is on file. */
  file?: string;
  /** Files the record cites but the case documents do not hold. */
  citedFiles?: string[];
  /** Who put it in the case file, for documents on file. */
  submittedBy?: string;
  /** What kind of source it is — never a judgment of its credibility. */
  traits: string[];
}

export interface Statement {
  id: string;
  sourceId: string;
  /** Where in the source, e.g. "Caption" or "Narrative". */
  at?: string;
  text: string;
}

export interface Note { basis: "source" | "analysis"; text: string }

export interface Conflict {
  id: string;
  topic: Topic;
  severity: Severity;
  effect: Effect;
  /** The disputed fact, short — the matrix row. */
  fact: string;
  title: string;
  summary: string;
  /** Both conflicting accounts come from the plaintiff's own side. */
  selfContradiction: boolean;
  statements: Statement[];
  /** Facts and analysis that bear on how much weight each side gets. */
  context: Note[];
  /** Why it matters to the plaintiff's case. */
  why: string[];
  /** Attorney review tasks, checked off on the page. */
  steps: { id: string; text: string }[];
}

export interface CaseConflicts {
  sources: Source[];
  conflicts: Conflict[];
}

const fieldOf = (c: DocumentContent, key: string) => {
  for (const b of c.blocks) if (b.type === "fields") { const p = b.pairs.find(([k]) => k === key); if (p) return p[1]; }
  return undefined;
};
const afterHeading = (c: DocumentContent, heading: string) => {
  const i = c.blocks.findIndex((b) => b.type === "heading" && b.text === heading);
  const next = i >= 0 ? c.blocks[i + 1] : undefined;
  return next?.type === "paragraph" ? next.text : undefined;
};
const firstHeading = (c: DocumentContent) => (c.blocks.find((b) => b.type === "heading") as { text: string } | undefined)?.text;
const isNote = (n: Note | undefined | false | ""): n is Note => !!n && !!n.text;

export function conflictsForCase(caseId: string | undefined, documents: CaseDocument[]): CaseConflicts {
  const record = defendantsForCase(caseId);
  if (!record) return { sources: [], conflicts: [] };
  const onFile = new Set(documents.map((d) => d.name));
  const recordSrc = (id: string) => record.sources.find((s) => s.id === id);
  const recordFact = (id: string, match: RegExp) => recordSrc(id)?.facts.find((x) => match.test(`${x.at ?? ""} ${x.text}`))?.text;

  const sources: Source[] = [];
  const addSource = (s: Source) => { if (!sources.some((x) => x.id === s.id)) sources.push(s); return s.id; };

  // A fact the Defendant Analysis records from one of its sources.
  const SIDE_OF: Record<string, [SourceGroup, Side, string[]]> = {
    "case-record": ["Case record", "plaintiff", ["Our case record"]],
    "analysis-summary": ["Our analysis", "plaintiff", ["Our work product"]],
    "caregiver-log": ["Facility records", "defendant", ["Defendant's record"]],
    "facility-incident-report": ["Facility records", "defendant", ["Defendant's record"]],
    "facility-call-log": ["Facility records", "defendant", ["Defendant's record"]],
    "hospital-admission": ["Medical records", "record", ["Treating provider"]],
    "imaging": ["Medical records", "record", ["Treating provider"]],
    "rehab-records": ["Medical records", "record", ["Treating provider"]],
  };
  const fact = (srcId: string, match: RegExp): Statement | undefined => {
    const src = recordSrc(srcId);
    const f = src?.facts.find((x) => match.test(`${x.at ?? ""} ${x.text}`));
    if (!src || !f || !SIDE_OF[srcId]) return undefined;
    const [group, side, traits] = SIDE_OF[srcId];
    const held = src.files.filter((n) => onFile.has(n));
    const cited = src.files.filter((n) => !onFile.has(n));
    addSource({
      id: src.id, title: srcId === "analysis-summary" ? "Stage 2 analysis, as the Defendant Analysis records it" : src.name,
      type: src.type, group, side, date: src.date, file: held[0], citedFiles: cited,
      traits: [...traits, ...(src.files.length && !held.length ? ["Cited, not on file"] : [])],
    });
    return { id: `${src.id}:${f.text.slice(0, 24)}`, sourceId: src.id, at: f.at, text: f.text };
  };

  // A statement read from the text of a document on file.
  const docs = documents.map((d) => ({ d, c: getDocumentContent(d) }));
  const findDoc = (test: (c: DocumentContent) => boolean) => docs.find(({ c }) => test(c));
  const fromDoc = (test: (c: DocumentContent) => boolean, read: (c: DocumentContent) => string | undefined, at: string, type: string): Statement | undefined => {
    const hit = docs.find(({ c }) => test(c) && read(c));
    if (!hit) return undefined;
    const id = `doc:${hit.d.name}`;
    const by = hit.d.source === "Plaintiff" ? "the client" : "our office";
    addSource({ id, title: hit.d.name, type, group: "Documents on file", side: "plaintiff", date: hit.d.date, file: hit.d.name, submittedBy: by,
      traits: [hit.d.source === "Plaintiff" ? "Client-submitted" : "Obtained by our office"] });
    return { id: `${id}:${at}`, sourceId: id, at, text: read(hit.c)! };
  };
  const heading = (re: RegExp) => (c: DocumentContent) => re.test(firstHeading(c) ?? "");

  const conflicts: Conflict[] = [];
  const add = (c: Omit<Conflict, "statements" | "context"> & { context: (Note | undefined | false | "")[] }, statements: (Statement | undefined)[]) => {
    const st = statements.filter((s): s is Statement => !!s);
    // Two different sources must be on file for the disagreement to be real.
    if (new Set(st.map((s) => s.sourceId)).size < 2) return;
    conflicts.push({ ...c, context: c.context.filter(isNote), statements: st });
  };

  const dispatchDate = recordSrc("dispatch-record")?.date;
  const deadline = recordFact("jurisdiction-review", /Deadline/);
  add({
    id: "EC-01", topic: "Incident", severity: "Critical", effect: "Hurts our client", selfContradiction: false,
    fact: "Date of the incident", title: "Our record gives Feb 14; the facility's own records give Feb 7",
    summary: "The case record dates the incident Feb 14, 2026; the facility's records place the stroke on Feb 7, 2026.",
    context: [
      dispatchDate && { basis: "source", text: `Emergency dispatch record dated ${dispatchDate}.` },
      { basis: "source", text: "The case record cites no document for Feb 14." },
      deadline && { basis: "analysis", text: `${deadline}.` },
    ],
    why: [
      "The limitations period runs from the earlier date until the attorney confirms which one is correct.",
      "A wrong date in a demand or complaint invites impeachment with the facility's own records.",
    ],
    steps: [
      { id: "client", text: "Confirm the date of the incident with the client" },
      { id: "records", text: "Obtain the caregiver log, incident report and hospital admission records" },
      { id: "fix", text: "Correct the case record once the date is confirmed" },
      { id: "deadline", text: "Re-check the limitations deadline against the confirmed date" },
    ],
  }, [
    fact("case-record", /Incident/),
    fact("caregiver-log", /Facial droop/),
    fact("facility-incident-report", /Stroke signs/),
    fact("hospital-admission", /Admitted/),
  ]);

  const deathDoc = documents.find((d) => /death|estate|letters|probate|executor|administrat/i.test(d.name));
  add({
    id: "EC-02", topic: "Parties", severity: "Critical", effect: "Hurts our client", selfContradiction: false,
    fact: "Whether the plaintiff is living", title: "The case is styled as an estate, but the treatment records show the plaintiff living",
    summary: "The caption reads \"Estate of Miller\", but the rehabilitation records show the plaintiff in treatment through May 2026.",
    context: [
      { basis: "source", text: deathDoc ? `${deathDoc.name} is on file.` : "No death certificate or estate document is on file." },
      { basis: "source", text: "Evelyn Miller answers the intake requests herself." },
      { basis: "analysis", text: "A death not yet on record would change the parties, claims and deadlines." },
    ],
    why: [
      "If the caption reflects a death not yet on record, the parties, the claims available and their deadlines all change.",
      "If it does not, the caption is wrong and must be corrected before anything is filed or sent.",
    ],
    steps: [
      { id: "status", text: "Confirm the client's status and who holds authority to bring the claim" },
      { id: "caption", text: "Correct the caption, or obtain the estate documents if it is right" },
    ],
  }, [
    fact("case-record", /Caption/),
    fact("rehab-records", /Rehabilitation began/),
  ]);

  const description = recordFact("case-record", /Description/);
  add({
    id: "EC-03", topic: "Parties", severity: "Major", effect: "Hurts our client", selfContradiction: true,
    fact: "Who the defendant is", title: "The caption names Logistics Co.; the Analysis names Memory Care Facility LLC",
    summary: "The caption and the policy on file name Logistics Co.; the Analysis identifies Memory Care Facility LLC.",
    context: [
      description && { basis: "source", text: `Case description: "${description}".` },
      { basis: "analysis", text: "The facility's licensing type is not on record." },
    ],
    why: [
      "The correct entity decides who is served, whose insurer is put on notice, and the venue.",
      "Both names come from our own file, so the inconsistency is ours to resolve.",
    ],
    steps: [
      { id: "entity", text: "Search the state business registry for the facility's legal name" },
      { id: "relation", text: "Establish whether Logistics Co. has any connection to the facility" },
      { id: "caption", text: "Correct the caption and the case record" },
    ],
  }, [
    fact("case-record", /Caption/),
    fact("analysis-summary", /Defendant/),
    fromDoc((c) => !!fieldOf(c, "Named Insured"), (c) => fieldOf(c, "Named Insured") && `Named Insured: ${fieldOf(c, "Named Insured")}`, "Declarations", "Insurance policy"),
  ]);

  const mvaDocs = documents.filter((d) => /motor vehicle|collision|MVC/i.test(getDocumentContent(d).blocks.map((b) => "text" in b ? b.text : "items" in b ? b.items.join(" ") : b.pairs.flat().join(" ")).join(" ")));
  add({
    id: "EC-04", topic: "Injury", severity: "Critical", effect: "Hurts our client", selfContradiction: true,
    fact: "What happened and the injury", title: "Documents on file describe a traffic collision; the case is a facility stroke claim",
    summary: "The case record describes a stroke at a care facility; the police report, hospital record and therapy notes on file describe a car crash.",
    context: [
      mvaDocs.length > 0 && { basis: "source", text: `${mvaDocs.length} of ${documents.length} case documents describe a vehicle collision.` },
      { basis: "source", text: "The stroke records the analysis relies on are cited, not on file." },
      { basis: "analysis", text: "The Liability Analysis sets the collision signals aside." },
    ],
    why: [
      "Documents that describe a different incident cannot support this claim, and in a demand package they undermine it.",
      "Either the wrong documents are on file for this case, or the case record is wrong. Confirm with the client before relying on either.",
    ],
    steps: [
      { id: "client", text: "Confirm with the client which incident these documents belong to" },
      { id: "remove", text: "Remove documents that belong to another matter from this case" },
      { id: "records", text: "Request the stroke-related medical records" },
    ],
  }, [
    fact("case-record", /Description/),
    fact("imaging", /stroke/),
    fromDoc(heading(/TRAFFIC COLLISION/), (c) => afterHeading(c, "NARRATIVE"), "Narrative", "Police report"),
    fromDoc(heading(/EMERGENCY DEPARTMENT/), (c) => afterHeading(c, "CHIEF COMPLAINT"), "Chief complaint", "Hospital record"),
    fromDoc(heading(/PHYSICAL THERAPY/), (c) => fieldOf(c, "Plan of Care") && `Plan of care: ${fieldOf(c, "Plan of Care")}`, "Plan of care", "Therapy notes"),
  ]);

  const policy = findDoc((c) => !!fieldOf(c, "Carrier"))?.c;
  add({
    id: "EC-05", topic: "Insurance", severity: "Major", effect: "Mixed", selfContradiction: true,
    fact: "The liability insurer", title: "The Defendant Analysis names one carrier; the policy on file names another",
    summary: "The Defendant Analysis names ABC Professional Liability Insurance; the policy on file names Sentinel Casualty Insurance.",
    context: [
      policy && fieldOf(policy, "Policy Period") && { basis: "source", text: `Policy period ${fieldOf(policy, "Policy Period")}.` },
      policy && fieldOf(policy, "Named Insured") && { basis: "source", text: `Named insured: ${fieldOf(policy, "Named Insured")} (see EC-03).` },
      { basis: "analysis", text: "The policy on file may belong to a different defendant." },
    ],
    why: [
      "Notice and the demand must go to the insurer that actually covers the defendant.",
      "The policy on file may belong to a different insured (see EC-03).",
    ],
    steps: [
      { id: "confirm", text: "Ask the facility for its liability carrier and policy declarations" },
      { id: "notice", text: "Send notice of claim once the carrier is confirmed" },
    ],
  }, [
    fact("analysis-summary", /Carrier/),
    fromDoc((c) => !!fieldOf(c, "Carrier"), (c) => fieldOf(c, "Carrier") && `Carrier: ${fieldOf(c, "Carrier")}`, "Declarations", "Insurance policy"),
  ]);

  // Only sources a listed conflict quotes are counted and shown.
  const used = new Set(conflicts.flatMap((c) => c.statements.map((s) => s.sourceId)));
  return { sources: sources.filter((s) => used.has(s.id)), conflicts };
}
