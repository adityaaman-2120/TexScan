import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, postForm, unwrap } from "./client";
import type { BatchAccepted, CalibrationOut, CaptureResult, InspectionOut, Method, ProfileOut, RollIn, RollPatch } from "./types";

/** Query keys in one place so mutations can invalidate precisely. */
export const keys = {
  health: ["health"] as const,
  profiles: ["profiles"] as const,
  stats: (days: number) => ["stats", days] as const,
  inspections: (params: InspectionListParams) => ["inspections", params] as const,
  inspection: (id: number) => ["inspection", id] as const,
  bitPlanes: (id: number) => ["bit-planes", id] as const,
  rolls: (params: RollListParams) => ["rolls", params] as const,
  roll: (id: number) => ["roll", id] as const,
  rollStats: ["roll-stats"] as const,
  mvtec: ["mvtec"] as const,
  mvtecSamples: (category: string) => ["mvtec", "samples", category] as const,
  benchmark: (source: string) => ["benchmark", source] as const,
};

export interface InspectionListParams {
  decision?: "PASS" | "FAIL";
  profile_id?: number;
  method?: string;
  q?: string;
  batch_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

/** Polled for the status dot; errors are shown by the dot, not by a toast. */
export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: () => unwrap(client.GET("/health")),
    refetchInterval: 15_000,
    retry: false,
    meta: { silent: true },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: () => unwrap(client.GET("/profiles")),
  });
}

export function useStats(days = 30) {
  return useQuery({
    queryKey: keys.stats(days),
    queryFn: () => unwrap(client.GET("/stats", { params: { query: { days } } })),
  });
}

export function useInspections(params: InspectionListParams = {}) {
  return useQuery({
    queryKey: keys.inspections(params),
    queryFn: () => unwrap(client.GET("/inspections", { params: { query: params } })),
    placeholderData: keepPreviousData, // keep the old page visible while the next one loads
  });
}

export function useInspection(id: number | undefined) {
  return useQuery({
    queryKey: keys.inspection(id ?? -1),
    // openapi-fetch widens the schema's fixed-length tuples (bbox) to number[]; the shared InspectionOut type keeps them
    queryFn: async () => (await unwrap(client.GET("/inspections/{inspection_id}", { params: { path: { inspection_id: id! } } }))) as InspectionOut,
    enabled: id !== undefined,
  });
}

export interface InspectInput {
  image: File;
  reference?: File;
  profileId?: number | null;
  method?: Method;
  /** Partial PipelineConfig overrides. */
  config?: Record<string, unknown>;
}

function inspectForm({ image, reference, profileId, method, config }: InspectInput): FormData {
  const form = new FormData();
  form.append("image", image);
  if (reference) form.append("reference", reference);
  if (profileId != null) form.append("profile_id", String(profileId));
  if (method) form.append("method", method);
  if (config) form.append("config", JSON.stringify(config));
  return form;
}

export function useInspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InspectInput) => postForm<InspectionOut>("/inspect", inspectForm(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useInspectBatch() {
  return useMutation({
    mutationFn: ({ images, ...rest }: Omit<InspectInput, "image"> & { images: File[] }) => {
      const form = inspectForm({ image: images[0]!, ...rest });
      form.delete("image");
      images.forEach((file) => form.append("images", file));
      return postForm<BatchAccepted>("/inspect/batch", form);
    },
  });
}

export function useDeleteInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(client.DELETE("/inspections/{inspection_id}", { params: { path: { inspection_id: id } } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unwrap(client.DELETE("/profiles/{profile_id}", { params: { path: { profile_id: id } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.profiles }),
  });
}

export interface AutotuneInput {
  name: string;
  method: "fft" | "gabor" | "local_statistics";
  quantile: number;
  maxSide: number;
  /** judge only the middle part of each picture (1 = all of it) */
  centerFraction: number;
  images: File[];
}

/** Learn a profile from known-good images. Can take a while (several pipeline runs per image). */
export function useAutotune() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, method, quantile, maxSide, centerFraction, images }: AutotuneInput) => {
      const form = new FormData();
      images.forEach((file) => form.append("images", file));
      form.append("name", name);
      form.append("method", method);
      form.append("quantile", String(quantile));
      form.append("config", JSON.stringify({ max_side: maxSide, center_fraction: centerFraction }));
      return postForm<ProfileOut>("/profiles/autotune", form);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.profiles }),
  });
}

/** Whether MVTEC_PATH points at a dataset on the server (not an error when it does not). */
export function useMvtecStatus() {
  return useQuery({ queryKey: keys.mvtec, queryFn: () => unwrap(client.GET("/datasets/mvtec")), staleTime: 60_000 });
}

export function useMvtecSamples(category: string | undefined) {
  return useQuery({
    queryKey: keys.mvtecSamples(category ?? ""),
    queryFn: () => unwrap(client.GET("/datasets/mvtec/samples", { params: { query: { category: category!, limit: 24 } } })),
    enabled: category !== undefined,
  });
}

/** The benchmark table written by `make eval`. */
export function useBenchmark(source: "mvtec" | "synthetic") {
  return useQuery({
    queryKey: keys.benchmark(source),
    queryFn: () => unwrap(client.GET("/benchmark", { params: { query: { source } } })),
    staleTime: 30_000,
  });
}

/** The eight bit planes of a stored inspection's grayscale image (fetched only when the viewer is open). */
export function useBitPlanes(inspectionId: number | undefined) {
  return useQuery({
    queryKey: keys.bitPlanes(inspectionId ?? 0),
    queryFn: () => unwrap(client.GET("/inspections/{inspection_id}/bit-planes", { params: { path: { inspection_id: inspectionId! } } })),
    enabled: inspectionId !== undefined,
    placeholderData: keepPreviousData,
    staleTime: Infinity, // the planes of a stored image never change
  });
}

export interface RulerInput {
  imageWidth: number;
  imageHeight: number;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  distanceMm: number;
}

/** Calibrations change what every later inspection of the profile reports, so the profile list is refreshed. */
function useRefreshProfiles() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.profiles });
}

/** Find the printed marker in a photo and store mm per pixel in the profile. */
export function useCalibrateMarker(profileId: number) {
  const refresh = useRefreshProfiles();
  return useMutation({
    mutationFn: ({ image, sideMm }: { image: File; sideMm: number }) => {
      const form = new FormData();
      form.append("image", image);
      form.append("side_mm", String(sideMm));
      return postForm<CalibrationOut>(`/profiles/${profileId}/calibration/marker`, form);
    },
    onSuccess: () => void refresh(),
  });
}

/** Two clicked points on a ruler and the real distance between them. */
export function useCalibrateRuler(profileId: number) {
  const refresh = useRefreshProfiles();
  return useMutation({
    mutationFn: ({ imageWidth, imageHeight, p1, p2, distanceMm }: RulerInput) => {
      const form = new FormData();
      form.append("image_width", String(imageWidth));
      form.append("image_height", String(imageHeight));
      form.append("x1", String(p1.x));
      form.append("y1", String(p1.y));
      form.append("x2", String(p2.x));
      form.append("y2", String(p2.y));
      form.append("distance_mm", String(distanceMm));
      return postForm<CalibrationOut>(`/profiles/${profileId}/calibration/ruler`, form);
    },
    onSuccess: () => void refresh(),
  });
}

export function useClearCalibration(profileId: number) {
  const refresh = useRefreshProfiles();
  return useMutation({
    mutationFn: () => unwrap(client.DELETE("/profiles/{profile_id}/calibration", { params: { path: { profile_id: profileId } } })),
    onSuccess: () => void refresh(),
  });
}

export interface RollListParams {
  status?: "open" | "complete";
  q?: string;
  limit?: number;
}

export function useRolls(params: RollListParams = {}) {
  return useQuery({
    queryKey: keys.rolls(params),
    queryFn: () => unwrap(client.GET("/rolls", { params: { query: params } })),
    placeholderData: keepPreviousData,
  });
}

export function useRoll(id: number | undefined) {
  return useQuery({
    queryKey: keys.roll(id ?? -1),
    queryFn: () => unwrap(client.GET("/rolls/{roll_id}", { params: { path: { roll_id: id! } } })),
    enabled: id !== undefined,
  });
}

export function useRollStats() {
  return useQuery({ queryKey: keys.rollStats, queryFn: () => unwrap(client.GET("/rolls/stats")) });
}

/** Everything a roll change can touch: the lists, the roll, the dashboard KPIs, and the inspections its captures are. */
function useRefreshRolls() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [["rolls"], ["roll"], ["roll-stats"], ["inspections"], ["stats"]]) void queryClient.invalidateQueries({ queryKey: key });
  };
}

export function useCreateRoll() {
  const refresh = useRefreshRolls();
  return useMutation({ mutationFn: (body: RollIn) => unwrap(client.POST("/rolls", { body })), onSuccess: refresh });
}

export function useUpdateRoll(id: number) {
  const refresh = useRefreshRolls();
  return useMutation({
    mutationFn: (body: RollPatch) => unwrap(client.PATCH("/rolls/{roll_id}", { params: { path: { roll_id: id } }, body })),
    onSuccess: refresh,
  });
}

export function useDeleteRoll() {
  const refresh = useRefreshRolls();
  return useMutation({
    mutationFn: (id: number) => unwrap(client.DELETE("/rolls/{roll_id}", { params: { path: { roll_id: id } } })),
    onSuccess: refresh,
  });
}

/** Inspect pictures with the roll's profile and place them at their metre marks. */
export function useAddCaptures(rollId: number) {
  const refresh = useRefreshRolls();
  return useMutation({
    mutationFn: ({ files, positions, config }: { files: File[]; positions: number[]; config?: Record<string, unknown> }) => {
      const form = new FormData();
      files.forEach((f) => form.append("images", f));
      form.append("positions", JSON.stringify(positions));
      if (config) form.append("config", JSON.stringify(config));
      return postForm<CaptureResult>(`/rolls/${rollId}/captures`, form);
    },
    onSuccess: refresh,
  });
}

export function useDeleteCapture(rollId: number) {
  const refresh = useRefreshRolls();
  return useMutation({
    mutationFn: (captureId: number) =>
      unwrap(client.DELETE("/rolls/{roll_id}/captures/{capture_id}", { params: { path: { roll_id: rollId, capture_id: captureId } } })),
    onSuccess: refresh,
  });
}
