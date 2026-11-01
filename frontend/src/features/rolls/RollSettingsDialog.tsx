import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUpdateRoll } from "@/api/hooks";
import type { RollOut } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { parsePositive } from "./rollMath";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Edit a roll's details and its scoring settings. The settings take effect on the score straight away. */
export function RollSettingsDialog({ roll, open, onOpenChange }: { roll: RollOut; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateRoll(roll.id);
  const [supplier, setSupplier] = useState(roll.supplier);
  const [fabric, setFabric] = useState(roll.fabric);
  const [inspector, setInspector] = useState(roll.inspector);
  const [notes, setNotes] = useState(roll.notes);
  const [width, setWidth] = useState(String(Math.round(roll.width_mm) / 10));
  const [length, setLength] = useState(String(roll.length_m));
  const [limit, setLimit] = useState(String(roll.limit));
  const [holeRule, setHoleRule] = useState(roll.hole_rule);
  const [along, setAlong] = useState(roll.along);

  const widthCm = parsePositive(width);
  const lengthM = parsePositive(length);
  const limitValue = parsePositive(limit);
  const ready = widthCm !== null && lengthM !== null && limitValue !== null;

  const save = () => {
    if (!ready || widthCm === null || lengthM === null || limitValue === null) return;
    update.mutate(
      { supplier: supplier.trim(), fabric: fabric.trim(), inspector: inspector.trim(), notes, width_mm: widthCm * 10, length_m: lengthM, limit: limitValue, hole_rule: holeRule, along },
      {
        onSuccess: () => {
          toast.success("Roll updated");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogTitle className="text-base font-semibold">Roll settings</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">Roll {roll.code}. The scoring rules are listed in docs/GRADING.md.</DialogDescription>
        <form
          className="mt-3 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Supplier">
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier" />
          </Field>
          <Field label="Fabric type">
            <Input value={fabric} onChange={(e) => setFabric(e.target.value)} aria-label="Fabric type" />
          </Field>
          <Field label="Cuttable width (cm)">
            <Input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} aria-label="Cuttable width in centimetres" className="num" />
          </Field>
          <Field label="Roll length (m)">
            <Input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} aria-label="Roll length in metres" className="num" />
          </Field>
          <Field label="Acceptance limit" hint="Points per 100 sq yd. Accept at or below it.">
            <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Acceptance limit" className="num w-28" />
          </Field>
          <Field label="QC inspector">
            <Input value={inspector} onChange={(e) => setInspector(e.target.value)} aria-label="QC inspector" />
          </Field>
          <Field label="Holes and openings" hint="Sources differ on this rule. Check your standard or buyer.">
            <Segmented
              label="Hole rule"
              value={holeRule}
              onChange={setHoleRule}
              options={[
                { value: "tiered", label: "1 in or less = 2, over = 4" },
                { value: "any_four", label: "Any hole = 4" },
              ]}
            />
          </Field>
          <Field label="The roll runs along the picture's" hint="Which edge of the picture points along the roll.">
            <Segmented
              label="Roll direction"
              value={along}
              onChange={setAlong}
              options={[
                { value: "vertical", label: "Vertical axis" },
                { value: "horizontal", label: "Horizontal axis" },
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (printed on the report)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-label="Notes"
                rows={3}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || update.isPending}>
              {update.isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
