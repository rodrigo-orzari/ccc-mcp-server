/**
 * Tool catalog for the Compare Cloud Costs MCP server.
 *
 * Names, descriptions and input schemas are copied verbatim from the
 * canonical catalog in rodrigo-orzari/ccc-premium-services
 * (src/mcp/server.ts, MCP_TOOLS_CATALOG) so this standalone package
 * exposes exactly the same four tools as the owner's backend.
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: McpToolDefinition[] = [
  {
    name: 'compare_cloud_pricing',
    description: 'Query and compare multi-cloud compute, database, and serverless pricing across AWS, Azure, Google Cloud, Oracle, DigitalOcean, Alibaba, and Cloudflare.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Product category: vm, database, serverless, storage, ai, networking, etc.',
          enum: ['vm', 'database', 'serverless', 'storage', 'ai', 'gpu', 'containers', 'app-hosting']
        },
        provider: {
          type: 'string',
          description: 'Filter by provider ID: aws, azure, gcp, oracle, digitalocean, alibaba, cloudflare',
          enum: ['aws', 'azure', 'gcp', 'oracle', 'digitalocean', 'alibaba', 'cloudflare']
        },
        min_vcpu: {
          type: 'number',
          description: 'Minimum required vCPUs for instance configurations'
        },
        min_ram_gb: {
          type: 'number',
          description: 'Minimum required RAM memory in Gigabytes'
        },
        region: {
          type: 'string',
          description: 'Target deployment geography or region (e.g. us-east-1, eastus, us-central1, sa-east-1)'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'search_ai_models',
    description: 'Search token pricing (Input, Output, Prompt Caching) and context windows for AI LLMs across OpenAI, Anthropic, DeepSeek, Mistral, Meta Llama, and Cohere.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'AI model provider: openai, anthropic, deepseek, mistral, cohere, google'
        },
        model_family: {
          type: 'string',
          description: 'Model family name (e.g. gpt-4o, claude-3-5-sonnet, deepseek-r1, mistral-large)'
        }
      }
    }
  },
  {
    name: 'estimate_workload_architecture',
    description: 'Calculates end-to-end multi-cloud cost benchmarks for realistic full-stack architectures (VMs + Managed DB + Load Balancers + Storage + Egress).',
    inputSchema: {
      type: 'object',
      properties: {
        workload_id: {
          type: 'string',
          description: 'Pre-modeled workload slug (e.g. three-tier-web-app, ai-rag-pipeline, high-throughput-api, batch-processing)'
        }
      },
      required: ['workload_id']
    }
  },
  {
    name: 'lookup_datacenter_compliance',
    description: 'Checks global data center availability, region locations, and compliance certifications (SOC 2, ISO 27001, HIPAA, PCI-DSS, FedRAMP).',
    inputSchema: {
      type: 'object',
      properties: {
        compliance_standard: {
          type: 'string',
          description: 'Compliance standard code: soc2, iso27001, hipaa, pci-dss, fedramp, gdpr'
        },
        country_or_city: {
          type: 'string',
          description: 'Filter by geographical location (e.g. Brazil, Germany, Tokyo, Virginia)'
        }
      }
    }
  }
];
