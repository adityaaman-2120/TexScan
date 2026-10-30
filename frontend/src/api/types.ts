import type { components } from "./schema";

type Schemas = components["schemas"];

export type InspectionOut = Schemas["InspectionOut"];
export type InspectionSummary = Schemas["InspectionSummary"];
export type InspectionPage = Schemas["InspectionPage"];
export type ProfileOut = Schemas["ProfileOut"];
export type StatsOut = Schemas["StatsOut"];
export type Defect = Schemas["Defect"];
export type BitPlanesOut = Schemas["BitPlanesOut"];
export type BitPlane = Schemas["BitPlane"];
export type BatchAccepted = Schemas["BatchAccepted"];
export type ArenaOut = Schemas["ArenaOut"];
export type RobustnessOut = Schemas["RobustnessOut"];
export type SpectrumOut = Schemas["SpectrumOut"];
export type SpectrumApplyOut = Schemas["SpectrumApplyOut"];
export type ArenaMethodResult = Schemas["ArenaMethodResult"];
export type RobustnessPoint = Schemas["RobustnessPoint"];
export type MvtecStatus = Schemas["MvtecStatus"];
export type MvtecSample = Schemas["MvtecSample"];
export type BenchmarkOut = Schemas["BenchmarkOut"];
export type CategoryMetrics = Schemas["CategoryMetrics"];

export type Decision = InspectionSummary["decision"];
export type Method = "fft" | "gabor" | "golden_template" | "local_statistics";

export const METHOD_LABELS: Record<Method, string> = {
  fft: "FFT notch",
  gabor: "Gabor bank",
  golden_template: "Golden template",
  local_statistics: "Local statistics",
};
