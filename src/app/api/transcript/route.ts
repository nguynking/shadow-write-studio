import { NextResponse } from "next/server";

import {
  fetchGeminiTranscriptData,
  GeminiTranscriptError,
} from "@/lib/gemini-transcript";
import {
  chunkTranscriptSegments,
  parsePastedTranscript,
} from "@/lib/transcript";
import {
  extractYoutubeVideoId,
  fetchYoutubeTranscriptData,
  getYoutubeThumbnailUrl,
  getYoutubeWatchUrl,
  TranscriptServiceError,
} from "@/lib/youtube";
import type {
  CaptionFormat,
  TranscriptApiError,
  TranscriptApiRequest,
  TranscriptApiSuccess,
  TranscriptErrorCode,
} from "@/types/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_VIDEO_DURATION_SECONDS = 30 * 60;
const MAX_REQUEST_CHARACTERS = 1_500_000;
const TRANSCRIPT_TIMEOUT_MS = 25_000;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

function jsonSuccess(body: TranscriptApiSuccess) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}

function jsonError(
  code: TranscriptErrorCode,
  message: string,
  status: number,
  details: Omit<TranscriptApiError["error"], "code" | "message"> = {},
) {
  return NextResponse.json<TranscriptApiError>(
    { error: { code, message, ...details } },
    { status, headers: NO_STORE_HEADERS },
  );
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function looksLikeRawVideoId(value: string): boolean {
  return !/[/:?&.=]/.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateLanguage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "en";
  if (typeof value !== "string") return null;
  const language = value.trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)
    ? language
    : null;
}

function validateFormat(value: unknown): CaptionFormat | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return value === "vtt" || value === "srt" ? value : null;
}

function tooLongError() {
  return jsonError(
    "VIDEO_TOO_LONG",
    "Choose a video that is 30 minutes or shorter so each practice session stays focused.",
    422,
    { maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS },
  );
}

export async function POST(request: Request) {
  let unknownBody: unknown;
  try {
    unknownBody = await request.json();
  } catch {
    return jsonError("INVALID_JSON", "Send the request as valid JSON.", 400);
  }

  if (!isPlainObject(unknownBody)) {
    return jsonError("INVALID_REQUEST", "The request body must be a JSON object.", 400);
  }

  const body = unknownBody as TranscriptApiRequest;
  const youtubeInput = firstNonEmptyString(
    body.youtubeUrl,
    body.url,
    body.videoId,
    body.source,
  );
  const pastedText = firstNonEmptyString(
    body.transcriptText,
    body.transcript,
    body.captions,
  );

  if (!youtubeInput && !pastedText) {
    return jsonError(
      "INVALID_REQUEST",
      "Add a YouTube link or paste captions in VTT/SRT format.",
      400,
    );
  }

  if (pastedText && pastedText.length > MAX_REQUEST_CHARACTERS) {
    return jsonError(
      "INVALID_TRANSCRIPT",
      "The pasted transcript is too large. Use captions from a video under 30 minutes.",
      413,
    );
  }

  const format = validateFormat(body.format);
  if (format === null) {
    return jsonError(
      "UNSUPPORTED_FORMAT",
      "Caption format must be either vtt or srt.",
      400,
    );
  }

  const language = validateLanguage(body.language);
  if (!language) {
    return jsonError(
      "INVALID_REQUEST",
      "Use a valid language code such as en or en-US.",
      400,
    );
  }

  const videoId = youtubeInput ? extractYoutubeVideoId(youtubeInput) : null;
  if (youtubeInput && !videoId) {
    return looksLikeRawVideoId(youtubeInput)
      ? jsonError(
          "INVALID_VIDEO_ID",
          "A YouTube video ID must contain exactly 11 letters, numbers, hyphens, or underscores.",
          400,
        )
      : jsonError(
          "INVALID_YOUTUBE_URL",
          "Enter a valid youtube.com or youtu.be video link.",
          400,
        );
  }

  if (pastedText) {
    const segments = parsePastedTranscript(pastedText, format);
    if (segments.length === 0) {
      return jsonError(
        "INVALID_TRANSCRIPT",
        "No timed captions were found. Paste a complete VTT or SRT transcript.",
        422,
      );
    }

    const transcriptDuration = Math.max(...segments.map((segment) => segment.endSeconds));
    if (transcriptDuration > MAX_VIDEO_DURATION_SECONDS) {
      return tooLongError();
    }

    const chunks = chunkTranscriptSegments(segments);
    if (chunks.length === 0) {
      return jsonError(
        "EMPTY_TRANSCRIPT",
        "The captions did not contain any readable spoken text.",
        422,
      );
    }

    return jsonSuccess({
      source: "pasted",
      video: {
        id: videoId,
        title: firstNonEmptyString(body.title) ?? "Pasted transcript",
        author: null,
        durationSeconds: Math.round(transcriptDuration * 1000) / 1000,
        thumbnailUrl: videoId ? getYoutubeThumbnailUrl(videoId) : null,
        url: videoId ? getYoutubeWatchUrl(videoId) : null,
      },
      chunks,
    });
  }

  // The no-input case returned above, so a non-pasted request always has an ID.
  if (!videoId) {
    return jsonError("INVALID_VIDEO_ID", "Enter a valid YouTube video.", 400);
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), TRANSCRIPT_TIMEOUT_MS);

  let directTranscriptError: unknown;

  try {
    const result = await fetchYoutubeTranscriptData(
      videoId,
      language,
      timeoutController.signal,
    );

    if (
      result.video.durationSeconds !== null &&
      result.video.durationSeconds > MAX_VIDEO_DURATION_SECONDS
    ) {
      return tooLongError();
    }

    const chunks = chunkTranscriptSegments(result.segments);
    if (chunks.length === 0) {
      return jsonError(
        "EMPTY_TRANSCRIPT",
        "YouTube returned captions without any readable spoken text.",
        422,
      );
    }

    return jsonSuccess({
      source: "youtube",
      video: result.video,
      chunks,
      transcriptMethod: "captions",
    });
  } catch (error) {
    directTranscriptError = error;

    if (
      error instanceof TranscriptServiceError &&
      ![
        "CAPTIONS_DISABLED",
        "CAPTIONS_NOT_FOUND",
        "LANGUAGE_NOT_AVAILABLE",
        "RATE_LIMITED",
        "UPSTREAM_TIMEOUT",
        "TRANSCRIPT_FETCH_FAILED",
      ].includes(error.code)
    ) {
      return jsonError(error.code, error.message, error.status, error.details);
    }
  } finally {
    clearTimeout(timeout);
  }

  try {
    const result = await fetchGeminiTranscriptData(videoId, request.signal);

    if (
      result.video.durationSeconds !== null &&
      result.video.durationSeconds > MAX_VIDEO_DURATION_SECONDS
    ) {
      return tooLongError();
    }

    const chunks = chunkTranscriptSegments(result.segments);
    if (chunks.length === 0) {
      return jsonError(
        "EMPTY_TRANSCRIPT",
        "The automatic transcript did not contain readable spoken English.",
        422,
      );
    }

    return jsonSuccess({
      source: "youtube",
      video: result.video,
      chunks,
      transcriptMethod: "ai",
    });
  } catch (error) {
    if (error instanceof GeminiTranscriptError && error.reason === "billing") {
      return jsonError(
        "TRANSCRIPT_FETCH_FAILED",
        "Automatic transcript fallback is not activated yet. The app owner needs to enable Vercel AI Gateway billing, or you can paste timed captions.",
        503,
      );
    }

    if (
      error instanceof GeminiTranscriptError &&
      error.reason === "invalid-output"
    ) {
      return jsonError(
        "EMPTY_TRANSCRIPT",
        "The automatic transcript did not contain readable timed speech. Try again or paste VTT/SRT captions.",
        422,
      );
    }

    if (directTranscriptError instanceof TranscriptServiceError) {
      return jsonError(
        "TRANSCRIPT_FETCH_FAILED",
        "Automatic transcript import is temporarily unavailable. Try again or paste VTT/SRT captions.",
        502,
        directTranscriptError.details,
      );
    }

    return jsonError(
      "TRANSCRIPT_FETCH_FAILED",
      "Automatic transcript import is temporarily unavailable. Try again or paste VTT/SRT captions.",
      502,
    );
  }
}
