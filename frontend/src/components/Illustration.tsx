import { cn } from "@/lib/utils";

export type IllustrationVariant =
  | "scan"
  | "camera"
  | "stack"
  | "history"
  | "compare"
  | "lab"
  | "spectrum"
  | "profile"
  | "chart"
  | "search";

/* Simple line illustrations: muted strokes for structure, the cyan accent for the one thing that matters. */
const muted = "stroke-muted-foreground/45";
const accent = "stroke-primary";

function Frame() {
  return <rect x="12" y="8" width="176" height="112" rx="14" className="stroke-border" strokeDasharray="3 6" />;
}

const scenes: Record<IllustrationVariant, React.ReactNode> = {
  scan: (
    <>
      <path d="M62 38h-12a4 4 0 0 0-4 4v12M138 38h12a4 4 0 0 1 4 4v12M62 90h-12a4 4 0 0 1-4-4V74M138 90h12a4 4 0 0 0 4-4V74" className={accent} />
      <path d="M62 64h76" className={accent} strokeWidth={2.2} />
      <rect x="64" y="46" width="72" height="36" rx="4" className={muted} strokeDasharray="2 5" />
      <circle cx="108" cy="58" r="6" className={muted} />
      <path d="M108 52v-4M108 68v4M102 58h-4M114 58h4" className={muted} />
    </>
  ),
  camera: (
    <>
      <rect x="52" y="40" width="96" height="58" rx="10" className={muted} />
      <path d="M80 40l6-9h28l6 9" className={muted} />
      <circle cx="100" cy="69" r="17" className={accent} />
      <circle cx="100" cy="69" r="7" className={accent} />
      <circle cx="136" cy="52" r="2.5" className="fill-primary stroke-primary" />
      <path d="M160 52a14 14 0 0 1 0 20M166 46a22 22 0 0 1 0 32" className={muted} />
    </>
  ),
  stack: (
    <>
      <rect x="44" y="30" width="86" height="56" rx="8" className={muted} />
      <rect x="58" y="42" width="86" height="56" rx="8" className={muted} />
      <rect x="72" y="54" width="86" height="56" rx="8" className={accent} />
      <path d="M86 70h36M86 82h58M86 94h28" className={muted} />
      <path d="M134 68l5 5 9-10" className={accent} />
    </>
  ),
  history: (
    <>
      <circle cx="78" cy="64" r="30" className={muted} />
      <path d="M78 46v18l12 8" className={accent} />
      <path d="M52 36l-8 2 2 8" className={accent} />
      <path d="M124 44h38M124 64h30M124 84h38" className={muted} />
      <circle cx="116" cy="44" r="2" className="fill-primary stroke-primary" />
    </>
  ),
  compare: (
    <>
      <rect x="34" y="34" width="60" height="62" rx="8" className={muted} />
      <rect x="106" y="34" width="60" height="62" rx="8" className={accent} />
      <path d="M100 28v74" className={muted} strokeDasharray="2 4" />
      <path d="M46 82V68M58 82V54M70 82V62M82 82V72" className={muted} />
      <path d="M118 82V60M130 82V46M142 82V56M154 82V68" className={accent} />
    </>
  ),
  lab: (
    <>
      <path d="M30 98c14-22 24 22 38 0s24 22 38 0 24 22 38 0" className={muted} />
      <path d="M40 50h120M40 70h120" className={muted} />
      <circle cx="74" cy="50" r="6" className={accent} fill="var(--card)" />
      <circle cx="122" cy="70" r="6" className={accent} fill="var(--card)" />
      <path d="M40 50h28M40 70h76" className={accent} />
    </>
  ),
  spectrum: (
    <>
      <path d="M30 94h140" className={muted} />
      <path d="M44 94V84M56 94V76M68 94V82M80 94V70M92 94V50" className={muted} />
      <path d="M108 94V50M120 94V70M132 94V82M144 94V76M156 94V84" className={muted} />
      <path d="M100 94V30" className={accent} strokeWidth={2.2} />
      <circle cx="80" cy="64" r="5" className={accent} />
      <circle cx="120" cy="64" r="5" className={accent} />
    </>
  ),
  profile: (
    <>
      <rect x="48" y="26" width="104" height="76" rx="10" className={muted} />
      <circle cx="78" cy="52" r="10" className={accent} />
      <path d="M98 46h40M98 58h26" className={muted} />
      <path d="M62 82h76" className={muted} />
      <circle cx="98" cy="82" r="5" className={accent} fill="var(--card)" />
    </>
  ),
  chart: (
    <>
      <path d="M40 30v66h122" className={muted} />
      <path d="M56 96V74M76 96V62M96 96V80M116 96V52M136 96V68" className={muted} />
      <path d="M52 66l22-14 22 12 22-26 24 14 16-8" className={accent} />
      <circle cx="118" cy="38" r="3" className="fill-primary stroke-primary" />
    </>
  ),
  search: (
    <>
      <circle cx="92" cy="58" r="26" className={muted} />
      <path d="M111 77l24 24" className={accent} strokeWidth={2.4} />
      <path d="M86 50a7 7 0 1 1 9 7c-2 1-3 2-3 4" className={accent} />
      <circle cx="92" cy="69" r="1" className="fill-primary stroke-primary" />
    </>
  ),
};

export function Illustration({ variant, className }: { variant: IllustrationVariant; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 128"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden
      className={cn("h-32 w-auto", className)}
    >
      <Frame />
      {scenes[variant]}
    </svg>
  );
}
