import type { ChangeType, RowKind } from "./data/BuildingChangeSource";

/** Shared by the map layers and the legend so they can't drift apart. */
export const CHANGE_COLORS: Record<ChangeType, string> = {
  gone: "#d7301f", // red-orange
  new: "#2166ac", // blue (red/blue stays distinguishable for red-green colour blindness)
  unknown: "#8c8c8c",
};

export const CHANGE_LABELS: Record<ChangeType, string> = {
  gone: "Building removed",
  new: "New building",
  unknown: "Unknown type",
};

export const KIND_LABELS: Record<RowKind, string> = {
  code: "Model output (C…)",
  answer: "Answer key (A…)",
  other: "Other",
};

export const TEST_AREA_COLOR = "#7b3294";
