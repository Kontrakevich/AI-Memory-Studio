import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive, KeyRound, Loader2, Settings2, Trash2 } from "lucide-react";
import { PhotoCard } from "@/components/hug/PhotoCard";
import {
  clearHugOpenRouterSecret,
  createHugJob,
  getHugCapabilities,
  setHugOpenRouterSecret,
} from "@/lib/hug.functions";
import {
  ACTIVE_JOB_KEY,
  TEST_MODE_KEY,
  readLocal,
  writeLocal,
} from "@/lib/hug-client";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const createJob = useServerFn(createHugJob);
  const capabilities = useServerFn(getHugCapabilities);
  const saveOpenRouterSecret = useServerFn(setHugOpenRouterSecret);
  const clearOpenRouterSecret = useServerFn(clearHugOpenRouterSecret);

  const [school, setSchool] = useState<string | null>(null);
  const [adult, setAdult] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [caps, setCaps] = useState<any>(null);
  const [capsBusy, setCapsBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);

  useEffect(() => {
    setTestMode(readLocal(TEST_MODE_KEY) === "1");
    setActiveJob(readLocal(ACTIVE_JOB_KEY));
  }, []);

  const hasCheck = (name: string) =>
    caps?.checks?.some((check: any) => check.name === name && check.ok);

  async function loadCaps() {
    setCapsBusy(true);
    setError(null);
    try {
      setCaps(await capabilities({}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверка недоступна");
    } finally {
      setCapsBusy(false);
    }
  }

  async function connectSecret() {
    const apiKey = secret.trim();
    if (!apiKey || secretBusy) return;

    setSecretBusy(true);
    setError(null);
    setSecretMessage(null);
    try {
      await saveOpenRouterSecret({ data: { apiKey } });
      setSecret("");
      const nextCaps = await capabilities({});
      setCaps(nextCaps);
      setSecretMessage(
        nextCaps.mode === "live"
          ? "OpenRouter подключен. Ключ хранится только в защищённой серверной cookie."
          : "Ключ принят, но LIVE-режим не подтвердился.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить ключ");
    } finally {
      setSecretBusy(false);
    }
  }

  async function disconnectSecret() {
    if (secretBusy) return;
    setSecretBusy(true);
    setError(null);
    setSecretMessage(null);
    try {
      await clearOpenRouterSecret({});
      setCaps(await capabilities({}));
      setSecretMessage("Ключ OpenRouter удалён из текущей сессии.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить ключ");
    } finally {
      setSecretBusy(false);
    }
  }

  async function start() {
    if (!school || !adult || busy) return;
    setBusy(true);
    setError(null);
    try {
      const job = await createJob({
        data: { schoolImage: school, adultImage: adult, testMode },
      });
      writeLocal(ACTIVE_JOB_KEY, job.id);
      await navigate({ to: "/job/$jobId", params: { jobId: job.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось начать встречу");
      setBusy(false);
    }
  }

  return (
    <main className="film-grain min-h-screen memory-vignette">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-5 safe-top safe-bottom">
        <header className="flex items-start justify-between gap-4 pb-6 pt-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
              HUG Mobile
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className={caps?.mode === "live" ? "text-primary" : ""}>
                OpenRouter {caps?.mode === "live" ? "LIVE" : "—"}
              </span>
              {caps ? " · " : null}
              {caps ? (
                <span className={hasCheck("VERCEL_BLOB") ? "text-primary" : ""}>
                  Storage {hasCheck("VERCEL_BLOB") ? "LIVE" : "—"}
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const opening = !showSettings;
              setShowSettings(opening);
              if (opening) void loadCaps();
            }}
            aria-label="Настройки"
            className="-mr-2 -mt-2 flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <Settings2 className="size-5" />
          </button>
        </header>

        {showSettings ? (
          <section className="mb-6 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <h2 className="text-lg">OpenRouter secret</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Ключ не записывается в Git или localStorage. После отправки он хранится
              только в HttpOnly/Secure cookie текущего браузера в течение 12 часов.
            </p>

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              API key
              <input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void connectSecret();
                }}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="sk-or-v1-…"
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>

            <button
              type="button"
              onClick={connectSecret}
              disabled={secret.trim().length < 20 || secretBusy}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-xs font-medium uppercase tracking-[0.16em] text-primary-foreground disabled:opacity-35"
            >
              {secretBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Подключить OpenRouter
            </button>

            {caps?.mode === "live" ? (
              <button
                type="button"
                onClick={disconnectSecret}
                disabled={secretBusy}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs uppercase tracking-[0.14em] text-muted-foreground"
              >
                <Trash2 className="size-3.5" />
                Удалить ключ из сессии
              </button>
            ) : null}

            {secretMessage ? (
              <p className="mt-3 rounded-xl border border-border bg-secondary p-3 text-[11px] leading-relaxed text-foreground">
                {secretMessage}
              </p>
            ) : null}

            <div className="my-5 h-px bg-border" />

            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-primary" />
              <h2 className="text-lg">Хранилище HUG</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Фото, кадры, видео, состояние задач и диагностика хранятся в приватном
              Vercel Blob. Пользовательский ключ для хранилища не требуется.
            </p>
            <div
              className={`mt-3 rounded-xl border p-3 text-[11px] ${
                hasCheck("VERCEL_BLOB")
                  ? "border-border bg-secondary text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive-foreground"
              }`}
            >
              {hasCheck("VERCEL_BLOB")
                ? "✓ Vercel Blob подключён"
                : "✕ Vercel Blob пока не подключён к production-проекту"}
            </div>

            <div className="my-5 h-px bg-border" />

            <label className="flex min-h-11 items-center justify-between gap-4">
              <span className="text-sm">Тест-режим</span>
              <input
                type="checkbox"
                checked={testMode}
                onChange={(event) => {
                  setTestMode(event.target.checked);
                  writeLocal(TEST_MODE_KEY, event.target.checked ? "1" : null);
                }}
                className="size-5 accent-primary"
              />
            </label>

            <button
              type="button"
              onClick={loadCaps}
              className="mt-3 min-h-11 w-full rounded-xl border border-border text-xs uppercase tracking-[0.18em] text-muted-foreground active:bg-secondary"
            >
              {capsBusy ? "Проверяем…" : "Проверить систему"}
            </button>

            {caps ? (
              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                <p>
                  Режим:{" "}
                  <span className={caps.mode === "live" ? "text-primary" : "text-destructive"}>
                    {caps.mode === "live" ? "LIVE" : "MOCK"}
                  </span>
                </p>
                <p>analysis: {caps.models.analysis}</p>
                <p>image: {caps.models.image}</p>
                <p>video: {caps.models.video}</p>
                {caps.checks.map((check: any) => (
                  <p key={check.name} className={check.ok ? "" : "text-destructive"}>
                    {check.ok ? "✓" : "✕"} {check.name} — {check.detail}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <h1 className="text-[34px] leading-[1.08] tracking-tight">
          Вернись в свою школьную фотографию
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Загрузи два фото — и встреться с собой из прошлого.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <PhotoCard
            title="Ты в детстве"
            hint="SCHOOL_IDENTITY"
            slot="school"
            value={school}
            onChange={setSchool}
            busy={busy}
          />
          <PhotoCard
            title="Современный ты"
            hint="ADULT_IDENTITY"
            slot="adult"
            value={adult}
            onChange={setAdult}
            busy={busy}
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}

        {activeJob ? (
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/job/$jobId", params: { jobId: activeJob } })
            }
            className="mt-5 min-h-11 text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4"
          >
            Вернуться к последней встрече
          </button>
        ) : null}

        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={start}
            disabled={!school || !adult || busy}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-medium uppercase tracking-[0.22em] text-primary-foreground transition-opacity disabled:opacity-35"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Встретить себя
          </button>
        </div>
      </div>
    </main>
  );
}
