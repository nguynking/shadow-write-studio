import { describe, expect, it } from "vitest";

import {
  calculateAccuracy,
  checkWriting,
  diffWords,
  getAccuracyResult,
  normalizeText,
  tokenizeWords,
} from "./scoring";

describe("tokenization", () => {
  it("normalizes case, Unicode forms, apostrophes, and punctuation", () => {
    expect(tokenizeWords("  I CAN’T believe it... Café! ")).toEqual([
      "i",
      "can't",
      "believe",
      "it",
      "café",
    ]);
    expect(normalizeText("Hello, WORLD!")).toBe("hello world");
  });
});

describe("word diff", () => {
  it("classifies correct and substituted words", () => {
    expect(diffWords("I like green tea", "I love green tea")).toEqual([
      { status: "correct", expected: "i", actual: "i" },
      { status: "substituted", expected: "like", actual: "love" },
      { status: "correct", expected: "green", actual: "green" },
      { status: "correct", expected: "tea", actual: "tea" },
    ]);
  });

  it("finds inserted and omitted words without shifting later matches", () => {
    expect(diffWords("I really like tea", "I like hot tea")).toEqual([
      { status: "correct", expected: "i", actual: "i" },
      { status: "missing", expected: "really" },
      { status: "correct", expected: "like", actual: "like" },
      { status: "extra", actual: "hot" },
      { status: "correct", expected: "tea", actual: "tea" },
    ]);
  });
});

describe("accuracy", () => {
  it("uses normalized edit distance and penalizes extra words", () => {
    expect(calculateAccuracy("I like tea", "I love tea")).toBe(67);
    expect(calculateAccuracy("I like tea", "I really like tea")).toBe(75);
    expect(calculateAccuracy("", "")).toBe(100);
    expect(calculateAccuracy("Hello", "")).toBe(0);
  });

  it("returns counts that explain the score", () => {
    expect(getAccuracyResult("One two three", "One too three now")).toEqual({
      score: 50,
      correct: 2,
      missing: 0,
      extra: 1,
      substituted: 1,
      expectedWords: 3,
      actualWords: 4,
    });
  });
});

describe("writing checklist", () => {
  it("checks capitalization, end punctuation, and a whole target phrase", () => {
    expect(checkWriting('  “Practice makes perfect!”', "makes perfect")).toEqual(
      {
        capitalization: true,
        terminalPunctuation: true,
        targetPhraseIncluded: true,
      },
    );
  });

  it("does not match a target inside a longer word", () => {
    expect(checkWriting("This is partly done", "art")).toEqual({
      capitalization: true,
      terminalPunctuation: false,
      targetPhraseIncluded: false,
    });
  });
});
