import { METHOD_LABELS, type Method } from "@/api/types";
import { useUi } from "@/store/ui";

/** Names shown to operators: what the scan does for them, not which algorithm runs. */
export const PRODUCT_METHOD_LABELS: Record<Method, string> = {
  gabor: "Texture scan",
  fft: "Pattern scan",
  local_statistics: "Surface scan",
  golden_template: "Reference match",
};

/** The technical name in engineering mode, the operator name otherwise. Unknown methods are shown as stored. */
export function methodLabel(method: string, engineering: boolean): string {
  const table: Record<string, string> = engineering ? METHOD_LABELS : PRODUCT_METHOD_LABELS;
  return table[method] ?? method;
}

export function useMethodLabel(): (method: string) => string {
  const engineering = useUi((s) => s.engineering);
  return (method) => methodLabel(method, engineering);
}
