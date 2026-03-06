import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDeckOverview } from "./tools/deck-overview.js";
import { registerDueToday } from "./tools/due-today.js";
import { registerDifficultCards } from "./tools/card-difficulty.js";
import { registerReviewHistory } from "./tools/review-history.js";
import { registerSearchCards } from "./tools/search-cards.js";

// Mock invoke for all tools
vi.mock("./anki-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./anki-client.js")>();
  return { ...actual, invoke: vi.fn() };
});

import { invoke } from "./anki-client.js";
const mockInvoke = vi.mocked(invoke);

async function setupFullServer() {
  const server = new McpServer({ name: "anki-connect", version: "0.1.0" });
  registerDeckOverview(server);
  registerDueToday(server);
  registerDifficultCards(server);
  registerReviewHistory(server);
  registerSearchCards(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("MCP protocol", () => {
  it("registers exactly 5 tools", async () => {
    const client = await setupFullServer();
    const { tools } = await client.listTools();

    expect(tools).toHaveLength(5);
  });

  it("registers tools with correct names", async () => {
    const client = await setupFullServer();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "get_deck_overview",
      "get_difficult_cards",
      "get_due_today",
      "get_review_history",
      "search_cards",
    ]);
  });

  it("all tools have descriptions", async () => {
    const client = await setupFullServer();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(10);
    }
  });

  it("can call a tool and get valid JSON response", async () => {
    const client = await setupFullServer();

    // Mock the review history API call
    mockInvoke.mockResolvedValueOnce([
      [0, 10],
      [-1, 5],
    ]);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 7 },
    });

    expect(result.content).toHaveLength(1);
    const textContent = result.content[0] as { type: string; text: string };
    expect(textContent.type).toBe("text");

    // Should be valid JSON
    const data = JSON.parse(textContent.text);
    expect(data).toHaveProperty("daily_counts");
    expect(data).toHaveProperty("current_streak_days");
    expect(data).toHaveProperty("trend");
  });

  it("returns isError for connection failures", async () => {
    const client = await setupFullServer();

    mockInvoke.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await client.callTool({
      name: "get_deck_overview",
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });
});
