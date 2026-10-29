<p align="center">
<a href="https://comparecloudcosts.com/yourcloud"><img src="ccc-logo-shield-transparent.png" alt="Compare Cloud Costs logo" width="160"></a>
</p>

# Compare Cloud Costs — MCP Server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server that gives your AI assistant access to the [Compare Cloud Costs](https://comparecloudcosts.com) pricing catalog — cloud and AI model pricing across AWS, Azure, Google Cloud, Oracle, DigitalOcean, Alibaba, Cloudflare and the frontier AI providers, aligned to the FinOps FOCUS™ standard.

**Data freshness:** CCC refreshes its pricing information about once a week. The catalog is not real-time or live data, so use it for planning and comparison rather than minute-by-minute price checks.

This package is the installable, stdio-transport MCP server. Tool names and schemas match the canonical catalog used by the Compare Cloud Costs backend, and every tool is backed by the site's real public APIs — no sample data.

## Tools

| Tool | What it does |
| --- | --- |
| `compare_cloud_pricing` | Query and compare multi-cloud compute, database, and serverless pricing across AWS, Azure, Google Cloud, Oracle, DigitalOcean, Alibaba, and Cloudflare. Filters: `category` (required), `provider`, `min_vcpu`, `min_ram_gb`, `region`. |
| `search_ai_models` | Search token pricing (input, output, prompt caching) and context windows for AI LLMs across OpenAI, Anthropic, DeepSeek, Mistral, Meta Llama, and Cohere. Filters: `provider`, `model_family`. |
| `estimate_workload_architecture` | End-to-end multi-cloud monthly cost benchmarks for realistic full-stack architectures (VMs + managed DB + load balancers + storage + egress). Takes a `workload_id` (see below). |
| `lookup_datacenter_compliance` | Checks global data center availability and region locations from the pricing catalog, with pointers to certification details. Filters: `compliance_standard`, `country_or_city`. |

### Workload IDs

`estimate_workload_architecture` accepts the workload slugs from https://comparecloudcosts.com/workloads, e.g. `3-tier-web`, `serverless-web-app`, `rag-ai-app`, `k8s-app-platform`, `ecommerce-microservices`, `streaming-analytics`, `data-warehouse-bi`, `ml-training-hosting`, `agentic-ai-swarm`. (The example slugs in the tool description — `three-tier-web-app`, `ai-rag-pipeline`, etc. — predate the current catalog; if an ID is unknown the tool returns the list of valid IDs.)

## Get a free API key

Tool calls need a free Compare Cloud Costs API key:

1. Go to **https://comparecloudcosts.com/mcp** and click **Generate preview key** (1-click, no card). Keys look like `ccc_live_…`.
2. Set it as the `CCC_API_KEY` environment variable in your MCP client config (see below).

`tools/list` works without a key; `tools/call` returns an error explaining how to get one. Free preview keys are rate-limited per hour (the remaining quota is reported in tool responses).

## Install

### Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "compare-cloud-costs": {
      "command": "npx",
      "args": ["-y", "@comparecloudcosts/mcp-server"],
      "env": {
        "CCC_API_KEY": "ccc_live_your_key_here"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "compare-cloud-costs": {
      "command": "npx",
      "args": ["-y", "@comparecloudcosts/mcp-server"],
      "env": {
        "CCC_API_KEY": "ccc_live_your_key_here"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json` (note VS Code uses the `servers` key):

```json
{
  "servers": {
    "compare-cloud-costs": {
      "command": "npx",
      "args": ["-y", "@comparecloudcosts/mcp-server"],
      "env": {
        "CCC_API_KEY": "ccc_live_your_key_here"
      },
      "type": "stdio"
    }
  }
}
```

Requires Node.js ≥ 18.

## How the tools map to the real API

All pricing data comes from `GET https://comparecloudcosts.com/api/v1/pricing` with header `X-API-Key: <CCC_API_KEY>` (documented in the "Public API" section of https://comparecloudcosts.com/docs). The endpoint is a faceted filter over the pricing database; the mappings below follow its server-side filter semantics exactly.

### `compare_cloud_pricing`

| Tool argument | API parameter | Notes |
| --- | --- | --- |
| `category` | `product` | The API has **no** category filter that accepts these values — its `category` parameter matches per-record labels like "General purpose". The category lens is the `product` parameter: `vm→compute`, `database→database`, `serverless→serverless`, `storage→storage`, `ai→ai`, `gpu→gpu`, `containers→containers`, `app-hosting→app-hosting`. (The API also special-cases `gpu` to GPU instances only, and `compute` to non-GPU.) Skipping this mapping would silently default every query to `compute`. |
| `provider` | `provider` | Provider slugs pass through unchanged (`aws`, `azure`, `gcp`, …). |
| `min_vcpu` | `minVcpu` | Numeric minimum. |
| `min_ram_gb` | `minMemory` | Numeric minimum, GB. |
| `region` | `geography` | The API has no region-slug parameter. Region IDs (`us-east-1`, `eu-west-1`, `sa-east-1`), Azure location names, and place names are translated to the API's geography buckets (`north america`, `south america`, `europe`, `asia pacific`, `middle east & africa`). Bucket values are sent **lowercase** — the API compares them against `LOWER(geography)` without lowercasing its input (verified against the production API). `global`/empty means no geography filter. Unrecognized strings pass through. |

Results are ordered by price ascending (cheapest first) by the API. The server requests a 500-record page and returns the total count plus the 50 lowest-priced records, trimmed to the comparison-relevant fields.

### `search_ai_models`

`product=ai` plus `provider` (passed through) and `model_family` → the API's free-text `search` parameter. Records are returned with their `attributes` (modality, model tier, etc.); token prices are per the record's `unit` (typically per 1M tokens).

### `estimate_workload_architecture`

Wired to the site's real estimator: `POST https://comparecloudcosts.com/api/workloads` with `{ "workloadId": "<id>" }`, which returns per-provider monthly totals and a component breakdown (instance types, quantities, monthly prices) computed from catalog pricing records (refreshed about once a week). The tool returns those totals and components as-is. Unknown IDs return the API's "Workload not found" plus the list of valid IDs — numbers are never invented.

### `lookup_datacenter_compliance`

Regional availability is computed from the site's facets endpoint, `GET https://comparecloudcosts.com/api/facets?product=compute[&geography=…]` (the same endpoint that powers the website's filter sidebar), which returns catalog-wide record counts per geography and per provider with proper faceted-search semantics. This is deliberately **not** derived from a sample of pricing records — the pricing endpoint returns records cheapest-first, which badly under-reports non-US geographies.

**Honest limitation:** per-datacenter compliance certifications (SOC 2, ISO 27001, HIPAA, PCI-DSS, FedRAMP, GDPR) are **not** exposed by any public API — the pricing records carry no certification fields. When a `compliance_standard` is requested, the tool says so explicitly and points to https://comparecloudcosts.com/datacenters and https://comparecloudcosts.com/compliance instead of fabricating coverage.

Also note: at the time of writing, the catalog's geography tagging for compute records is concentrated in North America (with a small Asia Pacific set), so geography-filtered queries for other regions may return zero records. That is the catalog's real coverage, reported as-is.

## Development

```bash
npm install
npm run build
npm start            # stdio server on dist/index.js
node test/smoke.mjs  # optional smoke test (set CCC_SMOKE_KEY to include API calls)
```

## Registry / directory files

- `server.json` — official MCP Registry manifest (`com.comparecloudcosts/mcp-server`); the matching `mcpName` field is in `package.json`, as the Registry requires.
- `glama.json` — Glama ownership-claim file (maintainer: the repository owner).

## License

MIT
