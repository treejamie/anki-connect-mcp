import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDeckOverview } from "./deck-overview.js";
import { makeCard, makeDeckStats } from "../test-helpers.js";

vi.mock("../anki-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anki-client.js")>();
  return { ...actual, invoke: vi.fn() };
});

import { invoke } from "../anki-client.js";
const mockInvoke = vi.mocked(invoke);

async function setup() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerDeckOverview(server);
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

describe("get_deck_overview", () => {
  it("returns correct maturity counts", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce({ "CIPP/E": 1 }) // deckNamesAndIds
      .mockResolvedValueOnce({ "1": makeDeckStats() }) // getDeckStats
      .mockResolvedValueOnce([1, 2, 3, 4]) // findCards
      .mockResolvedValueOnce([
        makeCard({ cardId: 1, type: 0 }), // new
        makeCard({ cardId: 2, type: 1 }), // learning
        makeCard({ cardId: 3, type: 2, interval: 10 }), // young (interval < 21)
        makeCard({ cardId: 4, type: 2, interval: 30 }), // mature (interval >= 21)
      ]); // cardsInfo

    const result = await client.callTool({ name: "get_deck_overview", arguments: {} });
    const data = parseResult(result);

    expect(data.total_cards).toBe(4);
    expect(data.card_maturity.new).toBe(1);
    expect(data.card_maturity.learning).toBe(1);
    expect(data.card_maturity.young).toBe(1);
    expect(data.card_maturity.mature).toBe(1);
  });

  it("returns deck not found error", async () => {
    const client = await setup();

    mockInvoke.mockResolvedValueOnce({ "CIPP/E": 1 }); // deckNamesAndIds

    const result = await client.callTool({
      name: "get_deck_overview",
      arguments: { deck: "Nonexistent" },
    });
    const textContent = result.content[0] as { text: string };

    expect(textContent.text).toContain("not found");
    expect(textContent.text).toContain("CIPP/E");
  });

  it("returns connection error when Anki is not running", async () => {
    const client = await setup();

    mockInvoke.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await client.callTool({ name: "get_deck_overview", arguments: {} });
    const textContent = result.content[0] as { text: string };

    expect(textContent.text).toContain("Could not connect to Anki");
    expect(result.isError).toBe(true);
  });

  it("computes average ease only from reviewed cards", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce({ "CIPP/E": 1 })
      .mockResolvedValueOnce({ "1": makeDeckStats() })
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([
        makeCard({ cardId: 1, type: 0, ease: 0 }), // new card - ease should be ignored
        makeCard({ cardId: 2, type: 2, interval: 30, ease: 2500 }), // review card
      ]);

    const result = await client.callTool({ name: "get_deck_overview", arguments: {} });
    const data = parseResult(result);

    expect(data.average_ease_percent).toBe(250);
  });
});
