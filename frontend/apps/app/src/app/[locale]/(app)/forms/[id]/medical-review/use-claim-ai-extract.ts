"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, claims } from "@acuity/api-client";
import {
  createInitialStepStatuses,
  extractStageToPhase,
  stageToStep,
  type PipelinePhase,
  type PipelineStepId,
  type StepVisualStatus,
} from "./pipeline-types";

type ExtractProgress = Awaited<ReturnType<typeof claims.getExtractProgress>>;
type ExtractProgressVisit = NonNullable<NonNullable<ExtractProgress["visits"]>[number]>;
type ReviewOutput = Awaited<ReturnType<typeof claims.getExtractionReviewOutput>>;

const POLL_MS = 1500;
const TERMINAL: ExtractProgress["status"][] = ["DONE", "FAILED", "AWAITING_INPUT"];

function normalizeReviewOutput(review: ReviewOutput): ReviewOutput {
  const display_fields = review.display_fields ?? review.standard_fields ?? {};
  return { ...review, display_fields };
}

function reviewHasExtractedValues(review: ReviewOutput): boolean {
  // 系统回填（诊所/医生/上传时姓名）不算「AI 识别成功」
  const systemCodes = new Set([
    "clinic_name",
    "doctor_name",
    "doctor_signature",
    "patient_name_cn",
    "patient_name_en",
  ]);
  return Object.entries(review.display_fields ?? {}).some(
    ([code, field]) =>
      !systemCodes.has(code) &&
      field?.value != null &&
      String(field.value).trim() !== "",
  );
}

type PipelineState = {
  phase: PipelinePhase;
  review: ReviewOutput | null;
  visits: ExtractProgressVisit[];
  error: string | null;
  showVisitDialog: boolean;
  stepStatuses: Record<PipelineStepId, StepVisualStatus>;
  currentStepId: PipelineStepId | null;
  progressLabel: string | null;
  completionToast: string | null;
};

function mapVisits(visits: ExtractProgress["visits"]): ExtractProgressVisit[] {
  return visits?.length ? [...visits] : [];
}

function applyProgress(
  progress: ExtractProgress,
  prev: PipelineState,
): Partial<PipelineState> {
  const stepId = stageToStep(progress.stage);
  const stepStatuses = { ...prev.stepStatuses };
  if (progress.status === "RUNNING" || progress.status === "QUEUED") {
    for (const id of Object.keys(stepStatuses) as PipelineStepId[]) {
      if (stepStatuses[id] === "running") stepStatuses[id] = "pending";
    }
    if (stepId) stepStatuses[stepId] = "running";
  }
  if (progress.status === "DONE") {
    for (const id of Object.keys(stepStatuses) as PipelineStepId[]) {
      stepStatuses[id] = "completed";
    }
  }
  const mappedVisits = mapVisits(progress.visits);
  const awaitingWithVisits =
    progress.status === "AWAITING_INPUT" && mappedVisits.length > 0;
  return {
    phase: extractStageToPhase(progress.stage),
    stepStatuses,
    currentStepId: stepId,
    progressLabel: progress.message,
    showVisitDialog: awaitingWithVisits,
    visits: mappedVisits.length > 0 ? mappedVisits : prev.visits,
    error: progress.status === "FAILED" ? progress.message : null,
  };
}

/** Claim PDF → AI extraction pipeline (parity with doctor web useClaimExtractionPipeline). */
export function useClaimAiExtract(claimId: number, taskNo: string | null) {
  const t = useTranslations("medical-review");
  const [state, setState] = useState<PipelineState>({
    phase: "uploaded",
    review: null,
    visits: [],
    error: null,
    showVisitDialog: false,
    stepStatuses: createInitialStepStatuses(),
    currentStepId: null,
    progressLabel: null,
    completionToast: null,
  });
  const [selectedVisitIndex, setSelectedVisitIndex] = useState<number | null>(null);
  const [confirmingVisit, setConfirmingVisit] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const startedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extractionStartedAtRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    startedRef.current = false;
    extractionStartedAtRef.current = null;
    cancelRequestedRef.current = false;
    stopPolling();
    setSelectedVisitIndex(null);
    setConfirmingVisit(false);
    setConfirmingCancel(false);
    setState({
      phase: "uploaded",
      review: null,
      visits: [],
      error: null,
      showVisitDialog: false,
      stepStatuses: createInitialStepStatuses(),
      currentStepId: null,
      progressLabel: null,
      completionToast: null,
    });
  }, [claimId, taskNo, stopPolling]);

  const fail = useCallback(
    (message: string) => {
      stopPolling();
      extractionStartedAtRef.current = null;
      startedRef.current = false;
      setState((p) => ({
        ...p,
        phase: "failed",
        error: message,
        showVisitDialog: false,
      }));
    },
    [stopPolling],
  );

  const loadReview = useCallback(async (): Promise<ReviewOutput | null> => {
    if (!taskNo) return null;
    try {
      return normalizeReviewOutput(await claims.getExtractionReviewOutput(taskNo));
    } catch (err) {
      if (err instanceof ApiError && err.kind === "not_found") return null;
      throw err;
    }
  }, [taskNo]);

  const finishReview = useCallback(async (): Promise<ReviewOutput | null> => {
    const raw = await loadReview();
    if (!raw) {
      fail(t("not-completed"));
      return null;
    }
    const review = normalizeReviewOutput(raw);
    setState((p) => ({
      ...p,
      review,
      phase: "review",
      showVisitDialog: false,
      progressLabel: null,
      stepStatuses: Object.fromEntries(
        Object.keys(p.stepStatuses).map((id) => [id, "completed"]),
      ) as Record<PipelineStepId, StepVisualStatus>,
    }));
    return review;
  }, [loadReview, fail, t]);

  const handleTerminal = useCallback(
    async (progress: ExtractProgress) => {
      if (progress.status === "AWAITING_INPUT") {
        const visits = mapVisits(progress.visits);
        if (visits.length === 0) return;
        stopPolling();
        setSelectedVisitIndex(visits[0]?.visit_index ?? null);
        setState((p) => ({ ...p, ...applyProgress(progress, p) }));
        return;
      }
      if (progress.status === "FAILED") {
        stopPolling();
        setState((p) => ({ ...p, ...applyProgress(progress, p) }));
        startedRef.current = false;
        return;
      }
      if (progress.status === "DONE") {
        stopPolling();
        const startedAt = extractionStartedAtRef.current;
        const review = await finishReview();
        if (review && startedAt != null) {
          const elapsedMs = Date.now() - startedAt;
          setState((p) => ({
            ...p,
            completionToast: reviewHasExtractedValues(review)
              ? t("completed-toast", {
                  seconds: (elapsedMs / 1000).toFixed(1),
                })
              : t("completed-empty-toast"),
          }));
          extractionStartedAtRef.current = null;
        }
        startedRef.current = false;
      }
    },
    [stopPolling, finishReview, t],
  );

  const pollOnce = useCallback(async () => {
    if (cancelRequestedRef.current) return;
    try {
      const progress = await claims.getExtractProgress(claimId);
      if (cancelRequestedRef.current) return;
      if (progress.status === "IDLE") {
        stopPolling();
        startedRef.current = false;
        extractionStartedAtRef.current = null;
        setState((p) => ({
          ...p,
          phase: "uploaded",
          review: null,
          visits: [],
          error: null,
          showVisitDialog: false,
          stepStatuses: createInitialStepStatuses(),
          currentStepId: null,
          progressLabel: null,
        }));
        return;
      }
      setState((p) => ({
        ...p,
        ...applyProgress(progress, p),
        error: progress.status === "FAILED" ? progress.message : null,
      }));
      if (TERMINAL.includes(progress.status)) await handleTerminal(progress);
    } catch (err) {
      if (cancelRequestedRef.current) return;
      fail(err instanceof ApiError ? err.message : t("progress-failed"));
    }
  }, [claimId, handleTerminal, fail, stopPolling, t]);

  const startPolling = useCallback(() => {
    stopPolling();
    void pollOnce();
    pollRef.current = setInterval(() => void pollOnce(), POLL_MS);
  }, [pollOnce, stopPolling]);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    cancelRequestedRef.current = false;
    extractionStartedAtRef.current = Date.now();
    setState((p) => ({
      ...p,
      error: null,
      phase: "preprocessing",
      progressLabel: t("progress-queued"),
      stepStatuses: {
        ...createInitialStepStatuses(),
        upload: "completed",
        preprocess: "running",
      },
    }));
    void claims
      .extractFromPdf(claimId)
      .then(() => startPolling())
      .catch((err) => {
        startedRef.current = false;
        extractionStartedAtRef.current = null;
        fail(err instanceof ApiError ? err.message : t("start-failed"));
      });
  }, [claimId, startPolling, fail, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const progress = await claims.getExtractProgress(claimId);
        if (cancelled || cancelRequestedRef.current) return;
        if (
          progress.status === "RUNNING" ||
          progress.status === "QUEUED" ||
          progress.status === "AWAITING_INPUT"
        ) {
          startedRef.current = true;
          setState((p) => ({
            ...p,
            ...applyProgress(progress, p),
            error: null,
          }));
          if (progress.status === "AWAITING_INPUT") {
            const visits = mapVisits(progress.visits);
            if (visits.length > 0) setSelectedVisitIndex(visits[0]?.visit_index ?? null);
          } else {
            startPolling();
          }
        } else if (progress.status === "DONE") {
          const review = await loadReview();
          if (review && !cancelled) {
            setState((p) => ({
              ...p,
              review,
              phase: "review",
              stepStatuses: Object.fromEntries(
                Object.keys(p.stepStatuses).map((id) => [id, "completed"]),
              ) as Record<PipelineStepId, StepVisualStatus>,
            }));
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId, startPolling, loadReview]);

  const cancel = useCallback(async () => {
    if (confirmingCancel) return;
    cancelRequestedRef.current = true;
    setConfirmingCancel(true);
    stopPolling();
    try {
      await claims.cancelExtraction(claimId);
      startedRef.current = false;
      extractionStartedAtRef.current = null;
      setSelectedVisitIndex(null);
      setConfirmingVisit(false);
      setState({
        phase: "uploaded",
        review: null,
        visits: [],
        error: null,
        showVisitDialog: false,
        stepStatuses: createInitialStepStatuses(),
        currentStepId: null,
        progressLabel: null,
        completionToast: null,
      });
    } catch (err) {
      cancelRequestedRef.current = false;
      fail(err instanceof ApiError ? err.message : t("cancel-failed"));
    } finally {
      setConfirmingCancel(false);
    }
  }, [confirmingCancel, claimId, stopPolling, fail, t]);

  const confirmVisitSelection = useCallback(async () => {
    if (selectedVisitIndex == null) return;
    setConfirmingVisit(true);
    try {
      setState((p) => ({
        ...p,
        showVisitDialog: false,
        phase: "extracting",
        progressLabel: t("visit-selected"),
      }));
      await claims.resumeExtraction(claimId, selectedVisitIndex);
      startPolling();
    } catch (err) {
      fail(err instanceof ApiError ? err.message : t("visit-failed"));
    } finally {
      setConfirmingVisit(false);
    }
  }, [claimId, selectedVisitIndex, startPolling, fail, t]);

  const retry = useCallback(() => {
    startedRef.current = false;
    cancelRequestedRef.current = false;
    stopPolling();
    setState((p) => ({
      ...p,
      error: null,
      stepStatuses: createInitialStepStatuses(),
      progressLabel: null,
    }));
    start();
  }, [stopPolling, start]);

  const refreshReview = useCallback(async () => {
    const review = await loadReview();
    if (review) {
      setState((p) => ({ ...p, review, phase: "review" }));
    }
    return review;
  }, [loadReview]);

  const dismissCompletionToast = useCallback(() => {
    setState((p) => ({ ...p, completionToast: null }));
  }, []);

  const isReviewReady = !!state.review;
  const isRunning =
    state.phase !== "uploaded" &&
    state.phase !== "failed" &&
    state.phase !== "review" &&
    state.phase !== "completed" &&
    !isReviewReady &&
    !state.showVisitDialog;
  const canStartAi =
    !isRunning &&
    !isReviewReady &&
    state.phase !== "failed" &&
    !state.showVisitDialog;

  return {
    ...state,
    selectedVisitIndex,
    setSelectedVisitIndex,
    confirmingVisit,
    confirmingCancel,
    isRunning,
    isReviewReady,
    canStartAi,
    start,
    cancel,
    retry,
    confirmVisitSelection,
    refreshReview,
    dismissCompletionToast,
  };
}
