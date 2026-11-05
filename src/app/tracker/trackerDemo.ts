import { type CaseCtx, type DocRequest, type MailMsg, type ReqStatus, letterOf, subjectOf, ownerEmail, addDays, today, iso } from "./trackerData";
import type { CaseState } from "./trackerStore";
import type { IntakeRequest } from "../intake/intakeRequestStore";
import type { CaseDocument } from "../types/case";

// ── Document Tracker records for the plaintiff firm ─────────────────────────
// Two sources. The Collection stage's intake requests to the client are real
// records and are mirrored here (see intakeRecords). For the Estate of Miller
// demo case, a few requests to the case's own third parties — its treating
// hospital, the facility and the facility's insurer — are added as samples,
// marked demo: they were never sent, and no reply from anyone is invented.
// Bump DEMO_VERSION when the sample set changes so an older one is replaced.

const DEMO_CASES = new Set(["PI-2024-001"]);
export const DEMO_VERSION = 1;
const JD = "Jennifer Davis";
/** Sample dates relative to today, so the overview stays meaningful. */
const rel = (days: number) => iso(addDays(today(), days));

export function buildDemoTracker(ctx: CaseCtx): (CaseState & { demoVersion: number }) | undefined {
  if (!DEMO_CASES.has(ctx.caseId)) return undefined;
  const base = { pages: 0, cost: 0, files: [], reviewed: false, auto: true, demo: true, owner: JD, range: "Feb 2026 – present" };
  const requests: DocRequest[] = [
    {
      ...base, id: "S01", title: "Hospital admission records", cat: "Medical records", type: "Hospital and ER",
      to: "Cook County Medical Center", contact: "", docs: ["ER admission record", "Triage notes"],
      method: "Authorization", channel: "Fax", status: "Sent", priority: "High",
      createdAt: rel(-21), sent: rel(-20), due: rel(-6),
      notes: "Cited by the Defendant Analysis but not in the case documents.",
      log: [{ at: rel(-21), text: "Request created" }, { at: rel(-20), text: "Sent by fax" }],
    },
    {
      ...base, id: "S02", title: "Facility call log and caregiver records", cat: "Defendant discovery", type: "Document production",
      to: "Memory Care Facility LLC", contact: "", docs: ["Facility call log", "Caregiver log", "Facility incident report"],
      method: "Authorization", channel: "Certified mail", status: "Sent", priority: "High",
      createdAt: rel(-11), sent: rel(-10), due: rel(4),
      notes: "Records request with a preservation letter. The findings marked Shown rest on these records.",
      log: [{ at: rel(-11), text: "Request created" }, { at: rel(-10), text: "Sent by certified mail" }],
    },
    {
      ...base, id: "S03", title: "Insurance policy and declarations", cat: "Insurance & prior claims", type: "Claims database",
      to: ctx.insurer ?? "The facility's liability insurer", contact: "", docs: ["Insurance policy", "Declarations page"],
      method: "Request to adjuster", channel: "Email", status: "Draft", priority: "Normal", auto: false,
      createdAt: rel(-2),
      notes: "The carrier is named on the Case Intelligence Summary; the policy itself is not on file.",
      log: [{ at: rel(-2), text: "Saved as draft" }],
    },
  ];

  let mseq = 0;
  const mail: MailMsg[] = [];
  const out = (r: DocRequest, dir: "out" | "draft", at: string) =>
    mail.push({ id: "M" + String(++mseq).padStart(3, "0"), rid: r.id, dir, kind: dir === "out" ? "Request" : "Draft", fromN: r.owner, fromE: ownerEmail(r.owner),
      toN: r.to, toE: r.contact, at, subject: subjectOf(r, ctx), body: letterOf(r, ctx), att: [], unread: false, replied: false, demo: true });
  out(requests[0], "out", requests[0].sent!);
  out(requests[1], "out", requests[1].sent!);
  out(requests[2], "draft", requests[2].createdAt);

  return { requests, mail, seq: 0, mseq, demoVersion: DEMO_VERSION };
}

/** The Collection intake requests sent to the client, as tracker records.
 *  Status comes from the request itself: answered with items still missing
 *  is partly returned; answered in full is received; otherwise it waits on
 *  the client. Received files are the client's own submitted documents. */
export function intakeRecords(ctx: CaseCtx, intake: IntakeRequest[], documents: CaseDocument[]): { requests: DocRequest[]; mail: MailMsg[] } {
  const requests: DocRequest[] = [];
  const mail: MailMsg[] = [];
  for (const q of intake) {
    if (q.removedAt || q.status === "Draft") continue;
    const answered = (q.submissions?.length ?? 0) > 0 || q.status === "Completed";
    const missing = q.missingDocs ?? 0;
    const status: ReqStatus = !answered ? "Waiting on plaintiff" : missing > 0 ? "Partially received" : "Received";
    const clientDocs = documents.filter((d) => d.requestId === q.id || (!q.submissions?.length && answered && d.source === "Plaintiff"));
    const lastSubmission = q.submissions?.[q.submissions.length - 1]?.submittedAt;
    const recipient = (q.deliveryMethod === "sms" ? q.recipientPhone : q.recipientEmail) ?? "";
    const r: DocRequest = {
      id: q.id, intakeId: q.id, title: q.followUpOf ? `Follow-up to ${q.followUpOf}` : "Client intake documents",
      cat: "Client documents", type: "Intake request", to: q.plaintiff, contact: recipient,
      docs: q.requestedDocs, range: "As requested", method: "Client request", channel: q.deliveryMethod === "sms" ? "SMS" : "Email",
      sent: q.lastSentAt, received: answered ? lastSubmission : undefined, status,
      pages: 0, cost: 0, owner: q.sender.name, files: clientDocs.map((d) => ({ name: d.name, pages: 0, storageKey: d.storageKey })),
      reviewed: false, auto: false, createdAt: q.createdAt, priority: "High",
      notes: `Mirrors ${q.id} from the Collection stage. Update it there.`,
      log: [
        { at: q.createdAt, text: `Intake request ${q.id} created and sent by ${q.deliveryMethod === "sms" ? "SMS" : "email"}` },
        ...(answered ? [{ at: lastSubmission ?? q.lastSentAt, text: lastSubmission ? "Client submitted documents" : "Client response recorded (time not recorded)" }] : []),
        ...(missing ? [{ at: lastSubmission ?? q.lastSentAt, text: `${missing} requested item${missing === 1 ? "" : "s"} still outstanding` }] : []),
      ],
    };
    requests.push(r);
    mail.push({ id: `MI-${q.id}`, rid: r.id, dir: "out", kind: "Request", fromN: q.sender.name, fromE: ownerEmail(q.sender.name), toN: q.plaintiff, toE: recipient,
      at: q.createdAt, subject: subjectOf(r, ctx), body: letterOf(r, ctx), att: [], unread: false, replied: false });
    if (answered) {
      mail.push({ id: `MR-${q.id}`, rid: r.id, dir: "in", kind: "Response", fromN: q.plaintiff, fromE: recipient, toN: q.sender.name, toE: ownerEmail(q.sender.name),
        at: lastSubmission ?? q.lastSentAt, subject: `Re: ${subjectOf(r, ctx)}`,
        body: `Recorded from the Collection stage: ${q.plaintiff} submitted documents for ${q.id}.${missing ? ` ${missing} requested item${missing === 1 ? " is" : "s are"} still outstanding.` : ""} Email isn't connected, so this is a note of the submission, not the message itself.`,
        att: clientDocs.map((d) => ({ name: d.name, pages: 0 })), unread: false, replied: false });
    }
  }
  return { requests, mail };
}
