export type ShipStatus = "priority" | "watch" | "suspicious" | "unlisted";

export const STATUS_WORD: Record<ShipStatus, string> = {
  // "approved" is the word Lummi Nation staff use; the code keeps `priority`.
  priority: "approved",
  watch: "watch list",
  suspicious: "suspicious",
  unlisted: "unlisted",
};
