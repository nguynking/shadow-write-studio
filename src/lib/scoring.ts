/** Deterministic text feedback used by the writing practice flow. */

export type WordDiffStatus =
  | "correct"
  | "missing"
  | "extra"
  | "substituted";

export interface WordDiff {
  status: WordDiffStatus;
  /** Word from the reference sentence, when one exists. */
  expected?: string;
  /** Word written by the learner, when one exists. */
  actual?: string;
}

export interface AccuracyResult {
  score: number;
  correct: number;
  missing: number;
  extra: number;
  substituted: number;
  expectedWords: number;
  actualWords: number;
}

export interface WritingChecklist {
  capitalization: boolean;
  terminalPunctuation: boolean;
  targetPhraseIncluded: boolean;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;

/**
 * Convert typographic variants to a stable form before comparing text.
 * Punctuation is intentionally excluded because word accuracy and writing
 * mechanics are scored separately.
 */
export function tokenizeWords(input: string): string[] {
  if (!input) return [];

  const canonical = input
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02bc\u0060]/g, "'")
    .toLocaleLowerCase("en-US");

  return canonical.match(WORD_PATTERN) ?? [];
}

/** Alias kept intentionally short for callers doing repeated comparisons. */
export const tokenize = tokenizeWords;

export function normalizeText(input: string): string {
  return tokenizeWords(input).join(" ");
}

/**
 * Align a learner's words to a reference with Levenshtein edit distance.
 * The returned order can be rendered directly as inline writing feedback.
 */
export function diffWords(expectedText: string, actualText: string): WordDiff[] {
  const expected = tokenizeWords(expectedText);
  const actual = tokenizeWords(actualText);
  const rows = expected.length + 1;
  const columns = actual.length + 1;
  const distances = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  );

  for (let row = 1; row < rows; row += 1) distances[row][0] = row;
  for (let column = 1; column < columns; column += 1) {
    distances[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      // A mismatch costs the same as one deletion plus one insertion. This
      // favors alignments that preserve nearby exact matches, while the
      // reconstruction below still presents a lone mismatch as substitution.
      const substitutionCost =
        expected[row - 1] === actual[column - 1] ? 0 : 2;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  const reversed: WordDiff[] = [];
  let row = expected.length;
  let column = actual.length;

  while (row > 0 || column > 0) {
    if (
      row > 0 &&
      column > 0 &&
      expected[row - 1] === actual[column - 1] &&
      distances[row][column] === distances[row - 1][column - 1]
    ) {
      reversed.push({
        status: "correct",
        expected: expected[row - 1],
        actual: actual[column - 1],
      });
      row -= 1;
      column -= 1;
      continue;
    }

    // Prefer a substitution over an equivalent delete + insert alignment.
    if (
      row > 0 &&
      column > 0 &&
      distances[row][column] === distances[row - 1][column - 1] + 2
    ) {
      reversed.push({
        status: "substituted",
        expected: expected[row - 1],
        actual: actual[column - 1],
      });
      row -= 1;
      column -= 1;
      continue;
    }

    if (
      row > 0 &&
      distances[row][column] === distances[row - 1][column] + 1
    ) {
      reversed.push({ status: "missing", expected: expected[row - 1] });
      row -= 1;
      continue;
    }

    reversed.push({ status: "extra", actual: actual[column - 1] });
    column -= 1;
  }

  return reversed.reverse();
}

export function getAccuracyResult(
  expectedText: string,
  actualText: string,
): AccuracyResult {
  const differences = diffWords(expectedText, actualText);
  const expectedWords = tokenizeWords(expectedText).length;
  const actualWords = tokenizeWords(actualText).length;
  const totals: Record<WordDiffStatus, number> = {
    correct: 0,
    missing: 0,
    extra: 0,
    substituted: 0,
  };

  for (const difference of differences) totals[difference.status] += 1;

  const denominator = Math.max(expectedWords, actualWords);
  const edits = totals.missing + totals.extra + totals.substituted;
  const score =
    denominator === 0
      ? 100
      : Math.round(Math.max(0, 1 - edits / denominator) * 100);

  return {
    score,
    ...totals,
    expectedWords,
    actualWords,
  };
}

export function calculateAccuracy(
  expectedText: string,
  actualText: string,
): number {
  return getAccuracyResult(expectedText, actualText).score;
}

function startsWithCapitalLetter(input: string): boolean {
  const firstLetter = input.trim().match(/\p{L}/u)?.[0];
  if (!firstLetter) return false;
  return (
    firstLetter === firstLetter.toLocaleUpperCase("en-US") &&
    firstLetter !== firstLetter.toLocaleLowerCase("en-US")
  );
}

function includesTokenSequence(tokens: string[], target: string[]): boolean {
  if (target.length === 0) return true;
  if (target.length > tokens.length) return false;

  for (let start = 0; start <= tokens.length - target.length; start += 1) {
    if (target.every((token, offset) => tokens[start + offset] === token)) {
      return true;
    }
  }

  return false;
}

/** Check mechanics independently from word accuracy so feedback is actionable. */
export function checkWriting(
  writing: string,
  targetPhrase = "",
): WritingChecklist {
  const trimmed = writing.trim();

  return {
    capitalization: startsWithCapitalLetter(trimmed),
    terminalPunctuation: /[.!?…][\s"'’”)}\]]*$/u.test(trimmed),
    targetPhraseIncluded: includesTokenSequence(
      tokenizeWords(writing),
      tokenizeWords(targetPhrase),
    ),
  };
}

export const getWritingChecklist = checkWriting;
