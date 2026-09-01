import { describe, expect, it } from "vitest";

import {
  chunkTranscriptSegments,
  decodeHtmlEntities,
  parseSrt,
  parseVtt,
} from "./transcript";
import {
  extractYoutubeVideoId,
  isValidYoutubeVideoId,
} from "./youtube";

describe("YouTube video ID parsing", () => {
  const videoId = "dQw4w9WgXcQ";

  it.each([
    videoId,
    `https://www.youtube.com/watch?v=${videoId}&t=42s`,
    `https://youtu.be/${videoId}?si=abc`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://youtube.com/shorts/${videoId}`,
    `https://m.youtube.com/live/${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
    `youtu.be/${videoId}`,
  ])("extracts the ID from %s", (input) => {
    expect(extractYoutubeVideoId(input)).toBe(videoId);
  });

  it.each([
    "too-short",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=not-valid",
    "",
  ])("rejects invalid or untrusted input %s", (input) => {
    expect(extractYoutubeVideoId(input)).toBeNull();
  });

  it("accepts only the exact YouTube ID alphabet and length", () => {
    expect(isValidYoutubeVideoId(videoId)).toBe(true);
    expect(isValidYoutubeVideoId("dQw4w9WgXc!")).toBe(false);
    expect(isValidYoutubeVideoId(`${videoId}x`)).toBe(false);
  });
});

describe("timed caption parsing", () => {
  it("parses VTT cue identifiers, settings, tags, and HTML entities", () => {
    const vtt = `WEBVTT\n\nintro\n00:00:01.200 --> 00:00:03.450 align:start position:0%\n<v Alex><c.green>Hello &amp; welcome.</c></v>\n\nNOTE ignored\nmetadata\n\n00:03.450 --> 00:06.000\nIt&#39;s good to see you.\n`;

    expect(parseVtt(vtt)).toEqual([
      {
        text: "Hello & welcome.",
        startSeconds: 1.2,
        endSeconds: 3.45,
      },
      {
        text: "It's good to see you.",
        startSeconds: 3.45,
        endSeconds: 6,
      },
    ]);
  });

  it("parses SRT indexes, multiline text, and comma timestamps", () => {
    const srt = `1\r\n00:00:00,500 --> 00:00:02,250\r\nThis is line one\r\nand line two.\r\n\r\n2\r\n00:00:02,250 --> 00:00:05,000\r\n<i>Keep going!</i>\r\n`;

    expect(parseSrt(srt)).toEqual([
      {
        text: "This is line one and line two.",
        startSeconds: 0.5,
        endSeconds: 2.25,
      },
      { text: "Keep going!", startSeconds: 2.25, endSeconds: 5 },
    ]);
  });

  it("decodes named, decimal, hexadecimal, and nested entities", () => {
    expect(decodeHtmlEntities("Tom &amp; Jo &#39;learn&#x27; &amp;#33;")).toBe(
      "Tom & Jo 'learn' !",
    );
  });
});

describe("sentence and thought-group chunking", () => {
  it("merges fragments until a natural sentence boundary and preserves cue bounds", () => {
    const chunks = chunkTranscriptSegments([
      { text: "I used to think", startSeconds: 0, endSeconds: 1.4 },
      {
        text: "fluency meant speaking fast.",
        startSeconds: 1.4,
        endSeconds: 3.2,
      },
      { text: "But now I know", startSeconds: 3.2, endSeconds: 5.1 },
      {
        text: "it means speaking clearly.",
        startSeconds: 5.1,
        endSeconds: 7.4,
      },
    ]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      text: "I used to think fluency meant speaking fast.",
      startSeconds: 0,
      endSeconds: 3.2,
      durationSeconds: 3.2,
    });
    expect(chunks[1]).toMatchObject({
      text: "But now I know it means speaking clearly.",
      startSeconds: 3.2,
      endSeconds: 7.4,
      durationSeconds: 4.2,
    });
  });

  it("removes rolling-caption overlap instead of repeating words", () => {
    const [chunk] = chunkTranscriptSegments([
      { text: "The point is", startSeconds: 0, endSeconds: 1.5 },
      { text: "The point is to listen", startSeconds: 1.5, endSeconds: 3 },
      { text: "to listen before speaking.", startSeconds: 3, endSeconds: 5 },
    ]);

    expect(chunk.text).toBe("The point is to listen before speaking.");
    expect(chunk.startSeconds).toBe(0);
    expect(chunk.endSeconds).toBe(5);
  });

  it("splits an unusually long source cue into units no longer than 12 seconds", () => {
    const chunks = chunkTranscriptSegments([
      {
        text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen.",
        startSeconds: 4,
        endSeconds: 29,
      },
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.durationSeconds <= 12)).toBe(true);
    expect(chunks[0].startSeconds).toBe(4);
    expect(chunks.at(-1)?.endSeconds).toBe(29);
  });
});

