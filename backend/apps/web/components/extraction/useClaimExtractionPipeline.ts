"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import {
  extractStageToPhase,
  fetchClaimExtractProgress,
  cancelClaimExtraction,
  resumeClaimExtraction,
  startClaimExtractFromPdf,
  type ExtractProgress,
} from "@/lib/claim/extraction";
import type { ExtractionReviewOutput, ExtractionTask, VisitCandidate } from "@/lib/api/types";
import {
  createInitialStepStatuses,
  fetchReviewOutput,
  fetchTask,
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
  progressLabel: string | null;
  completionToast: string | null;
};

const POLL_MS = 1500;
const TERMINAL: ExtractProgress["status"][] = ["DONE", "FAILED", "AWAITING_INPUT"];

function stageToStep(stage: ExtractProgress["stage"]): PipelineStepId | null {
  if (stage === "INGEST") return "preprocess";
  if (stage === "CLASSIFY") return "classify";
  if (stage === "EXTRACT") return "extract";
  if (stage === "VALIDATE") return "finalize";
  return null;
}

function mapVisits(visits: ExtractProgress["visits"]): VisitCandidate[] {
  if (!visits?.length) return [];
  return visits.map((v, i) => ({
    id: i + 1,
    visit_index: v.visit_index,
    visit_date: v.visit_date,
    summary: v.summary,
    page_range: [v.page_range[0], v.page_range[1]] as [number, number],
    selected: v.selected,
    model_name: null,
    token_usage: 0,
    stub: false,
    created_at: new Date().toISOString(),
  }));
}

function applyProgress(progress: ExtractProgress, prev: PipelineState): Partial<PipelineState> {
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
    // 续跑后进度可能短暂无 visits，勿清空已展示列表
    visits: mappedVisits.length > 0 ? mappedVisits : prev.visits,
    error: progress.status === "FAILED" ? progress.message : null,
  };
}

/** 填报流程：202 入队 + 轮询进度（OCR/AI 在 arq worker 后台执行）。 */
export function useClaimExtractionPipeline(
  taskId: string,
  options: { templateId?: number; claimId: number },
) {
  const { t } = useI18n();
  const claimId = options.claimId;
  const [state, setState] = useState<PipelineState>({
    phase: "uploaded",
    task: null,
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
  const [cancelling, setCancelling] = useState(false);
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

  // 重新上传会换新 taskNo，须重置入队标记与 UI 状态
  useEffect(() => {
    startedRef.current = false;
    extractionStartedAtRef.current = null;
    cancelRequestedRef.current = false;
    stopPolling();
    setSelectedVisitIndex(null);
    setConfirmingVisit(false);
    setCancelling(false);
    setState({
      phase: "uploaded",
      task: null,
      review: null,
      visits: [],
      error: null,
      showVisitDialog: false,
      stepStatuses: createInitialStepStatuses(),
      currentStepId: null,
      progressLabel: null,
      completionToast: null,
    });
  }, [taskId, stopPolling]);

  const fail = useCallback(
    (message: string) => {
      stopPolling();
      extractionStartedAtRef.current = null;
      setState((p) => ({ ...p, phase: "failed", error: message, showVisitDialog: false }));
    },
    [stopPolling],
  );

  const loadReview = useCallback(async () => {
    try {
      return await fetchReviewOutput(taskId);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return null;
      throw err;
    }
  }, [taskId]);

  const finishReview = useCallback(async (): Promise<boolean> => {
    const review = await loadReview();
    const task = await fetchTask(taskId);
    if (!review && task.status !== "REVIEW" && task.status !== "COMPLETED") {
      fail(t("doctor.extract.notCompleted"));
      return false;
    }
    setState((p) => ({
      ...p,
      task,
      review,
      phase: task.status === "COMPLETED" ? "completed" : "review",
      showVisitDialog: false,
      progressLabel: null,
      stepStatuses: Object.fromEntries(
        Object.keys(p.stepStatuses).map((id) => [id, "completed"]),
      ) as Record<PipelineStepId, StepVisualStatus>,
    }));
    return true;
  }, [taskId, loadReview, fail, t]);

  const handleTerminal = useCallback(
    async (progress: ExtractProgress) => {
      if (progress.status === "AWAITING_INPUT") {
        const visits = mapVisits(progress.visits);
        // 空列表多为续跑后残留缓存，忽略，继续轮询真实进度
        if (visits.length === 0) return;
        stopPolling();
        setSelectedVisitIndex(visits[0]?.visit_index ?? null);
        setState((p) => ({ ...p, ...applyProgress(progress, p) }));
        return;
      }
      if (progress.status === "FAILED") {
        stopPolling();
        setState((p) => ({ ...p, ...applyProgress(progress, p) }));
        return;
      }
      if (progress.status === "DONE") {
        stopPolling();
        const startedAt = extractionStartedAtRef.current;
        const ok = await finishReview();
        if (ok && startedAt != null) {
          const elapsedMs = Date.now() - startedAt;
          setState((p) => ({
            ...p,
            completionToast: t("doctor.extract.completedToast", {
              seconds: (elapsedMs / 1000).toFixed(1),
            }),
          }));
          extractionStartedAtRef.current = null;
        }
      }
    },
    [stopPolling, finishReview, t],
  );

  const pollOnce = useCallback(async () => {
    if (cancelRequestedRef.current) return;
    try {
      const progress = await fetchClaimExtractProgress(claimId);
      if (cancelRequestedRef.current) return;
      // 取消成功后后端为 IDLE，停止轮询并回到上传后状态
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
      fail(err instanceof ApiRequestError ? err.message : t("doctor.extract.progressFailed"));
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
      progressLabel: t("doctor.extract.queued"),
      stepStatuses: { ...createInitialStepStatuses(), upload: "completed", preprocess: "running" },
    }));
    void startClaimExtractFromPdf(claimId)
      .then(() => startPolling())
      .catch((err) => {
        startedRef.current = false;
        extractionStartedAtRef.current = null;
        fail(err instanceof ApiRequestError ? err.message : t("doctor.extract.startFailed"));
      });
  }, [claimId, startPolling, fail, t]);

  // 页面刷新后若后台仍在跑，恢复轮询并展示「取消识别」
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const progress = await fetchClaimExtractProgress(claimId);
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
            if (visits.length > 0) {
              setSelectedVisitIndex(visits[0]?.visit_index ?? null);
            }
          } else {
            startPolling();
          }
        }
      } catch {
        // 忽略：未登录或网络抖动时不影响页面
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId, startPolling]);

  const cancel = useCallback(async () => {
    if (cancelling) return;
    cancelRequestedRef.current = true;
    setCancelling(true);
    stopPolling();
    try {
      await cancelClaimExtraction(claimId);
      startedRef.current = false;
      extractionStartedAtRef.current = null;
      setSelectedVisitIndex(null);
      setConfirmingVisit(false);
      setState({
        phase: "uploaded",
        task: null,
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
      fail(err instanceof ApiRequestError ? err.message : t("doctor.extract.cancelFailed"));
    } finally {
      setCancelling(false);
    }
  }, [cancelling, claimId, stopPolling, fail, t]);

  const confirmVisitSelection = useCallback(async () => {
    if (selectedVisitIndex == null) return;
    setConfirmingVisit(true);
    try {
      setState((p) => ({
        ...p,
        showVisitDialog: false,
        phase: "extracting",
        progressLabel: t("doctor.extract.visitSelected"),
      }));
      await resumeClaimExtraction(claimId, selectedVisitIndex);
      startPolling();
    } catch (err) {
      fail(err instanceof ApiRequestError ? err.message : t("doctor.extract.visitFailed"));
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
      setState((p) => ({
        ...p,
        review,
        phase: p.task?.status === "COMPLETED" ? "completed" : "review",
      }));
    }
    return review;
  }, [loadReview]);

  const applyReview = useCallback((review: ExtractionReviewOutput) => {
    setState((p) => ({ ...p, review, phase: "review" }));
  }, []);

  const dismissCompletionToast = useCallback(() => {
    setState((p) => ({ ...p, completionToast: null }));
  }, []);

  return {
    ...state,
    selectedVisitIndex,
    setSelectedVisitIndex,
    confirmingVisit,
    confirmingCancel: cancelling,
    confirmVisitSelection,
    start,
    cancel,
    retry,
    refreshReview,
    applyReview,
    dismissCompletionToast,
  };
}
