/** Daily learning domain types — no I/O. */

export type LearningTrack = "dafYomi" | "mishnaYomi" | "yerushalmiYomi" | "nachYomi";

export type LearningEntry = {
  track: LearningTrack;
  labelKey: string;
  description: string;
};

export type LearningView = {
  date: string;
  entries: LearningEntry[];
};

export const LEARNING_TRACKS: LearningTrack[] = [
  "dafYomi",
  "mishnaYomi",
  "yerushalmiYomi",
  "nachYomi",
];
