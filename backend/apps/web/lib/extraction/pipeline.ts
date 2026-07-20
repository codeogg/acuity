import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type {
  ExtractionReviewOutput,
  ExtractionTask,
  FinalizeExtractionOutput,
  Step10MapOutput,
  Step11PrepareReviewOutput,
  Step2PreprocessOutput,
  Step3OcrOutput,
  Step4ClassifyOutput,
  Step5DetectVisitsOutput,
  Step5SelectVisitOutput,
  Step6BuildPromptOutput,
  Step7ExtractFieldsOutput,
  Step8ValidateOutput,
  Step9DetectMissingOutput,
  VisitCandidate,
} from "@/lib/api/types";
import type { AppLocale } from "@/lib/i18n/types";

export type { FinalizeExtractionOutput };

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

export type PipelineStepDef = {
  id: PipelineStepId;
  number: number;
  title: string;
  description: string;
};

export const PIPELINE_STEPS: PipelineStepDef[] = [
  { id: "upload", number: 1, title: "上載 PDF", description: "建立提取工作並儲存原檔" },
  { id: "preprocess", number: 2, title: "PDF 預處理", description: "分頁、文字層偵測及頁面標記" },
  { id: "ocr", number: 3, title: "OCR 識別", description: "識別掃描頁文字（純文字層可略過引擎）" },
  { id: "classify", number: 4, title: "文件分類", description: "識別文件類型及保險公司" },
  { id: "visit", number: 5, title: "就診選擇", description: "多次就診時選擇本次提取範圍" },
  { id: "prompt", number: 6, title: "建立 Prompt", description: "組合欄位提取提示詞" },
  { id: "extract", number: 7, title: "欄位提取", description: "使用 AI 提取標準欄位" },
  {
    id: "finalize",
    number: 8,
    title: "驗證及映射",
    description: "欄位驗證、缺失偵測及保險欄位映射",
  },
  { id: "review", number: 9, title: "產生交付資料", description: "產生可編輯審核表單" },
];

export function getPipelineSteps(locale: AppLocale): PipelineStepDef[] {
  if (locale !== "en-HK") return PIPELINE_STEPS;
  const titles: Record<PipelineStepId, [string, string]> = {
    upload: ["Upload PDF", "Create an extraction task and save the original"],
    preprocess: ["Preprocess PDF", "Split pages, detect text layers and mark pages"],
    ocr: ["OCR", "Read scanned text (skip engine for text-only pages)"],
    classify: ["Classify documents", "Identify document types and insurer"],
    visit: ["Select visit", "Choose the extraction range when multiple visits exist"],
    prompt: ["Build prompt", "Assemble field extraction instructions"],
    extract: ["Extract fields", "Extract standard fields with AI"],
    finalize: ["Validate and map", "Validate fields, detect missing data and map insurer fields"],
    review: ["Prepare review data", "Generate an editable review form"],
  };
  return PIPELINE_STEPS.map((step) => ({
    ...step,
    title: titles[step.id][0],
    description: titles[step.id][1],
  }));
}

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

const STATUS_RANK: Record<ExtractionTask["status"], number> = {
  WAITING: 0,
  PREPROCESSING: 1,
  OCR: 2,
  CLASSIFYING: 3,
  VISIT_SELECT: 4,
  EXTRACTING: 5,
  VALIDATING: 6,
  MAPPING: 7,
  REVIEW: 8,
  COMPLETED: 9,
  FAILED: -1,
};

/** 根据任务状态推断刷新页面时已完成的步骤（用于进度条恢复）。 */
export function inferStepStatusesFromTask(
  task: ExtractionTask,
  opts?: { visitRequired?: boolean },
): Record<PipelineStepId, StepVisualStatus> {
  const statuses = createInitialStepStatuses();
  const rank = STATUS_RANK[task.status];
  if (rank < 0) return statuses;

  if (rank >= 1) statuses.preprocess = "completed";
  if (rank >= 3) statuses.ocr = "completed";
  if (rank >= 4) statuses.classify = "completed";

  if (rank >= 5) {
    if (opts?.visitRequired === false) statuses.visit = "skipped";
    else statuses.visit = "completed";
  }

  const step = task.current_step ?? "";
  if (rank >= 5) {
    if (step.includes("STEP7") || rank >= 6) {
      statuses.prompt = "completed";
    }
    if (step.includes("STEP7_EXTRACT") || rank >= 6) {
      statuses.extract = "completed";
    }
  }
  if (rank >= 6) {
    statuses.prompt = "completed";
    statuses.extract = "completed";
  }
  if (rank >= 7) {
    statuses.finalize = "completed";
  }
  if (rank >= 8 && step.includes("STEP11")) {
    statuses.review = "completed";
  }

  return statuses;
}

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

export function phaseLabel(phase: PipelinePhase, locale: AppLocale = "zh-HK"): string {
  if (locale === "en-HK") {
    const labels: Record<PipelinePhase, string> = {
      uploaded: "Task created",
      preprocessing: "Preprocessing PDF…",
      ocr: "Running OCR…",
      ocr_skipped: "Reading text layer (OCR skipped)…",
      classifying: "Classifying documents…",
      detecting_visits: "Detecting visits…",
      visit_select: "Select a visit",
      extracting: "Extracting standard fields with AI…",
      finalizing: "Validating, completing and mapping fields…",
      preparing_review: "Preparing review data…",
      review: "Review and edit standard fields",
      completed: "Review completed",
      failed: "Processing failed",
    };
    return labels[phase];
  }
  const labels: Record<PipelinePhase, string> = {
    uploaded: "工作已建立",
    preprocessing: "正在預處理 PDF…",
    ocr: "正在進行 OCR 識別…",
    ocr_skipped: "正在解析文字層（略過 OCR）…",
    classifying: "正在進行文件分類…",
    detecting_visits: "正在偵測就診記錄…",
    visit_select: "請選擇就診記錄",
    extracting: "正在使用 AI 提取標準欄位…",
    finalizing: "正在驗證、補全及映射欄位…",
    preparing_review: "正在產生交付資料…",
    review: "請核對並編輯標準欄位",
    completed: "審核已完成",
    failed: "處理失敗",
  };
  return labels[phase];
}

export function statusToPhase(
  status: ExtractionTask["status"],
  opts?: { awaitingVisitSelect?: boolean; isReviewReady?: boolean },
): PipelinePhase {
  if (status === "WAITING") return "uploaded";
  if (status === "PREPROCESSING") return "preprocessing";
  if (status === "OCR") return "ocr";
  if (status === "CLASSIFYING") return "classifying";
  if (status === "VISIT_SELECT") {
    return opts?.awaitingVisitSelect ? "visit_select" : "detecting_visits";
  }
  if (status === "EXTRACTING") return "extracting";
  if (status === "VALIDATING" || status === "MAPPING") return "finalizing";
  if (status === "REVIEW") {
    return opts?.isReviewReady ? "review" : "preparing_review";
  }
  if (status === "COMPLETED") return "completed";
  return "failed";
}

const STEP_RUNNING_LABELS: Partial<Record<PipelineStepId, string>> = {
  preprocess: "PDF 預處理中",
  ocr: "OCR 識別中",
  classify: "文件分類中",
  visit: "就診記錄偵測中",
  prompt: "正在準備 AI 提取",
  extract: "AI 欄位提取中",
  finalize: "欄位驗證及映射中",
  review: "正在產生核對資料",
};

const PHASE_RUNNING_LABELS: Partial<Record<PipelinePhase, string>> = {
  preprocessing: "PDF 預處理中",
  ocr: "OCR 識別中",
  ocr_skipped: "文字層解析中",
  classifying: "文件分類中",
  detecting_visits: "就診記錄偵測中",
  visit_select: "請選擇就診記錄",
  extracting: "AI 欄位提取中",
  finalizing: "欄位驗證及映射中",
  preparing_review: "正在產生核對資料",
};

/** 左侧 PDF 遮罩：仅展示当前进行中的一步（简化文案）。 */
export function resolveExtractionOverlayLabel(opts: {
  currentStepId: PipelineStepId | null;
  stepStatuses: Record<PipelineStepId, StepVisualStatus>;
  phase: PipelinePhase;
  showVisitDialog?: boolean;
  locale?: AppLocale;
}): string {
  const english = opts.locale === "en-HK";
  if (opts.showVisitDialog) return english ? "Select a visit" : "請選擇就診記錄";

  const { currentStepId, stepStatuses, phase } = opts;

  if (currentStepId && stepStatuses[currentStepId] === "running") {
    if (currentStepId === "ocr") {
      return phase === "ocr_skipped"
        ? english ? "Reading text layer" : "文字層解析中"
        : english ? "Running OCR" : "OCR 識別中";
    }
    if (english) {
      const labels: Partial<Record<PipelineStepId, string>> = {
        preprocess: "Preprocessing PDF",
        ocr: "Running OCR",
        classify: "Classifying documents",
        visit: "Detecting visits",
        prompt: "Preparing AI extraction",
        extract: "Extracting fields with AI",
        finalize: "Validating and mapping fields",
        review: "Preparing review data",
      };
      return labels[currentStepId] ?? "AI extraction in progress";
    }
    return STEP_RUNNING_LABELS[currentStepId] ?? "AI 識別中";
  }

  if (phase === "extracting") {
    if (stepStatuses.prompt === "running") return english ? "Preparing AI extraction" : "正在準備 AI 提取";
    if (stepStatuses.extract === "running") return english ? "Extracting fields with AI" : "AI 欄位提取中";
  }

  return english
    ? phaseLabel(phase, "en-HK").replace(/…$/, "")
    : PHASE_RUNNING_LABELS[phase] ?? "AI 識別中";
}

export async function fetchTask(taskId: string) {
  return apiFetch<ExtractionTask>(`/api/doctor/extraction-tasks/${taskId}`);
}

export async function runPreprocess(taskId: string) {
  return apiFetch<Step2PreprocessOutput>(
    `/api/doctor/extraction-tasks/${taskId}/preprocess`,
    { method: "POST" },
  );
}

export async function runOcr(taskId: string) {
  return apiFetch<Step3OcrOutput>(
    `/api/doctor/extraction-tasks/${taskId}/ocr`,
    { method: "POST", timeoutMs: 300_000 },
  );
}

/** Gemini 长耗时步骤 HTTP 超时（10 分钟，供 extraction-test 串行流程） */
export const GEMINI_STEP_TIMEOUT_MS = 600_000;

export async function runClassify(taskId: string) {
  return apiFetch<Step4ClassifyOutput>(
    `/api/doctor/extraction-tasks/${taskId}/classify`,
    { method: "POST", timeoutMs: GEMINI_STEP_TIMEOUT_MS },
  );
}

export async function runDetectVisits(taskId: string) {
  return apiFetch<Step5DetectVisitsOutput>(
    `/api/doctor/extraction-tasks/${taskId}/detect-visits`,
    { method: "POST", timeoutMs: GEMINI_STEP_TIMEOUT_MS },
  );
}

export async function fetchVisits(taskId: string) {
  return apiFetch<VisitCandidate[]>(
    `/api/doctor/extraction-tasks/${taskId}/visits`,
  );
}

export async function selectVisit(taskId: string, visitIndex: number) {
  return apiFetch<Step5SelectVisitOutput>(
    `/api/doctor/extraction-tasks/${taskId}/visits/select`,
    {
      method: "POST",
      body: { visit_index: visitIndex },
    },
  );
}

export async function runBuildPrompt(taskId: string) {
  return apiFetch<Step6BuildPromptOutput>(
    `/api/doctor/extraction-tasks/${taskId}/build-prompt`,
    { method: "POST" },
  );
}

export async function runExtractFields(taskId: string) {
  return apiFetch<Step7ExtractFieldsOutput>(
    `/api/doctor/extraction-tasks/${taskId}/extract-fields`,
    { method: "POST", timeoutMs: GEMINI_STEP_TIMEOUT_MS },
  );
}

export async function runValidate(taskId: string) {
  return apiFetch<Step8ValidateOutput>(
    `/api/doctor/extraction-tasks/${taskId}/validate`,
    { method: "POST" },
  );
}

export async function runDetectMissing(taskId: string) {
  return apiFetch<Step9DetectMissingOutput>(
    `/api/doctor/extraction-tasks/${taskId}/detect-missing`,
    { method: "POST" },
  );
}

export async function runFinalizeExtraction(
  taskId: string,
  options?: { templateId?: number },
) {
  return apiFetch<FinalizeExtractionOutput>(
    `/api/doctor/extraction-tasks/${taskId}/finalize-extraction`,
    {
      method: "POST",
      body: {
        template_id: options?.templateId ?? null,
      },
    },
  );
}

export async function runMapToInsurance(taskId: string) {
  return apiFetch<Step10MapOutput>(
    `/api/doctor/extraction-tasks/${taskId}/map-to-insurance`,
    { method: "POST", body: {} },
  );
}

export async function runPrepareReview(taskId: string) {
  return apiFetch<Step11PrepareReviewOutput>(
    `/api/doctor/extraction-tasks/${taskId}/prepare-review`,
    { method: "POST" },
  );
}

export async function fetchReviewOutput(taskId: string) {
  return apiFetch<ExtractionReviewOutput>(
    `/api/doctor/extraction-tasks/${taskId}/review-output`,
  );
}

const pipelineLocks = new Map<string, Promise<void>>();

/** 同一任务同时只跑一条流水线，避免 React StrictMode 重复触发导致 422。 */
export function runPipelineExclusive(
  taskId: string,
  runner: () => Promise<void>,
): Promise<void> {
  const existing = pipelineLocks.get(taskId);
  if (existing) return existing;
  const job = runner().finally(() => {
    pipelineLocks.delete(taskId);
  });
  pipelineLocks.set(taskId, job);
  return job;
}

export function clearPipelineLock(taskId: string) {
  pipelineLocks.delete(taskId);
}

export async function fetchExtractionResult(taskId: string) {
  return apiFetch<{ stage: string }>(
    `/api/doctor/extraction-tasks/${taskId}/extraction-result`,
  );
}

export async function isDetectMissingDone(taskId: string): Promise<boolean> {
  try {
    const result = await fetchExtractionResult(taskId);
    return result.stage === "final";
  } catch {
    return false;
  }
}

export async function fetchMappedResult(taskId: string) {
  try {
    return await apiFetch<Step10MapOutput["result"]>(
      `/api/doctor/extraction-tasks/${taskId}/mapped-result`,
    );
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}

export function isOcrStepDone(task: ExtractionTask): boolean {
  return (
    task.current_step === "STEP3_OCR_DONE" ||
    STATUS_RANK[task.status] > STATUS_RANK.OCR
  );
}

/** 422 或请求超时等场景下，若目标步骤已由并行/后台请求完成则吞掉错误继续。 */
export async function runStepSafe<T>(
  taskId: string,
  run: () => Promise<T>,
  isAlreadyDone: (task: ExtractionTask) => boolean,
  options?: { hasArtifact?: () => Promise<boolean> },
): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if (options?.hasArtifact && (await options.hasArtifact())) return null;
    if (err instanceof ApiRequestError && err.status === 422) {
      const latest = await fetchTask(taskId);
      if (isAlreadyDone(latest)) return null;
    }
    throw err;
  }
}

export async function runPostExtractionSteps(taskId: string) {
  await runBuildPrompt(taskId);
  await runExtractFields(taskId);
  await runFinalizeExtraction(taskId);
  await runPrepareReview(taskId);
}
