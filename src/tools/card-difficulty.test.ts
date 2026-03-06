import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDifficultCards } from "./card-difficulty.js";
import { makeCard } from "../test-helpers.js";

vi.mock("../anki-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anki-client.js")>();
  return { ...actual, invoke: vi.fn() };
});

import { invoke } from "../anki-client.js";
const mockInvoke = vi.mocked(invoke);

async function setup() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerDifficultCards(server);
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

describe("get_difficult_cards", () => {
  it("sorts by lapses (highest first) by default", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1, 2, 3]) // findCards
      .mockResolvedValueOnce([
        makeCard({ cardId: 1, lapses: 2 }),
        makeCard({ cardId: 2, lapses: 10 }),
        makeCard({ cardId: 3, lapses: 5 }),
      ]); // cardsInfo

    const result = await client.callTool({ name: "get_difficult_cards", arguments: {} });
    const data = parseResult(result);

    expect(data.difficult_cards[0].lapses).toBe(10);
    expect(data.difficult_cards[1].lapses).toBe(5);
    expect(data.difficult_cards[2].lapses).toBe(2);
  });

  it("sorts by ease (lowest first) when specified", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1, 2, 3])
      .mockResolvedValueOnce([
        makeCard({ cardId: 1, ease: 2500 }),
        makeCard({ cardId: 2, ease: 1300 }),
        makeCard({ cardId: 3, ease: 1800 }),
      ]);

    const result = await client.callTool({
      name: "get_difficult_cards",
      arguments: { sort_by: "ease" },
    });
    const data = parseResult(result);

    expect(data.difficult_cards[0].ease_percent).toBe(130);
    expect(data.difficult_cards[1].ease_percent).toBe(180);
    expect(data.difficult_cards[2].ease_percent).toBe(250);
  });

  it("returns message when no reviewed cards exist", async () => {
    const client = await setup();

    mockInvoke.mockResolvedValueOnce([]); // findCards returns empty

    const result = await client.callTool({ name: "get_difficult_cards", arguments: {} });
    const textContent = result.content[0] as { text: string };

    expect(textContent.text).toContain("No reviewed cards found");
  });

  it("strips HTML from front field text", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([
        makeCard({
          cardId: 1,
          fields: {
            Front: { value: "<b>What</b> is <i>GDPR</i>?", order: 0 },
            Back: { value: "Answer", order: 1 },
          },
        }),
      ]);

    const result = await client.callTool({ name: "get_difficult_cards", arguments: {} });
    const data = parseResult(result);

    expect(data.difficult_cards[0].front_text).toBe("What is GDPR?");
  });

  it("respects limit parameter", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1, 2, 3])
      .mockResolvedValueOnce([
        makeCard({ cardId: 1, lapses: 10 }),
        makeCard({ cardId: 2, lapses: 5 }),
        makeCard({ cardId: 3, lapses: 1 }),
      ]);

    const result = await client.callTool({
      name: "get_difficult_cards",
      arguments: { limit: 2 },
    });
    const data = parseResult(result);

    expect(data.difficult_cards).toHaveLength(2);
    expect(data.summary.cards_returned).toBe(2);
    expect(data.summary.cards_analyzed).toBe(3);
  });
});
