import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerReviewHistory } from "./review-history.js";

vi.mock("../anki-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anki-client.js")>();
  return { ...actual, invoke: vi.fn() };
});

import { invoke } from "../anki-client.js";
const mockInvoke = vi.mocked(invoke);

async function setup() {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerReviewHistory(server);
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

describe("get_review_history", () => {
  it("calculates streak from consecutive days", async () => {
    const client = await setup();

    // 3 consecutive days with reviews, then a gap
    mockInvoke.mockResolvedValueOnce([
      [0, 20], // today
      [-1, 15], // yesterday
      [-2, 10], // 2 days ago
      [-3, 0], // gap
      [-4, 25], // 4 days ago
    ]);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 30 },
    });
    const data = parseResult(result);

    expect(data.current_streak_days).toBe(3);
  });

  it("calculates upward trend when recent reviews exceed prior", async () => {
    const client = await setup();

    // Build 14+ days of data: prior 7 days low, recent 7 days high
    const reviewData: [number, number][] = [];
    for (let i = 0; i < 7; i++) {
      reviewData.push([-(13 - i), 5]); // prior 7 days: 5 reviews/day = 35 total
    }
    for (let i = 0; i < 7; i++) {
      reviewData.push([-(6 - i), 20]); // recent 7 days: 20 reviews/day = 140 total
    }

    mockInvoke.mockResolvedValueOnce(reviewData);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 30 },
    });
    const data = parseResult(result);

    expect(data.trend.direction).toBe("up");
    expect(data.trend.change_percent).toBe(300); // (140-35)/35 * 100
  });

  it("calculates downward trend", async () => {
    const client = await setup();

    const reviewData: [number, number][] = [];
    for (let i = 0; i < 7; i++) {
      reviewData.push([-(13 - i), 20]); // prior: 20/day
    }
    for (let i = 0; i < 7; i++) {
      reviewData.push([-(6 - i), 5]); // recent: 5/day
    }

    mockInvoke.mockResolvedValueOnce(reviewData);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 30 },
    });
    const data = parseResult(result);

    expect(data.trend.direction).toBe("down");
  });

  it("reports stable trend when change is small", async () => {
    const client = await setup();

    const reviewData: [number, number][] = [];
    for (let i = 0; i < 14; i++) {
      reviewData.push([-(13 - i), 10]); // same every day
    }

    mockInvoke.mockResolvedValueOnce(reviewData);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 30 },
    });
    const data = parseResult(result);

    expect(data.trend.direction).toBe("stable");
    expect(data.trend.change_percent).toBe(0);
  });

  it("filters to requested day window", async () => {
    const client = await setup();

    mockInvoke.mockResolvedValueOnce([
      [0, 10],
      [-1, 10],
      [-2, 10],
      [-10, 10], // outside 7-day window
      [-20, 10], // outside 7-day window
    ]);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 7 },
    });
    const data = parseResult(result);

    expect(data.daily_counts).toHaveLength(3);
    expect(data.total_reviews).toBe(30);
  });

  it("handles zero streak when last day has no reviews", async () => {
    const client = await setup();

    mockInvoke.mockResolvedValueOnce([
      [0, 0], // today: no reviews
      [-1, 10],
      [-2, 10],
    ]);

    const result = await client.callTool({
      name: "get_review_history",
      arguments: { days: 30 },
    });
    const data = parseResult(result);

    expect(data.current_streak_days).toBe(0);
  });
});
