import { useSyncExternalStore } from "react";

// ── Attorney decisions on evidence conflicts, per case ──────────────────────
// Kept in this browser. A conflict is "Decided" only once the attorney records
// a decision; nothing is decided automatically. Every recorded change stays in
// the conflict's history. Suggested next steps checked off are kept here too.

export interface ConflictDecision {
  choice: string;
  owner?: string;
  note?: string;
  by: string;
  at: string;
  history: { choice: string; owner?: string; note?: string; by: string; at: string }[];
}
interface CaseDecisions {
  items: Record<string, ConflictDecision>;
  /** Next steps marked done: "EC-01:client" → ISO time. */
  steps: Record<string, string>;
}

const KEY = "leco.evidenceConflicts.v2";
export const ATTORNEY = "Jennifer Davis";
const EMPTY: CaseDecisions = { items: {}, steps: {} };
const listeners = new Set<() => void>();

function load(): Record<string, CaseDecisions> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
let all: Record<string, CaseDecisions> = typeof window === "undefined" ? {} : load();

/** Saves; returns false when the browser would not store it (it still holds for this session). */
function update(caseId: string, fn: (d: CaseDecisions) => CaseDecisions): boolean {
  all = { ...all, [caseId]: fn(all[caseId] ?? EMPTY) };
  listeners.forEach((l) => l());
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; }
}

export function useConflictDecisions(caseId: string): CaseDecisions {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => all[caseId] ?? EMPTY,
  );
}

export function recordConflictDecision(caseId: string, conflictId: string, d: { choice: string; owner?: string; note?: string }): boolean {
  const entry = { choice: d.choice, owner: d.owner || undefined, note: d.note?.trim() || undefined, by: ATTORNEY, at: new Date().toISOString() };
  return update(caseId, (c) => ({ ...c, items: { ...c.items, [conflictId]: { ...entry, history: [...(c.items[conflictId]?.history ?? []), entry] } } }));
}

export function toggleConflictStep(caseId: string, key: string): boolean {
  return update(caseId, (c) => {
    const { [key]: was, ...rest } = c.steps;
    return { ...c, steps: was ? rest : { ...rest, [key]: new Date().toISOString() } };
  });
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
