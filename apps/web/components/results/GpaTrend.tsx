import { computeCgpa, type SemesterResult } from "@usp/core";

const W = 320;
const H = 176;
const PAD = { top: 22, right: 14, bottom: 28, left: 30 };

interface Point {
  semester: number;
  gpa: number;
  cgpa: number;
}

/**
 * Hand-built SVG trend: GPA for each semester (solid) and the running CGPA
 * after it (dashed). Needs two graded semesters to show a trend; otherwise it
 * renders nothing. A visually hidden table carries the same numbers.
 */
export function GpaTrend({ semesters }: { semesters: SemesterResult[] }) {
  const ordered = semesters.slice().sort((a, b) => a.semester - b.semester);
  const points: Point[] = [];
  ordered.forEach((s, i) => {
    if (s.gpa == null) return;
    points.push({ semester: s.semester, gpa: s.gpa, cgpa: computeCgpa(ordered.slice(0, i + 1)) });
  });
  if (points.length < 2) return null;

  const values = points.flatMap((p) => [p.gpa, p.cgpa]);
  const min = Math.min(...values);
  const span = 10 - Math.floor(min - 0.25);
  const step = span <= 4 ? 1 : 2;
  const lo = Math.max(0, 10 - step * Math.ceil(span / step));
  const ticks: number[] = [];
  for (let t = lo; t <= 10; t += step) ticks.push(t);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (innerW * i) / (points.length - 1);
  const y = (v: number) => PAD.top + innerH * (1 - (Math.max(lo, v) - lo) / (10 - lo));
  const line = (pick: (p: Point) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(" ");

  const last = points[points.length - 1]!;
  const first = points[0]!;
  const direction =
    last.gpa > first.gpa ? "up from" : last.gpa < first.gpa ? "down from" : "level with";
  const summary =
    `GPA by semester, ${direction} ${first.gpa.toFixed(2)} in semester ${first.semester} ` +
    `to ${last.gpa.toFixed(2)} in semester ${last.semester}. ` +
    points.map((p) => `Semester ${p.semester}: ${p.gpa.toFixed(2)}`).join(", ") +
    `. Running CGPA ends at ${last.cgpa.toFixed(2)}.`;

  const labelAll = points.length <= 6;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={summary}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={12}
              className="fill-muted-foreground tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}

        <path
          d={line((p) => p.cgpa)}
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-muted-foreground"
        />
        <path
          d={line((p) => p.gpa)}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary"
        />

        {points.map((p, i) => {
          const cy = y(p.gpa);
          const showLabel = labelAll || i === points.length - 1;
          return (
            <g key={p.semester}>
              <circle cx={x(i)} cy={cy} r={4} className="fill-primary stroke-surface" strokeWidth={2} />
              {showLabel ? (
                <text
                  x={x(i)}
                  y={cy < PAD.top + 10 ? cy + 18 : cy - 9}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  className="fill-foreground tabular-nums"
                >
                  {p.gpa.toFixed(2)}
                </text>
              ) : null}
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize={12}
                className="fill-muted-foreground tabular-nums"
              >
                S{p.semester}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" x2="17" y1="4" y2="4" strokeWidth="2.5" strokeLinecap="round" className="stroke-primary" />
          </svg>
          GPA each semester
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line
              x1="1"
              x2="17"
              y1="4"
              y2="4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="4 3"
              className="stroke-muted-foreground"
            />
          </svg>
          CGPA so far
        </span>
      </figcaption>

      <table className="sr-only">
        <caption>GPA and running CGPA by semester</caption>
        <thead>
          <tr>
            <th scope="col">Semester</th>
            <th scope="col">GPA</th>
            <th scope="col">CGPA so far</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.semester}>
              <th scope="row">{p.semester}</th>
              <td>{p.gpa.toFixed(2)}</td>
              <td>{p.cgpa.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
