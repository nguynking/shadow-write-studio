"use client";

import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock3,
  Headphones,
  Library,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { DictionaryPanel } from "@/components/dictionary-panel";
import type { PracticeAttempt } from "@/components/practice-panel";
import { PracticePanel } from "@/components/practice-panel";
import {
  SourceImporter,
  type TranscriptImportResult,
} from "@/components/source-importer";
import {
  formatTimestamp,
  TranscriptPanel,
  type TranscriptChunkView,
} from "@/components/transcript-panel";
import { YoutubePlayer } from "@/components/youtube-player";
import { EXAMPLE_CHUNKS, EXAMPLE_VIDEO } from "@/data/example-session";
import {
  type LearningAttempt,
  type LearningStats,
  type SavedSentence,
  learningStorage,
} from "@/lib/storage";

type AppView = "practice" | "context" | "notebook";

type VideoSession = TranscriptImportResult["video"];

const navItems = [
  { id: "practice" as const, label: "Practice", icon: Headphones },
  { id: "context" as const, label: "Word context", icon: Search },
  { id: "notebook" as const, label: "Notebook", icon: Library },
];

function newId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function savedSentenceKey(videoId: string, chunkId: string) {
  return `${videoId}:${chunkId}`;
}

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function nextStats(
  current: LearningStats,
  attempt: PracticeAttempt,
): LearningStats {
  const now = new Date();
  const today = dayKey(now);
  const last = current.lastPracticedAt
    ? new Date(current.lastPracticedAt)
    : null;
  const lastDay = last ? dayKey(last) : null;
  const elapsedDays = last
    ? Math.round(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
          new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime()) /
          86_400_000,
      )
    : null;
  const rebuildAttempts =
    current.rebuildAttempts + (attempt.type === "rebuild" ? 1 : 0);
  const averageAccuracy =
    attempt.type === "rebuild" && typeof attempt.score === "number"
      ? Math.round(
          (current.averageAccuracy * current.rebuildAttempts + attempt.score) /
            rebuildAttempts,
        )
      : current.averageAccuracy;

  return {
    ...current,
    totalAttempts: current.totalAttempts + 1,
    recordingAttempts:
      current.recordingAttempts + (attempt.type === "recording" ? 1 : 0),
    rebuildAttempts,
    personalizeAttempts:
      current.personalizeAttempts + (attempt.type === "personalize" ? 1 : 0),
    averageAccuracy,
    streakDays:
      lastDay === today
        ? Math.max(1, current.streakDays)
        : elapsedDays === 1
          ? current.streakDays + 1
          : 1,
    lastPracticedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function StudioApp() {
  const [view, setView] = useState<AppView>("practice");
  const [video, setVideo] = useState<VideoSession>({ ...EXAMPLE_VIDEO });
  const [chunks, setChunks] = useState<TranscriptChunkView[]>(
    EXAMPLE_CHUNKS.map((chunk) => ({ ...chunk })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    EXAMPLE_CHUNKS[1]?.id ?? EXAMPLE_CHUNKS[0]?.id ?? null,
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [playRequest, setPlayRequest] = useState(0);
  const [loop, setLoop] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [wordDraft, setWordDraft] = useState("");
  const [wordQuery, setWordQuery] = useState("");
  const [savedSentences, setSavedSentences] = useState<SavedSentence[]>([]);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [stats, setStats] = useState<LearningStats>(() => ({
    totalAttempts: 0,
    recordingAttempts: 0,
    rebuildAttempts: 0,
    personalizeAttempts: 0,
    averageAccuracy: 0,
    streakDays: 0,
    totalPracticeSeconds: 0,
  }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      setSavedSentences(learningStorage.loadSavedSentences());
      setAttempts(learningStorage.loadAttempts());
      setStats(learningStorage.loadLearningStats());
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    learningStorage.saveSavedSentences(savedSentences);
  }, [hydrated, savedSentences]);

  useEffect(() => {
    if (!hydrated) return;
    learningStorage.saveAttempts(attempts);
  }, [attempts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    learningStorage.saveLearningStats(stats);
  }, [hydrated, stats]);

  const selectedChunk = useMemo(
    () => chunks.find((chunk) => chunk.id === selectedId) ?? chunks[0] ?? null,
    [chunks, selectedId],
  );

  const savedIds = useMemo(
    () =>
      new Set(
        chunks
          .filter((chunk) =>
            savedSentences.some(
              (sentence) =>
                sentence.id === savedSentenceKey(video.id, chunk.id) ||
                (sentence.id === chunk.id && sentence.videoId === video.id),
            ),
          )
          .map((chunk) => chunk.id),
      ),
    [chunks, savedSentences, video.id],
  );

  function playChunk(chunk: TranscriptChunkView) {
    setSelectedId(chunk.id);
    setPlayRequest((request) => request + 1);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(
        () =>
          document.getElementById("player-card")?.scrollIntoView({
            behavior: preferredScrollBehavior(),
            block: "start",
          }),
        0,
      );
    }
  }

  function importSession(result: TranscriptImportResult) {
    setVideo(result.video);
    setChunks(result.chunks);
    setSelectedId(result.chunks[0]?.id ?? null);
    setCurrentTime(0);
    setPlayRequest(0);
    window.setTimeout(
      () => {
        document.getElementById("practice-studio")?.scrollIntoView({
          behavior: preferredScrollBehavior(),
          block: "start",
        });
        document.getElementById("studio-heading")?.focus();
      },
      50,
    );
  }

  function useExample() {
    importSession({
      source: "youtube",
      video: { ...EXAMPLE_VIDEO },
      chunks: EXAMPLE_CHUNKS.map((chunk) => ({ ...chunk })),
    });
  }

  function toggleSaved(chunk: TranscriptChunkView) {
    setSavedSentences((current) => {
      const key = savedSentenceKey(video.id, chunk.id);
      const alreadySaved = current.some(
        (sentence) =>
          sentence.id === key ||
          (sentence.id === chunk.id && sentence.videoId === video.id),
      );
      if (alreadySaved) {
        return current.filter(
          (sentence) =>
            sentence.id !== key &&
            !(sentence.id === chunk.id && sentence.videoId === video.id),
        );
      }

      return [
        {
          id: key,
          text: chunk.text,
          videoId: video.id,
          videoTitle: video.title,
          startSeconds: chunk.startSeconds,
          endSeconds: chunk.endSeconds,
          savedAt: new Date().toISOString(),
        },
        ...current,
      ];
    });
  }

  function recordAttempt(attempt: PracticeAttempt) {
    const learningAttempt: LearningAttempt = {
      id: newId("attempt"),
      type: attempt.type,
      createdAt: new Date().toISOString(),
      sentenceId: selectedChunk?.id,
      prompt: selectedChunk?.text,
      response: attempt.response,
      score: attempt.score,
    };

    setAttempts((current) => [learningAttempt, ...current].slice(0, 100));
    setStats((current) => nextStats(current, attempt));
  }

  function searchWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = wordDraft.trim();
    if (query) setWordQuery(query);
  }

  function reviewSaved(sentence: SavedSentence) {
    const reviewChunk: TranscriptChunkView = {
      id: sentence.id,
      text: sentence.text,
      startSeconds: sentence.startSeconds,
      endSeconds: sentence.endSeconds,
      durationSeconds: sentence.endSeconds - sentence.startSeconds,
    };
    setVideo({
      id: sentence.videoId,
      title: sentence.videoTitle,
      author: "YouTube",
      durationSeconds: 0,
      thumbnailUrl: `https://i.ytimg.com/vi/${sentence.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${sentence.videoId}`,
    });
    setChunks([reviewChunk]);
    setSelectedId(reviewChunk.id);
    setView("practice");
    setPlayRequest((request) => request + 1);
  }

  return (
    <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:oklch(0.975_0.012_91/0.88)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-17 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            className="flex min-w-0 items-center gap-3 rounded-xl text-left"
            onClick={() => setView("practice")}
            aria-label="ShadowWrite Studio, go to practice"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[var(--ink)] text-white shadow-[var(--shadow-control)]">
              <Volume2 aria-hidden="true" size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold tracking-[-0.02em] text-[var(--ink)]">
                ShadowWrite
              </span>
              <span className="hidden text-xs text-[var(--ink-faint)] sm:block">
                Hear it. Rebuild it. Use it.
              </span>
            </span>
          </button>

          <nav className="hidden items-center rounded-[14px] bg-white p-1 shadow-[var(--shadow-control)] md:flex" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`button min-h-10 px-3.5 ${
                    active
                      ? "bg-[var(--ink)] text-white"
                      : "bg-transparent text-[var(--ink-muted)] hover:bg-[var(--surface-subtle)]"
                  }`}
                  onClick={() => setView(item.id)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon aria-hidden="true" size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 text-sm font-medium text-[var(--ink-muted)] sm:flex">
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[var(--positive-soft)] px-2 font-bold tabular-nums text-[var(--positive)]">
              {stats.streakDays}
            </span>
            day streak
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {view === "practice" ? (
          <>
            <SourceImporter onImported={importSession} onUseExample={useExample} />

            <section id="practice-studio" className="scroll-mt-24 pt-10" aria-labelledby="studio-heading">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Production practice</p>
                  <h2 id="studio-heading" tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[var(--ink)] sm:text-3xl">
                    One sentence, three useful passes
                  </h2>
                </div>
                <p className="max-w-md text-sm leading-6 text-[var(--ink-muted)]">
                  First copy the sound, then retrieve the words, then make the language yours.
                </p>
              </div>

              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(22rem,0.82fr)]">
                <div id="player-card" className="order-2 min-w-0 scroll-mt-24 rounded-[24px] bg-white p-4 shadow-[var(--shadow-card)] sm:p-6 lg:order-1">
                  <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">{video.title}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--ink-faint)]">{video.author}</p>
                    </div>
                    <a
                      className="text-link shrink-0 text-xs"
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      YouTube
                    </a>
                  </div>

                  <YoutubePlayer
                    videoId={video.id}
                    clip={selectedChunk}
                    playRequest={playRequest}
                    loop={loop}
                    playbackRate={playbackRate}
                    onTimeUpdate={setCurrentTime}
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-[var(--surface-subtle)] p-3">
                    <button
                      type="button"
                      className="button primary-button"
                      onClick={() => selectedChunk && playChunk(selectedChunk)}
                      disabled={!selectedChunk}
                    >
                      <Play aria-hidden="true" size={17} fill="currentColor" />
                      Play sentence
                    </button>
                    <label className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-[var(--ink-muted)]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--brand)]"
                        checked={loop}
                        onChange={(event) => setLoop(event.target.checked)}
                      />
                      Loop
                    </label>
                    <label className="ml-auto flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--ink-muted)]">
                      Speed
                      <select
                        className="text-input min-h-10 py-1.5 pr-8 text-sm"
                        value={playbackRate}
                        onChange={(event) => setPlaybackRate(Number(event.target.value))}
                      >
                        <option value={0.75}>0.75×</option>
                        <option value={1}>1×</option>
                        <option value={1.25}>1.25×</option>
                      </select>
                    </label>
                  </div>

                  {selectedChunk ? (
                    <div className="mt-4">
                      <PracticePanel
                        chunk={selectedChunk}
                        onReplay={() => playChunk(selectedChunk)}
                        onAttempt={recordAttempt}
                      />
                    </div>
                  ) : (
                    <div className="mt-5 rounded-[16px] bg-[var(--surface-warm)] p-5 text-sm text-[var(--ink-muted)]">
                      Choose a transcript sentence to start.
                    </div>
                  )}
                </div>

                <div className="order-1 flex min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-[24px] bg-white p-4 shadow-[var(--shadow-card)] sm:p-6 lg:sticky lg:top-24 lg:order-2 lg:h-[calc(100vh-7.5rem)] lg:min-h-0">
                  <TranscriptPanel
                    chunks={chunks}
                    selectedId={selectedChunk?.id ?? null}
                    currentTime={currentTime}
                    savedIds={savedIds}
                    onPlay={playChunk}
                    onSave={toggleSaved}
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}

        {view === "context" ? (
          <section className="mx-auto max-w-5xl" aria-labelledby="context-heading">
            <div className="mb-8 max-w-3xl">
              <p className="eyebrow">Word context</p>
              <h1 id="context-heading" className="mt-2 text-balance text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.06em] text-[var(--ink)]">
                Learn a word where it lives.
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-lg leading-8 text-[var(--ink-muted)]">
                Start with a clear meaning, then hear the same word inside real conversations at the moment it is spoken.
              </p>
            </div>

            <form className="mb-7 rounded-[20px] bg-white p-3 shadow-[var(--shadow-card)] sm:flex sm:gap-3" onSubmit={searchWord}>
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">English word or phrase</span>
                <Search aria-hidden="true" size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
                <input
                  className="text-input h-13 w-full border-0 !pl-12 shadow-none"
                  value={wordDraft}
                  onChange={(event) => setWordDraft(event.target.value)}
                  placeholder="Try ‘momentum’ or ‘figure out’"
                  autoCapitalize="none"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="button primary-button mt-2 h-13 w-full px-6 sm:mt-0 sm:w-auto">
                Find contexts
              </button>
            </form>

            {!wordQuery ? (
              <div className="mb-8 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-[var(--ink-faint)]">Try a useful phrase:</span>
                {["figure out", "momentum", "actually", "get used to"].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="button secondary-button min-h-9 rounded-full px-3 py-1.5 text-sm"
                    onClick={() => {
                      setWordDraft(suggestion);
                      setWordQuery(suggestion);
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            <DictionaryPanel query={wordQuery} />
          </section>
        ) : null}

        {view === "notebook" ? (
          <section aria-labelledby="notebook-heading">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Your notebook</p>
                <h1 id="notebook-heading" className="mt-2 text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-none tracking-[-0.06em] text-[var(--ink)]">
                  Proof of practice.
                </h1>
              </div>
              <p className="max-w-md text-sm leading-6 text-[var(--ink-muted)]">
                Progress here means language you produced, not videos you watched.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Practice attempts", value: stats.totalAttempts, icon: Sparkles },
                { label: "Voice recordings", value: stats.recordingAttempts, icon: Volume2 },
                { label: "Rebuild accuracy", value: `${stats.averageAccuracy}%`, icon: CheckCircle2 },
                { label: "Current streak", value: `${stats.streakDays}d`, icon: Clock3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-[20px] bg-white p-5 shadow-[var(--shadow-control)]">
                    <Icon aria-hidden="true" size={20} className="text-[var(--brand)]" />
                    <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)] tabular-nums">{item.value}</p>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{item.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <section className="rounded-[24px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="saved-heading">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="eyebrow">Review queue</p>
                    <h2 id="saved-heading" className="mt-1 text-xl font-semibold text-[var(--ink)]">Saved sentences</h2>
                  </div>
                  <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-sm font-bold text-[var(--brand-strong)] tabular-nums">{savedSentences.length}</span>
                </div>

                {savedSentences.length ? (
                  <ul className="mt-5 space-y-3">
                    {savedSentences.map((sentence) => (
                      <li key={sentence.id} className="rounded-[16px] bg-[var(--surface-subtle)] p-4">
                        <p className="text-[15px] leading-7 text-[var(--ink)]">{sentence.text}</p>
                        <p className="mt-2 text-xs text-[var(--ink-faint)]">
                          {formatTimestamp(sentence.startSeconds)} · {sentence.videoTitle}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" className="button secondary-button min-h-10" onClick={() => reviewSaved(sentence)}>
                            <Play aria-hidden="true" size={15} />
                            Practice again
                          </button>
                          <button
                            type="button"
                            className="button ghost-button min-h-10"
                            onClick={() => setSavedSentences((current) => current.filter((item) => item.id !== sentence.id))}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-5 rounded-[16px] bg-[var(--surface-warm)] p-6 text-center">
                    <Bookmark aria-hidden="true" size={24} className="mx-auto text-[var(--warning)]" />
                    <p className="mt-3 font-semibold text-[var(--ink)]">Save one sentence worth reusing</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Choose the bookmark beside any transcript sentence.</p>
                    <button type="button" className="button secondary-button mt-4" onClick={() => setView("practice")}>Find a sentence</button>
                  </div>
                )}
              </section>

              <section className="rounded-[24px] bg-[var(--ink)] p-5 text-white shadow-[var(--shadow-media)] sm:p-7" aria-labelledby="recent-heading">
                <BookOpen aria-hidden="true" size={23} className="text-[var(--brand-soft)]" />
                <h2 id="recent-heading" className="mt-5 text-xl font-semibold">Recent output</h2>
                <p className="mt-1 text-sm leading-6 text-white/65">Your latest retrieval and original-use attempts.</p>
                {attempts.length ? (
                  <ol className="mt-5 space-y-3">
                    {attempts.slice(0, 5).map((attempt) => (
                      <li key={attempt.id} className="rounded-[14px] bg-white/8 p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">{attempt.type}</span>
                          {typeof attempt.score === "number" ? <span className="text-sm font-bold tabular-nums">{attempt.score}%</span> : null}
                        </div>
                        {attempt.response ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/85">{attempt.response}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-5 rounded-[14px] bg-white/8 p-5 text-sm leading-6 text-white/70">
                    Your recordings and writing attempts will appear here.
                  </div>
                )}
                {attempts.length ? (
                  <button
                    type="button"
                    className="button mt-5 w-full bg-white text-[var(--ink)] hover:bg-[var(--surface-subtle)]"
                    onClick={() => setView("practice")}
                  >
                    <RotateCcw aria-hidden="true" size={17} />
                    Continue practice
                  </button>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="mx-auto mt-12 max-w-[90rem] border-t border-[var(--border)] px-4 py-7 text-xs leading-6 text-[var(--ink-faint)] sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p>Your practice records stay in this browser. Embedded services receive normal requests when you load them.</p>
          <p className="flex flex-wrap gap-x-4">
            <a className="text-link" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a>
            <a className="text-link" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy</a>
            <a className="text-link" href="https://youglish.com/" target="_blank" rel="noreferrer">Powered by YouGlish</a>
            <a className="text-link" href="https://www.datamuse.com/api/" target="_blank" rel="noreferrer">Datamuse API</a>
          </p>
        </div>
      </footer>

      <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 grid grid-cols-3 rounded-[18px] bg-[color:oklch(0.245_0.03_258/0.96)] p-1.5 shadow-[0_14px_40px_oklch(0.1_0.02_258/0.3)] backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex min-h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-[13px] px-1 text-[11px] font-semibold ${active ? "bg-white text-[var(--ink)]" : "text-white/70"}`}
              onClick={() => {
                setView(item.id);
                window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
              }}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={18} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
