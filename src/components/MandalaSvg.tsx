import { memo, useMemo, type MouseEvent } from "react";
import { VIEW_RADIUS, type Mandala } from "@/lib/mandala";

interface Props {
  mandala: Mandala;
  /** Group-level fills (group id -> CSS colour), used for previews. */
  fills?: Record<string, string> | null;
  /** Per-region fills (region index -> CSS colour). Takes precedence over `fills`. */
  regionFills?: Record<number, string> | null;
  /** Makes regions interactive. */
  onRegionTap?: (index: number) => void;
  /** Mirror-line angles (degrees, local frame) to draw as faint guides. */
  guides?: number[];
  guidesVisible?: boolean;
  className?: string;
  title?: string;
  strokeWidth?: number;
  /** Keep lines the same on-screen width at any zoom (strokeWidth is then in px). */
  nonScalingStroke?: boolean;
}

function MandalaSvgImpl({
  mandala,
  fills,
  regionFills,
  onRegionTap,
  guides,
  guidesVisible = false,
  className,
  title,
  strokeWidth = 1.4,
  nonScalingStroke = false,
}: Props) {
  const vectorEffect = nonScalingStroke ? "non-scaling-stroke" : undefined;
  const shapeD = useMemo(() => new Map(mandala.shapes.map((s) => [s.id, s.d])), [mandala.shapes]);
  // Full previews use crisp "stained glass" lines. A board in progress mixes
  // paper and colour, so it uses a line tone that reads on both.
  const coloured = !!fills;
  const interactive = !!regionFills;
  const v = VIEW_RADIUS;

  const handleClick = onRegionTap
    ? (e: MouseEvent<SVGSVGElement>) => {
        const el = (e.target as Element).closest("[data-index]");
        if (el) onRegionTap(Number(el.getAttribute("data-index")));
      }
    : undefined;

  return (
    <svg
      viewBox={`${-v} ${-v} ${2 * v} ${2 * v}`}
      className={className}
      role="img"
      aria-label={title ?? `Mandala for ${mandala.date}`}
      onClick={handleClick}
      style={{
        filter: coloured || interactive ? "var(--art-filter)" : undefined,
        cursor: onRegionTap ? "pointer" : undefined,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <g
        transform="rotate(-90)"
        stroke={
          coloured ? "var(--line-on-colour)" : interactive ? "var(--line-board)" : "var(--line)"
        }
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      >
        {mandala.regions.map((r, i) => (
          <path
            key={i}
            d={shapeD.get(r.shape)}
            transform={r.rotate ? `rotate(${r.rotate})` : undefined}
            fill={regionFills?.[i] ?? fills?.[r.group] ?? "var(--paper)"}
            vectorEffect={vectorEffect}
            data-index={i}
            data-group={r.group}
            style={{ transition: "fill 500ms ease" }}
          />
        ))}
      </g>
      {guides && guides.length > 0 && (
        <g
          transform="rotate(-90)"
          stroke="var(--guide)"
          strokeWidth={1.5}
          strokeDasharray="6 10"
          pointerEvents="none"
          data-testid="symmetry-guides"
          style={{ opacity: guidesVisible ? 1 : 0, transition: "opacity 900ms ease" }}
        >
          {guides.map((deg) => (
            <line
              key={deg}
              x1={-v}
              y1={0}
              x2={v}
              y2={0}
              transform={`rotate(${deg})`}
              vectorEffect={vectorEffect}
            />
          ))}
        </g>
      )}
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
