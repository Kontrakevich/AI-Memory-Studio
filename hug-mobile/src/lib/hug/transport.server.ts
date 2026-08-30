import { request as httpsRequest } from "node:https";
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
    transport: "node:https";
    authHeaderSent: boolean;
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

type NativeResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  bytes: Uint8Array;
};

function nativeHttps(
  endpoint: string,
  method: string,
  headers: Record<string, string>,
  payload?: string,
): Promise<NativeResponse> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") {
    throw new Error(`OpenRouterTransport only supports HTTPS endpoints, got ${url.protocol}`);
  }

  return new Promise((resolve, reject) => {
    const requestHeaders: Record<string, string> = { ...headers };
    if (payload) requestHeaders["Content-Length"] = String(Buffer.byteLength(payload));

    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers: requestHeaders,
        timeout: 120_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            bytes: new Uint8Array(buffer),
          });
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error("OpenRouter request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "HTTP-Referer": "https://hug-mobile.vercel.app",
      "X-Title": "HUG Mobile",
    };
    if (json) headers["Content-Type"] = "application/json";
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
    const response = await nativeHttps(endpoint, method, this.headers(Boolean(payload)), payload);
    const raw = Buffer.from(response.bytes).toString("utf8");
    let data: T | null = null;
    try {
      data = raw ? (JSON.parse(raw) as T) : null;
    } catch {}

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      data,
      ...(data ? {} : { raw: raw.slice(0, 1000) }),
      meta: {
        endpoint: pathOrUrl,
        method,
        status: response.status,
        durationMs: Date.now() - started,
        ...(payload ? { requestBytes: Buffer.byteLength(payload) } : {}),
        responseBytes: response.bytes.byteLength,
        transport: "node:https",
        authHeaderSent: true,
      },
    };
  }

  async requestBinary(pathOrUrl: string) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is not configured on the server");
    const endpoint = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    const response = await nativeHttps(endpoint, "GET", this.headers(false));
    const contentTypeRaw = response.headers["content-type"];
    const contentType = Array.isArray(contentTypeRaw)
      ? contentTypeRaw[0] ?? "application/octet-stream"
      : contentTypeRaw ?? "application/octet-stream";

    if (response.status < 200 || response.status >= 300) {
      return { ok: false, status: response.status, bytes: null, contentType };
    }

    return {
      ok: true,
      status: response.status,
      bytes: response.bytes,
      contentType,
    };
  }
}
