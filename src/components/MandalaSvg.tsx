import { memo, useMemo } from "react";
import { VIEW_RADIUS, type Mandala } from "@/lib/mandala";

interface Props {
  mandala: Mandala;
  /** group id -> CSS colour. Groups without a fill are left as paper. */
  fills?: Record<string, string> | null;
  className?: string;
  title?: string;
  strokeWidth?: number;
}

function MandalaSvgImpl({ mandala, fills, className, title, strokeWidth = 1.4 }: Props) {
  const shapeD = useMemo(
    () => new Map(mandala.shapes.map((s) => [s.id, s.d])),
    [mandala.shapes],
  );
  const v = VIEW_RADIUS;
  return (
    <svg
      viewBox={`${-v} ${-v} ${2 * v} ${2 * v}`}
      className={className}
      role="img"
      aria-label={title ?? `Mandala for ${mandala.date}`}
      style={fills ? { filter: "var(--art-filter)" } : undefined}
    >
      <g
        transform="rotate(-90)"
        stroke={fills ? "var(--line-on-colour)" : "var(--line)"}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      >
        {mandala.regions.map((r, i) => (
          <path
            key={i}
            d={shapeD.get(r.shape)}
            transform={r.rotate ? `rotate(${r.rotate})` : undefined}
            fill={fills?.[r.group] ?? "var(--paper)"}
            data-group={r.group}
            style={{ transition: "fill 600ms ease" }}
          />
        ))}
      </g>
    </svg>
  );
}

export const MandalaSvg = memo(MandalaSvgImpl);

export function suggestedFills(m: Mandala): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, idx] of Object.entries(m.suggested)) {
    out[group] = m.palette.colours[idx].css;
  }
  return out;
}
