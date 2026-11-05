import { MapPin, Scale, BookOpen } from "lucide-react";
import { governingLawSummary } from "../jurisdiction/jurisdictionData";

/** A statutory cap with the source it was verified against. None is on file:
 *  the app holds no verified legal-source data, so every case shows the cap as
 *  unconfirmed until one is added here with its authority and the date it was
 *  checked. Keyed "State|Case type". */
interface VerifiedCap { amount: number; appliesTo: string; authority: string; verifiedOn: string; url?: string }
const VERIFIED_CAPS: Record<string, VerifiedCap> = {};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Informational only: it never changes the valuation. */
export function JurisdictionalCapCard({ caseData, governingLaw }: { caseData: any; governingLaw?: string }) {
  const place: string | undefined = caseData?.jurisdiction || undefined;
  const law = governingLawSummary(caseData?.caseId, place, governingLaw);
  const lawState = law.value && !/not/i.test(law.value) ? law.value.split(/\s*[—-]\s*/)[0] : undefined;
  const claim = [caseData?.caseType, caseData?.caseSubType].filter(Boolean).join(" · ") || undefined;
  const cap = lawState ? VERIFIED_CAPS[`${lawState}|${caseData?.caseType ?? ""}`] : undefined;

  // Icon and label on one line, the value beneath; columns split by thin rules.
  const column = (Icon: typeof MapPin, label: string, children: React.ReactNode) => (
    <div className="min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0 sm:border-l sm:first:border-l-0 border-line">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={2} />
        <span className="eyebrow leading-4" title={label}>{label}</span>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
  const value = "text-sm leading-5 font-semibold text-ink break-words";

  return (
    <section aria-labelledby="noneconomic-cap" className="rounded-xl border border-line bg-white px-4 py-3.5">
      <h4 id="noneconomic-cap" className="card-title">Jurisdictional Non-Economic Damages Limit</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 mt-3">
        {column(MapPin, "Jurisdiction", <p className={value}>{place ?? <span className="text-[#8A98A3] font-normal">Not provided</span>}</p>)}
        {column(Scale, "Maximum Non-Economic Damages", cap ? <>
          <p className={`${value} tabular-nums`}>{usd(cap.amount)}</p>
          <span className="inline-flex items-center mt-1 rounded-full border border-[#D1FADF] bg-[#ECFDF3] text-[#15803D] text-[10.5px] font-semibold leading-4 px-1.5">Verified</span>
        </> : <>
          <p className={value}>No applicable cap confirmed</p>
          <span title={`Attorney review required${claim ? ` for ${claim}` : ""}. For reference only; it does not change the estimate.`} className="inline-flex items-center mt-1 rounded-full border border-[#FDE6C8] bg-[#FFF7ED] text-[#B45309] text-[10.5px] font-semibold leading-4 px-1.5">Not verified</span>
        </>)}
        {column(BookOpen, "Legal Reference", cap ? (
          <p className={value}>{cap.url ? <a href={cap.url} target="_blank" rel="noreferrer" className="text-deep hover:text-ink">{cap.authority}</a> : cap.authority}</p>
        ) : (
          <p className="text-sm leading-5 text-[#5B6B78] break-words">No verified source on file</p>
        ))}
      </div>
    </section>
  );
}
