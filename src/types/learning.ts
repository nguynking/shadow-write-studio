export type TranscriptSource = "youtube" | "pasted";

export type CaptionFormat = "vtt" | "srt";

export interface RawTranscriptSegment {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface TranscriptChunk extends RawTranscriptSegment {
  id: string;
  index: number;
  durationSeconds: number;
}

export interface VideoMetadata {
  id: string | null;
  title: string;
  author: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  url: string | null;
}

export interface TranscriptApiSuccess {
  source: TranscriptSource;
  video: VideoMetadata;
  chunks: TranscriptChunk[];
  /** How a YouTube transcript was created. Pasted captions omit this field. */
  transcriptMethod?: "captions" | "ai";
}

export type TranscriptErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_JSON"
  | "INVALID_YOUTUBE_URL"
  | "INVALID_VIDEO_ID"
  | "INVALID_TRANSCRIPT"
  | "UNSUPPORTED_FORMAT"
  | "EMPTY_TRANSCRIPT"
  | "VIDEO_TOO_LONG"
  | "VIDEO_UNAVAILABLE"
  | "CAPTIONS_DISABLED"
  | "CAPTIONS_NOT_FOUND"
  | "LANGUAGE_NOT_AVAILABLE"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "TRANSCRIPT_FETCH_FAILED";

export interface TranscriptApiErrorDetail {
  code: TranscriptErrorCode;
  message: string;
  availableLanguages?: string[];
  maxDurationSeconds?: number;
}

export interface TranscriptApiError {
  error: TranscriptApiErrorDetail;
}

export interface TranscriptApiRequest {
  /** A YouTube URL or 11-character video ID. */
  source?: string;
  youtubeUrl?: string;
  url?: string;
  videoId?: string;
  /** Pasted WebVTT or SubRip captions. */
  transcriptText?: string;
  transcript?: string;
  captions?: string;
  format?: CaptionFormat;
  /** Preferred BCP 47 caption language. Defaults to English. */
  language?: string;
  /** Optional label used when only pasted captions are supplied. */
  title?: string;
}
