import { describe, expect, it } from "vitest";

import {
  EMPTY_LEARNING_STATS,
  STORAGE_KEYS,
  STORAGE_VERSION,
  addAttempt,
  clearLearningData,
  loadAttempts,
  loadLearningStats,
  loadSavedSentences,
  loadSavedWords,
  saveLearningStats,
  saveSavedSentences,
  type StorageLike,
  updateLearningStats,
  upsertSavedSentence,
  upsertSavedWord,
  writeVersionedStorage,
} from "./storage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const sentence = {
  id: "sentence-1",
  text: "Practice makes progress.",
  videoId: "video-1",
  videoTitle: "How to keep learning",
  startSeconds: 12.5,
  endSeconds: 15.2,
  savedAt: "2026-08-30T00:00:00.000Z",
};

describe("versioned learning storage", () => {
  it("round-trips saved sentences inside a versioned envelope", () => {
    const storage = new MemoryStorage();
    expect(saveSavedSentences([sentence], storage)).toBe(true);
    expect(loadSavedSentences(storage)).toEqual([sentence]);
    expect(JSON.parse(storage.values.get(STORAGE_KEYS.savedSentences)!)).toEqual({
      version: STORAGE_VERSION,
      data: [sentence],
    });
  });

  it("uses safe defaults for corrupt or incompatible data", () => {
    const storage = new MemoryStorage();
    storage.values.set(STORAGE_KEYS.savedSentences, "not json");
    expect(loadSavedSentences(storage)).toEqual([]);

    storage.values.set(
      STORAGE_KEYS.savedSentences,
      JSON.stringify({ version: STORAGE_VERSION + 1, data: [sentence] }),
    );
    expect(loadSavedSentences(storage)).toEqual([]);

    storage.values.set(
      STORAGE_KEYS.savedSentences,
      JSON.stringify({ version: STORAGE_VERSION, data: [{ id: 1 }] }),
    );
    expect(loadSavedSentences(storage)).toEqual([]);
  });

  it("safely no-ops when browser storage is unavailable", () => {
    expect(loadSavedSentences(null)).toEqual([]);
    expect(saveSavedSentences([sentence], null)).toBe(false);
    expect(writeVersionedStorage("key", { value: true }, null)).toBe(false);
  });

  it("upserts saved content by id, newest first", () => {
    const storage = new MemoryStorage();
    upsertSavedSentence(sentence, storage);
    upsertSavedSentence({ ...sentence, text: "Updated sentence." }, storage);
    upsertSavedSentence({ ...sentence, id: "sentence-2" }, storage);

    expect(loadSavedSentences(storage).map(({ id, text }) => ({ id, text }))).toEqual(
      [
        { id: "sentence-2", text: "Practice makes progress." },
        { id: "sentence-1", text: "Updated sentence." },
      ],
    );

    upsertSavedWord(
      {
        id: "word-1",
        word: "progress",
        savedAt: "2026-08-30T00:00:00.000Z",
      },
      storage,
    );
    expect(loadSavedWords(storage)).toHaveLength(1);
  });

  it("stores attempts and updates aggregate stats", () => {
    const storage = new MemoryStorage();
    addAttempt(
      {
        id: "attempt-1",
        type: "rebuild",
        createdAt: "2026-08-30T00:00:00.000Z",
        score: 80,
      },
      storage,
    );
    expect(loadAttempts(storage)).toHaveLength(1);

    expect(loadLearningStats(storage)).toEqual(EMPTY_LEARNING_STATS);
    expect(
      updateLearningStats(
        (current) => ({
          ...current,
          totalAttempts: current.totalAttempts + 1,
          rebuildAttempts: current.rebuildAttempts + 1,
          averageAccuracy: 80,
        }),
        storage,
      ),
    ).toBe(true);
    expect(loadLearningStats(storage)).toMatchObject({
      totalAttempts: 1,
      rebuildAttempts: 1,
      averageAccuracy: 80,
    });
  });

  it("does not throw when the storage implementation rejects access", () => {
    const blockedStorage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(loadLearningStats(blockedStorage)).toEqual(EMPTY_LEARNING_STATS);
    expect(saveLearningStats({ ...EMPTY_LEARNING_STATS }, blockedStorage)).toBe(
      false,
    );
    expect(clearLearningData(blockedStorage)).toBe(false);
  });

  it("clears every learning collection", () => {
    const storage = new MemoryStorage();
    saveSavedSentences([sentence], storage);
    saveLearningStats({ ...EMPTY_LEARNING_STATS, totalAttempts: 3 }, storage);
    expect(clearLearningData(storage)).toBe(true);
    expect(storage.values.size).toBe(0);
  });
});
