export const SOURCE_OPTIONS = [
  "Xiaohongshu",
  "Google",
  "Facebook",
  "Referral",
  "Repeat Client",
  "Walk-in",
  "Other",
] as const;

export const TARGET_AREA_OPTIONS = [
  "Kitchen",
  "Bathroom",
  "Flooring",
  "Carpet",
  "Painting",
  "Full Renovation",
  "Other",
] as const;

export const STAGES = [
  { key: "P1_NEW", label: "新建", color: "bg-slate-600" },
  { key: "P2_MEASURE_QUOTE", label: "量尺报价", color: "bg-sky-600" },
  { key: "P3_START_MATERIALS", label: "进场材料", color: "bg-amber-500" },
  { key: "P4_CONSTRUCTION", label: "施工中", color: "bg-violet-600" },
  { key: "CLOSED", label: "已完工", color: "bg-emerald-600" },
] as const;

export function stageMeta(stage: string) {
  return (
    STAGES.find((s) => s.key === stage) ?? {
      key: stage as any,
      label: stage,
      color: "bg-gray-500",
    }
  );
}