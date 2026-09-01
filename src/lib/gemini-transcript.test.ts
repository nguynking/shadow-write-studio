import { describe, expect, it } from "vitest";

import {
  GeminiTranscriptError,
  normalizeGeminiTranscriptData,
} from "./gemini-transcript";

describe("Gemini transcript normalization", () => {
  it("cleans and orders timed speech while preserving video metadata", () => {
    const result = normalizeGeminiTranscriptData("Gxad3-pmzqw", {
      title: "The Lawyer Behind Elon Musk",
      author: "Bloomberg Originals",
      durationSeconds: 1303.1234,
      segments: [
        { text: "  Good   morning. ", startSeconds: 9.1236, endSeconds: 12.7 },
        { text: "Hello.", startSeconds: 6.87, endSeconds: 8.1 },
      ],
    });

    expect(result.video).toMatchObject({
      id: "Gxad3-pmzqw",
      title: "The Lawyer Behind Elon Musk",
      author: "Bloomberg Originals",
      durationSeconds: 1303.123,
    });
    expect(result.segments).toEqual([
      { text: "Hello.", startSeconds: 6.87, endSeconds: 8.1 },
      { text: "Good morning.", startSeconds: 9.124, endSeconds: 12.7 },
    ]);
  });

  it("rejects model output without usable timed speech", () => {
    expect(() =>
      normalizeGeminiTranscriptData("Gxad3-pmzqw", {
        title: "Video",
        author: null,
        durationSeconds: 10,
        segments: [{ text: " ", startSeconds: 3, endSeconds: 3 }],
      }),
    ).toThrow(GeminiTranscriptError);
  });
});
