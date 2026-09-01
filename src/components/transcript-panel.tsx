"use client";

import { Bookmark, Check, Play, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

export type TranscriptChunkView = {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

type TranscriptPanelProps = {
  chunks: readonly TranscriptChunkView[];
  selectedId: string | null;
  currentTime: number;
  savedIds: ReadonlySet<string>;
  onPlay: (chunk: TranscriptChunkView) => void;
  onSave: (chunk: TranscriptChunkView) => void;
};

export function formatTimestamp(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function TranscriptPanel({
  chunks,
  selectedId,
  currentTime,
  savedIds,
  onPlay,
  onSave,
}: TranscriptPanelProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const selectedRef = useRef<HTMLLIElement | null>(null);

  const visibleChunks = useMemo(() => {
    if (!deferredQuery) return chunks;
    return chunks.filter((chunk) => chunk.text.toLocaleLowerCase().includes(deferredQuery));
  }, [chunks, deferredQuery]);

  const playingId = useMemo(
    () => chunks.find((chunk) => currentTime >= chunk.startSeconds && currentTime < chunk.endSeconds)?.id ?? null,
    [chunks, currentTime],
  );

  useEffect(() => {
    if (selectedId) selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="transcript-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Time-aligned transcript</p>
          <h2 id="transcript-heading" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Choose one sentence
          </h2>
        </div>
        <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-semibold tabular-nums text-[var(--ink-muted)]">
          {chunks.length} sentences
        </span>
      </div>

      <label className="relative mb-4 block">
        <span className="sr-only">Search transcript</span>
        <Search
          aria-hidden="true"
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
        />
        <input
          className="text-input w-full !pl-10"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a phrase in this video"
        />
      </label>

      <ol className="transcript-scroll min-h-[20rem] flex-1 space-y-2 overflow-y-auto pr-1" aria-label="Video transcript">
        {visibleChunks.map((chunk, index) => {
          const selected = selectedId === chunk.id;
          const playing = playingId === chunk.id;
          const saved = savedIds.has(chunk.id);

          return (
            <li
              key={chunk.id}
              ref={selected ? selectedRef : undefined}
              className={`group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-[16px] p-2.5 transition-[background-color,box-shadow] duration-150 ${
                selected
                  ? "bg-[var(--brand-soft)] shadow-[inset_3px_0_0_var(--brand)]"
                  : playing
                    ? "bg-[var(--surface-subtle)]"
                    : "hover:bg-[var(--surface-subtle)]"
              }`}
            >
              <button
                type="button"
                className="grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl text-left"
                onClick={() => onPlay(chunk)}
                aria-label={`Play sentence ${index + 1} from ${formatTimestamp(chunk.startSeconds)}`}
                aria-pressed={selected}
              >
                <span
                  className={`grid h-10 min-w-12 place-items-center rounded-[12px] px-2 font-mono text-xs font-semibold tabular-nums transition-[background-color,color,scale] duration-150 active:scale-[0.96] ${
                    selected || playing
                      ? "bg-[var(--brand)] text-white"
                      : "bg-white text-[var(--ink-muted)] shadow-[var(--shadow-control)]"
                  }`}
                  aria-hidden="true"
                >
                  {playing ? <Play size={15} fill="currentColor" /> : formatTimestamp(chunk.startSeconds)}
                </span>
                <span className="min-w-0 break-words px-1 text-[16px] leading-7 text-[var(--ink)] [overflow-wrap:anywhere]">
                  {chunk.text}
                </span>
              </button>

              <button
                type="button"
                className={`icon-button mt-0.5 ${saved ? "text-[var(--positive)]" : "text-[var(--ink-faint)]"}`}
                onClick={() => onSave(chunk)}
                aria-label={saved ? `Saved: ${chunk.text}` : `Save sentence: ${chunk.text}`}
                aria-pressed={saved}
              >
                {saved ? <Check aria-hidden="true" size={18} /> : <Bookmark aria-hidden="true" size={18} />}
              </button>
            </li>
          );
        })}
      </ol>

      {visibleChunks.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-[16px] bg-[var(--surface-subtle)] p-6 text-center">
          <div>
            <p className="font-semibold text-[var(--ink)]">No matching sentence</p>
            <button type="button" className="text-link mt-2" onClick={() => setQuery("")}>
              Clear transcript search
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
