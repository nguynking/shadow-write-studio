"use client";

import { FileText, Link2, LoaderCircle, Sparkles } from "lucide-react";
import { FormEvent, useId, useState } from "react";

export type TranscriptImportResult = {
  video: {
    id: string;
    title: string;
    author: string;
    durationSeconds: number;
    thumbnailUrl: string;
    url: string;
  };
  chunks: Array<{
    id: string;
    text: string;
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
  }>;
  source: "youtube" | "pasted";
  transcriptMethod?: "captions" | "ai";
};

type SourceImporterProps = {
  onImported: (result: TranscriptImportResult) => void;
  onUseExample: () => void;
};

type ImportError = {
  field: "youtube" | "captions" | "general";
  message: string;
};

export function SourceImporter({ onImported, onUseExample }: SourceImporterProps) {
  const panelId = useId();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [format, setFormat] = useState<"vtt" | "srt">("vtt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ImportError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function importTranscript(payload: Record<string, string>) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as TranscriptImportResult & {
        error?: { message?: string } | string;
        message?: string;
      };
      if (!response.ok) {
        const message =
          typeof body.error === "string" ? body.error : body.error?.message ?? body.message;
        throw new Error(message || "Unable to build this practice. Try another video or paste its captions.");
      }
      onImported(body);
      setSuccess(
        body.transcriptMethod === "ai"
          ? `Practice ready with ${body.chunks.length} sentences. Timings were created automatically, so check them against the video.`
          : `Practice ready with ${body.chunks.length} sentences.`,
      );
    } catch (caught) {
      setError({
        field: "general",
        message:
          caught instanceof Error
            ? caught.message
            : "Unable to build this practice. Try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  function submitYoutube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!youtubeUrl.trim()) {
      setError({ field: "youtube", message: "Paste a YouTube link first." });
      return;
    }
    void importTranscript({ youtubeUrl: youtubeUrl.trim() });
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!youtubeUrl.trim()) {
      setError({
        field: "youtube",
        message: "Keep the YouTube link above so the captions can seek the video.",
      });
      return;
    }
    if (!transcriptText.trim()) {
      setError({
        field: "captions",
        message: "Paste the VTT or SRT captions first.",
      });
      return;
    }
    void importTranscript({
      youtubeUrl: youtubeUrl.trim(),
      transcriptText,
      format,
    });
  }

  return (
    <section className="source-card" aria-labelledby="source-heading">
      <div className="max-w-[44rem]">
        <p className="eyebrow">Your practice material</p>
        <h1 id="source-heading" className="mt-2 max-w-[18ch] text-balance text-[clamp(2rem,4vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-[var(--ink)]">
          Turn English you understand into English you can use.
        </h1>
        <p className="mt-4 max-w-[62ch] text-pretty text-base leading-7 text-[var(--ink-muted)] sm:text-lg">
          Pick one real sentence. Listen closely, shadow it, record yourself, then rebuild and personalize it.
        </p>
      </div>

      <form className="mt-8" onSubmit={submitYoutube} noValidate>
        <label htmlFor={`${panelId}-youtube`} className="field-label">
          YouTube video
        </label>
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Link2 aria-hidden="true" size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
            <input
              id={`${panelId}-youtube`}
              className="text-input h-13 w-full !pl-12"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={youtubeUrl}
              onChange={(event) => {
                setYoutubeUrl(event.target.value);
                if (error?.field === "youtube") setError(null);
              }}
              aria-describedby={`${panelId}-youtube-help ${error?.field === "youtube" ? `${panelId}-error` : ""}`}
              aria-invalid={error?.field === "youtube"}
            />
          </div>
          <button type="submit" className="button primary-button h-13 px-5" disabled={loading}>
            {loading ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> : <Sparkles aria-hidden="true" size={18} />}
            {loading ? "Building practice" : "Build practice"}
          </button>
        </div>
        <p id={`${panelId}-youtube-help`} className="mt-2 text-sm leading-6 text-[var(--ink-faint)]">
          Use a public English video under 30 minutes. If captions are blocked, automatic transcription can take a minute or two.
        </p>
      </form>

      <p className="sr-only" role="status" aria-live="polite">
        {loading
          ? "Checking captions and building your practice. Automatic transcription may take up to two minutes."
          : ""}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="button secondary-button" onClick={onUseExample}>
          <Sparkles aria-hidden="true" size={17} />
          Use example
        </button>
        <button
          type="button"
          className="button ghost-button"
          onClick={() => setManualOpen((open) => !open)}
          aria-expanded={manualOpen}
          aria-controls={`${panelId}-manual`}
        >
          <FileText aria-hidden="true" size={17} />
          Paste VTT or SRT
        </button>
      </div>

      {manualOpen ? (
        <form id={`${panelId}-manual`} className="mt-6 rounded-[18px] bg-[var(--surface-subtle)] p-4 sm:p-5" onSubmit={submitManual}>
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <label className="block">
              <span className="field-label">Caption format</span>
              <select className="text-input mt-2 h-12" value={format} onChange={(event) => setFormat(event.target.value as "vtt" | "srt")}>
                <option value="vtt">WebVTT (.vtt)</option>
                <option value="srt">SubRip (.srt)</option>
              </select>
            </label>
            <p className="text-sm leading-6 text-[var(--ink-muted)]">
              Keep the YouTube link above so each caption can seek the correct video time.
            </p>
          </div>
          <label htmlFor={`${panelId}-captions`} className="field-label mt-4 block">
            Timestamped captions
          </label>
          <textarea
            id={`${panelId}-captions`}
            className="text-input mt-2 min-h-40 w-full resize-y font-mono text-sm leading-6"
            value={transcriptText}
            onChange={(event) => {
              setTranscriptText(event.target.value);
              if (error?.field === "captions") setError(null);
            }}
            placeholder={format === "vtt" ? "WEBVTT\n\n00:00:10.000 --> 00:00:13.000\nWelcome to today's video." : "1\n00:00:10,000 --> 00:00:13,000\nWelcome to today's video."}
            aria-invalid={error?.field === "captions"}
            aria-describedby={error?.field === "captions" ? `${panelId}-error` : undefined}
          />
          <button type="submit" className="button primary-button mt-4" disabled={loading}>
            {loading ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> : <FileText aria-hidden="true" size={18} />}
            {loading ? "Importing captions" : "Import captions"}
          </button>
        </form>
      ) : null}

      <div className="min-h-6">
        {error ? (
          <p id={`${panelId}-error`} className="mt-4 text-sm font-medium text-[var(--danger)]" role="alert">
            {error.message}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 text-sm font-medium text-[var(--positive)]" role="status">
            {success}
          </p>
        ) : null}
      </div>
    </section>
  );
}
