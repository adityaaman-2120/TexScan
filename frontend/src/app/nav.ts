import {
  AudioWaveform,
  GraduationCap,
  FlaskConical,
  GitCompare,
  History,
  LayoutDashboard,
  Layers,
  ScanLine,
  SlidersHorizontal,
  Webcam,
  type LucideIcon,
} from "lucide-react";
import type { IllustrationVariant } from "@/components/Illustration";

export type NavGroup = "Workspace" | "Analysis" | "Library";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  description: string;
  /** Extra words the command palette matches on. */
  keywords: string[];
  illustration: IllustrationVariant;
  /** Backend endpoint(s) the page will use. */
  endpoint: string;
  /** What the finished page will do (shown on placeholder pages). */
  planned: string[];
}

/** Single source of truth for the sidebar, the command palette and the router. */
export const NAV_ITEMS: NavItem[] = [
  {
    path: "/inspect",
    label: "Inspect",
    icon: ScanLine,
    group: "Workspace",
    description: "Run one image through the pipeline and step through every stage.",
    keywords: ["upload", "image", "defect", "analyze"],
    illustration: "scan",
    endpoint: "POST /inspect",
    planned: [
      "Drop an image, pick a method and a profile",
      "Stage-by-stage viewer with timings",
      "Defect list with type and confidence",
      "Histograms before and after enhancement",
    ],
  },
  {
    path: "/live",
    label: "Live",
    icon: Webcam,
    group: "Workspace",
    description: "Stream a webcam and get a PASS / FAIL verdict with an overlay in real time.",
    keywords: ["webcam", "camera", "stream", "realtime"],
    illustration: "camera",
    endpoint: "WS /ws/live",
    planned: ["Browser webcam capture as JPEG frames", "Decision and overlay at up to 5 fps", "Latency readout per frame"],
  },
  {
    path: "/batch",
    label: "Batch",
    icon: Layers,
    group: "Workspace",
    description: "Inspect many images at once and follow progress live.",
    keywords: ["bulk", "folder", "many", "queue"],
    illustration: "stack",
    endpoint: "POST /inspect/batch · WS /ws/batch/{id}",
    planned: ["Drop a whole folder of images", "Per-image progress over WebSocket", "Pass / fail summary with links to results"],
  },
  {
    path: "/history",
    label: "History",
    icon: History,
    group: "Analysis",
    description: "Browse, filter and reopen past inspections.",
    keywords: ["past", "log", "results", "inspections"],
    illustration: "history",
    endpoint: "GET /inspections",
    planned: ["Filter by decision, profile and date", "Paginated list with overlay thumbnails", "Open or delete a result"],
  },
  {
    path: "/arena",
    label: "Method Arena",
    icon: GitCompare,
    group: "Analysis",
    description: "Run every detection method on the same image and compare them side by side.",
    keywords: ["compare", "methods", "benchmark", "iou", "dice"],
    illustration: "compare",
    endpoint: "POST /arena",
    planned: ["Four methods, one image, side by side", "IoU and Dice against a ground-truth mask", "Timing per method"],
  },
  {
    path: "/robustness",
    label: "Robustness Lab",
    icon: FlaskConical,
    group: "Analysis",
    description: "Stress-test a verdict against noise, blur, exposure and JPEG compression.",
    keywords: ["noise", "blur", "brightness", "jpeg", "degradation", "stress"],
    illustration: "lab",
    endpoint: "POST /robustness",
    planned: ["Sweep each degradation across a range", "Charts of decision and defect area per level", "Find the level where the verdict flips"],
  },
  {
    path: "/spectrum",
    label: "Spectrum Studio",
    icon: AudioWaveform,
    group: "Analysis",
    description: "Look at the frequency spectrum and draw your own notch filter.",
    keywords: ["fft", "frequency", "notch", "filter", "peaks"],
    illustration: "spectrum",
    endpoint: "POST /spectrum · POST /spectrum/apply",
    planned: ["Log-magnitude spectrum with detected peaks", "Draw a notch mask on the spectrum", "See the residual and defect mask update"],
  },
  {
    path: "/profiles",
    label: "Profiles",
    icon: SlidersHorizontal,
    group: "Library",
    description: "Material profiles tuned from known-good images.",
    keywords: ["autotune", "tune", "material", "threshold", "denim", "tile"],
    illustration: "profile",
    endpoint: "POST /profiles/autotune · GET /profiles",
    planned: ["Upload 5 to 20 good images to autotune", "Review the threshold and minimum area chosen", "Rename, replace or delete profiles"],
  },
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "Library",
    description: "Totals, pass rate, defect types and activity over time.",
    keywords: ["stats", "overview", "metrics", "kpi", "charts"],
    illustration: "chart",
    endpoint: "GET /stats",
    planned: ["Pass rate and totals", "Defects by type", "Inspections per day"],
  },
  {
    path: "/about",
    label: "About",
    icon: GraduationCap,
    group: "Library",
    description: "How TexScan works, and where each lab syllabus topic lives in it.",
    keywords: ["syllabus", "lab", "course", "help", "shortcuts", "bit planes", "morphology", "restoration"],
    illustration: "search",
    endpoint: "none",
    planned: ["Syllabus topics mapped to pages and code", "Keyboard shortcuts"],
  },
];

export const NAV_GROUPS: NavGroup[] = ["Workspace", "Analysis", "Library"];

export const DEFAULT_PATH = NAV_ITEMS[0]!.path;

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
}

export function requireNav(path: string): NavItem {
  const item = NAV_ITEMS.find((i) => i.path === path);
  if (!item) throw new Error(`unknown nav path ${path}`);
  return item;
}
