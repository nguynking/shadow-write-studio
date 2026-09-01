import { generateText, Output } from "ai";
import { z } from "zod";

import {
  getYoutubeThumbnailUrl,
  getYoutubeWatchUrl,
  type YoutubeTranscriptData,
} from "./youtube";

const transcriptSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).nullable(),
  durationSeconds: z.number().positive().finite(),
  segments: z
    .array(
      z.object({
        text: z.string(),
        startSeconds: z.number().nonnegative().finite(),
        endSeconds: z.number().positive().finite(),
      }),
    )
    .min(1),
});

export type GeneratedTranscript = z.infer<typeof transcriptSchema>;

const TRANSCRIPT_PROMPT = `Create a complete, time-aligned transcript of the spoken English in this public YouTube video.

Requirements:
- Transcribe the speaker's words verbatim. Keep contractions, filler words, and the speaker's original grammar.
- Cover the whole video from the first spoken English to the last. Do not summarize, paraphrase, translate, or invent speech.
- Split speech into short natural phrases, usually 3 to 12 seconds each. A short phrase at the beginning or end is acceptable.
- Return startSeconds and endSeconds as numeric seconds from the beginning of the video. Every end must be later than its start.
- Exclude music descriptions, sound-effect labels, and text that is only visible on screen.
- Return the actual video title, channel/author when available, and total duration in seconds.`;

export class GeminiTranscriptError extends Error {
  readonly reason: "billing" | "unavailable" | "invalid-output";

  constructor(
    reason: "billing" | "unavailable" | "invalid-output",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GeminiTranscriptError";
    this.reason = reason;
  }
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function normalizeGeminiTranscriptData(
  videoId: string,
  generated: GeneratedTranscript,
): YoutubeTranscriptData {
  const segments = generated.segments
    .map((segment) => ({
      text: segment.text.replace(/\s+/g, " ").trim(),
      startSeconds: roundSeconds(segment.startSeconds),
      endSeconds: roundSeconds(segment.endSeconds),
    }))
    .filter(
      (segment) =>
        segment.text.length > 0 &&
        segment.startSeconds >= 0 &&
        segment.endSeconds > segment.startSeconds,
    )
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (segments.length === 0) {
    throw new GeminiTranscriptError(
      "invalid-output",
      "The automatic transcript did not contain usable timed speech.",
    );
  }

  const finalEndSeconds = segments.at(-1)?.endSeconds ?? 0;

  return {
    video: {
      id: videoId,
      title: generated.title.trim() || "YouTube video",
      author: generated.author?.trim() || null,
      durationSeconds: roundSeconds(
        Math.max(generated.durationSeconds, finalEndSeconds),
      ),
      thumbnailUrl: getYoutubeThumbnailUrl(videoId),
      url: getYoutubeWatchUrl(videoId),
    },
    segments,
  };
}

function errorMessages(error: unknown, depth = 0): string[] {
  if (depth > 4 || !error) return [];
  if (typeof error === "string") return [error];
  if (!(error instanceof Error)) return [];

  return [error.message, ...errorMessages(error.cause, depth + 1)].filter(Boolean);
}

function isGatewayBillingError(error: unknown): boolean {
  return errorMessages(error).some((message) =>
    /credit card|payment required|billing|unlock.*credits|valid card/i.test(message),
  );
}

function safeErrorSummary(error: unknown) {
  const possibleStatus =
    error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;

  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message:
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Unknown transcript fallback error",
    statusCode:
      typeof possibleStatus === "number" ? possibleStatus : undefined,
  };
}

export async function fetchGeminiTranscriptData(
  videoId: string,
  abortSignal?: AbortSignal,
): Promise<YoutubeTranscriptData> {
  const videoUrl = getYoutubeWatchUrl(videoId);

  try {
    const { output } = await generateText({
      model: "google/gemini-3.7-flash",
      output: Output.object({ schema: transcriptSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: { type: "url", url: new URL(videoUrl) },
              mediaType: "video/mp4",
              providerOptions: {
                google: { mediaResolution: "low" },
              },
            },
            { type: "text", text: TRANSCRIPT_PROMPT },
          ],
        },
      ],
      maxOutputTokens: 30_000,
      maxRetries: 1,
      abortSignal,
      timeout: 240_000,
      providerOptions: {
        gateway: {
          caching: "auto",
          tags: ["feature:youtube-transcript"],
        },
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });

    return normalizeGeminiTranscriptData(videoId, output);
  } catch (error) {
    console.error("Gemini transcript fallback failed", safeErrorSummary(error));

    if (error instanceof GeminiTranscriptError) throw error;
    if (isGatewayBillingError(error)) {
      throw new GeminiTranscriptError(
        "billing",
        "Vercel AI Gateway billing is not active.",
        { cause: error },
      );
    }

    throw new GeminiTranscriptError(
      "unavailable",
      "The automatic transcript fallback is temporarily unavailable.",
      { cause: error },
    );
  }
}
