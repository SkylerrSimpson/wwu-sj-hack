export type ShipStatus = "priority" | "watch" | "suspicious" | "unlisted";

export const STATUS_WORD: Record<ShipStatus, string> = {
  priority: "priority",
  watch: "watch list",
  suspicious: "suspicious",
  unlisted: "unlisted",
};
