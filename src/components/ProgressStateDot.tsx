import type { CSSProperties } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { SectionGroupProgressStatus } from "@/lib/section-progress";

type ProgressDotStyle = CSSProperties & {
  "--progress-dot-degrees": string;
};

export function ProgressStateDot({
  className,
  status,
}: {
  className?: string;
  status: SectionGroupProgressStatus;
}) {
  return (
    <span
      className={["progress-state-dot", className].filter(Boolean).join(" ")}
      data-progress-state={status.kind}
      aria-label={status.label}
      title={status.label}
      style={
        {
          "--progress-dot-degrees": `${status.percent * 3.6}deg`,
        } as ProgressDotStyle
      }
    >
      {status.kind === "read" && <Check aria-hidden="true" size={11} />}
      {status.kind === "updated" && <RotateCcw aria-hidden="true" size={10} />}
    </span>
  );
}
