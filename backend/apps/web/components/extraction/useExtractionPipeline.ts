"use client";

import { useCallback, useRef, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import type { ExtractionReviewOutput, ExtractionTask, VisitCandidate } from "@/lib/api/types";
import {
  clearPipelineLock,
  createInitialStepStatuses,
  fetchReviewOutput,
  fetchTask,
  fetchVisits,
  inferStepStatusesFromTask,
  isOcrStepDone,
  runBuildPrompt,
  runClassify,
  runDetectVisits,
  runExtractFields,
  runFinalizeExtraction,
  runOcr,
  runPipelineExclusive,
  runPrepareReview,
  runPreprocess,
  runStepSafe,
  selectVisit,
  type PipelinePhase,
  type PipelineStepId,
  type StepVisualStatus,
} from "@/lib/extraction/pipeline";
import { useI18n } from "@/lib/i18n/I18nProvider";

type PipelineState = {
  phase: PipelinePhase;
  task: ExtractionTask | null;
  review: ExtractionReviewOutput | null;
  visits: VisitCandidate[];
  error: string | null;
  showVisitDialog: boolean;
  stepStatuses: Record<PipelineStepId, StepVisualStatus>;
  currentStepId: PipelineStepId | null;
};

/** 根据 current_step 判断产物是否已生成，避免用 GET 探测导致 404 日志。 */
function hasPromptArtifact(task: ExtractionTask): boolean {
  const step = task.current_step ?? "";
  return (
    step.includes("STEP6_BUILD_PROMPT_DONE") ||
    step.includes("STEP7_") ||
    step.includes("STEP8_") ||
    step.includes("STEP9_") ||
    step.includes("STEP10_") ||
    step.includes("STEP11_")
  );
}

function hasExtractionResult(task: ExtractionTask): boolean {
  const step = task.current_step ?? "";
  return (
    step.includes("STEP7_EXTRACT_FIELDS_DONE") ||
    step.includes("STEP8_") ||
    step.includes("STEP9_") ||
    step.includes("STEP10_") ||
    step.includes("STEP11_") ||
    task.status === "VALIDATING" ||
    task.status === "MAPPING" ||
    task.status === "REVIEW" ||
    task.status === "COMPLETED"
  );
}

function hasMappedResult(task: ExtractionTask): boolean {
  const step = task.current_step ?? "";
  return (
    step.includes("STEP10_MAP_INSURANCE_DONE") ||
    step.includes("STEP11_") ||
    task.status === "REVIEW" ||
    task.status === "COMPLETED"
  );
}

async function hasOcrResults(taskId: string): Promise<boolean> {
  try {
    const { apiFetch } = await import("@/lib/api/client");
    const rows = await apiFetch<unknown[]>(
      `/api/doctor/extraction-tasks/${taskId}/ocr-results`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function needsOcrEngine(taskId: string): Promise<boolean> {
  const { apiFetch } = await import("@/lib/api/client");
  const pages = await apiFetch<Array<{ source: string }>>(
    `/api/doctor/extraction-tasks/${taskId}/pages`,
  );
  return pages.some((p) => p.source === "ocr_required");
}

const PAUSE_VISIT = "__VISIT_SELECT_PAUSE__";

export function useExtractionPipeline(
  taskId: string,
  options?: { templateId?: number },
) {
  const { t } = useI18n();
  const [state, setState] = useState<PipelineState>({
    phase: "uploaded",
    task: null,
    review: null,
    visits: [],
    error: null,
    showVisitDialog: false,
    stepStatuses: createInitialStepStatuses(),
    currentStepId: null,
  });
  const [selectedVisitIndex, setSelectedVisitIndex] = useState<number | null>(null);
  const [confirmingVisit, setConfirmingVisit] = useState(false);

  const awaitingVisitRef = useRef(false);
  const visitRequiredRef = useRef<boolean | null>(null);
  const startedRef = useRef(false);
  const templateIdRef = useRef(options?.templateId);
  templateIdRef.current = options?.templateId;

  const patchStep = useCallback(
    (stepId: PipelineStepId, status: StepVisualStatus) => {
      setState((prev) => ({
        ...prev,
        stepStatuses: { ...prev.stepStatuses, [stepId]: status },
        currentStepId: status === "running" ? stepId : prev.currentStepId,
      }));
    },
    [],
  );

  const beginStep = useCallback(
    (stepId: PipelineStepId, phase?: PipelinePhase) => {
      patchStep(stepId, "running");
      if (phase) {
        setState((prev) => ({ ...prev, phase }));
      }
    },
    [patchStep],
  );

  const completeStep = useCallback(
    (stepId: PipelineStepId) => {
      patchStep(stepId, "completed");
      setState((prev) => ({
        ...prev,
        currentStepId: prev.currentStepId === stepId ? null : prev.currentStepId,
      }));
    },
    [patchStep],
  );

  const skipStep = useCallback(
    (stepId: PipelineStepId) => {
      patchStep(stepId, "skipped");
      setState((prev) => ({
        ...prev,
        currentStepId: prev.currentStepId === stepId ? null : prev.currentStepId,
      }));
    },
    [patchStep],
  );

  const fail = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      phase: "failed",
      error: message,
      showVisitDialog: false,
      currentStepId: null,
    }));
  }, []);

  const loadReview = useCallback(async () => {
    try {
      return await fetchReviewOutput(taskId);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return null;
      throw err;
    }
  }, [taskId]);

  const finishReview = useCallback(async () => {
    beginStep("review", "preparing_review");
    let review = await loadReview();
    if (!review) {
      await runStepSafe(
        taskId,
        () => runPrepareReview(taskId),
        (t) => t.status === "REVIEW" || t.status === "COMPLETED",
      );
      review = await loadReview();
    }
    const latest = await fetchTask(taskId);
    completeStep("review");
    setState((prev) => ({
      ...prev,
      task: latest,
      review,
      phase: latest.status === "COMPLETED" ? "completed" : "review",
      showVisitDialog: false,
      currentStepId: null,
      stepStatuses: Object.fromEntries(
        Object.keys(prev.stepStatuses).map((id) => [id, "completed"]),
      ) as Record<PipelineStepId, StepVisualStatus>,
    }));
  }, [taskId, loadReview, beginStep, completeStep]);

  const runVisitStep = useCallback(
    async (task: ExtractionTask): Promise<ExtractionTask> => {
      if (task.status !== "VISIT_SELECT") {
        if (visitRequiredRef.current === false) {
          skipStep("visit");
        } else {
          completeStep("visit");
        }
        return task;
      }

      beginStep("visit", "detecting_visits");
      let visits = await fetchVisits(taskId);
      if (visits.length === 0) {
        const detected = await runDetectVisits(taskId);
        visits = detected.visits;
      }

      if (visits.length === 0) {
        skipStep("visit");
        return fetchTask(taskId);
      }

      if (visits.length === 1) {
        await runStepSafe(
          taskId,
          () => selectVisit(taskId, visits[0]!.visit_index),
          (t) =>
            t.status === "EXTRACTING" ||
            t.status === "VALIDATING" ||
            t.status === "MAPPING" ||
            t.status === "REVIEW",
        );
        completeStep("visit");
        return fetchTask(taskId);
      }

      const selected = visits.find((v) => v.selected);
      if (selected) {
        completeStep("visit");
        return fetchTask(taskId);
      }

      awaitingVisitRef.current = true;
      visitRequiredRef.current = true;
      setSelectedVisitIndex(visits[0]?.visit_index ?? null);
      setState((prev) => ({
        ...prev,
        task,
        visits,
        phase: "visit_select",
        showVisitDialog: true,
      }));
      throw new Error(PAUSE_VISIT);
    },
    [taskId, beginStep, completeStep, skipStep],
  );

  const runExtractionAndFinalize = useCallback(
    async (initialTask: ExtractionTask): Promise<ExtractionTask> => {
      let task = initialTask;

      if (task.status === "EXTRACTING") {
        if (hasPromptArtifact(task)) {
          completeStep("prompt");
        } else {
          beginStep("prompt", "extracting");
          await runStepSafe(
            taskId,
            () => runBuildPrompt(taskId),
            () => false,
          );
          completeStep("prompt");
        }
        task = await fetchTask(taskId);
      } else if (
        task.status === "VALIDATING" ||
        task.status === "MAPPING" ||
        task.status === "REVIEW"
      ) {
        completeStep("prompt");
      }

      if (task.status === "EXTRACTING") {
        if (hasExtractionResult(task)) {
          completeStep("extract");
        } else {
          beginStep("extract", "extracting");
          await runStepSafe(
            taskId,
            () => runExtractFields(taskId),
            (t) => t.status === "VALIDATING" || t.status === "MAPPING" || t.status === "REVIEW",
          );
          completeStep("extract");
        }
        task = await fetchTask(taskId);
      } else if (task.status === "VALIDATING" || task.status === "MAPPING") {
        completeStep("extract");
      }

      const mappedReady = hasMappedResult(task);
      if (
        task.status === "VALIDATING" ||
        task.status === "MAPPING" ||
        (task.status === "REVIEW" && !mappedReady)
      ) {
        beginStep("finalize", "finalizing");
        await runStepSafe(
          taskId,
          () =>
            runFinalizeExtraction(
              taskId,
              templateIdRef.current === undefined
                ? undefined
                : { templateId: templateIdRef.current },
            ),
          (t) => t.status === "REVIEW" || t.status === "COMPLETED",
          { hasArtifact: async () => hasMappedResult(await fetchTask(taskId)) },
        );
        completeStep("finalize");
        task = await fetchTask(taskId);
      } else if (task.status === "REVIEW" || task.status === "COMPLETED") {
        completeStep("finalize");
      }

      if (task.status === "REVIEW" || task.status === "COMPLETED") {
        await finishReview();
      }

      return task;
    },
    [taskId, beginStep, completeStep, finishReview],
  );

  const executePipeline = useCallback(async () => {
    if (awaitingVisitRef.current) return;

    try {
      let task = await fetchTask(taskId);
      const inferred = inferStepStatusesFromTask(
        task,
        visitRequiredRef.current === null
          ? undefined
          : { visitRequired: visitRequiredRef.current },
      );

      setState((prev) => ({
        ...prev,
        task,
        error: null,
        stepStatuses: { ...inferred, upload: "completed" },
      }));

      if (task.status === "COMPLETED") {
        const review = await loadReview();
        setState((prev) => ({
          ...prev,
          review,
          phase: "completed",
          stepStatuses: Object.fromEntries(
            Object.keys(prev.stepStatuses).map((k) => [k, "completed"]),
          ) as Record<PipelineStepId, StepVisualStatus>,
          currentStepId: null,
        }));
        return;
      }

      if (task.status === "FAILED") {
        fail(task.error_message ?? t("doctor.extractionTest.failed"));
        return;
      }

      if (task.status === "REVIEW") {
        const statuses = inferStepStatusesFromTask(
          task,
          visitRequiredRef.current === null
            ? undefined
            : { visitRequired: visitRequiredRef.current },
        );
        setState((prev) => ({
          ...prev,
          stepStatuses: {
            ...statuses,
            upload: "completed",
            finalize: "completed",
            extract: "completed",
            prompt: "completed",
          },
        }));
        await finishReview();
        return;
      }

      // Step 2 — 预处理
      if (task.status === "WAITING") {
        beginStep("preprocess", "preprocessing");
        await runPreprocess(taskId);
        completeStep("preprocess");
        task = await fetchTask(taskId);
      } else {
        completeStep("preprocess");
      }

      // Step 3 — OCR
      if (task.status === "OCR") {
        beginStep("ocr", (await needsOcrEngine(taskId)) ? "ocr" : "ocr_skipped");
        if (!(await hasOcrResults(taskId))) {
          await runStepSafe(
            taskId,
            () => runOcr(taskId),
            isOcrStepDone,
            { hasArtifact: () => hasOcrResults(taskId) },
          );
        }
        completeStep("ocr");
        task = await fetchTask(taskId);
      } else {
        completeStep("ocr");
      }

      // Step 4 — 分类
      if (task.status === "CLASSIFYING") {
        beginStep("classify", "classifying");
        const classified = await runClassify(taskId);
        visitRequiredRef.current = classified.status === "VISIT_SELECT";
        completeStep("classify");
        task = await fetchTask(taskId);
      } else {
        completeStep("classify");
        if (task.status === "VISIT_SELECT") {
          visitRequiredRef.current = true;
        }
      }

      // Step 5 — 就诊
      if (task.status === "VISIT_SELECT") {
        task = await runVisitStep(task);
      } else if (visitRequiredRef.current === false) {
        skipStep("visit");
      } else if (
        task.status === "EXTRACTING" ||
        task.status === "VALIDATING" ||
        task.status === "MAPPING" ||
        task.status === "REVIEW"
      ) {
        completeStep("visit");
      }

      if (task.status === "EXTRACTING" || task.status === "VALIDATING" || task.status === "MAPPING") {
        task = await runExtractionAndFinalize(task);
      } else if (task.status === "REVIEW") {
        await finishReview();
      }
    } catch (err) {
      if (err instanceof Error && err.message === PAUSE_VISIT) return;

      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("doctor.extractionTest.failed");
      fail(message);
      try {
        const task = await fetchTask(taskId);
        setState((prev) => ({ ...prev, task }));
      } catch {
        /* ignore */
      }
    }
  }, [
    taskId,
    beginStep,
    completeStep,
    fail,
    finishReview,
    loadReview,
    runVisitStep,
    runExtractionAndFinalize,
    skipStep,
    t,
  ]);

  const runExclusive = useCallback(() => {
    return runPipelineExclusive(taskId, executePipeline);
  }, [taskId, executePipeline]);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runExclusive();
  }, [runExclusive]);

  const continueAfterVisitSelect = useCallback(async () => {
    const task = await fetchTask(taskId);
    setState((prev) => ({ ...prev, task }));
    await runExtractionAndFinalize(task);
  }, [taskId, runExtractionAndFinalize]);

  const confirmVisitSelection = useCallback(async () => {
    if (selectedVisitIndex == null) return;
    setConfirmingVisit(true);
    try {
      setState((prev) => ({ ...prev, showVisitDialog: false, phase: "extracting" }));
      await runStepSafe(
        taskId,
        () => selectVisit(taskId, selectedVisitIndex),
        (t) =>
          t.status === "EXTRACTING" ||
          t.status === "VALIDATING" ||
          t.status === "MAPPING" ||
          t.status === "REVIEW",
      );
      completeStep("visit");
      awaitingVisitRef.current = false;
      await runPipelineExclusive(taskId, continueAfterVisitSelect);
    } catch (err) {
      awaitingVisitRef.current = true;
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("doctor.extract.visitFailed");
      fail(message);
    } finally {
      setConfirmingVisit(false);
    }
  }, [taskId, selectedVisitIndex, continueAfterVisitSelect, completeStep, fail, t]);

  const retry = useCallback(() => {
    awaitingVisitRef.current = false;
    startedRef.current = false;
    clearPipelineLock(taskId);
    setState((prev) => ({
      ...prev,
      error: null,
      stepStatuses: createInitialStepStatuses(),
      currentStepId: null,
    }));
    startedRef.current = true;
    void runExclusive();
  }, [taskId, runExclusive]);

  const refreshReview = useCallback(async () => {
    const review = await loadReview();
    if (review) {
      setState((prev) => ({
        ...prev,
        review,
        phase: prev.task?.status === "COMPLETED" ? "completed" : "review",
      }));
    }
    return review;
  }, [loadReview]);

  const applyReview = useCallback((review: ExtractionReviewOutput) => {
    setState((prev) => ({
      ...prev,
      review,
      phase: "review",
    }));
  }, []);

  return {
    ...state,
    selectedVisitIndex,
    setSelectedVisitIndex,
    confirmingVisit,
    confirmVisitSelection,
    start,
    retry,
    refreshReview,
    applyReview,
  };
}
