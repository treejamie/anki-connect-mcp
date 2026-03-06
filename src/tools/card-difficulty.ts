import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invoke, stripHtml, easeToPercent, type CardInfo } from "../anki-client.js";

export function registerDifficultCards(server: McpServer): void {
  server.registerTool(
    "get_difficult_cards",
    {
      title: "Get Difficult Cards",
      description:
        "Find the cards you struggle with most, sorted by highest lapse count or lowest ease factor. Useful for identifying weak study areas.",
      inputSchema: {
        deck: z
          .string()
          .optional()
          .describe("Deck name to analyze. If omitted, analyzes all decks."),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Maximum number of difficult cards to return."),
        sort_by: z
          .enum(["ease", "lapses"])
          .optional()
          .default("lapses")
          .describe("Sort by lowest ease factor or highest lapse count."),
      },
    },
    async ({ deck, limit, sort_by }) => {
      try {
        // Only look at cards that have been reviewed at least once
        const query = deck ? `"deck:${deck}" -is:new` : "-is:new";
        const cardIds = await invoke<number[]>("findCards", { query });

        if (cardIds.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No reviewed cards found. Start reviewing to build up difficulty data.",
              },
            ],
          };
        }

        const cards = await invoke<CardInfo[]>("cardsInfo", { cards: cardIds });

        // Sort by difficulty metric
        const sorted = cards.sort((a, b) => {
          if (sort_by === "ease") return a.ease - b.ease; // lowest ease first
          return b.lapses - a.lapses; // highest lapses first
        });

        // Get front field (first field by order) for each card
        const difficult = sorted.slice(0, limit).map((card) => {
          const frontField = Object.values(card.fields).find((f) => f.order === 0);
          const frontText = frontField ? stripHtml(frontField.value).slice(0, 200) : "(no front field)";

          return {
            card_id: card.cardId,
            front_text: frontText,
            ease_percent: easeToPercent(card.ease),
            lapses: card.lapses,
            interval_days: card.interval,
            reps: card.reps,
            deck: card.deckName,
          };
        });

        const avgEase =
          difficult.length > 0
            ? Math.round(difficult.reduce((sum, c) => sum + c.ease_percent, 0) / difficult.length)
            : 0;
        const totalLapses = difficult.reduce((sum, c) => sum + c.lapses, 0);

        const result = {
          difficult_cards: difficult,
          summary: {
            cards_analyzed: cards.length,
            cards_returned: difficult.length,
            sorted_by: sort_by,
            average_ease_percent: avgEase,
            total_lapses_in_set: totalLapses,
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
