import {
  AudioWaveform,
  FileText,
  FlaskConical,
  GitCompare,
  History,
  LayoutDashboard,
  Layers,
  Layers2,
  ScanLine,
  ScanSearch,
  SlidersHorizontal,
  Webcam,
  type LucideIcon,
} from "lucide-react";
import type { IllustrationVariant } from "@/components/Illustration";

export type NavGroup = "Inspect" | "Records" | "Setup" | "Engineering";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  description: string;
  /** Extra words the command palette matches on. */
  keywords: string[];
  illustration: IllustrationVariant;
  /** Only available (sidebar, palette, router) while Engineering mode is on. */
  engineering?: boolean;
  /** Reachable and searchable, but not listed in the sidebar. */
  hidden?: boolean;
}

/** Single source of truth for the sidebar, the command palette and the router. */
export const NAV_ITEMS: NavItem[] = [
  {
    path: "/inspect",
    label: "Inspect",
    icon: ScanLine,
    group: "Inspect",
    description: "Check a piece of fabric for defects. Add a photo and get a clear pass or fail.",
    keywords: ["upload", "photo", "image", "defect", "check"],
    illustration: "scan",
  },
  {
    path: "/live",
    label: "Live",
    icon: Webcam,
    group: "Inspect",
    description: "Point a camera at the fabric and see pass or fail as you go.",
    keywords: ["camera", "webcam", "phone", "stream", "realtime"],
    illustration: "camera",
  },
  {
    path: "/roll",
    label: "Roll Inspection",
    icon: Layers2,
    group: "Inspect",
    description: "Inspect a whole roll along its length and grade it with the four-point system: points, defect map and report.",
    keywords: ["roll", "four point", "grading", "points", "length", "meter", "supplier", "astm"],
    illustration: "stack",
  },
  {
    path: "/batch",
    label: "Batch",
    icon: Layers,
    group: "Inspect",
    description: "Check many photos at once and follow progress live.",
    keywords: ["bulk", "folder", "many", "queue", "lot"],
    illustration: "stack",
    hidden: true,
  },
  {
    path: "/history",
    label: "History",
    icon: History,
    group: "Records",
    description: "Every past inspection. Filter, reopen and download.",
    keywords: ["past", "log", "results", "inspections", "records"],
    illustration: "history",
  },
  {
    path: "/reports",
    label: "Reports",
    icon: FileText,
    group: "Records",
    description: "Download printable PDF reports for single inspections and whole batches.",
    keywords: ["pdf", "download", "print", "export", "certificate"],
    illustration: "search",
  },
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "Records",
    description: "Pass rate, defect types and activity over time.",
    keywords: ["stats", "overview", "metrics", "kpi", "charts", "quality"],
    illustration: "chart",
  },
  {
    path: "/profiles",
    label: "Profiles",
    icon: SlidersHorizontal,
    group: "Setup",
    description: "Settings for each fabric, learned from good samples so good cloth passes.",
    keywords: ["fabric", "material", "setup", "tune", "denim", "cotton", "silk"],
    illustration: "profile",
  },
  {
    path: "/xray",
    label: "Pipeline X-Ray",
    icon: ScanSearch,
    group: "Engineering",
    description: "Step through every processing stage of one inspection, with timings.",
    keywords: ["stages", "pipeline", "debug", "steps"],
    illustration: "scan",
    engineering: true,
  },
  {
    path: "/spectrum",
    label: "Spectrum Studio",
    icon: AudioWaveform,
    group: "Engineering",
    description: "Look at the frequency spectrum and draw your own notch filter.",
    keywords: ["fft", "frequency", "notch", "filter", "peaks"],
    illustration: "spectrum",
    engineering: true,
  },
  {
    path: "/arena",
    label: "Method Arena",
    icon: GitCompare,
    group: "Engineering",
    description: "Run every detection method on the same image and compare them side by side.",
    keywords: ["compare", "methods", "benchmark", "iou", "dice"],
    illustration: "compare",
    engineering: true,
  },
  {
    path: "/robustness",
    label: "Robustness Lab",
    icon: FlaskConical,
    group: "Engineering",
    description: "Stress-test a verdict against noise, blur, exposure and JPEG compression.",
    keywords: ["noise", "blur", "brightness", "jpeg", "degradation", "stress"],
    illustration: "lab",
    engineering: true,
  },
  {
    path: "/bit-planes",
    label: "Bit-Plane viewer",
    icon: Layers,
    group: "Engineering",
    description: "See the eight binary layers of the grayscale image.",
    keywords: ["bit", "planes", "binary", "layers", "msb"],
    illustration: "stack",
    engineering: true,
  },
];

/** Sidebar sections, in order. Engineering only appears while Engineering mode is on. */
export const PRODUCT_GROUPS: NavGroup[] = ["Inspect", "Records", "Setup"];
export const ENGINEERING_GROUP: NavGroup = "Engineering";

export function navGroups(engineering: boolean): NavGroup[] {
  return engineering ? [...PRODUCT_GROUPS, ENGINEERING_GROUP] : PRODUCT_GROUPS;
}

/** Items listed in the sidebar. */
export function sidebarItems(group: NavGroup, engineering: boolean): NavItem[] {
  return NAV_ITEMS.filter((i) => i.group === group && !i.hidden && (engineering || !i.engineering));
}

/** Items the command palette offers (includes hidden ones such as Batch). */
export function paletteItems(engineering: boolean): NavItem[] {
  return NAV_ITEMS.filter((i) => engineering || !i.engineering);
}

export const DEFAULT_PATH = NAV_ITEMS[0]!.path;

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
}

export function requireNav(path: string): NavItem {
  const item = NAV_ITEMS.find((i) => i.path === path);
  if (!item) throw new Error(`unknown nav path ${path}`);
  return item;
}
