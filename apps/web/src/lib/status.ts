import type { Status } from "@/lib/vessel";

export type ShipStatus = Status;

export const STATUS_WORD: Record<Status, string> = {
  // "approved" is the word Lummi Nation staff use; the code keeps `priority`.
  priority: "approved",
  watch: "watch list",
  suspicious: "suspicious",
  unlisted: "unlisted",
};
