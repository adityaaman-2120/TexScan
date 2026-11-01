import { POINT_COLORS } from "@/features/rolls/rollMath";

/** Small figures for the three steps. Drawn by hand in SVG; they are illustrations, not data. */

const PAPER = "#eef1f5";
const INK = "#0b0d12";

/** The 6 x 6 cells of the marker the app prints (1 = black). The same bits as the PDF. */
const MARKER = [
  [1, 1, 1, 1, 1, 1],
  [1, 0, 1, 0, 0, 1],
  [1, 1, 0, 1, 0, 1],
  [1, 1, 1, 0, 0, 1],
  [1, 1, 1, 0, 1, 1],
  [1, 1, 1, 1, 1, 1],
] as const;

const mono = { fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace' } as const;

export function MarkerArt() {
  const cell = 17;
  const x0 = 46;
  const y0 = 40;
  return (
    <svg viewBox="0 0 360 176" className="w-full" role="img" aria-label="A printed square marker of known size, and a single pixel standing for a known length">
      <rect x="6" y="6" width="348" height="164" rx="6" fill="none" stroke="var(--border)" />
      <rect x={x0 - 17} y={y0 - 17} width={cell * 6 + 34} height={cell * 6 + 34} fill={PAPER} />
      {MARKER.flatMap((row, r) => row.map((v, c) => (v ? <rect key={`${r}-${c}`} x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell} fill={INK} /> : null)))}
      {/* dimension line */}
      <g stroke="var(--foreground)" strokeWidth="1" opacity="0.8">
        <line x1={x0} y1={26} x2={x0 + cell * 6} y2={26} />
        <line x1={x0} y1={21} x2={x0} y2={31} />
        <line x1={x0 + cell * 6} y1={21} x2={x0 + cell * 6} y2={31} />
      </g>
      <text x={x0 + (cell * 6) / 2} y="19" textAnchor="middle" fontSize="10.5" fill="var(--foreground)" style={mono}>
        50 mm
      </text>
      {/* one pixel, zoomed */}
      <g transform="translate(214 30)">
        {Array.from({ length: 25 }, (_, n) => {
          const gx = n % 5;
          const gy = Math.floor(n / 5);
          const mid = gx === 2 && gy === 2;
          return <rect key={n} x={gx * 18} y={gy * 18} width="18" height="18" fill={mid ? "var(--primary)" : "none"} stroke="var(--border)" />;
        })}
        <text x="45" y="118" textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)" style={mono}>
          one pixel = a known length
        </text>
      </g>
    </svg>
  );
}

export function RollArt() {
  const left = 24;
  const width = 312;
  const marks = [
    { at: 0.12, points: 1 },
    { at: 0.31, points: 3 },
    { at: 0.36, points: 2 },
    { at: 0.66, points: 4 },
    { at: 0.83, points: 1 },
  ] as const;
  const shots = [[0.0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0]] as const;
  return (
    <svg viewBox="0 0 360 176" className="w-full" role="img" aria-label="A roll drawn as a strip with pictures taken along it and defect markers coloured by points">
      <rect x="6" y="6" width="348" height="164" rx="6" fill="none" stroke="var(--border)" />
      {shots.map(([a, b], i) => (
        <g key={i}>
          <rect x={left + a * width + 1.5} y="34" width={(b - a) * width - 3} height="26" rx="2" fill="none" stroke="var(--primary)" strokeOpacity="0.55" strokeDasharray="3 3" />
        </g>
      ))}
      <text x={left} y="26" fontSize="10.5" fill="var(--muted-foreground)" style={mono}>
        one picture per stretch, each with its metre mark
      </text>
      <rect x={left} y="70" width={width} height="46" rx="3" style={{ fill: "color-mix(in oklab, var(--primary) 14%, var(--card))" }} stroke="var(--border)" />
      {Array.from({ length: 52 }, (_, i) => (
        <line key={i} x1={left + 3 + i * 6} y1="70" x2={left + 3 + i * 6} y2="116" stroke="var(--foreground)" strokeOpacity="0.05" />
      ))}
      {marks.map((m) => (
        <g key={m.at}>
          <line x1={left + m.at * width} y1="70" x2={left + m.at * width} y2="116" strokeWidth="2.4" style={{ stroke: POINT_COLORS[m.points] }} />
          <circle cx={left + m.at * width} cy="93" r="5" style={{ fill: POINT_COLORS[m.points] }} stroke="var(--card)" strokeWidth="1.5" />
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={left + t * width} y1="116" x2={left + t * width} y2="124" stroke="var(--muted-foreground)" />
          <text x={left + t * width} y="138" textAnchor="middle" fontSize="9.5" fill="var(--muted-foreground)" style={mono}>
            {Math.round(t * 100)} m
          </text>
        </g>
      ))}
      <text x={left} y="158" fontSize="10.5" fill="var(--muted-foreground)" style={mono}>
        every defect found, measured and placed
      </text>
    </svg>
  );
}

export function ReportArt() {
  return (
    <svg viewBox="0 0 360 176" className="w-full" role="img" aria-label="A report sheet with a defect map, a defect table, a signature line and an accept stamp">
      <rect x="6" y="6" width="348" height="164" rx="6" fill="none" stroke="var(--border)" />
      <g transform="translate(34 14)">
        <rect width="128" height="150" rx="3" fill={PAPER} />
        <rect x="10" y="10" width="62" height="7" fill={INK} />
        <rect x="10" y="22" width="92" height="3" fill={INK} opacity="0.35" />
        <rect x="10" y="38" width="108" height="16" fill="#dbe2ea" />
        {[0.2, 0.46, 0.8].map((t, i) => (
          <rect key={i} x={10 + t * 108} y="38" width="2.4" height="16" style={{ fill: POINT_COLORS[([2, 3, 1] as const)[i]!] }} />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <g key={i}>
            <rect x="10" y={64 + i * 11} width="108" height="1" fill={INK} opacity="0.2" />
            <rect x="10" y={68 + i * 11} width={[44, 36, 52, 30][i]} height="3" fill={INK} opacity="0.55" />
            <rect x="96" y={68 + i * 11} width="14" height="3" fill={INK} opacity="0.55" />
          </g>
        ))}
        <rect x="10" y="124" width="64" height="1" fill={INK} />
        <path d="M14 121 q6 -12 10 -2 t9 -3 t10 1 t8 -4" fill="none" stroke="#1d4ed8" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="10" y="130" width="38" height="2.5" fill={INK} opacity="0.4" />
      </g>
      <g transform="translate(208 62) rotate(-7)">
        <rect width="118" height="44" rx="5" fill="none" strokeWidth="2.6" style={{ stroke: "var(--success)" }} />
        <text x="59" y="25" textAnchor="middle" fontSize="22" fontWeight="700" letterSpacing="3" style={{ fill: "var(--success)", ...mono }}>
          ACCEPT
        </text>
        <text x="59" y="38" textAnchor="middle" fontSize="8.5" letterSpacing="1.6" style={{ fill: "var(--success)", ...mono }}>
          FIRST QUALITY
        </text>
      </g>
      <text x="208" y="138" fontSize="10.5" fill="var(--muted-foreground)" style={mono}>
        score, defect map, signatures
      </text>
    </svg>
  );
}
