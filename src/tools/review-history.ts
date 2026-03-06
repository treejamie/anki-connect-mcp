import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invoke } from "../anki-client.js";

export function registerReviewHistory(server: McpServer): void {
  server.registerTool(
    "get_review_history",
    {
      title: "Get Review History",
      description:
        "Get daily review counts, streak, and trend over a period. Useful for assessing study consistency.",
      inputSchema: {
        days: z
          .number()
          .optional()
          .default(30)
          .describe("Number of days of history to retrieve."),
      },
    },
    async ({ days }) => {
      try {
        // getNumCardsReviewedByDay returns [[dayOffset, count], ...]
        // where dayOffset is negative days from today (0 = today, -1 = yesterday, etc.)
        const reviewsByDay = await invoke<[number, number][]>("getNumCardsReviewedByDay");

        // Filter to requested window and build daily counts
        const dailyCounts: { date: string; count: number }[] = [];
        const today = new Date();

        for (const [dayOffset, count] of reviewsByDay) {
          if (dayOffset < -days) continue;

          const date = new Date(today);
          date.setDate(date.getDate() + dayOffset);
          dailyCounts.push({
            date: date.toISOString().split("T")[0],
            count,
          });
        }

        // Sort chronologically
        dailyCounts.sort((a, b) => a.date.localeCompare(b.date));

        const totalReviews = dailyCounts.reduce((sum, d) => sum + d.count, 0);
        const dailyAverage = dailyCounts.length > 0 ? Math.round(totalReviews / dailyCounts.length) : 0;

        // Calculate current streak (consecutive days with reviews, counting back from today)
        let streak = 0;
        for (let i = dailyCounts.length - 1; i >= 0; i--) {
          if (dailyCounts[i].count > 0) {
            streak++;
          } else {
            break;
          }
        }

        // Calculate trend: compare last 7 days vs prior 7 days
        let trend: "up" | "down" | "stable" = "stable";
        let trendPercent = 0;

        if (dailyCounts.length >= 14) {
          const recent7 = dailyCounts.slice(-7).reduce((sum, d) => sum + d.count, 0);
          const prior7 = dailyCounts.slice(-14, -7).reduce((sum, d) => sum + d.count, 0);

          if (prior7 > 0) {
            trendPercent = Math.round(((recent7 - prior7) / prior7) * 100);
            if (trendPercent > 10) trend = "up";
            else if (trendPercent < -10) trend = "down";
          } else if (recent7 > 0) {
            trend = "up";
            trendPercent = 100;
          }
        }

        const result = {
          daily_counts: dailyCounts,
          total_reviews: totalReviews,
          daily_average: dailyAverage,
          current_streak_days: streak,
          trend: {
            direction: trend,
            change_percent: trendPercent,
            comparison: "last 7 days vs prior 7 days",
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
