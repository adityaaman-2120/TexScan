import { ImagePlus, Loader2, Webcam, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAddCaptures } from "@/api/hooks";
import type { RollOut } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { plural } from "@/lib/utils";
import { nextPosition, parsePositive, spacedPositions } from "./rollMath";

interface Pending {
  id: number;
  file: File;
  preview: string;
  position: string;
}

const textOf = (n: number): string => String(n);

/** Pictures to add with their metre marks, uploaded in one go; or capture from Live. */
export function CaptureUploader({ roll }: { roll: RollOut }) {
  const add = useAddCaptures(roll.id);
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const [items, setItems] = useState<Pending[]>([]);
  const lastCovered = roll.captures.at(-1)?.covered_m;
  const suggested = nextPosition(roll.captures, roll.length_m);
  const [step, setStep] = useState(lastCovered ? textOf(Math.round(lastCovered * 100) / 100) : "");
  const [start, setStart] = useState(textOf(suggested));
  const closed = roll.status === "complete";

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | File[] | null) => {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const stepValue = parsePositive(step);
    const marks = stepValue !== null ? spacedPositions(suggested + items.length * stepValue, stepValue, images.length, roll.length_m) : [];
    setItems((prev) => [
      ...prev,
      ...images.map((file, i) => ({ id: ++counter.current, file, preview: URL.createObjectURL(file), position: marks[i] !== undefined ? textOf(marks[i]!) : "" })),
    ]);
  };

  const remove = (id: number) =>
    setItems((prev) => {
      prev.filter((i) => i.id === id).forEach((i) => URL.revokeObjectURL(i.preview));
      return prev.filter((i) => i.id !== id);
    });

  const fill = () => {
    const s = Number(start.replace(",", "."));
    const st = parsePositive(step);
    if (!Number.isFinite(s) || st === null) return;
    const marks = spacedPositions(s, st, items.length, roll.length_m);
    setItems((prev) => prev.map((i, n) => ({ ...i, position: textOf(marks[n]!) })));
  };

  const positions = items.map((i) => (i.position.trim() === "" ? NaN : Number(i.position.replace(",", "."))));
  const valid = items.length > 0 && positions.every((p) => Number.isFinite(p) && p >= 0 && p <= roll.length_m);

  const submit = () => {
    add.mutate(
      { files: items.map((i) => i.file), positions },
      {
        onSuccess: (res) => {
          items.forEach((i) => URL.revokeObjectURL(i.preview));
          setItems([]);
          setStart(textOf(nextPosition(res.roll.captures, res.roll.length_m)));
          toast.success(`Added ${plural(res.added, "picture")}`, {
            description: res.rejected.length ? `${res.rejected.length} could not be read: ${res.rejected.map((r) => r.filename).join(", ")}` : `Roll score: ${res.roll.summary.total_points} points.`,
          });
        },
      },
    );
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Add pictures</CardTitle>
        <CardDescription>
          Give each picture the metre mark at its top edge, counted from the start of the roll. Pictures should follow one another without overlapping.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {closed ? (
          <p className="text-sm text-muted-foreground">This roll is complete. Open it again to add pictures.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label="Choose pictures of the roll"
                tabIndex={-1}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => input.current?.click()}>
                <ImagePlus />
                Choose pictures
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/live?roll=${roll.id}&at=${suggested}`}>
                  <Webcam />
                  Capture from Live
                </Link>
              </Button>
            </div>

            {items.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium">First picture at (m)</span>
                    <Input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} aria-label="First picture position" className="num h-8 w-24" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium">Then every (m)</span>
                    <Input inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} aria-label="Distance between pictures" className="num h-8 w-24" />
                  </label>
                  <Button variant="outline" size="sm" onClick={fill} disabled={parsePositive(step) === null}>
                    Fill the metre marks
                  </Button>
                </div>

                <ul className="space-y-2" aria-label="Pictures to add">
                  {items.map((i, n) => {
                    const bad = i.position.trim() !== "" && !(Number.isFinite(positions[n]) && positions[n]! >= 0 && positions[n]! <= roll.length_m);
                    return (
                      <li key={i.id} className="flex items-center gap-3 rounded-lg border p-2">
                        <img src={i.preview} alt="" className="size-12 shrink-0 rounded object-cover" />
                        <span className="min-w-0 flex-1 truncate text-sm">{i.file.name}</span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          at
                          <Input
                            inputMode="decimal"
                            value={i.position}
                            onChange={(e) => setItems((prev) => prev.map((p) => (p.id === i.id ? { ...p, position: e.target.value } : p)))}
                            aria-label={`Metre mark of ${i.file.name}`}
                            aria-invalid={bad}
                            className="num h-8 w-24"
                          />
                          m
                        </label>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${i.file.name}`} onClick={() => remove(i.id)}>
                          <X />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center gap-3">
                  <Button onClick={submit} disabled={!valid || add.isPending}>
                    {add.isPending && <Loader2 className="animate-spin" />}
                    {add.isPending ? "Inspecting…" : `Inspect ${plural(items.length, "picture")}`}
                  </Button>
                  {!valid && <span className="text-xs text-muted-foreground">Every picture needs a metre mark between 0 and {roll.length_m} m.</span>}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
