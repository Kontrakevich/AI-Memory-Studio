import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Download, Loader2, RotateCw, Share2, X } from "lucide-react";
import {
  advanceHugJob,
  getHugDiagnostics,
  getHugJob,
  retryHugStage,
  setHugApproval,
} from "@/lib/hug.functions";
import { ACTIVE_JOB_KEY, writeLocal } from "@/lib/hug-client";
import { STAGE_GROUPS, type DiagnosticEvent, type JobView, type Stage } from "@/lib/hug/types";

export const Route = createFileRoute("/job/$jobId")({ component: JobScreen });

function groupStatus(job: JobView, stages: string[]) {
  const states = stages.map(
    (stage) => job.stage_states[stage as keyof typeof job.stage_states]?.status ?? "pending",
  );
  if (states.includes("error")) return "error";
  if (states.includes("running")) return "running";
  if (states.every((state) => state === "done")) return "done";
  if (states.includes("done")) return "running";
  return "pending";
}

function timestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function duration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} ч ${String(minutes).padStart(2, "0")} мин ${String(seconds).padStart(2, "0")} сек`;
  if (minutes > 0) return `${minutes} мин ${String(seconds).padStart(2, "0")} сек`;
  return `${seconds} сек`;
}

function elapsed(now: number, startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) return null;
  const started = new Date(startedAt).getTime();
  const finished = finishedAt ? new Date(finishedAt).getTime() : now;
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;
  return Math.max(0, finished - started);
}

function stageState(job: JobView | null) {
  if (!job || job.current_stage === "done") return null;
  return job.stage_states[job.current_stage as Stage] ?? null;
}

function JobScreen() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const fetchJob = useServerFn(getHugJob);
  const advance = useServerFn(advanceHugJob);
  const retry = useServerFn(retryHugStage);
  const approve = useServerFn(setHugApproval);
  const diagnostics = useServerFn(getHugDiagnostics);

  const [job, setJob] = useState<JobView | null>(null);
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [showDiag, setShowDiag] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [localStageStartedAt, setLocalStageStartedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const running = useRef(false);

  const loadDiagnostics = useCallback(async () => {
    try {
      setEvents(await diagnostics({ data: { jobId } }));
    } catch {}
  }, [diagnostics, jobId]);

  const refreshJob = useCallback(async () => {
    try {
      setJob(await fetchJob({ data: { jobId } }));
    } catch (refreshError) {
      if (!job) setError(refreshError instanceof Error ? refreshError.message : "Задача не найдена");
    }
  }, [fetchJob, job, jobId]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    writeLocal(ACTIVE_JOB_KEY, jobId);
    void refreshJob();
  }, [jobId, refreshJob]);

  useEffect(() => {
    if (
      !job ||
      job.test_mode ||
      running.current ||
      job.status === "completed" ||
      job.status === "error" ||
      job.current_stage === "done"
    ) {
      return;
    }
    running.current = true;
    setInFlight(true);
    setLocalStageStartedAt(new Date().toISOString());
    void advance({ data: { jobId } })
      .then(setJob)
      .catch((advanceError) => setError(advanceError instanceof Error ? advanceError.message : "Ошибка этапа"))
      .finally(() => {
        running.current = false;
        setInFlight(false);
        setLocalStageStartedAt(null);
        void loadDiagnostics();
      });
  }, [advance, job, jobId, loadDiagnostics]);

  const currentState = stageState(job);
  const serverStageRunning = currentState?.status === "running";

  useEffect(() => {
    if (!inFlight && !serverStageRunning && !showDiag) return;
    const poll = window.setInterval(() => {
      void refreshJob();
      if (showDiag) void loadDiagnostics();
    }, 10_000);
    return () => window.clearInterval(poll);
  }, [inFlight, loadDiagnostics, refreshJob, serverStageRunning, showDiag]);

  async function manual(fn: () => Promise<JobView>) {
    if (inFlight) return;
    setInFlight(true);
    setLocalStageStartedAt(new Date().toISOString());
    setError(null);
    try {
      setJob(await fn());
    } catch (manualError) {
      setError(manualError instanceof Error ? manualError.message : "Ошибка");
    } finally {
      setInFlight(false);
      setLocalStageStartedAt(null);
      void loadDiagnostics();
      void refreshJob();
    }
  }

  if (!job) {
    return (
      <Shell>
        {error ? <p className="text-destructive">{error}</p> : <Loader2 className="size-6 animate-spin text-primary" />}
      </Shell>
    );
  }

  if (job.status === "completed" && job.urls.final_video) {
    return <Result job={job} onRestart={() => navigate({ to: "/" })} />;
  }

  const needsMaster =
    job.test_mode && job.approvals.master !== true && Boolean(job.urls.master_first_frame);
  const needsMeeting =
    job.test_mode &&
    job.approvals.master === true &&
    job.approvals.meeting !== true &&
    Boolean(job.urls.meeting_reference_frame);

  const taskElapsed = elapsed(now, job.created_at) ?? 0;
  const actualStageStartedAt = currentState?.startedAt ?? (inFlight ? localStageStartedAt : null);
  const stageElapsed = elapsed(now, actualStageStartedAt, currentState?.finishedAt);
  const lastServerAgo = elapsed(now, job.updated_at) ?? 0;

  return (
    <Shell>
      <header className="pb-6">
        <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          {job.mode === "mock" ? "Mock-режим" : "Живая генерация"}
          {job.test_mode ? " · тест" : ""}
        </p>
        <h1 className="mt-3 text-[28px]">Готовим вашу встречу</h1>
      </header>

      <section className="mb-5 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px]">
          <span className="text-muted-foreground">Задача в работе</span>
          <span className="text-right font-medium text-primary">{duration(taskElapsed)}</span>
          <span className="text-muted-foreground">Текущий этап</span>
          <span className="text-right font-medium">{job.current_stage === "done" ? "завершено" : job.current_stage.toUpperCase()}</span>
          <span className="text-muted-foreground">Время этапа</span>
          <span className="text-right font-medium">{stageElapsed == null ? "ожидает запуска" : duration(stageElapsed)}</span>
          <span className="text-muted-foreground">Этап начат</span>
          <span className="text-right">{timestamp(actualStageStartedAt)}</span>
          <span className="text-muted-foreground">Последнее обновление</span>
          <span className="text-right">{timestamp(job.updated_at)}</span>
          <span className="text-muted-foreground">Без нового ответа</span>
          <span className="text-right">{duration(lastServerAgo)}</span>
        </div>
        {(inFlight || serverStageRunning) ? (
          <p className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            Этап выполняется. Состояние проверяется автоматически каждые 10 секунд.
          </p>
        ) : null}
      </section>

      <ol className="space-y-3">
        {STAGE_GROUPS.map((group, index) => {
          const status = groupStatus(job, group.stages);
          return (
            <li key={group.key} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-[11px] ${
                  status === "done"
                    ? "bg-primary text-primary-foreground"
                    : status === "error"
                      ? "bg-destructive"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {status === "done" ? (
                  <Check className="size-3.5" />
                ) : status === "error" ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <p className={`text-sm ${status === "running" ? "breathe" : ""}`}>{group.label}</p>
            </li>
          );
        })}
      </ol>

      {job.status === "error" ? (
        <div className="mt-5 rounded-2xl border border-destructive/40 p-4">
          <p className="text-xs">
            {job.error?.stage}: {job.error?.message}
          </p>
          <button
            onClick={() => manual(() => retry({ data: { jobId } }))}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs"
          >
            <RotateCw className="size-3.5" />
            Повторить этап
          </button>
        </div>
      ) : null}

      {needsMaster ? (
        <ApprovalCard
          title="Мастер-кадр"
          url={job.urls.master_first_frame!}
          busy={inFlight}
          onApprove={() => manual(() => approve({ data: { jobId, target: "master", approved: true } }))}
          onReject={() => manual(() => approve({ data: { jobId, target: "master", approved: false } }))}
        />
      ) : null}

      {needsMeeting ? (
        <ApprovalCard
          title="Кадр встречи"
          url={job.urls.meeting_reference_frame!}
          busy={inFlight}
          onApprove={() => manual(() => approve({ data: { jobId, target: "meeting", approved: true } }))}
          onReject={() => manual(() => approve({ data: { jobId, target: "meeting", approved: false } }))}
        />
      ) : null}

      {job.test_mode && job.current_stage !== "done" ? (
        <button
          disabled={inFlight}
          onClick={() => manual(() => advance({ data: { jobId } }))}
          className="mt-6 min-h-14 w-full rounded-2xl bg-primary text-xs uppercase text-primary-foreground disabled:opacity-60"
        >
          {inFlight ? `Выполняется: ${job.current_stage}` : `Выполнить этап: ${job.current_stage}`}
        </button>
      ) : null}

      <button
        onClick={() => {
          setShowDiag((value) => !value);
          void loadDiagnostics();
        }}
        className="mt-6 min-h-11 text-[11px] uppercase text-muted-foreground underline"
      >
        Диагностика
      </button>

      {showDiag ? (
        <div className="max-h-[28rem] overflow-auto rounded-2xl border border-border bg-card p-3">
          {events.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-muted-foreground">Диагностических записей пока нет</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="mb-3 border-b border-border pb-3 last:mb-0 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] text-primary">
                    {event.stage} · попытка {event.attempt}
                  </p>
                  <time className="shrink-0 text-right text-[10px] text-muted-foreground">
                    {timestamp(event.created_at)}
                  </time>
                </div>
                <p className="mt-1 break-words text-[11px] text-muted-foreground">{event.message}</p>
                {event.provider || event.model ? (
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {[event.provider, event.model].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </Shell>
  );
}

function ApprovalCard({
  title,
  url,
  busy,
  onApprove,
  onReject,
}: {
  title: string;
  url: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      <img src={url} alt={title} className="aspect-[9/16] w-full object-cover" />
      <div className="p-4">
        <p className="text-sm">{title}</p>
        <div className="mt-3 flex gap-3">
          <button
            disabled={busy}
            onClick={onApprove}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-xs text-primary-foreground"
          >
            <Check className="size-4" />
            Принять
          </button>
          <button
            disabled={busy}
            onClick={onReject}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-xs"
          >
            <X className="size-4" />
            Отклонить
          </button>
        </div>
      </div>
    </section>
  );
}

function Result({ job, onRestart }: { job: JobView; onRestart: () => void }) {
  const video = job.urls.final_video!;
  const frame = job.urls.hug_final_frame;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Вы встретились",
          text: "15 секунд между прошлым и настоящим.",
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch {}
  }

  return (
    <Shell>
      <h1 className="text-[32px]">Вы встретились</h1>
      <p className="mt-2 text-sm text-muted-foreground">15 секунд между прошлым и настоящим.</p>
      {job.mode === "mock" ? <p className="mt-2 text-xs text-destructive">MOCK-результат</p> : null}
      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        {job.mode === "mock" ? (
          <img src={video} alt="mock result" className="aspect-[9/16] w-full object-cover" />
        ) : (
          <video src={video} controls playsInline autoPlay loop muted className="aspect-[9/16] w-full bg-black object-cover" />
        )}
      </div>
      {frame ? <img src={frame} alt="HUG_FINAL_FRAME" className="mt-4 w-full rounded-2xl" /> : null}
      <div className="mt-6 space-y-3">
        <a
          href={video}
          download="hug.mp4"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-xs text-primary-foreground"
        >
          <Download className="size-4" />
          Скачать
        </a>
        <button
          onClick={share}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border text-xs"
        >
          <Share2 className="size-4" />
          Поделиться
        </button>
        <button onClick={onRestart} className="min-h-12 w-full text-xs text-muted-foreground underline">
          Сделать еще одну встречу
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="film-grain min-h-screen memory-vignette">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-5 safe-top safe-bottom">
        {children}
      </div>
    </main>
  );
}
