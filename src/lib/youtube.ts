import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptInvalidLangError,
  YoutubeTranscriptInvalidVideoIdError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript-plus";

import type {
  RawTranscriptSegment,
  TranscriptApiErrorDetail,
  TranscriptErrorCode,
  VideoMetadata,
} from "@/types/learning";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function isValidYoutubeVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

/**
 * Extracts an ID only from known YouTube URL shapes. Restricting the hostname is
 * intentional: a query such as `not-youtube.example/?v=...` must not be trusted.
 */
export function extractYoutubeVideoId(input: string): string | null {
  const value = input.trim();

  if (isValidYoutubeVideoId(value)) {
    return value;
  }

  const candidateUrl = /^(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(
    value,
  )
    ? `https://${value}`
    : value;

  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  let videoId: string | null = null;

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else {
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const firstPart = pathParts[0]?.toLowerCase();

    if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v");
    } else if (["embed", "shorts", "live", "v"].includes(firstPart)) {
      videoId = pathParts[1] ?? null;
    }
  }

  return videoId && isValidYoutubeVideoId(videoId) ? videoId : null;
}

// Keep the alternate capitalization ergonomic for callers and tests.
export const extractYouTubeVideoId = extractYoutubeVideoId;

export function getYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export class TranscriptServiceError extends Error {
  readonly code: TranscriptErrorCode;
  readonly status: number;
  readonly details: Omit<TranscriptApiErrorDetail, "code" | "message">;

  constructor(
    code: TranscriptErrorCode,
    message: string,
    status: number,
    details: Omit<TranscriptApiErrorDetail, "code" | "message"> = {},
  ) {
    super(message);
    this.name = "TranscriptServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface YoutubeTranscriptData {
  video: VideoMetadata;
  segments: RawTranscriptSegment[];
}

function selectLargestThumbnail(
  thumbnails: Array<{ url: string; width: number; height: number }>,
): string | null {
  return (
    thumbnails.reduce<(typeof thumbnails)[number] | null>((largest, thumbnail) => {
      if (!largest) return thumbnail;
      return thumbnail.width * thumbnail.height > largest.width * largest.height
        ? thumbnail
        : largest;
    }, null)?.url ?? null
  );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function mapYoutubeError(error: unknown): TranscriptServiceError {
  if (error instanceof TranscriptServiceError) return error;

  if (
    error instanceof YoutubeTranscriptInvalidVideoIdError ||
    error instanceof YoutubeTranscriptInvalidLangError
  ) {
    return new TranscriptServiceError(
      error instanceof YoutubeTranscriptInvalidLangError
        ? "INVALID_REQUEST"
        : "INVALID_VIDEO_ID",
      error instanceof YoutubeTranscriptInvalidLangError
        ? "The caption language code is invalid."
        : "Enter a valid 11-character YouTube video ID.",
      400,
    );
  }

  if (error instanceof YoutubeTranscriptVideoUnavailableError) {
    return new TranscriptServiceError(
      "VIDEO_UNAVAILABLE",
      "This YouTube video is private, unavailable, or no longer exists.",
      404,
    );
  }

  if (error instanceof YoutubeTranscriptDisabledError) {
    return new TranscriptServiceError(
      "CAPTIONS_DISABLED",
      "The creator has disabled captions for this video.",
      422,
    );
  }

  if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
    return new TranscriptServiceError(
      "LANGUAGE_NOT_AVAILABLE",
      "English captions are not available for this video.",
      422,
      { availableLanguages: error.availableLangs },
    );
  }

  if (error instanceof YoutubeTranscriptNotAvailableError) {
    return new TranscriptServiceError(
      "CAPTIONS_NOT_FOUND",
      "This video has no captions. Try another video or paste an SRT/VTT file.",
      422,
    );
  }

  if (error instanceof YoutubeTranscriptTooManyRequestError) {
    return new TranscriptServiceError(
      "RATE_LIMITED",
      "YouTube is temporarily limiting transcript requests. Please try again shortly.",
      429,
    );
  }

  if (isAbortError(error)) {
    return new TranscriptServiceError(
      "UPSTREAM_TIMEOUT",
      "YouTube took too long to return captions. Please try again.",
      504,
    );
  }

  return new TranscriptServiceError(
    "TRANSCRIPT_FETCH_FAILED",
    "We could not retrieve captions from YouTube. Try again or paste an SRT/VTT file.",
    502,
  );
}

export async function fetchYoutubeTranscriptData(
  videoId: string,
  language = "en",
  signal?: AbortSignal,
): Promise<YoutubeTranscriptData> {
  try {
    const { videoDetails, segments } = await fetchTranscript(videoId, {
      lang: language,
      retries: 1,
      retryDelay: 350,
      signal,
      videoDetails: true,
    });

    return {
      video: {
        id: videoDetails.videoId || videoId,
        title: videoDetails.title || "YouTube video",
        author: videoDetails.author || null,
        durationSeconds: Number.isFinite(videoDetails.lengthSeconds)
          ? videoDetails.lengthSeconds
          : null,
        thumbnailUrl:
          selectLargestThumbnail(videoDetails.thumbnails) ??
          getYoutubeThumbnailUrl(videoId),
        url: getYoutubeWatchUrl(videoId),
      },
      segments: segments.map((segment) => ({
        text: segment.text,
        startSeconds: segment.offset,
        endSeconds: segment.offset + segment.duration,
      })),
    };
  } catch (error) {
    throw mapYoutubeError(error);
  }
}
