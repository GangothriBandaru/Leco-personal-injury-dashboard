import { ChevronLeft, Sparkles } from "lucide-react";

export type Tone = "positive" | "warning" | "critical" | "info";

// ── Shared pieces for the insurance pages ─────────────────────────────────────
// Everything here maps onto the product's existing classes — pills, cards,
// eyebrows, the AI callout — so the insurance pages read as part of Case Intake
// rather than as a separate tool. No colour is introduced that the rest of the
// app does not already use.

// Tone → the existing semantic pill. positive/warning/critical/info are the
// product's complete/progress/risk/neutral.
export const TONE_PILL: Record<Tone, string> = {
  positive: "pill pill-complete",
  warning: "pill pill-progress",
  critical: "pill pill-risk",
  info: "pill pill-neutral",
};

// Tone → the text colour those pills use, for a value shown without a pill.
export const TONE_TEXT: Record<Tone, string> = {
  positive: "text-[#15803D]",
  warning: "text-[#B45309]",
  critical: "text-[#B91C1C]",
  info: "text-ink",
};

// The breadcrumb bar every Case Intake page carries: a back action on the left,
// the trail on the right. Inside the Case Workspace it sits in the page content,
// under the workspace's own sticky header, rather than as a second sticky bar.
export function InsuranceBreadcrumb({
  backLabel, onBack, trail, embedded = false,
}: {
  backLabel: string;
  onBack: () => void;
  /** The trail, left to right. Every entry but the last is a link. */
  trail: { label: string; onClick?: () => void }[];
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? "" : "bg-white sticky top-0 z-40"}>
      <div className={embedded ? "" : "max-w-[1400px] mx-auto px-8 py-4"}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 secondary-text hover:text-ink transition-colors">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
            {backLabel}
          </button>
          <div className="secondary-text ml-auto flex items-center flex-wrap justify-end">
            {trail.map((t, i) => {
              const last = i === trail.length - 1;
              return (
                <span key={t.label} className="flex items-center">
                  {i > 0 && <span className="mx-2">›</span>}
                  {last ? (
                    <span className="text-ink font-medium">{t.label}</span>
                  ) : t.onClick ? (
                    <button onClick={t.onClick} className="secondary-text hover:text-ink transition-colors">{t.label}</button>
                  ) : (
                    <span>{t.label}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// The attorney-facing reading of a panel. The product has no separate Attorney
// Insight component, so this uses its established AI callout — the same tint,
// border and eyebrow the AI summaries use elsewhere.
export function AttorneyInsight({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-tint border border-[#D6F2F7] p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
        <span className="eyebrow text-deep">Attorney Insight</span>
      </div>
      <p className="body-text leading-relaxed">{children}</p>
    </div>
  );
}

// The disclaimer that closes an analysis meant for the attorney, not the client.
export function AttorneyDisclaimer() {
  return (
    <p className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A98A3]">
      For attorney use only · Not legal advice
    </p>
  );
}
