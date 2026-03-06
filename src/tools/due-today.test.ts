import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDueToday } from "./due-today.js";
import { makeCard, makeDeckStats } from "../test-helpers.js";

vi.mock("../anki-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anki-client.js")>();
  return { ...actual, invoke: vi.fn() };
});

import { invoke } from "../anki-client.js";
const mockInvoke = vi.mocked(invoke);

async function setup() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerDueToday(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function parseResult(result: { content: unknown[] }) {
  const textContent = result.content[0] as { type: string; text: string };
  return JSON.parse(textContent.text);
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("get_due_today", () => {
  it("returns correct due breakdown and reviewed count", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce({ "CIPP/E": 1 }) // deckNamesAndIds
      .mockResolvedValueOnce({
        "1": makeDeckStats({ new_count: 5, learn_count: 2, review_count: 8 }),
      }) // getDeckStats
      .mockResolvedValueOnce(15) // getNumCardsReviewedToday
      .mockResolvedValueOnce([1, 2, 3]) // findCards (due cards)
      .mockResolvedValueOnce([
        makeCard({ cardId: 1, type: 0 }),
        makeCard({ cardId: 2, type: 1 }),
        makeCard({ cardId: 3, type: 2 }),
      ]); // cardsInfo

    const result = await client.callTool({ name: "get_due_today", arguments: {} });
    const data = parseResult(result);

    expect(data.reviewed_today).toBe(15);
    expect(data.due_now.new).toBe(5);
    expect(data.due_now.learning).toBe(2);
    expect(data.due_now.review).toBe(8);
    expect(data.due_now.total).toBe(15);
    expect(data.due_cards_breakdown.new).toBe(1);
    expect(data.due_cards_breakdown.learning).toBe(1);
    expect(data.due_cards_breakdown.review).toBe(1);
  });

  it("returns deck not found error", async () => {
    const client = await setup();

    mockInvoke.mockResolvedValueOnce({ "CIPP/E": 1 }); // deckNamesAndIds

    const result = await client.callTool({
      name: "get_due_today",
      arguments: { deck: "Missing" },
    });
    const textContent = result.content[0] as { text: string };

    expect(textContent.text).toContain("not found");
  });

  it("handles no cards due", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce({ "CIPP/E": 1 })
      .mockResolvedValueOnce({
        "1": makeDeckStats({ new_count: 0, learn_count: 0, review_count: 0 }),
      })
      .mockResolvedValueOnce(0) // reviewed today
      .mockResolvedValueOnce([]); // no due cards

    const result = await client.callTool({ name: "get_due_today", arguments: {} });
    const data = parseResult(result);

    expect(data.due_now.total).toBe(0);
    expect(data.due_cards_breakdown.total).toBe(0);
  });
});
