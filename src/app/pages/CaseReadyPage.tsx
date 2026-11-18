import { useState, useEffect } from "react";
import { StageNavigator } from "../components/StageNavigator";
import {
  ChevronLeft, CheckCircle, ChevronDown, ChevronRight,
  ExternalLink, BarChart2,
  ArrowRight, Flag, Circle, Shield, Users, Scale, Stethoscope, Gavel, CalendarDays, Landmark
} from "lucide-react";
import { useAnalysisCounts, type AnalysisDetail } from "./AnalysisPage";
import { governingLawSummary } from "../jurisdiction/jurisdictionData";
import { DELIVERABLES, type DeliverableKind } from "./DeliverablePage";
import { defendantsForCase } from "../defendants/defendantData";
import { useDefendantDecisions } from "../defendants/defendantDecisionStore";
import { useInsuranceSummary } from "../insurance/caseInsurance";
import { Button } from "../components/ui/button";
import {
  PipelineState,
  classifyDocuments, generateAnalysisFindings, computeChecklist
} from "../types/case";

interface CaseReadyPageProps {
  caseData?: {
    caseName: string;
    caseId: string;
    plaintiff: string;
    summary: string;
    jurisdiction?: string;
  };
  pipeline?: PipelineState;
  onPipelineUpdate?: (updates: Partial<PipelineState>) => void;
  onStageClick?: (stageName: string) => void;
  onBackToIntake?: () => void;
  onOpenWorkspace?: () => void;
  /** Opens the Insurance Policy Analysis — the same pages Analysis opens. */
  onOpenInsurance?: () => void;
  /** Opens one of the Generated Deliverables on its own page. */
  onOpenDeliverable?: (kind: DeliverableKind) => void;
  /** Opens the Defendant Analysis — the same page Analysis opens. */
  onOpenDefendants?: () => void;
  /** Opens one of the Analysis findings pages, returning here. */
  onOpenAnalysisDetail?: (detail: AnalysisDetail) => void;
  /** Opens the Attorney Jurisdiction Review, returning here. */
  onOpenJurisdiction?: () => void;
  /** The governing law the attorney approved, if any. */
  governingLaw?: string;
  /** Section to bring into view on arrival — used when returning from a sub-page. */
  scrollToSection?: string;
}

const CHECKLIST_DETAILS: Record<string, string> = {
  "Medical records collected": "Documents have been collected from the plaintiff and attorney sources.",
  "Documents classified": "All documents have been categorized across Liability, Medical, and Insurance categories.",
  "Missing records audited": "Evidence gaps discovered and follow-up requests have been issued.",
  "Key entities extracted": "Witnesses, medical providers, and treatment dates extracted and verified.",
  "Medical chronology generated": "Complete treatment timeline generated from available evidence.",
  "Valuation completed": "Total recommended case value computed with multiplier scenarios.",
  "Case workspace generated": "All exhibits, chronologies, and demand parameters are staged for attorney review.",
};

// The four deliverables — the same list their dedicated pages are built from.
const deliverables = DELIVERABLES.map((d) => ({ ...d, color: "bg-tint text-deep" }));

export function CaseReadyPage({ caseData, pipeline, onStageClick, onBackToIntake, onOpenWorkspace, onOpenInsurance, onOpenDeliverable, onOpenDefendants, onOpenAnalysisDetail, onOpenJurisdiction, governingLaw, scrollToSection }: CaseReadyPageProps) {
  // The Analysis Findings, as deliverables — the same counts the Analysis stage shows.
  const counts = useAnalysisCounts(caseData?.caseId, pipeline?.documents ?? []);
  const insurance = useInsuranceSummary(caseData?.caseId ?? "PI-2024-001", pipeline?.documents ?? []);
  const law = governingLawSummary(caseData?.caseId, caseData?.jurisdiction, governingLaw);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const analysisCards: { id: string; title: string; category: string; icon: any; description: string; count?: number; meta: string; onOpen?: () => void }[] = [
    { id: "liability", title: "Liability Signals", category: "Liability", icon: Scale, count: counts.liability, meta: plural(counts.liability, "finding", "findings"),
      description: "Key findings identifying potential liability and the evidence supporting each finding.", onOpen: () => onOpenAnalysisDetail?.("liability") },
    { id: "injury", title: "Injury Signals", category: "Medical", icon: Stethoscope, count: counts.injury, meta: plural(counts.injury, "finding", "findings"),
      description: "Key injury findings, medical evidence, and documented impacts relevant to the case.", onOpen: () => onOpenAnalysisDetail?.("injury") },
    { id: "violations", title: "Violation Analysis", category: "Analysis", icon: Gavel, count: counts.violations, meta: plural(counts.violations, "violation", "violations"),
      description: "Identified violations, supporting evidence, and their relevance to potential liability.", onOpen: () => onOpenAnalysisDetail?.("violations") },
    { id: "timeline", title: "Case Timeline Overview", category: "Timeline", icon: CalendarDays, count: counts.events, meta: plural(counts.events, "key event", "key events"),
      description: "Key events extracted from the case timeline, with supporting evidence for each event.", onOpen: () => onOpenAnalysisDetail?.("timeline") },
    { id: "jurisdiction", title: "Jurisdiction Analysis", category: "Jurisdiction", icon: Landmark,
      meta: [caseData?.jurisdiction, law.value].filter(Boolean).join(" · ") || "Not provided",
      description: "Jurisdiction details, applicable governing law, relevant legal limitations, and jurisdiction-specific considerations.", onOpen: onOpenJurisdiction },
  ];
  const defendants = defendantsForCase(caseData?.caseId ?? "PI-2024-001");
  const defendantDecisions = useDefendantDecisions(defendants?.id);
  // Returning from a sub-page lands back on the deliverable it was opened from.
  useEffect(() => {
    if (!scrollToSection) return;
    const t = setTimeout(() => document.getElementById(scrollToSection)?.scrollIntoView({ block: "center" }), 50);
    return () => clearTimeout(t);
  }, [scrollToSection]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Derive checklist from pipeline state
  const categories = pipeline ? classifyDocuments(pipeline.documents) : [];
  const findings = pipeline ? generateAnalysisFindings(categories) : [];
  const checklistMap = pipeline ? computeChecklist(pipeline, categories, findings) : {};
  const checklistItems = Object.entries(checklistMap).map(([label]) => ({
    id: label.replace(/\s+/g, "-").toLowerCase(),
    label,
    detail: CHECKLIST_DETAILS[label] ?? label,
    complete: true,
  }));
  const completedCount = checklistItems.filter((i) => i.complete).length;
  const allComplete = completedCount === checklistItems.length && checklistItems.length > 0;

  const defaultCaseData = {
    caseName: "Estate of Miller vs Logistics Co.",
    caseId: "PI-2024-001",
    plaintiff: "Evelyn Miller",
    summary: "Motor vehicle accident resulting in cervical disc herniation and ongoing physical therapy.",
    jurisdiction: "Cook County, IL",
  };

  const data = { ...defaultCaseData, ...caseData };

  return (
    <div className="min-h-screen bg-wash">
      {/* Breadcrumb */}
      <div className="bg-white sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToIntake}
              className="flex items-center gap-2 secondary-text hover:text-ink transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to Case Intake
            </button>
            <div className="secondary-text ml-auto">
              Case Intake <span className="mx-2">›</span>
              <span className="text-ink font-medium">{data.caseName}</span>
            </div>
          </div>
        </div>
      </div>

      <StageNavigator currentStage="Case Ready" onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">

        {/* ── 1. CASE READY HEADER ── */}
        <h1 className="page-title" style={{ fontSize: "24px" }}>Stage 4 - Case Ready</h1>
        <div className="lg-card p-6">
          <div className="flex items-start justify-between gap-8">
            {/* Left */}
            <div className="flex-1">
              <div className="pill pill-complete mb-4">
                <CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                PROCESSING COMPLETE
              </div>
              <h1 className="page-title mb-3">Case Ready For Review</h1>
              <p className="body-text leading-relaxed max-w-xl">
                All intake, classification, analysis, and valuation workflows have been completed for this case. Review generated outputs before continuing to the Case Workspace.
              </p>
            </div>

            {/* Right — Completion status + workspace CTA */}
            <div className="shrink-0 w-64">
              <div className="lg-zone rounded-xl p-5 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white border border-line flex items-center justify-center mb-3">
                  <CheckCircle className="w-6 h-6 text-deep" strokeWidth={1.75} />
                </div>
                <div className="kpi-value leading-none mb-1">100%</div>
                <div className="eyebrow mb-4">Case Completed</div>
                <Button
                  disabled={!allComplete}
                  onClick={onOpenWorkspace}
                  className="btn btn-primary gap-2 w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Open Case Workspace
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. SNAPSHOT + CHECKLIST (left) · DELIVERABLES (right) ──
            The left cards keep their own height; the deliverables panel
            stretches to the left column's combined height. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,31fr)_minmax(0,69fr)] gap-8 items-stretch">

          <div className="flex flex-col gap-8 min-w-0">
          {/* Case Intelligence Snapshot — the three metrics as compact rows */}
          <div className="lg-card p-5">
            <h2 className="section-header mb-4">Case Intelligence Snapshot</h2>
            <div className="space-y-3">
              {([
                { label: "Confidence Score", value: "94%", pill: "pill-complete", Icon: CheckCircle, note: "High Confidence" },
                { label: "Estimated Range", value: "$968K – $1,372K", pill: "pill-neutral", Icon: BarChart2, note: "Settlement Range" },
                { label: "Critical Risks", value: "2", pill: "pill-risk", Icon: Flag, note: "Review Required" },
              ]).map(({ label, value, pill, Icon, note }) => (
                <div key={label} className="lg-zone lg-zone-grey rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="eyebrow mb-1">{label}</div>
                    <div className="text-[20px] font-bold text-ink leading-tight tabular-nums whitespace-nowrap">{value}</div>
                  </div>
                  <span className={`pill ${pill} mt-2`}>
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {note}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Case Readiness Checklist */}
          <div className="lg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="section-header">Case Readiness Checklist</h2>
              <span className="pill pill-neutral">
                {completedCount} / {checklistItems.length} COMPLETE
              </span>
            </div>

            <div className="divide-y divide-line">
              {checklistItems.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-wash transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {item.complete
                        ? <CheckCircle className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />
                        : <Circle className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                      }
                      <span className={`text-sm ${item.complete ? "text-ink" : "text-[#5B6B78]"}`}>{item.label}</span>
                    </div>
                    {expandedItem === item.id
                      ? <ChevronDown className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                      : <ChevronRight className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                    }
                  </button>
                  {expandedItem === item.id && (
                    <div className="px-6 pb-4">
                      <p className="secondary-text leading-relaxed pl-7">{item.detail}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-5 border-t border-line bg-wash">
              <div className="flex items-end justify-between mb-3">
                <span className="eyebrow">Completion Progress</span>
                <span className="text-2xl font-bold text-deep leading-none">
                  {checklistItems.length > 0 ? Math.round((completedCount / checklistItems.length) * 100) : 0}%
                </span>
              </div>
              <div className="lg-progress mb-3">
                <span
                  style={{ width: checklistItems.length > 0 ? `${(completedCount / checklistItems.length) * 100}%` : "0%" }}
                />
              </div>
              {allComplete
                ? <span className="pill pill-complete"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Ready For Attorney Review</span>
                : <span className="text-xs font-medium text-[#5B6B78]">Complete earlier stages to proceed</span>
              }
            </div>
          </div>

          </div>{/* end left column */}

          {/* RIGHT — Generated Deliverables: on wide screens exactly the left column's
              height (the row is sized by the left column), its cards scrolling inside. */}
          <div className="min-w-0 relative">
          <div id="generated-deliverables" className="lg-card overflow-hidden scroll-mt-[150px] flex flex-col lg:absolute lg:inset-0">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="section-header">Generated Deliverables</h2>
              {/* Counted: the deliverables, Insurance and Defendant Analysis. */}
              <span className="secondary-text">{DELIVERABLES.length + 2 + analysisCards.length} deliverables ready</span>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
              {deliverables.map((item) => (
                <div
                  key={item.title}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenDeliverable?.(item.kind)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDeliverable?.(item.kind); } }}
                  className="lg-card lg-card-i p-3.5 flex flex-col cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2.5">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${item.color}`}>
                      <item.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {item.category}
                    </div>
                  </div>
                  <h3 className="card-title mb-1">{item.title}</h3>
                  <p className="secondary-text leading-relaxed flex-1">{item.description}</p>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line">
                    <span className="mono-ref">{item.date}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenDeliverable?.(item.kind); }}
                      className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors"
                    >
                      Open <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Insurance Policy Analysis — the fifth deliverable, one column
                  wide beneath Case Summary, opening the insurance analysis
                  Stage 2 produced. */}
              <div id="insurance-deliverable" className="lg-card lg-card-i p-3.5 flex flex-col scroll-mt-[150px]">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep">
                    <Shield className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Insurance
                  </div>
                </div>
                <h3 className="card-title mb-1">Insurance Policy Analysis</h3>
                <p className="secondary-text leading-relaxed flex-1">
                  Parties, policies, coverage, liens, bad-faith readiness and open insurance issues in one view.
                </p>
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line">
                  <span className="mono-ref truncate">{insurance.meta}</span>
                  <button
                    onClick={onOpenInsurance}
                    className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors"
                  >
                    Open <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {/* Defendant Analysis — the same analysis the Analysis stage opens. */}
              <div
                id="defendant-deliverable"
                role="button"
                tabIndex={0}
                onClick={onOpenDefendants}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDefendants?.(); } }}
                className="lg-card lg-card-i p-3.5 flex flex-col cursor-pointer scroll-mt-[150px]"
              >
                <div className="flex items-start justify-between mb-2.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep">
                    <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Liability
                  </div>
                </div>
                <h3 className="card-title mb-1">Defendant Analysis</h3>
                <p className="secondary-text leading-relaxed flex-1">
                  Review defendant identification, liability evidence, relationships between responsible parties, investigation priorities, and attorney decisions.
                </p>
                <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-line">
                  <span className="mono-ref truncate">
                    {!defendants ? "Not available for this case" : defendantDecisions?.confirmedAt ? `Decisions confirmed ${defendantDecisions.confirmedAt}` : "Awaiting attorney decisions"}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenDefendants?.(); }}
                    className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors"
                  >
                    Open <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {/* The Analysis Findings, each opening its Analysis page and returning here. */}
              {analysisCards.map((item) => (
                <div
                  key={item.id}
                  id={`${item.id}-deliverable`}
                  role="button"
                  tabIndex={0}
                  onClick={item.onOpen}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.onOpen?.(); } }}
                  className="lg-card lg-card-i p-3.5 flex flex-col cursor-pointer scroll-mt-[150px]"
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep">
                      <item.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {item.category}
                    </div>
                    {item.count !== undefined && (
                      <span className="text-xs font-semibold text-deep bg-white border border-[#D6F2F7] rounded-full px-2 py-0.5 tabular-nums">{item.count}</span>
                    )}
                  </div>
                  <h3 className="card-title mb-1">{item.title}</h3>
                  <p className="secondary-text leading-relaxed flex-1">{item.description}</p>
                  <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-line">
                    <span className="mono-ref truncate" title={item.meta}>{item.meta}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); item.onOpen?.(); }}
                      className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors shrink-0"
                    >
                      Open <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>

        <div className="lg-zone px-6 py-5 flex items-center justify-between gap-8">
          <div>
            <h3 className="card-title mb-1">Ready to Proceed?</h3>
            <p className="body-text max-w-xl leading-relaxed">
              Opening the primary Case Workspace consolidates all evidence exhibits, timeline chronologies, draft demands, and litigation parameters for secure court compilation.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button
              disabled={!allComplete}
              onClick={onOpenWorkspace}
              className="btn btn-primary gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Open Case Workspace
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
