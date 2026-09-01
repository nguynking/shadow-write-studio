/** Browser-only persistence for learning progress. All operations fail safely. */

export const STORAGE_VERSION = 1;

export const STORAGE_KEYS = {
  savedSentences: "shadow-write.saved-sentences",
  savedWords: "shadow-write.saved-words",
  attempts: "shadow-write.attempts",
  stats: "shadow-write.stats",
} as const;

export interface SavedSentence {
  id: string;
  text: string;
  videoId: string;
  videoTitle: string;
  startSeconds: number;
  endSeconds: number;
  savedAt: string;
}

export interface SavedWord {
  id: string;
  word: string;
  definition?: string;
  example?: string;
  videoId?: string;
  startSeconds?: number;
  savedAt: string;
}

export type AttemptType = "recording" | "rebuild" | "personalize";

export interface LearningAttempt {
  id: string;
  type: AttemptType;
  createdAt: string;
  sentenceId?: string;
  prompt?: string;
  response?: string;
  score?: number;
  durationSeconds?: number;
}

export interface LearningStats {
  totalAttempts: number;
  recordingAttempts: number;
  rebuildAttempts: number;
  personalizeAttempts: number;
  averageAccuracy: number;
  streakDays: number;
  totalPracticeSeconds: number;
  lastPracticedAt?: string;
  updatedAt?: string;
}

export const EMPTY_LEARNING_STATS: Readonly<LearningStats> = Object.freeze({
  totalAttempts: 0,
  recordingAttempts: 0,
  rebuildAttempts: 0,
  personalizeAttempts: 0,
  averageAccuracy: 0,
  streakDays: 0,
  totalPracticeSeconds: 0,
});

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StorageEnvelope<T> {
  version: number;
  data: T;
}

type Validator<T> = (value: unknown) => value is T;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    // Access can throw when storage is blocked by the browser or an iframe.
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isSavedSentence(value: unknown): value is SavedSentence {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.savedAt === "string" &&
    typeof value.videoId === "string" &&
    typeof value.videoTitle === "string" &&
    isFiniteNumber(value.startSeconds) &&
    isFiniteNumber(value.endSeconds)
  );
}

function isSavedWord(value: unknown): value is SavedWord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.word === "string" &&
    typeof value.savedAt === "string" &&
    isOptionalString(value.definition) &&
    isOptionalString(value.example) &&
    isOptionalString(value.videoId) &&
    isOptionalNumber(value.startSeconds)
  );
}

function isLearningAttempt(value: unknown): value is LearningAttempt {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.type === "recording" ||
      value.type === "rebuild" ||
      value.type === "personalize") &&
    typeof value.createdAt === "string" &&
    isOptionalString(value.sentenceId) &&
    isOptionalString(value.prompt) &&
    isOptionalString(value.response) &&
    isOptionalNumber(value.score) &&
    isOptionalNumber(value.durationSeconds)
  );
}

function isLearningStats(value: unknown): value is LearningStats {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.totalAttempts) &&
    isFiniteNumber(value.recordingAttempts) &&
    isFiniteNumber(value.rebuildAttempts) &&
    isFiniteNumber(value.personalizeAttempts) &&
    isFiniteNumber(value.averageAccuracy) &&
    isFiniteNumber(value.streakDays) &&
    isFiniteNumber(value.totalPracticeSeconds) &&
    isOptionalString(value.lastPracticedAt) &&
    isOptionalString(value.updatedAt)
  );
}

function isArrayOf<T>(validator: Validator<T>): Validator<T[]> {
  return (value: unknown): value is T[] =>
    Array.isArray(value) && value.every(validator);
}

/**
 * Read one versioned value. Invalid JSON, an unknown schema version, blocked
 * storage, and server rendering all produce the supplied fallback.
 */
export function readVersionedStorage<T>(
  key: string,
  fallback: T,
  validate: Validator<T>,
  storage: StorageLike | null = getBrowserStorage(),
): T {
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallback;
    if (parsed.version !== STORAGE_VERSION || !validate(parsed.data)) {
      return fallback;
    }
    return parsed.data;
  } catch {
    return fallback;
  }
}

/** Return false instead of throwing on SSR, private mode, or quota failures. */
export function writeVersionedStorage<T>(
  key: string,
  data: T,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;

  const envelope: StorageEnvelope<T> = {
    version: STORAGE_VERSION,
    data,
  };

  try {
    storage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

function removeStoredValue(
  key: string,
  storage: StorageLike | null,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadSavedSentences(
  storage: StorageLike | null = getBrowserStorage(),
): SavedSentence[] {
  return readVersionedStorage(
    STORAGE_KEYS.savedSentences,
    [],
    isArrayOf(isSavedSentence),
    storage,
  );
}

export function saveSavedSentences(
  sentences: SavedSentence[],
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  return writeVersionedStorage(STORAGE_KEYS.savedSentences, sentences, storage);
}

export function upsertSavedSentence(
  sentence: SavedSentence,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  const existing = loadSavedSentences(storage);
  const next = [sentence, ...existing.filter((item) => item.id !== sentence.id)];
  return saveSavedSentences(next, storage);
}

export function removeSavedSentence(
  id: string,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  const existing = loadSavedSentences(storage);
  return saveSavedSentences(
    existing.filter((item) => item.id !== id),
    storage,
  );
}

export function loadSavedWords(
  storage: StorageLike | null = getBrowserStorage(),
): SavedWord[] {
  return readVersionedStorage(
    STORAGE_KEYS.savedWords,
    [],
    isArrayOf(isSavedWord),
    storage,
  );
}

export function saveSavedWords(
  words: SavedWord[],
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  return writeVersionedStorage(STORAGE_KEYS.savedWords, words, storage);
}

export function upsertSavedWord(
  word: SavedWord,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  const existing = loadSavedWords(storage);
  const next = [word, ...existing.filter((item) => item.id !== word.id)];
  return saveSavedWords(next, storage);
}

export function removeSavedWord(
  id: string,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  const existing = loadSavedWords(storage);
  return saveSavedWords(
    existing.filter((item) => item.id !== id),
    storage,
  );
}

export function loadAttempts(
  storage: StorageLike | null = getBrowserStorage(),
): LearningAttempt[] {
  return readVersionedStorage(
    STORAGE_KEYS.attempts,
    [],
    isArrayOf(isLearningAttempt),
    storage,
  );
}

export function saveAttempts(
  attempts: LearningAttempt[],
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  return writeVersionedStorage(STORAGE_KEYS.attempts, attempts, storage);
}

export function addAttempt(
  attempt: LearningAttempt,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  const existing = loadAttempts(storage);
  return saveAttempts(
    [attempt, ...existing.filter((item) => item.id !== attempt.id)],
    storage,
  );
}

export function loadLearningStats(
  storage: StorageLike | null = getBrowserStorage(),
): LearningStats {
  return readVersionedStorage(
    STORAGE_KEYS.stats,
    { ...EMPTY_LEARNING_STATS },
    isLearningStats,
    storage,
  );
}

export function saveLearningStats(
  stats: LearningStats,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  return writeVersionedStorage(STORAGE_KEYS.stats, stats, storage);
}

export function updateLearningStats(
  update:
    | Partial<LearningStats>
    | ((current: LearningStats) => LearningStats),
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  const current = loadLearningStats(storage);
  const next =
    typeof update === "function" ? update(current) : { ...current, ...update };
  return saveLearningStats(next, storage);
}

export function clearLearningData(
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  let cleared = true;
  for (const key of Object.values(STORAGE_KEYS) as string[]) {
    cleared = removeStoredValue(key, storage) && cleared;
  }
  return cleared;
}

/** Convenient namespaced API for client components. */
export const learningStorage = {
  loadSavedSentences,
  saveSavedSentences,
  upsertSavedSentence,
  removeSavedSentence,
  loadSavedWords,
  saveSavedWords,
  upsertSavedWord,
  removeSavedWord,
  loadAttempts,
  saveAttempts,
  addAttempt,
  loadLearningStats,
  saveLearningStats,
  updateLearningStats,
  clearLearningData,
};
