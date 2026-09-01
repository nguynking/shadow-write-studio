"use client";

import {
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Lightbulb,
  Mic2,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from "react";

import { AudioRecorder } from "@/components/audio-recorder";
import {
  checkWriting,
  diffWords,
  getAccuracyResult,
  type AccuracyResult,
  type WordDiff,
  type WritingChecklist,
} from "@/lib/scoring";

export type PracticeAttempt = {
  type: "recording" | "rebuild" | "personalize";
  response?: string;
  score?: number;
};

type TranscriptChunk = {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
};

type PracticePanelProps = {
  chunk: TranscriptChunk;
  onReplay: () => void;
  onAttempt: (attempt: PracticeAttempt) => void;
};

type PracticeMode = "shadow" | "rebuild" | "personalize";

const MODES: Array<{ id: PracticeMode; label: string }> = [
  { id: "shadow", label: "Shadow" },
  { id: "rebuild", label: "Rebuild" },
  { id: "personalize", label: "Make it yours" },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function deriveTargetPhrase(sentence: string) {
  const words =
    sentence.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const phraseLength = Math.min(4, words.length);
  return words.slice(0, phraseLength).join(" ");
}

function DifferenceBadge({ difference }: { difference: WordDiff }) {
  if (difference.status === "correct") {
    return (
      <span className="inline-flex min-h-8 max-w-full items-center gap-1 break-words rounded-lg bg-[var(--positive-soft)] px-2.5 py-1 text-sm font-semibold text-[var(--positive)]">
        <Check aria-hidden="true" size={14} strokeWidth={3} />
        {difference.actual}
        <span className="sr-only">, correct</span>
      </span>
    );
  }

  if (difference.status === "missing") {
    return (
      <span className="inline-flex min-h-8 max-w-full items-center break-words rounded-lg bg-[var(--danger-soft)] px-2.5 py-1 text-sm font-semibold text-[var(--danger)]">
        {difference.expected}
        <span className="ml-1 font-normal">(missing)</span>
      </span>
    );
  }

  if (difference.status === "extra") {
    return (
      <span className="inline-flex min-h-8 max-w-full items-center break-words rounded-lg bg-[var(--surface-warm)] px-2.5 py-1 text-sm font-semibold text-[var(--warning)] line-through decoration-2">
        {difference.actual}
        <span className="sr-only">, extra word</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex min-h-8 max-w-full items-center gap-1.5 break-words rounded-lg bg-[var(--surface-warm)] px-2.5 py-1 text-sm font-semibold text-[var(--warning)]"
      aria-label={`${difference.actual ?? "word"}, replace with ${difference.expected ?? "the expected word"}`}
    >
      <span className="line-through decoration-2" aria-hidden="true">
        {difference.actual}
      </span>
      <span aria-hidden="true">→</span>
      <span aria-hidden="true">{difference.expected}</span>
    </span>
  );
}

function ChecklistItem({
  checked,
  children,
}: {
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 text-sm text-[var(--ink-muted)]">
      {checked ? (
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--positive)]"
          size={18}
        />
      ) : (
        <Circle
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--ink-faint)]"
          size={18}
        />
      )}
      <span>
        {children}
        <span className="sr-only">: {checked ? "complete" : "not yet"}</span>
      </span>
    </li>
  );
}

function PracticePanelSession({
  chunk,
  onReplay,
  onAttempt,
}: PracticePanelProps) {
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rebuildInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeMode, setActiveMode] = useState<PracticeMode>("shadow");
  const [rebuildText, setRebuildText] = useState("");
  const [sentenceHidden, setSentenceHidden] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{
    accuracy: AccuracyResult;
    differences: WordDiff[];
  } | null>(null);
  const [personalSentence, setPersonalSentence] = useState("");
  const [targetPhrase, setTargetPhrase] = useState(() =>
    deriveTargetPhrase(chunk.text),
  );
  const [personalChecklist, setPersonalChecklist] =
    useState<WritingChecklist | null>(null);

  const sentenceIsHidden =
    activeMode === "rebuild" && sentenceHidden && !rebuildResult;

  function selectMode(mode: PracticeMode) {
    setActiveMode(mode);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = MODES.findIndex((mode) => mode.id === activeMode);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % MODES.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + MODES.length) % MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = MODES.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextMode = MODES[nextIndex];
    setActiveMode(nextMode.id);
    tabRefs.current[nextIndex]?.focus();
  }

  function startRebuild() {
    setSentenceHidden(true);
    setRebuildResult(null);
    window.requestAnimationFrame(() => rebuildInputRef.current?.focus());
  }

  function submitRebuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = rebuildText.trim();
    if (!response) return;

    const accuracy = getAccuracyResult(chunk.text, response);
    const differences = diffWords(chunk.text, response);
    setRebuildResult({ accuracy, differences });
    setSentenceHidden(false);
    onAttempt({ type: "rebuild", response, score: accuracy.score });
  }

  function retryRebuild() {
    setRebuildText("");
    setRebuildResult(null);
    setSentenceHidden(true);
    window.requestAnimationFrame(() => rebuildInputRef.current?.focus());
  }

  function submitPersonalSentence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = personalSentence.trim();
    if (!response) return;

    setPersonalChecklist(checkWriting(response, targetPhrase));
    onAttempt({ type: "personalize", response });
  }

  return (
    <section
      className="min-w-0 overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
      aria-labelledby={`${baseId}-title`}
    >
      <div className="border-b border-[var(--border)] px-4 py-5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Selected sentence</p>
            <h2
              id={`${baseId}-title`}
              className="mt-2 break-words text-balance text-lg font-semibold leading-snug tracking-[-0.018em] text-[var(--ink)] sm:text-xl"
            >
              {sentenceIsHidden ? (
                <span className="inline-flex items-center gap-2 text-[var(--ink-muted)]">
                  <EyeOff aria-hidden="true" size={19} />
                  Sentence hidden. Rebuild it from memory.
                </span>
              ) : (
                chunk.text
              )}
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-faint)]">
              {formatTime(chunk.startSeconds)} to {formatTime(chunk.endSeconds)}
            </p>
          </div>
          <button
            type="button"
            className="button secondary-button shrink-0"
            onClick={onReplay}
          >
            <Play aria-hidden="true" size={17} fill="currentColor" />
            Replay
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-3 border-b border-[var(--border)] bg-[var(--surface-subtle)] p-1.5"
        role="tablist"
        aria-label="Practice mode"
      >
        {MODES.map((mode, index) => {
          const selected = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${baseId}-${mode.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={selected ? `${baseId}-${mode.id}-panel` : undefined}
              tabIndex={selected ? 0 : -1}
              className={`min-h-12 min-w-0 rounded-xl px-1.5 py-2 text-center text-xs font-semibold leading-tight transition-colors sm:px-3 sm:text-sm ${
                selected
                  ? "bg-[var(--surface)] text-[var(--brand-strong)] shadow-[var(--shadow-control)]"
                  : "text-[var(--ink-muted)] hover:bg-white/60 hover:text-[var(--ink)]"
              }`}
              onClick={() => selectMode(mode.id)}
              onKeyDown={handleTabKeyDown}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {activeMode === "shadow" ? (
        <div
          id={`${baseId}-shadow-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-shadow-tab`}
          className="space-y-6 p-4 sm:p-6"
        >
          <div>
            <div className="flex items-center gap-2">
              <Mic2 aria-hidden="true" size={20} className="text-[var(--brand)]" />
              <h3 className="font-semibold text-[var(--ink)]">
                Match the speaker
              </h3>
            </div>
            <ol className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)] sm:grid-cols-3">
              {[
                "Replay and notice the rhythm.",
                "Speak with the recording.",
                "Record yourself and compare.",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-2 rounded-xl bg-[var(--surface-subtle)] p-3"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-strong)]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-[var(--border)] p-4">
            <p className="mb-3 text-sm font-semibold text-[var(--ink)]">
              Your recording
            </p>
            <AudioRecorder
              onRecorded={() => onAttempt({ type: "recording" })}
            />
            <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">
              Compare timing and rhythm first. A pronunciation score would be a
              guess, so this practice keeps you in control.
            </p>
          </div>
        </div>
      ) : null}

      {activeMode === "rebuild" ? (
        <div
          id={`${baseId}-rebuild-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-rebuild-tab`}
          className="space-y-5 p-4 sm:p-6"
        >
          <div className="flex items-start gap-3 rounded-2xl bg-[var(--brand-soft)] p-4">
            <Lightbulb
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--brand-strong)]"
              size={19}
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--ink)]">
                Recall the exact sentence
              </h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Read it once, hide it, then type what you remember. This checks
                exact recall, not grammar ability.
              </p>
            </div>
          </div>

          {!sentenceHidden && !rebuildResult ? (
            <button
              type="button"
              className="button secondary-button w-full sm:w-auto"
              onClick={startRebuild}
            >
              <EyeOff aria-hidden="true" size={18} />
              Hide sentence and start
            </button>
          ) : null}

          <form className="space-y-3" onSubmit={submitRebuild}>
            <label className="field-label block" htmlFor={`${baseId}-rebuild`}>
              Rebuild from memory
            </label>
            <textarea
              ref={rebuildInputRef}
              id={`${baseId}-rebuild`}
              className="text-input min-h-28 w-full resize-y"
              value={rebuildText}
              onChange={(event) => setRebuildText(event.target.value)}
              placeholder="Type the sentence here"
              autoComplete="off"
              spellCheck={false}
              disabled={!sentenceHidden || Boolean(rebuildResult)}
              aria-describedby={`${baseId}-rebuild-help`}
            />
            <p
              id={`${baseId}-rebuild-help`}
              className="text-xs text-[var(--ink-faint)]"
            >
              Spelling and word order count. Capitalization and punctuation do
              not affect this score.
            </p>
            {!rebuildResult ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  className="button primary-button w-full sm:w-auto"
                  disabled={!sentenceHidden || !rebuildText.trim()}
                >
                  <Check aria-hidden="true" size={18} />
                  Check my recall
                </button>
                {sentenceHidden ? (
                  <button
                    type="button"
                    className="button ghost-button w-full sm:w-auto"
                    onClick={() => setSentenceHidden(false)}
                  >
                    <Eye aria-hidden="true" size={18} />
                    Show sentence
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

          {rebuildResult ? (
            <div
              className="space-y-4 rounded-2xl border border-[var(--border)] p-4"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-muted)]">
                    Exact recall
                  </p>
                  <p className="text-3xl font-bold tracking-[-0.04em] text-[var(--ink)]">
                    {rebuildResult.accuracy.score}%
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={retryRebuild}
                >
                  <RotateCcw aria-hidden="true" size={17} />
                  Try again
                </button>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">
                  Word by word
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rebuildResult.differences.map((difference, index) => (
                    <DifferenceBadge
                      key={`${difference.status}-${index}-${difference.actual ?? difference.expected}`}
                      difference={difference}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
                Green is correct. Red is missing. Struck-through words are
                extra. A replacement shows what to use instead.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeMode === "personalize" ? (
        <div
          id={`${baseId}-personalize-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-personalize-tab`}
          className="space-y-5 p-4 sm:p-6"
        >
          <div className="flex items-start gap-3 rounded-2xl bg-[var(--positive-soft)] p-4">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--positive)]"
              size={19}
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--ink)]">
                Turn input into your English
              </h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Choose a useful phrase, then write one original sentence about your life.
              </p>
              <label className="field-label mt-3 block" htmlFor={`${baseId}-phrase`}>
                Phrase to reuse
              </label>
              <input
                id={`${baseId}-phrase`}
                className="text-input mt-1.5 min-h-10 w-full bg-white py-2 text-sm"
                value={targetPhrase}
                onChange={(event) => {
                  setTargetPhrase(event.target.value);
                  setPersonalChecklist(null);
                }}
                placeholder="Choose a phrase from the sentence"
              />
            </div>
          </div>

          <form className="space-y-3" onSubmit={submitPersonalSentence}>
            <label className="field-label block" htmlFor={`${baseId}-personal`}>
              Your original sentence
            </label>
            <textarea
              id={`${baseId}-personal`}
              className="text-input min-h-28 w-full resize-y"
              value={personalSentence}
              onChange={(event) => {
                setPersonalSentence(event.target.value);
                setPersonalChecklist(null);
              }}
              placeholder="Connect the phrase to something real in your life"
              aria-describedby={`${baseId}-personal-help`}
            />
            <p
              id={`${baseId}-personal-help`}
              className="text-xs text-[var(--ink-faint)]"
            >
              The checklist checks simple mechanics only. It does not judge
              whether your grammar sounds natural.
            </p>
            <button
              type="submit"
              className="button primary-button w-full sm:w-auto"
              disabled={!personalSentence.trim() || !targetPhrase.trim()}
            >
              <Check aria-hidden="true" size={18} />
              Check my sentence
            </button>
          </form>

          {personalChecklist ? (
            <div
              className="rounded-2xl border border-[var(--border)] p-4"
              aria-live="polite"
            >
              <p className="font-semibold text-[var(--ink)]">
                Quick writing checklist
              </p>
              <ul className="mt-3 space-y-2">
                <ChecklistItem checked={personalChecklist.capitalization}>
                  Starts with a capital letter
                </ChecklistItem>
                <ChecklistItem
                  checked={personalChecklist.terminalPunctuation}
                >
                  Ends with punctuation
                </ChecklistItem>
                <ChecklistItem checked={personalChecklist.targetPhraseIncluded}>
                  Includes “{targetPhrase}”
                </ChecklistItem>
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function PracticePanel({ chunk, onReplay, onAttempt }: PracticePanelProps) {
  return (
    <PracticePanelSession
      key={chunk.id}
      chunk={chunk}
      onReplay={onReplay}
      onAttempt={onAttempt}
    />
  );
}
