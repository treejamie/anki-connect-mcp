import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invoke, type CardInfo, type DeckStats } from "../anki-client.js";

export function registerDueToday(server: McpServer): void {
  server.registerTool(
    "get_due_today",
    {
      title: "Get Due Today",
      description:
        "Get today's study workload: cards due now (new/learning/review), cards already reviewed today, and total remaining.",
      inputSchema: {
        deck: z
          .string()
          .optional()
          .describe("Deck name to check. If omitted, checks all decks."),
      },
    },
    async ({ deck }) => {
      try {
        // Get deck stats for due counts
        const deckMap = await invoke<Record<string, number>>("deckNamesAndIds");
        const deckIds = deck
          ? [deckMap[deck]].filter(Boolean)
          : Object.values(deckMap);

        if (deck && deckIds.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Deck "${deck}" not found. Available decks: ${Object.keys(deckMap).join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const deckStats = await invoke<Record<string, DeckStats>>("getDeckStats", {
          decks: deckIds,
        });

        const reviewedToday = await invoke<number>("getNumCardsReviewedToday");

        // Get due cards for type breakdown
        const query = deck ? `is:due "deck:${deck}"` : "is:due";
        const dueCardIds = await invoke<number[]>("findCards", { query });

        let dueNew = 0;
        let dueLearning = 0;
        let dueReview = 0;

        if (dueCardIds.length > 0) {
          const cards = await invoke<CardInfo[]>("cardsInfo", { cards: dueCardIds });
          for (const card of cards) {
            if (card.type === 0) dueNew++;
            else if (card.type === 1) dueLearning++;
            else dueReview++;
          }
        }

        const statsEntries = Object.values(deckStats);
        const scheduledNew = statsEntries.reduce((sum, s) => sum + s.new_count, 0);
        const scheduledLearn = statsEntries.reduce((sum, s) => sum + s.learn_count, 0);
        const scheduledReview = statsEntries.reduce((sum, s) => sum + s.review_count, 0);

        const result = {
          reviewed_today: reviewedToday,
          due_now: {
            new: scheduledNew,
            learning: scheduledLearn,
            review: scheduledReview,
            total: scheduledNew + scheduledLearn + scheduledReview,
          },
          due_cards_breakdown: {
            new: dueNew,
            learning: dueLearning,
            review: dueReview,
            total: dueCardIds.length,
          },
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Could not connect to Anki. Make sure Anki is running with the AnkiConnect addon installed (addon code: 2055492159).",
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: `AnkiConnect error: ${message}` }],
    isError: true,
  };
}
