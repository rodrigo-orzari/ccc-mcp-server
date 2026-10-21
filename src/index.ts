#!/usr/bin/env node
/**
 * Compare Cloud Costs — standalone MCP server (stdio).
 *
 * Exposes the four tools from the canonical catalog
 * (rodrigo-orzari/ccc-premium-services, src/mcp/server.ts) backed by the
 * real public API at https://comparecloudcosts.com/api/v1/pricing.
 * Requires a free API key in the CCC_API_KEY environment variable
 * (generate one at https://comparecloudcosts.com/mcp).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools.js";
import {
  API_BASE,
  CATEGORY_TO_PRODUCT,
  MISSING_KEY_MESSAGE,
  fetchPricing,
  getApiKey,
  toGeography,
  trimPricingRecord,
} from "./api.js";

const DISPLAY_CAP = 50;
const PAGE_LIMIT = "500";

/** Workload IDs that exist in the site's catalog (src/config/workloads.ts
 *  in rodrigo-orzari/ccc, mirrored by the public /workloads pages). The
 *  examples in the catalog's workload_id description predate the current
 *  catalog, so unknown IDs get this list back in the error message. */
const KNOWN_WORKLOAD_IDS = [
  "3-tier-web",
  "serverless-web-app",
  "rag-ai-app",
  "ai-gateway-proxy",
  "api-rate-limiting-auth-gateway",
  "cross-cloud-event-router",
  "serverless-fallback-buffer",
  "k8s-app-platform",
  "ecommerce-microservices",
  "streaming-analytics",
  "data-warehouse-bi",
  "disaster-recovery",
  "content-media-platform",
  "compliance-ready-web-app",
  "smart-manufacturing",
  "hpc-scientific",
  "saas-paas-app",
  "ml-training-hosting",
  "event-driven-image-processing",
  "event-driven-api",
  "hybrid-cloud-network",
  "zero-trust-edge",
  "voice-ai-assistant",
  "agentic-ai-swarm",
];

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

async function handleCompareCloudPricing(
  apiKey: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const category = typeof args.category === "string" ? args.category : "vm";
  const product = CATEGORY_TO_PRODUCT[category] ?? "compute";

  const params = new URLSearchParams();
  params.set("product", product);
  if (typeof args.provider === "string" && args.provider) {
    params.set("provider", args.provider);
  }
  if (typeof args.min_vcpu === "number") {
    params.set("minVcpu", String(args.min_vcpu));
  }
  if (typeof args.min_ram_gb === "number") {
    params.set("minMemory", String(args.min_ram_gb));
  }
  const geography =
    typeof args.region === "string" ? toGeography(args.region) : null;
  if (geography) params.set("geography", geography);
  params.set("limit", PAGE_LIMIT);

  const { data, count, rateLimitRemaining } = await fetchPricing(apiKey, params);
  const shown = data
    .slice(0, DISPLAY_CAP)
    .map((r) => trimPricingRecord(r, false));

  const header =
    `${count} pricing record(s) returned by the Compare Cloud Costs API ` +
    `(product=${product}` +
    (typeof args.provider === "string" ? `, provider=${args.provider}` : "") +
    (geography ? `, geography=${geography}` : "") +
    `), ordered by price ascending. Showing the ${shown.length} lowest-priced.` +
    (rateLimitRemaining ? ` API quota remaining: ${rateLimitRemaining}.` : "");

  return textResult(`${header}\n\n${JSON.stringify(shown, null, 2)}`);
}

async function handleSearchAiModels(
  apiKey: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const params = new URLSearchParams();
  params.set("product", "ai");
  if (typeof args.provider === "string" && args.provider) {
    params.set("provider", args.provider);
  }
  if (typeof args.model_family === "string" && args.model_family) {
    params.set("search", args.model_family);
  }
  params.set("limit", PAGE_LIMIT);

  const { data, count, rateLimitRemaining } = await fetchPricing(apiKey, params);
  const shown = data
    .slice(0, DISPLAY_CAP)
    .map((r) => trimPricingRecord(r, true));

  const header =
    `${count} AI model pricing record(s) returned by the Compare Cloud Costs API` +
    (typeof args.provider === "string" ? ` for provider=${args.provider}` : "") +
    (typeof args.model_family === "string"
      ? ` matching "${args.model_family}"`
      : "") +
    `. Showing ${shown.length}. Token prices are per the record's unit ` +
    `(typically per 1M tokens); see each record's attributes for ` +
    `input/output/caching detail.` +
    (rateLimitRemaining ? ` API quota remaining: ${rateLimitRemaining}.` : "");

  return textResult(`${header}\n\n${JSON.stringify(shown, null, 2)}`);
}

async function handleEstimateWorkloadArchitecture(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const workloadId =
    typeof args.workload_id === "string" ? args.workload_id : "";
  if (!workloadId) {
    return errorResult(
      "workload_id is required. Known workload IDs include: " +
        KNOWN_WORKLOAD_IDS.join(", ") +
        ". Full catalog: https://comparecloudcosts.com/workloads"
    );
  }

  // POST /api/workloads is the site's own estimator endpoint
  // (src/app/api/workloads/route.ts in rodrigo-orzari/ccc): body
  // { workloadId } -> per-provider monthly totals + component breakdown.
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/workloads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ workloadId }),
    });
  } catch (err) {
    return errorResult(
      `Could not reach the Compare Cloud Costs workload estimator: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const body: any = await res.json().catch(() => undefined);
  if (res.status === 404 || body?.error === "Workload not found") {
    return errorResult(
      `Workload "${workloadId}" was not found. Known workload IDs include: ` +
        KNOWN_WORKLOAD_IDS.join(", ") +
        ". Full catalog: https://comparecloudcosts.com/workloads"
    );
  }
  if (!res.ok) {
    return errorResult(
      `Workload estimator returned HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 300) ?? "unknown error"}`
    );
  }

  const results = body?.results ?? body;
  const summary: Record<string, unknown> = {};
  for (const [provider, r] of Object.entries<any>(results ?? {})) {
    if (r && typeof r === "object" && "total" in r) {
      summary[provider] = {
        estimated_monthly_total_usd: Math.round((r.total as number) * 100) / 100,
        components: (r.components ?? []).map((c: any) => ({
          name: c.name,
          instanceType: c.instanceType,
          monthlyPrice:
            typeof c.monthlyPrice === "number"
              ? Math.round(c.monthlyPrice * 100) / 100
              : c.monthlyPrice,
          quantity: c.quantity,
          ...(c.noComparableSku ? { noComparableSku: true, matchReason: c.matchReason } : {}),
        })),
      };
    }
  }

  return textResult(
    `Estimated monthly cost per provider for workload "${workloadId}" ` +
      `(from the Compare Cloud Costs estimator; CCC pricing data is refreshed about once a week, and totals are directional ` +
      `benchmarks at default architecture priorities):\n\n` +
      `${JSON.stringify(summary, null, 2)}\n\n` +
      `Interactive version: https://comparecloudcosts.com/workloads/${workloadId}`
  );
}

async function handleLookupDatacenterCompliance(
  apiKey: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const geography =
    typeof args.country_or_city === "string"
      ? toGeography(args.country_or_city)
      : null;

  // Regional availability comes from the site's facets endpoint
  // (src/app/api/facets/route.ts in rodrigo-orzari/ccc, backed by
  // getFacetCounts in the pricing repository): catalog-wide per-provider
  // and per-geography record counts, computed with proper faceted-search
  // semantics — NOT a price-ordered sample of pricing records, which
  // would badly under-report non-US geographies. The endpoint is public
  // (it powers the site's own filter sidebar); the pricing API key is
  // still required by this server for every tool call, per the site's
  // documented contract.
  void apiKey;
  const params = new URLSearchParams();
  params.set("product", "compute");
  if (geography) params.set("geography", geography);

  let facets: any;
  try {
    const res = await fetch(`${API_BASE}/api/facets?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return errorResult(
        `Facets endpoint returned HTTP ${res.status} while looking up regional availability.`
      );
    }
    facets = await res.json();
  } catch (err) {
    return errorResult(
      `Could not reach the Compare Cloud Costs facets endpoint: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const providerCounts: Record<string, number> = facets?.provider ?? {};
  const geographyCounts: Record<string, number> = facets?.geography ?? {};

  const lines: string[] = [];
  lines.push(
    `Regional availability from the Compare Cloud Costs pricing catalog ` +
      `(facet counts over all compute records in the current catalog` +
      (geography
        ? `; provider counts are filtered to geography="${geography}"`
        : "") +
      `):`
  );
  lines.push("");
  lines.push("Priced compute records by geography (whole catalog):");
  lines.push(JSON.stringify(geographyCounts, null, 2));
  lines.push("");
  lines.push(
    geography
      ? `Priced compute records by provider in ${geography}:`
      : "Priced compute records by provider (whole catalog):"
  );
  lines.push(JSON.stringify(providerCounts, null, 2));
  if (geography && Object.keys(providerCounts).length === 0) {
    lines.push(
      `No priced compute records in the catalog are currently tagged with ` +
        `geography "${geography}" — regional coverage in the pricing data is ` +
        `still concentrated in the geographies listed above. The ` +
        `https://comparecloudcosts.com/datacenters page tracks provider ` +
        `footprints independently of pricing coverage.`
    );
  }
  lines.push("");
  if (typeof args.compliance_standard === "string" && args.compliance_standard) {
    lines.push(
      `Note: per-datacenter compliance certification data (including ` +
        `"${args.compliance_standard}") is not exposed by the public pricing ` +
        `API, so certification coverage cannot be confirmed from the catalog ` +
        `alone. See https://comparecloudcosts.com/datacenters and ` +
        `https://comparecloudcosts.com/compliance for certification details.`
    );
  } else {
    lines.push(
      `Note: per-datacenter compliance certifications (SOC 2, ISO 27001, ` +
        `HIPAA, PCI-DSS, FedRAMP, GDPR) are not exposed by the public pricing ` +
        `API. See https://comparecloudcosts.com/datacenters and ` +
        `https://comparecloudcosts.com/compliance for certification details.`
    );
  }

  return textResult(lines.join("\n"));
}

const server = new Server(
  { name: "compare-cloud-costs", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  const apiKey = getApiKey();
  if (!apiKey) {
    return errorResult(MISSING_KEY_MESSAGE);
  }

  try {
    switch (name) {
      case "compare_cloud_pricing":
        return await handleCompareCloudPricing(apiKey, args);
      case "search_ai_models":
        return await handleSearchAiModels(apiKey, args);
      case "estimate_workload_architecture":
        return await handleEstimateWorkloadArchitecture(args);
      case "lookup_datacenter_compliance":
        return await handleLookupDatacenterCompliance(apiKey, args);
      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Compare Cloud Costs MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
