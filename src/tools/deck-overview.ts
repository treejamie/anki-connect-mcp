import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invoke, easeToPercent, type CardInfo, type DeckStats } from "../anki-client.js";

export function registerDeckOverview(server: McpServer): void {
  server.registerTool(
    "get_deck_overview",
    {
      title: "Get Deck Overview",
      description:
        "Get study progress statistics for Anki decks including card counts, maturity distribution, and ease factors.",
      inputSchema: {
        deck: z
          .string()
          .optional()
          .describe("Deck name to get stats for. If omitted, returns stats for all decks."),
      },
    },
    async ({ deck }) => {
      try {
        // Get deck names and IDs
        const deckMap = await invoke<Record<string, number>>("deckNamesAndIds");
        const deckNames = deck
          ? Object.keys(deckMap).filter((name) => name === deck)
          : Object.keys(deckMap);

        if (deck && deckNames.length === 0) {
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

        // Get deck stats (due counts)
        const deckIds = deckNames.map((name) => deckMap[name]);
        const deckStats = await invoke<Record<string, DeckStats>>("getDeckStats", {
          decks: deckIds,
        });

        // Get all card IDs for deeper analysis
        const query = deck ? `"deck:${deck}"` : "*";
        const cardIds = await invoke<number[]>("findCards", { query });

        // Get card details for maturity analysis
        let mature = 0;
        let young = 0;
        let newCards = 0;
        let learning = 0;
        let totalEase = 0;
        let easeCount = 0;
        let totalLapses = 0;

        if (cardIds.length > 0) {
          const cards = await invoke<CardInfo[]>("cardsInfo", { cards: cardIds });

          for (const card of cards) {
            totalLapses += card.lapses;

            if (card.type === 0) {
              newCards++;
            } else if (card.type === 1) {
              learning++;
            } else {
              // type 2 = review
              if (card.interval >= 21) {
                mature++;
              } else {
                young++;
              }
              // Only count ease for cards that have been reviewed
              totalEase += card.ease;
              easeCount++;
            }
          }
        }

        // Summarize deck stats
        const statsEntries = Object.values(deckStats);
        const totalDueNew = statsEntries.reduce((sum, s) => sum + s.new_count, 0);
        const totalDueLearn = statsEntries.reduce((sum, s) => sum + s.learn_count, 0);
        const totalDueReview = statsEntries.reduce((sum, s) => sum + s.review_count, 0);

        const result = {
          decks: deckNames,
          total_cards: cardIds.length,
          card_maturity: {
            new: newCards,
            learning,
            young,
            mature,
          },
          due_today: {
            new: totalDueNew,
            learning: totalDueLearn,
            review: totalDueReview,
            total: totalDueNew + totalDueLearn + totalDueReview,
          },
          average_ease_percent: easeCount > 0 ? easeToPercent(Math.round(totalEase / easeCount)) : null,
          total_lapses: totalLapses,
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
