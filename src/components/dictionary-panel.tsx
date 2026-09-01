"use client";

import { useEffect, useId, useMemo, useState } from "react";

import type {
  DictionaryApiResponse,
  DictionaryEntry,
  DictionaryMeaning,
  DictionarySuccessResponse,
} from "@/types/dictionary";

import { YouGlishWidget } from "./youglish-widget";

type DictionaryState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | {
      status: "success";
      query: string;
      data: DictionarySuccessResponse;
    }
  | { status: "empty"; query: string; message: string }
  | { status: "error"; query: string; message: string };

function getDisplayMeanings(entries: DictionaryEntry[]) {
  const selected: DictionaryMeaning[] = [];
  const seenDefinitions = new Set<string>();
  const definitionsPerPart = new Map<string, number>();
  let definitionCount = 0;

  for (const entry of entries) {
    for (const meaning of entry.meanings) {
      if (definitionCount >= 6) return selected;

      const partKey = meaning.partOfSpeech.toLowerCase();
      const currentPartCount = definitionsPerPart.get(partKey) ?? 0;
      if (currentPartCount >= 2) continue;

      const availableDefinitions = meaning.definitions.filter((definition) => {
        const key = definition.definition.toLowerCase();
        if (seenDefinitions.has(key)) return false;
        seenDefinitions.add(key);
        return true;
      });

      const definitions = availableDefinitions.slice(
        0,
        Math.min(2 - currentPartCount, 6 - definitionCount),
      );
      if (definitions.length === 0) continue;

      const existingMeaning = selected.find(
        (item) => item.partOfSpeech.toLowerCase() === partKey,
      );

      if (existingMeaning) {
        existingMeaning.definitions.push(...definitions);
      } else {
        selected.push({
          partOfSpeech: meaning.partOfSpeech,
          definitions: [...definitions],
        });
      }

      definitionCount += definitions.length;
      definitionsPerPart.set(partKey, currentPartCount + definitions.length);
    }
  }

  return selected;
}

function getPronunciation(entries: DictionaryEntry[]) {
  const phonetic =
    entries.find((entry) => entry.phonetic)?.phonetic ??
    entries.flatMap((entry) => entry.phonetics).find((item) => item.text)
      ?.text;
  const audio = entries
    .flatMap((entry) => entry.phonetics)
    .find((item) => item.audio)?.audio;

  return { phonetic, audio };
}

function getSynonyms(meanings: DictionaryMeaning[]) {
  return Array.from(
    new Set(
      meanings.flatMap((meaning) =>
        meaning.definitions.flatMap((definition) => definition.synonyms),
      ),
    ),
  ).slice(0, 6);
}

function isDictionarySuccess(
  response: DictionaryApiResponse,
): response is DictionarySuccessResponse {
  return "entries" in response;
}

export function DictionaryPanel({ query }: { query: string }) {
  const reactId = useId();
  const panelId = `dictionary-${reactId.replace(/:/g, "")}`;
  const normalizedQuery = query.trim();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<DictionaryState>(
    normalizedQuery
      ? { status: "loading", query: normalizedQuery }
      : { status: "idle" },
  );

  useEffect(() => {
    if (!normalizedQuery) return;

    const controller = new AbortController();

    async function loadDictionary() {
      setState({ status: "loading", query: normalizedQuery });

      try {
        const response = await fetch(
          `/api/dictionary?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as DictionaryApiResponse;
        if (controller.signal.aborted) return;

        if (!response.ok || !isDictionarySuccess(payload)) {
          const message =
            "error" in payload
              ? payload.error.message
              : "The dictionary could not load this word. Try again.";

          setState({
            status: response.status === 404 ? "empty" : "error",
            query: normalizedQuery,
            message,
          });
          return;
        }

        setState({
          status: "success",
          query: normalizedQuery,
          data: payload,
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setState({
          status: "error",
          query: normalizedQuery,
          message:
            "The dictionary could not load. Check your connection and try again.",
        });
      }
    }

    void loadDictionary();
    return () => controller.abort();
  }, [normalizedQuery, retryKey]);

  const viewState = useMemo<DictionaryState>(
    () =>
      !normalizedQuery
        ? { status: "idle" }
        : state.status !== "idle" && state.query === normalizedQuery
          ? state
          : { status: "loading", query: normalizedQuery },
    [normalizedQuery, state],
  );

  const displayData = useMemo(() => {
    if (viewState.status !== "success") return null;

    const meanings = getDisplayMeanings(viewState.data.entries);
    const pronunciation = getPronunciation(viewState.data.entries);

    return {
      word: viewState.data.entries[0]?.word ?? viewState.data.query,
      meanings,
      synonyms: getSynonyms(meanings),
      sourceUrl: viewState.data.entries.find((entry) => entry.sourceUrls[0])
        ?.sourceUrls[0],
      license: viewState.data.entries.find((entry) => entry.license)?.license,
      ...pronunciation,
    };
  }, [viewState]);

  const announcement =
    viewState.status === "loading"
      ? `Looking up ${normalizedQuery}.`
      : viewState.status === "success"
        ? `Dictionary results for ${displayData?.word ?? normalizedQuery} are ready.`
        : viewState.status === "empty" || viewState.status === "error"
          ? viewState.message
          : "Enter a word to see its meaning and pronunciation.";

  return (
    <section
      className="space-y-8"
      aria-labelledby={`${panelId}-heading`}
    >
      <div
        className="rounded-3xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] sm:p-7"
        aria-busy={viewState.status === "loading"}
      >
        <div className="space-y-1">
          <h2
            id={`${panelId}-heading`}
            className="text-lg font-semibold tracking-[-0.01em] text-[var(--ink)]"
          >
            Meaning and pronunciation
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
            Learn the definition first, then notice how speakers use the word.
          </p>
        </div>

        <p className="sr-only" role="status" aria-live="polite" aria-atomic>
          {announcement}
        </p>

        {viewState.status === "idle" ? (
          <div className="mt-6 rounded-2xl bg-[var(--surface-subtle)] px-5 py-5 text-sm leading-6 text-[var(--ink-muted)]">
            Enter a word to see its meaning, pronunciation, examples, and real
            video contexts.
          </div>
        ) : null}

        {viewState.status === "loading" ? (
          <div className="mt-6 rounded-2xl bg-[var(--surface-subtle)] px-5 py-5">
            <p className="text-sm font-medium text-[var(--ink)]">
              Looking up “{normalizedQuery}”…
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              Finding definitions, examples, and pronunciation audio.
            </p>
          </div>
        ) : null}

        {viewState.status === "empty" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-warm)] px-5 py-5 text-[var(--ink)]">
            <p className="text-sm font-semibold">No dictionary entry found</p>
            <p className="mt-1 text-sm leading-6">{viewState.message}</p>
          </div>
        ) : null}

        {viewState.status === "error" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--danger-soft)] px-5 py-5 text-[var(--ink)]">
            <p className="text-sm font-semibold">Dictionary unavailable</p>
            <p className="mt-1 text-sm leading-6">{viewState.message}</p>
            <button
              type="button"
              className="button primary-button mt-4"
              onClick={() => setRetryKey((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {viewState.status === "success" && displayData ? (
          <div className="mt-7 space-y-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="break-words text-3xl font-semibold leading-tight tracking-[-0.03em] text-[var(--ink)] sm:text-4xl">
                  {displayData.word}
                </p>
                {displayData.phonetic ? (
                  <p className="text-base text-[var(--ink-muted)]">
                    /{displayData.phonetic.replace(/^\/+|\/+$/g, "")}/
                  </p>
                ) : null}
              </div>

              {displayData.audio ? (
                <audio
                  className="h-10 w-full max-w-xs"
                  controls
                  preload="none"
                  src={displayData.audio}
                  aria-label={`Pronunciation of ${displayData.word}`}
                >
                  Your browser does not support pronunciation audio.
                </audio>
              ) : null}
            </div>

            <div className="space-y-6">
              {displayData.meanings.map((meaning, meaningIndex) => (
                <section
                  key={meaning.partOfSpeech}
                  className="space-y-3"
                  aria-labelledby={`${panelId}-meaning-${meaningIndex}`}
                >
                  <h3
                    id={`${panelId}-meaning-${meaningIndex}`}
                    className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]"
                  >
                    {meaning.partOfSpeech}
                  </h3>
                  <ol className="space-y-4">
                    {meaning.definitions.map((definition, index) => (
                      <li
                        key={definition.definition}
                        className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-sm leading-6 text-[var(--ink)]"
                      >
                        <span
                          className="pt-px text-[var(--ink-faint)] tabular-nums"
                          aria-hidden="true"
                        >
                          {index + 1}.
                        </span>
                        <div className="space-y-1">
                          <p>{definition.definition}</p>
                          {definition.example ? (
                            <p className="text-[var(--ink-muted)]">
                              <span className="sr-only">Example: </span>
                              “{definition.example}”
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>

            {displayData.synonyms.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                  Similar words
                </h3>
                <ul className="flex flex-wrap gap-2" aria-label="Synonyms">
                  {displayData.synonyms.map((synonym) => (
                    <li
                      key={synonym}
                      className="rounded-full bg-[var(--surface-subtle)] px-3 py-1.5 text-sm text-[var(--ink-muted)]"
                    >
                      {synonym}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {displayData.sourceUrl || displayData.license ? (
              <p className="text-xs leading-5 text-[var(--ink-faint)]">
                {displayData.sourceUrl ? (
                  <a
                    className="text-link"
                    href={displayData.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View dictionary source
                  </a>
                ) : null}
                {displayData.sourceUrl && displayData.license ? " · " : null}
                {displayData.license ? (
                  <a
                    className="text-link"
                    href={displayData.license.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {displayData.license.name}
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] sm:p-7">
        <YouGlishWidget key={normalizedQuery || "idle"} query={normalizedQuery} />
      </div>
    </section>
  );
}
