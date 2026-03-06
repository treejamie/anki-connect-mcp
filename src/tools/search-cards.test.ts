import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerSearchCards } from "./search-cards.js";
import { makeCard } from "../test-helpers.js";

vi.mock("../anki-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anki-client.js")>();
  return { ...actual, invoke: vi.fn() };
});

import { invoke } from "../anki-client.js";
const mockInvoke = vi.mocked(invoke);

async function setup() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerSearchCards(server);
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

describe("search_cards", () => {
  it("returns cards with front and back text", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1]) // findCards
      .mockResolvedValueOnce([
        makeCard({
          cardId: 1,
          fields: {
            Front: { value: "What is GDPR?", order: 0 },
            Back: { value: "General Data Protection Regulation", order: 1 },
          },
          tags: ["chapter1", "gdpr"],
        }),
      ]); // cardsInfo

    const result = await client.callTool({
      name: "search_cards",
      arguments: { query: "GDPR" },
    });
    const data = parseResult(result);

    expect(data.total_matches).toBe(1);
    expect(data.cards[0].front).toBe("What is GDPR?");
    expect(data.cards[0].back).toBe("General Data Protection Regulation");
    expect(data.cards[0].tags).toEqual(["chapter1", "gdpr"]);
  });

  it("respects limit parameter", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1, 2, 3, 4, 5]) // findCards returns 5
      .mockResolvedValueOnce([
        makeCard({ cardId: 1 }),
        makeCard({ cardId: 2 }),
      ]); // cardsInfo for first 2

    const result = await client.callTool({
      name: "search_cards",
      arguments: { query: "GDPR", limit: 2 },
    });
    const data = parseResult(result);

    expect(data.total_matches).toBe(5);
    expect(data.showing).toBe(2);
    // Verify findCards was called, then cardsInfo with only 2 IDs
    expect(mockInvoke).toHaveBeenCalledWith("cardsInfo", { cards: [1, 2] });
  });

  it("returns message when no cards match", async () => {
    const client = await setup();

    mockInvoke.mockResolvedValueOnce([]); // findCards returns empty

    const result = await client.callTool({
      name: "search_cards",
      arguments: { query: "nonexistent" },
    });
    const textContent = result.content[0] as { text: string };

    expect(textContent.text).toContain("No cards found");
    expect(textContent.text).toContain("nonexistent");
  });

  it("strips HTML from card fields", async () => {
    const client = await setup();

    mockInvoke
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([
        makeCard({
          fields: {
            Front: { value: "<b>Bold</b> question", order: 0 },
            Back: { value: "<p>Paragraph</p> answer", order: 1 },
          },
        }),
      ]);

    const result = await client.callTool({
      name: "search_cards",
      arguments: { query: "test" },
    });
    const data = parseResult(result);

    expect(data.cards[0].front).toBe("Bold question");
    expect(data.cards[0].back).toBe("Paragraph answer");
  });
});
