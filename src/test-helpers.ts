import type { CardInfo, DeckStats } from "./anki-client.js";

export function makeCard(overrides: Partial<CardInfo> = {}): CardInfo {
  return {
    cardId: 1,
    fields: {
      Front: { value: "What is GDPR?", order: 0 },
      Back: { value: "General Data Protection Regulation", order: 1 },
    },
    fieldOrder: 0,
    question: "What is GDPR?",
    answer: "General Data Protection Regulation",
    modelName: "Basic",
    deckName: "CIPP/E",
    css: "",
    interval: 10,
    note: 1,
    type: 2,
    queue: 2,
    due: 0,
    reps: 5,
    lapses: 1,
    left: 0,
    mod: 0,
    ease: 2500,
    tags: [],
    ...overrides,
  };
}

export function makeDeckStats(overrides: Partial<DeckStats> = {}): DeckStats {
  return {
    deck_id: 1,
    name: "CIPP/E",
    new_count: 5,
    learn_count: 3,
    review_count: 10,
    total_in_deck: 100,
    ...overrides,
  };
}
