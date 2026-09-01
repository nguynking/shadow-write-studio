"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type YouGlishFetchEvent = {
  query?: string;
  totalResult?: number;
};

type YouGlishWidgetOptions = {
  autoStart: 0 | 1;
  components: number;
  restrictionMode: 0 | 1;
  videoQuality: "default" | "small" | "medium" | "highres";
  events: {
    onFetchDone: (event: YouGlishFetchEvent) => void;
    onError: () => void;
  };
};

type YouGlishWidgetInstance = {
  fetch: (query: string, language: string, accent?: string) => void;
};

type YouGlishNamespace = {
  Widget: new (
    target: string | HTMLElement,
    options: YouGlishWidgetOptions,
  ) => YouGlishWidgetInstance;
};

declare global {
  interface Window {
    YG?: YouGlishNamespace;
    onYouglishAPIReady?: () => void;
  }
}

type WidgetStatus = "loading" | "ready" | "empty" | "error";

type WidgetState = {
  status: WidgetStatus;
  query: string;
};

const WIDGET_COMPONENTS = 4 + 8 + 16 + 64;

function comparableQuery(query: string) {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function YouGlishWidget({ query }: { query: string }) {
  const reactId = useId();
  const containerId = `youglish-${reactId.replace(/:/g, "")}`;
  const widgetRef = useRef<YouGlishWidgetInstance | null>(null);
  const currentQueryRef = useRef(query.trim());
  const [widgetState, setWidgetState] = useState<WidgetState>({
    status: "loading",
    query: query.trim(),
  });

  const fetchQuery = useCallback((widget: YouGlishWidgetInstance) => {
    const currentQuery = currentQueryRef.current;
    if (!currentQuery) return;

    setWidgetState({ status: "loading", query: currentQuery });
    widget.fetch(currentQuery, "english");
  }, []);

  const initializeWidget = useCallback(() => {
    if (!window.YG || widgetRef.current) return;

    try {
      const widget = new window.YG.Widget(containerId, {
        autoStart: 0,
        components: WIDGET_COMPONENTS,
        restrictionMode: 1,
        videoQuality: "default",
        events: {
          onFetchDone: (event) => {
            if (
              event.query &&
              comparableQuery(event.query) !==
                comparableQuery(currentQueryRef.current)
            ) {
              return;
            }

            setWidgetState({
              status: (event.totalResult ?? 0) > 0 ? "ready" : "empty",
              query: currentQueryRef.current,
            });
          },
          onError: () =>
            setWidgetState({
              status: "error",
              query: currentQueryRef.current,
            }),
        },
      });

      widgetRef.current = widget;
      fetchQuery(widget);
    } catch {
      setWidgetState({
        status: "error",
        query: currentQueryRef.current,
      });
    }
  }, [containerId, fetchQuery]);

  useEffect(() => {
    const previousReadyHandler = window.onYouglishAPIReady;
    const readyHandler = () => {
      previousReadyHandler?.();
      initializeWidget();
    };

    window.onYouglishAPIReady = readyHandler;

    const initializeTimer = window.YG
      ? window.setTimeout(initializeWidget, 0)
      : undefined;

    return () => {
      if (initializeTimer !== undefined) window.clearTimeout(initializeTimer);
      if (window.onYouglishAPIReady === readyHandler) {
        window.onYouglishAPIReady = previousReadyHandler;
      }
    };
  }, [initializeWidget]);

  useEffect(() => {
    currentQueryRef.current = query.trim();
    if (!currentQueryRef.current) return;

    const fetchTimer = window.setTimeout(() => {
      if (widgetRef.current) {
        fetchQuery(widgetRef.current);
      } else {
        initializeWidget();
      }
    }, 0);

    return () => window.clearTimeout(fetchTimer);
  }, [fetchQuery, initializeWidget, query]);

  useEffect(
    () => () => {
      widgetRef.current = null;
    },
    [],
  );

  const normalizedQuery = query.trim();
  const status = !normalizedQuery
    ? "idle"
    : widgetState.query === normalizedQuery
      ? widgetState.status
      : "loading";
  const statusMessage =
    status === "loading"
      ? `Finding real examples of “${query.trim()}”…`
      : status === "empty"
        ? `No context clips were found for “${query.trim()}”. Try a related word or phrase.`
        : status === "error"
          ? "Context clips could not load. Check your connection and try again."
          : status === "ready"
            ? `Context clips for “${query.trim()}” are ready.`
            : "Enter a word to hear it in real conversations.";

  function retryContextClips() {
    if (!normalizedQuery) return;
    setWidgetState({ status: "loading", query: normalizedQuery });
    if (widgetRef.current) {
      fetchQuery(widgetRef.current);
    } else {
      initializeWidget();
    }
  }

  return (
    <section
      className="space-y-4"
      aria-labelledby={`${containerId}-heading`}
      aria-busy={status === "loading"}
    >
      <div className="space-y-1">
        <h3
          id={`${containerId}-heading`}
          className="text-base font-semibold text-[var(--ink)]"
        >
          Hear it in context
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
          Each clip starts where the phrase is spoken. Use the controls to move
          through different speakers and situations.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)]">
        <div
          className={query.trim() ? "min-h-[260px] p-3 sm:p-4" : "hidden"}
        >
          <div id={containerId} className="min-h-[220px] w-full" />
        </div>

        {status !== "ready" ? (
          <div className="px-5 py-5">
            <p
              className="text-sm leading-6 text-[var(--ink-muted)]"
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </p>
            {status === "error" ? (
              <button type="button" className="button secondary-button mt-3" onClick={retryContextClips}>
                Try context clips again
              </button>
            ) : null}
          </div>
        ) : (
          <p className="sr-only" role="status" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </div>

      <p className="text-xs leading-5 text-[var(--ink-faint)]">
        Powered by{" "}
        <a
          className="text-link"
          href="https://youglish.com/"
          target="_blank"
          rel="noreferrer"
        >
          YouGlish.com
        </a>
      </p>

      {normalizedQuery ? (
        <Script
          id="youglish-widget-api"
          src="https://youglish.com/public/emb/widget.js"
          strategy="lazyOnload"
          onReady={initializeWidget}
          onError={() =>
            setWidgetState({
              status: "error",
              query: currentQueryRef.current,
            })
          }
        />
      ) : null}
    </section>
  );
}
