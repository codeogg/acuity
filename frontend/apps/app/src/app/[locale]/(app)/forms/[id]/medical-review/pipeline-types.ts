export type PipelineStepId =
  | "upload"
  | "preprocess"
  | "ocr"
  | "classify"
  | "visit"
  | "prompt"
  | "extract"
  | "finalize"
  | "review";

export type StepVisualStatus = "pending" | "running" | "completed" | "skipped";

export type PipelinePhase =
  | "uploaded"
  | "preprocessing"
  | "ocr"
  | "ocr_skipped"
  | "classifying"
  | "detecting_visits"
  | "visit_select"
  | "extracting"
  | "finalizing"
  | "preparing_review"
  | "review"
  | "completed"
  | "failed";

export function createInitialStepStatuses(): Record<PipelineStepId, StepVisualStatus> {
  return {
    upload: "completed",
    preprocess: "pending",
    ocr: "pending",
    classify: "pending",
    visit: "pending",
    prompt: "pending",
    extract: "pending",
    finalize: "pending",
    review: "pending",
  };
}

export function extractStageToPhase(
  stage: string,
): PipelinePhase {
  switch (stage) {
    case "INGEST":
      return "preprocessing";
    case "CLASSIFY":
      return "classifying";
    case "EXTRACT":
      return "extracting";
    case "VALIDATE":
      return "finalizing";
    case "AWAITING_INPUT":
      return "visit_select";
    case "DONE":
      return "review";
    case "FAILED":
      return "failed";
    default:
      return "uploaded";
  }
}

export function stageToStep(stage: string): PipelineStepId | null {
  if (stage === "INGEST") return "preprocess";
  if (stage === "CLASSIFY") return "classify";
  if (stage === "EXTRACT") return "extract";
  if (stage === "VALIDATE") return "finalize";
  return null;
}
