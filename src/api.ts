/**
 * Client for the real Compare Cloud Costs public API.
 *
 * Data source: GET https://comparecloudcosts.com/api/v1/pricing
 * (header X-API-Key: <CCC_API_KEY>) — see the "Public API" section of
 * https://comparecloudcosts.com/docs and src/app/api/v1/pricing/route.ts
 * in rodrigo-orzari/ccc. Filter semantics come from buildPricingFilters()
 * in src/lib/api-utils.ts of the same repo:
 *   - `product`    one of compute|gpu|database|serverless|networking|
 *                  containers|data-analytics|ai|storage|app-hosting|
 *                  security|integration (defaults to compute!)
 *   - `provider`   comma-separated provider slugs
 *   - `minVcpu` / `minMemory`  numeric minimums
 *   - `geography`  matched against the records' geography buckets
 *                  (North America, South America, Europe, Asia Pacific,
 *                  Middle East & Africa, Global)
 *   - `search`     free-text match (used for AI model families)
 *   - `limit`      page size (API default 5000)
 */

export const API_BASE =
  process.env.CCC_API_BASE_URL ?? "https://comparecloudcosts.com";

export const GENERATE_KEY_URL = "https://comparecloudcosts.com/mcp";

export function getApiKey(): string | undefined {
  const key = process.env.CCC_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export const MISSING_KEY_MESSAGE =
  `CCC_API_KEY is not set, so the Compare Cloud Costs API cannot be called. ` +
  `Get a free API key (1-click, no card) at ${GENERATE_KEY_URL} and set it as ` +
  `the CCC_API_KEY environment variable in your MCP client configuration, ` +
  `then restart the client. tools/list works without a key; tool calls need one.`;

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface PricingResponse {
  data: Record<string, unknown>[];
  count: number;
  rateLimitRemaining?: string | null;
}

export async function fetchPricing(
  apiKey: string,
  params: URLSearchParams
): Promise<PricingResponse> {
  const url = `${API_BASE}/api/v1/pricing?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
  } catch (err) {
    throw new ApiError(
      `Could not reach the Compare Cloud Costs API at ${API_BASE}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const bodyText = await res.text();
  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    const detail =
      body?.error ?? body?.message ?? bodyText.slice(0, 300) ?? "unknown error";
    throw new ApiError(
      `Compare Cloud Costs API returned HTTP ${res.status}: ${detail}. ` +
        `If your key is missing, invalid, or out of quota, generate a free key at ${GENERATE_KEY_URL}.`,
      res.status
    );
  }

  return {
    data: Array.isArray(body?.data) ? body.data : [],
    count: typeof body?.count === "number" ? body.count : (body?.data?.length ?? 0),
    rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
  };
}

/** Tool `category` enum -> the API's `product` parameter (src/lib/api-utils.ts). */
export const CATEGORY_TO_PRODUCT: Record<string, string> = {
  vm: "compute",
  database: "database",
  serverless: "serverless",
  storage: "storage",
  ai: "ai",
  gpu: "gpu",
  containers: "containers",
  "app-hosting": "app-hosting",
};

/**
 * Translate a free-form region/country/city string (the tool schemas use
 * cloud region IDs like "us-east-1", Azure names like "eastus", or plain
 * places like "Brazil") into one of the API's geography bucket values.
 *
 * IMPORTANT: the values are returned LOWERCASED. buildPricingFilters()
 * compares them against LOWER(pr.geography) without lowercasing the
 * input, so the canonical bucket names must be sent as e.g.
 * "south america", not "South America" (verified live: the capitalized
 * form matches nothing).
 *
 * Returns null for "global"/empty (no filter) and passes unrecognized
 * strings through unchanged — the API also matches raw geography values
 * and always force-includes 'global' rows.
 */
export function toGeography(input: string | undefined): string | null {
  if (!input) return null;
  const r = input.trim().toLowerCase();
  if (!r || r === "global") return null;

  if (
    r.includes("south america") ||
    r.includes("s. america") ||
    r.startsWith("sa-") ||
    r.includes("sao paulo") ||
    r.includes("são paulo") ||
    r.includes("brazil") ||
    r.includes("brasil") ||
    r.includes("chile") ||
    r.includes("colombia") ||
    r.includes("argentina")
  ) {
    return "south america";
  }
  if (
    r.includes("middle east") ||
    r.includes("africa") ||
    r.startsWith("me-") ||
    r.includes("uae") ||
    r.includes("dubai") ||
    r.includes("bahrain") ||
    r.includes("qatar") ||
    r.includes("israel")
  ) {
    return "middle east & africa";
  }
  if (
    r.includes("asia") ||
    r.includes("apac") ||
    r.startsWith("ap-") ||
    r.startsWith("cn-") ||
    r.includes("tokyo") ||
    r.includes("singapore") ||
    r.includes("sydney") ||
    r.includes("mumbai") ||
    r.includes("seoul") ||
    r.includes("osaka") ||
    r.includes("hong kong") ||
    r.includes("china") ||
    r.includes("india") ||
    r.includes("japan") ||
    r.includes("australia") ||
    r.includes("indonesia") ||
    r.includes("jakarta")
  ) {
    return "asia pacific";
  }
  if (
    r.includes("europe") ||
    r.startsWith("eu-") ||
    r.includes("ireland") ||
    r.includes("frankfurt") ||
    r.includes("london") ||
    r.includes("paris") ||
    r.includes("germany") ||
    r.includes("france") ||
    r.includes("spain") ||
    r.includes("italy") ||
    r.includes("netherlands") ||
    r.includes("sweden") ||
    r.includes("switzerland") ||
    r.includes("poland") ||
    r === "uk" ||
    r.includes("uk-")
  ) {
    return "europe";
  }
  if (
    r.includes("north america") ||
    r.includes("n. america") ||
    r.startsWith("us-") ||
    r.startsWith("ca-") ||
    r === "us" ||
    r === "usa" ||
    r.includes("united states") ||
    r.includes("canada") ||
    r.includes("virginia") ||
    r.includes("ohio") ||
    r.includes("oregon") ||
    r.includes("texas") ||
    r.includes("california") ||
    r.includes("mexico")
  ) {
    return "north america";
  }
  // Unrecognized: pass through (matched case-insensitively by the API).
  return input.trim();
}

/** Keep only the fields that matter for a pricing comparison. */
export function trimPricingRecord(
  rec: Record<string, unknown>,
  includeAttributes: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    provider: rec.provider,
    service: rec.service,
    region: rec.region,
    instance_type: rec.instance_type,
    vcpus: rec.vcpus,
    memory_gb: rec.memory_gb,
    arch: rec.arch,
    os: rec.os,
    gpu_count: rec.gpu_count,
    geography: rec.geography,
    price_per_unit: rec.price_per_unit,
    unit: rec.unit,
    category: rec.category,
  };
  if (includeAttributes && rec.attributes != null) {
    out.attributes = rec.attributes;
  }
  return out;
}
