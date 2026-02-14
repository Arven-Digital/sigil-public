#!/usr/bin/env node
/**
 * Sigil Protocol MCP Server
 *
 * Exposes Sigil wallet operations as MCP tools for AI agents.
 * Runs as a stdio-based MCP server.
 *
 * Environment variables:
 *   SIGIL_API_URL          - API base URL (default: https://api.sigil.codes)
 *   SIGIL_API_KEY          - Agent API key (sgil_...)
 *   SIGIL_ACCOUNT_ADDRESS  - Default Sigil account address
 *   SIGIL_CHAIN_ID         - Default chain ID (default: 43114)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = process.env.SIGIL_API_URL || "https://api.sigil.codes";
const API_KEY = process.env.SIGIL_API_KEY || "";
const DEFAULT_ACCOUNT = process.env.SIGIL_ACCOUNT_ADDRESS || "";
const DEFAULT_CHAIN_ID = parseInt(process.env.SIGIL_CHAIN_ID || "43114");

let authToken: string | null = null;

async function authenticate(): Promise<string> {
  if (authToken) return authToken;
  if (!API_KEY) throw new Error("SIGIL_API_KEY is required");

  const res = await fetch(`${API_URL}/v1/agent/auth/api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Authentication failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  authToken = data.token;
  return authToken!;
}

async function apiCall(path: string, options?: RequestInit & { body?: any }): Promise<any> {
  const token = await authenticate();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    // Token expired, re-auth
    authToken = null;
    const newToken = await authenticate();
    const retry = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    if (!retry.ok) throw new Error(`API error: ${retry.status} ${await retry.text()}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  return res.json();
}

const TOOLS = [
  {
    name: "get_account_info",
    description: "Get Sigil account status including balance, policy, session keys, daily spend, and guardian status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Account address (default: configured account)" },
      },
    },
  },
  {
    name: "evaluate_transaction",
    description: "Submit a transaction for 3-layer Guardian evaluation (rules, simulation, AI scoring). Returns verdict (APPROVED/REJECTED/ESCALATE), risk score, and guardian signature if approved.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Target contract/address" },
        value: { type: "string", description: "Value in wei" },
        data: { type: "string", description: "Transaction calldata (hex)" },
      },
      required: ["to", "value"],
    },
  },
  {
    name: "create_session_key",
    description: "Create a time-limited, spend-limited session key for the agent. Session keys auto-expire and have restricted scope.",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Public address of the session key" },
        validForHours: { type: "number", description: "How many hours the key is valid (default: 24)" },
        spendLimit: { type: "string", description: "Max spend in wei for this session key" },
      },
      required: ["key"],
    },
  },
  {
    name: "freeze_account",
    description: "Emergency freeze the Sigil account. Blocks ALL transactions including agent operations. Use only in emergencies.",
    inputSchema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "Reason for freezing" },
        address: { type: "string", description: "Account address (default: configured account)" },
      },
      required: ["reason"],
    },
  },
  {
    name: "unfreeze_account",
    description: "Unfreeze a frozen Sigil account. Requires owner authorization.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Account address (default: configured account)" },
      },
    },
  },
  {
    name: "update_policy",
    description: "Update the account's spending policy. Set per-transaction limits, daily caps, and guardian thresholds.",
    inputSchema: {
      type: "object" as const,
      properties: {
        maxTxValue: { type: "string", description: "Max value per transaction in wei" },
        dailyLimit: { type: "string", description: "Max daily spend in wei" },
        guardianThreshold: { type: "string", description: "Threshold above which Guardian co-sign is required, in wei" },
        allowedTargets: { type: "array", items: { type: "string" }, description: "Whitelist of target addresses" },
      },
    },
  },
  {
    name: "get_transaction_history",
    description: "Get recent transaction evaluation history for the account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Account address (default: configured account)" },
        limit: { type: "number", description: "Number of transactions to return (default: 20)" },
      },
    },
  },
  {
    name: "rotate_agent_key",
    description: "Rotate the agent's signing key to a new address. The old key is immediately revoked.",
    inputSchema: {
      type: "object" as const,
      properties: {
        newAgentKey: { type: "string", description: "New agent key address" },
        address: { type: "string", description: "Account address (default: configured account)" },
      },
      required: ["newAgentKey"],
    },
  },
  {
    name: "get_protection_status",
    description: "Get real-time protection status: circuit breaker state, velocity limits, and recent rejection count.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Account address (default: configured account)" },
        chainId: { type: "number", description: "Chain ID (default: configured chain)" },
      },
    },
  },
];

async function handleTool(name: string, args: Record<string, any>): Promise<string> {
  const addr = args.address || DEFAULT_ACCOUNT;
  if (!addr && name !== "evaluate_transaction") {
    return JSON.stringify({ error: "No account address configured. Set SIGIL_ACCOUNT_ADDRESS or pass address parameter." });
  }

  switch (name) {
    case "get_account_info":
      return JSON.stringify(await apiCall(`/v1/agent/wallets/${addr}`));

    case "evaluate_transaction": {
      // Build a minimal UserOp-like structure
      const result = await apiCall("/v1/evaluate", {
        method: "POST",
        body: {
          userOp: {
            sender: addr,
            nonce: "0x0",
            callData: args.data || "0x",
            callGasLimit: "200000",
            verificationGasLimit: "200000",
            preVerificationGas: "50000",
            maxFeePerGas: "25000000000",
            maxPriorityFeePerGas: "1500000000",
            signature: "0x",
          },
        },
      });
      return JSON.stringify(result);
    }

    case "create_session_key":
      return JSON.stringify(
        await apiCall(`/v1/agent/wallets/${addr}/session-keys`, {
          method: "POST",
          body: {
            key: args.key,
            validForHours: args.validForHours || 24,
            spendLimit: args.spendLimit || "100000000000000000",
          },
        })
      );

    case "freeze_account":
      return JSON.stringify(
        await apiCall(`/v1/accounts/${addr}/freeze`, {
          method: "POST",
          body: { reason: args.reason },
        })
      );

    case "unfreeze_account":
      return JSON.stringify(
        await apiCall(`/v1/accounts/${addr}/unfreeze`, { method: "POST" })
      );

    case "update_policy":
      return JSON.stringify(
        await apiCall(`/v1/accounts/${addr}/policy`, {
          method: "PUT",
          body: {
            maxTxValue: args.maxTxValue,
            dailyLimit: args.dailyLimit,
            guardianThreshold: args.guardianThreshold,
            allowedTargets: args.allowedTargets,
          },
        })
      );

    case "get_transaction_history":
      return JSON.stringify(
        await apiCall(`/v1/transactions?account=${addr}&limit=${args.limit || 20}`)
      );

    case "rotate_agent_key":
      return JSON.stringify(
        await apiCall(`/v1/accounts/${addr}/rotate-key`, {
          method: "POST",
          body: { newAgentKey: args.newAgentKey },
        })
      );

    case "get_protection_status":
      return JSON.stringify(
        await apiCall(`/v1/accounts/${addr}/protection?chainId=${args.chainId || DEFAULT_CHAIN_ID}`)
      );

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─── Server setup ───

const server = new Server(
  { name: "sigil-protocol", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, (args as Record<string, any>) || {});
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sigil MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
