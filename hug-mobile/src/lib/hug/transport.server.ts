import { getHugConfig } from "./config.server";

export type TransportResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  raw?: string;
  meta: {
    endpoint: string;
    method: string;
    status: number;
    durationMs: number;
    requestBytes?: number;
    responseBytes?: number;
  };
};

export function sanitize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/.test(value)) return "[data-url]";
    if (value.length > 180) return `[string:${value.length} chars]`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (depth > 4) return "[depth-limit]";
  if (Array.isArray(value)) return value.slice(0, 8).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = /authorization|api[-_ ]?key|secret|token|b64_json|base64/i.test(k)
      ? "[redacted]"
      : sanitize(v, depth + 1);
  }
  return out;
}

function normalizeApiKey(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.replace(/^Bearer\s+/i, "").trim() || null;
}

export class OpenRouterTransport {
  private baseUrl: string;
  private apiKey: string | null;

  constructor(apiKeyOverride?: string | null) {
    const c = getHugConfig();
    this.baseUrl = c.baseUrl.replace(/\/$/, "");
    this.apiKey = normalizeApiKey(apiKeyOverride ?? c.apiKey);
  }

  private headers(json: boolean) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is not configured on the server");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${this.apiKey}`);
    headers.set("HTTP-Referer", "https://github.com/Kontrakevich/AI-Memory-Studio");
    headers.set("X-Title", "HUG Mobile");
    if (json) headers.set("content-type", "application/json");
    return headers;
  }

  async request<T>(
    pathOrUrl: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<TransportResult<T>> {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is not configured on the server");
    const method = init.method ?? (init.body ? "POST" : "GET");
    const endpoint = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    const payload = init.body ? JSON.stringify(init.body) : undefined;
    const started = Date.now();
    const response = await fetch(endpoint, {
      method,
      headers: this.headers(Boolean(payload)),
      redirect: "error",
      ...(payload ? { body: payload } : {}),
    });
    const raw = await response.text();
    let data: T | null = null;
    try {
      data = raw ? (JSON.parse(raw) as T) : null;
    } catch {}
    return {
      ok: response.ok,
      status: response.status,
      data,
      ...(data ? {} : { raw: raw.slice(0, 1000) }),
      meta: {
        endpoint: pathOrUrl,
        method,
        status: response.status,
        durationMs: Date.now() - started,
        ...(payload ? { requestBytes: payload.length } : {}),
        responseBytes: raw.length,
      },
    };
  }

  async requestBinary(pathOrUrl: string) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is not configured on the server");
    const endpoint = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    const response = await fetch(endpoint, {
      headers: this.headers(false),
      redirect: "error",
    });
    if (!response.ok) {
      return { ok: false, status: response.status, bytes: null, contentType: "" };
    }
    return {
      ok: true,
      status: response.status,
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}
