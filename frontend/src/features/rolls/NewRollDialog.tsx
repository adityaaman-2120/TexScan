import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCreateRoll, useProfiles } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUi } from "@/store/ui";
import { lengthToMetres, parsePositive, widthToMm, type RollLengthUnit, type RollWidthUnit } from "./rollMath";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Roll ID, supplier, fabric and profile, width and length. */
export function NewRollDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateRoll();
  const { data: profiles } = useProfiles();
  const activeProfile = useUi((s) => s.profileId);

  const [code, setCode] = useState("");
  const [supplier, setSupplier] = useState("");
  const [fabric, setFabric] = useState("");
  const [profileId, setProfileId] = useState<string>("");
  const [width, setWidth] = useState("");
  const [widthUnit, setWidthUnit] = useState<RollWidthUnit>("cm");
  const [length, setLength] = useState("");
  const [lengthUnit, setLengthUnit] = useState<RollLengthUnit>("m");
  const [limit, setLimit] = useState("40");

  const calibrated = (profiles ?? []).filter((p) => p.config.calibration != null);
  const chosen = profileId || (calibrated.find((p) => p.id === activeProfile)?.id ?? calibrated[0]?.id)?.toString() || "";
  const widthMm = widthToMm(width, widthUnit);
  const lengthM = lengthToMetres(length, lengthUnit);
  const limitValue = parsePositive(limit);
  const ready = code.trim() !== "" && chosen !== "" && widthMm !== null && lengthM !== null && limitValue !== null;

  const submit = () => {
    if (!ready || widthMm === null || lengthM === null || limitValue === null) return;
    create.mutate(
      { code: code.trim(), supplier: supplier.trim(), fabric: fabric.trim(), profile_id: Number(chosen), width_mm: widthMm, length_m: lengthM, limit: limitValue, hole_rule: "tiered", along: "vertical", inspector: "", notes: "" },
      {
        onSuccess: (roll) => {
          toast.success(`Roll ${roll.code} started`);
          onOpenChange(false);
          navigate(`/roll/${roll.id}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle className="text-base font-semibold">New roll</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">Details of the roll you are about to inspect. They appear on the report.</DialogDescription>
        <form
          className="mt-3 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Roll ID">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. R-2041" aria-label="Roll ID" autoFocus />
          </Field>
          <Field label="Supplier">
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Acme Mills" aria-label="Supplier" />
          </Field>
          <Field label="Fabric type">
            <Input value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="e.g. Cotton twill 3/1" aria-label="Fabric type" />
          </Field>
          <Field label="Fabric profile" hint="Must be size-calibrated, because points come from real defect lengths.">
            <Select value={chosen} onValueChange={setProfileId}>
              <SelectTrigger aria-label="Fabric profile">
                <SelectValue placeholder="Choose a calibrated profile" />
              </SelectTrigger>
              <SelectContent>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} disabled={p.config.calibration == null}>
                    {p.name}
                    {p.config.calibration == null ? " (not calibrated)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {profiles && calibrated.length === 0 && (
              <span className="mt-1 block text-[11px] text-warning">
                No calibrated profile yet. <Link to="/profiles" onClick={() => onOpenChange(false)} className="underline underline-offset-4">Open Profiles</Link> and calibrate sizes first.
              </span>
            )}
          </Field>
          <Field label="Cuttable width" hint="Between the selvages.">
            <div className="flex items-center gap-2">
              <Input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} aria-label="Roll width" className="num" />
              <Segmented label="Width unit" value={widthUnit} onChange={setWidthUnit} options={[{ value: "cm", label: "cm" }, { value: "in", label: "in" }, { value: "mm", label: "mm" }]} />
            </div>
          </Field>
          <Field label="Roll length">
            <div className="flex items-center gap-2">
              <Input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} aria-label="Roll length" className="num" />
              <Segmented label="Length unit" value={lengthUnit} onChange={setLengthUnit} options={[{ value: "m", label: "m" }, { value: "yd", label: "yd" }]} />
            </div>
          </Field>
          <Field label="Acceptance limit" hint="Accept when points per 100 sq yd are at or below this. 40 is the usual limit.">
            <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Acceptance limit" className="num w-28" />
          </Field>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Start roll
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
