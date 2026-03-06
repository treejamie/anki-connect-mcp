import { describe, it, expect } from "vitest";
import { stripHtml, easeToPercent } from "./anki-client.js";

describe("stripHtml", () => {
  it("removes basic HTML tags", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("removes nested tags", () => {
    expect(stripHtml("<p>hello <i>world</i></p>")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(stripHtml("no tags here")).toBe("no tags here");
  });

  it("trims whitespace", () => {
    expect(stripHtml("  <span>text</span>  ")).toBe("text");
  });

  it("handles self-closing tags", () => {
    expect(stripHtml("line1<br/>line2")).toBe("line1line2");
  });
});

describe("easeToPercent", () => {
  it("converts 2500 to 250", () => {
    expect(easeToPercent(2500)).toBe(250);
  });

  it("converts 1300 to 130", () => {
    expect(easeToPercent(1300)).toBe(130);
  });

  it("converts 0 to 0", () => {
    expect(easeToPercent(0)).toBe(0);
  });

  it("rounds correctly", () => {
    expect(easeToPercent(2555)).toBe(256);
  });
});
