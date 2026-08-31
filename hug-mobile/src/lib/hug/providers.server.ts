import { getHugConfig } from "./config.server";
import { OpenRouterTransport, type TransportResult } from "./transport.server";

export type ImageInput = { dataUrl: string; label: string };
export type ProviderCall<T> = { result: T; meta: Record<string, unknown> };

function fail(where: string, res: TransportResult<unknown>): never {
  const body = res.data as { error?: { message?: string } } | null;
  throw new Error(`${where}: ${body?.error?.message ?? res.raw ?? `HTTP ${res.status}`}`);
}

export class AnalysisProvider {
  constructor(private transport = new OpenRouterTransport()) {}

  async analyze(
    prompt: string,
    images: ImageInput[],
  ): Promise<ProviderCall<Record<string, unknown>>> {
    const model = getHugConfig().models.analysis;
    const content: unknown[] = [{ type: "text", text: prompt }];
    for (const i of images) {
      content.push(
        { type: "text", text: `[${i.label}]` },
        { type: "image_url", image_url: { url: i.dataUrl } },
      );
    }
    const res = await this.transport.request<{
      choices?: { message?: { content?: string } }[];
    }>("/chat/completions", {
      body: {
        model,
        messages: [{ role: "user", content }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      },
    });
    if (!res.ok || !res.data) fail("AnalysisProvider", res);
    return {
      result: parseJsonLoose(res.data.choices?.[0]?.message?.content ?? ""),
      meta: { provider: "AnalysisProvider", model, ...res.meta },
    };
  }
}

export function parseJsonLoose(text: string): Record<string, unknown> {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(t.slice(s, e + 1));
      } catch {}
    }
    return { raw_text: t.slice(0, 2000), parse_error: true };
  }
}

type ImageApiResponse = {
  data?: { b64_json?: string; media_type?: string; url?: string }[];
};

type ImageRoute = {
  label: string;
  providerSlug: "google-ai-studio" | "google-vertex";
  timeoutMs: number;
};

const NANO_BANANA_ROUTES: ImageRoute[] = [
  { label: "Google AI Studio", providerSlug: "google-ai-studio", timeoutMs: 100_000 },
  { label: "Google Vertex", providerSlug: "google-vertex", timeoutMs: 160_000 },
];

function imageApiError(res: TransportResult<unknown>) {
  const body = res.data as { error?: { message?: string } } | null;
  return body?.error?.message ?? res.raw ?? `HTTP ${res.status}`;
}

export class NanoBananaProvider {
  constructor(private transport = new OpenRouterTransport()) {}

  async capabilities() {
    const r = await this.transport.request<unknown>("/images/models");
    if (!r.ok) fail("NanoBananaProvider.capabilities", r);
    return r.data;
  }

  async generate(
    prompt: string,
    references: ImageInput[],
  ): Promise<ProviderCall<{ bytes: Uint8Array; contentType: string }>> {
    const c = getHugConfig();
    const model = c.models.image;
    const baseBody: Record<string, unknown> = {
      model,
      prompt,
      aspect_ratio: c.aspectRatio,
      resolution: "2K",
      quality: "high",
      output_format: "png",
      n: 1,
    };
    if (references.length) {
      baseBody.input_references = references.map((r) => ({
        type: "image_url",
        image_url: { url: r.dataUrl },
      }));
    }

    const attempts: string[] = [];

    for (const route of NANO_BANANA_ROUTES) {
      try {
        const res = await this.transport.request<ImageApiResponse>("/images", {
          timeoutMs: route.timeoutMs,
          body: {
            ...baseBody,
            provider: {
              only: [route.providerSlug],
              allow_fallbacks: false,
            },
          },
        });

        if (!res.ok || !res.data) {
          const reason = imageApiError(res);
          attempts.push(`${route.label}: HTTP ${res.status} — ${reason}`);
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            fail(`NanoBananaProvider (${route.label})`, res);
          }
          continue;
        }

        const item = res.data.data?.[0];
        if (!item) {
          attempts.push(`${route.label}: response has no image`);
          continue;
        }

        let bytes: Uint8Array;
        if (item.b64_json) {
          bytes = base64ToBytes(item.b64_json);
        } else if (item.url) {
          const rr = await fetch(item.url);
          if (!rr.ok) {
            attempts.push(`${route.label}: image URL download failed (HTTP ${rr.status})`);
            continue;
          }
          bytes = new Uint8Array(await rr.arrayBuffer());
        } else {
          attempts.push(`${route.label}: response has no b64_json/url`);
          continue;
        }

        return {
          result: { bytes, contentType: item.media_type ?? "image/png" },
          meta: {
            provider: "NanoBananaProvider",
            model,
            google_backend: route.label,
            google_backend_slug: route.providerSlug,
            failover_attempts_before_success: attempts.length,
            ...res.meta,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push(`${route.label}: ${message}`);
      }
    }

    throw new Error(
      `NanoBananaProvider: оба сервера Nano Banana Pro не ответили. ${attempts.join(" | ")}`,
    );
  }
}

export type VideoJob = {
  jobId: string;
  pollingUrl?: string;
  usage?: Record<string, unknown>;
};

export class VideoPrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoPrivacyError";
  }
}

function frameImages(firstFrame: ImageInput, lastFrame?: ImageInput) {
  const frames: unknown[] = [
    {
      type: "image_url",
      image_url: { url: firstFrame.dataUrl },
      frame_type: "first_frame",
    },
  ];
  if (lastFrame) {
    frames.push({
      type: "image_url",
      image_url: { url: lastFrame.dataUrl },
      frame_type: "last_frame",
    });
  }
  return frames;
}

async function pollVideo(transport: OpenRouterTransport, providerName: string, job: VideoJob) {
  const r = await transport.request<{
    status?: string;
    error?: { message?: string };
    unsigned_urls?: string[];
    usage?: Record<string, unknown>;
  }>(job.pollingUrl ?? `/videos/${encodeURIComponent(job.jobId)}`);
  if (!r.ok || !r.data) fail(`${providerName}.poll`, r);
  return {
    result: {
      status: r.data.status ?? "unknown",
      ...(r.data.error?.message ? { error: r.data.error.message } : {}),
      ...(r.data.unsigned_urls ? { unsignedUrls: r.data.unsigned_urls } : {}),
      ...(r.data.usage ? { usage: r.data.usage } : {}),
    },
    meta: { provider: providerName, ...r.meta },
  };
}

async function videoContent(
  transport: OpenRouterTransport,
  providerName: string,
  job: VideoJob,
  unsignedUrl?: string,
) {
  const r = await transport.requestBinary(
    unsignedUrl ?? `/videos/${encodeURIComponent(job.jobId)}/content?index=0`,
  );
  if (!r.ok || !r.bytes) throw new Error(`${providerName}.content: HTTP ${r.status}`);
  return { bytes: r.bytes, contentType: r.contentType || "video/mp4" };
}

export class SeedanceProvider {
  constructor(private transport = new OpenRouterTransport()) {}

  async capabilities() {
    const r = await this.transport.request<unknown>("/videos/models");
    if (!r.ok) fail("SeedanceProvider.capabilities", r);
    return r.data;
  }

  async submit(
    prompt: string,
    firstFrame: ImageInput,
    references: ImageInput[],
  ): Promise<ProviderCall<VideoJob>> {
    const c = getHugConfig();
    const model = c.models.video;
    const lastFrame = references.find((r) => r.label === "MEETING_REFERENCE_FRAME");

    const res = await this.transport.request<{
      id?: string;
      polling_url?: string;
      usage?: Record<string, unknown>;
    }>("/videos", {
      body: {
        model,
        prompt,
        duration: c.videoDurationSeconds,
        resolution: "720p",
        aspect_ratio: c.aspectRatio,
        generate_audio: false,
        frame_images: frameImages(firstFrame, lastFrame),
      },
    });

    if (!res.ok || !res.data) {
      const errorText = `${String(res.raw ?? "")} ${JSON.stringify(res.data ?? {})}`;
      if (
        errorText.includes("InputImageSensitiveContentDetected") ||
        errorText.includes("PrivacyInformation")
      ) {
        throw new VideoPrivacyError(
          `SeedanceProvider.submit: Seedance отклонил подготовленные MASTER/MEETING кадры по фильтру приватности. HTTP ${res.status}`,
        );
      }
      fail("SeedanceProvider.submit", res);
    }

    if (!res.data.id) throw new Error("SeedanceProvider: no video job id returned");
    return {
      result: {
        jobId: res.data.id,
        ...(res.data.polling_url ? { pollingUrl: res.data.polling_url } : {}),
        ...(res.data.usage ? { usage: res.data.usage } : {}),
      },
      meta: {
        provider: "SeedanceProvider",
        model,
        video_input_mode: lastFrame ? "first_last_frame" : "first_frame_only",
        raw_identity_references_sent: false,
        ...res.meta,
      },
    };
  }

  async poll(job: VideoJob) {
    return pollVideo(this.transport, "SeedanceProvider", job);
  }

  async content(job: VideoJob, unsignedUrl?: string) {
    return videoContent(this.transport, "SeedanceProvider", job, unsignedUrl);
  }
}

export const KLING_FALLBACK_MODEL = "kwaivgi/kling-v3.0-std";

export class KlingProvider {
  constructor(private transport = new OpenRouterTransport()) {}

  async submit(
    prompt: string,
    firstFrame: ImageInput,
    lastFrame?: ImageInput,
  ): Promise<ProviderCall<VideoJob>> {
    const c = getHugConfig();
    const res = await this.transport.request<{
      id?: string;
      polling_url?: string;
      usage?: Record<string, unknown>;
    }>("/videos", {
      body: {
        model: KLING_FALLBACK_MODEL,
        prompt,
        duration: c.videoDurationSeconds,
        resolution: "720p",
        aspect_ratio: c.aspectRatio,
        generate_audio: false,
        frame_images: frameImages(firstFrame, lastFrame),
      },
    });

    if (!res.ok || !res.data) fail("KlingProvider.submit", res);
    if (!res.data.id) throw new Error("KlingProvider: no video job id returned");

    return {
      result: {
        jobId: res.data.id,
        ...(res.data.polling_url ? { pollingUrl: res.data.polling_url } : {}),
        ...(res.data.usage ? { usage: res.data.usage } : {}),
      },
      meta: {
        provider: "KlingProvider",
        model: KLING_FALLBACK_MODEL,
        video_input_mode: lastFrame ? "first_last_frame" : "first_frame_only",
        raw_identity_references_sent: false,
        fallback: true,
        ...res.meta,
      },
    };
  }

  async poll(job: VideoJob) {
    return pollVideo(this.transport, "KlingProvider", job);
  }

  async content(job: VideoJob, unsignedUrl?: string) {
    return videoContent(this.transport, "KlingProvider", job, unsignedUrl);
  }
}

export function base64ToBytes(base64: string) {
  const b = atob(base64);
  const bytes = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
