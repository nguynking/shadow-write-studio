import type {
  CaptionFormat,
  RawTranscriptSegment,
  TranscriptChunk,
} from "@/types/learning";

const MIN_CHUNK_SECONDS = 3;
const MAX_CHUNK_SECONDS = 12;
const SOFT_CHUNK_SECONDS = 8;
const MAX_CAPTION_GAP_SECONDS = 1.5;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

export function decodeHtmlEntities(value: string): string {
  let decoded = value;

  // Two passes also handle strings such as `&amp;#39;` without a DOM dependency.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(
      /&(#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi,
      (entity, body: string) => {
        if (body[0] !== "#") {
          return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
        }

        const hexadecimal = body[1]?.toLowerCase() === "x";
        const numberText = body.slice(hexadecimal ? 2 : 1);
        const codePoint = Number.parseInt(numberText, hexadecimal ? 16 : 10);

        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
          return entity;
        }

        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      },
    );

    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

export function parseCaptionTimestamp(value: string): number | null {
  const match = value
    .trim()
    .match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);

  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number((match[4] ?? "0").padEnd(3, "0"));

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    seconds >= 60 ||
    (match[1] && minutes >= 60)
  ) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function cleanCueText(lines: string[]): string {
  const withoutMarkup = lines
    .join(" ")
    .replace(/\{\\[^}]+}/g, " ")
    .replace(/<[^>]*>/g, " ");

  return decodeHtmlEntities(withoutMarkup)
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCueTiming(line: string): { start: number; end: number } | null {
  const arrowIndex = line.indexOf("-->");
  if (arrowIndex < 0) return null;

  const startText = line.slice(0, arrowIndex).trim();
  // Cue settings, when present, begin after whitespace following the end time.
  const endText = line
    .slice(arrowIndex + 3)
    .trim()
    .split(/\s+/, 1)[0];
  const start = parseCaptionTimestamp(startText);
  const end = parseCaptionTimestamp(endText);

  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function parseTimedCaptionText(text: string, kind: CaptionFormat): RawTranscriptSegment[] {
  const lines = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n");
  const segments: RawTranscriptSegment[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line || (kind === "vtt" && /^WEBVTT(?:\s|$)/i.test(line))) {
      index += 1;
      continue;
    }

    if (kind === "vtt" && /^(NOTE|STYLE|REGION)(?:\s|$)/i.test(line)) {
      index += 1;
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }

    let timing = parseCueTiming(line);
    if (!timing && index + 1 < lines.length) {
      // Both SRT indexes and optional VTT cue identifiers occupy this line.
      timing = parseCueTiming(lines[index + 1]);
      if (timing) index += 1;
    }

    if (!timing) {
      index += 1;
      continue;
    }

    index += 1;
    const cueLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      // Recover gracefully from caption files that omit a blank line between cues.
      if (parseCueTiming(lines[index])) break;
      cueLines.push(lines[index]);
      index += 1;
    }

    const cueText = cleanCueText(cueLines);
    if (cueText) {
      segments.push({
        text: cueText,
        startSeconds: roundTimestamp(timing.start),
        endSeconds: roundTimestamp(timing.end),
      });
    }
  }

  return segments.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function parseVtt(text: string): RawTranscriptSegment[] {
  return parseTimedCaptionText(text, "vtt");
}

export function parseSrt(text: string): RawTranscriptSegment[] {
  return parseTimedCaptionText(text, "srt");
}

export const parseVTT = parseVtt;
export const parseSRT = parseSrt;

export function detectCaptionFormat(text: string): CaptionFormat {
  const normalized = text.replace(/^\ufeff/, "").trimStart();
  if (/^WEBVTT(?:\s|$)/i.test(normalized)) return "vtt";
  if (/^(?:\d+\s*\n)?\d{1,3}:\d{2}:\d{2},\d{1,3}\s*-->/m.test(normalized)) {
    return "srt";
  }
  return "vtt";
}

export function parsePastedTranscript(
  text: string,
  format: CaptionFormat = detectCaptionFormat(text),
): RawTranscriptSegment[] {
  return format === "srt" ? parseSrt(text) : parseVtt(text);
}

function roundTimestamp(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeSegments(segments: RawTranscriptSegment[]): RawTranscriptSegment[] {
  return segments
    .map((segment) => ({
      text: decodeHtmlEntities(segment.text).replace(/\s+/g, " ").trim(),
      startSeconds: Math.max(0, Number(segment.startSeconds)),
      endSeconds: Math.max(0, Number(segment.endSeconds)),
    }))
    .filter(
      (segment) =>
        segment.text &&
        Number.isFinite(segment.startSeconds) &&
        Number.isFinite(segment.endSeconds) &&
        segment.endSeconds > segment.startSeconds,
    )
    .sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);
}

function splitOversizedSegment(segment: RawTranscriptSegment): RawTranscriptSegment[] {
  const duration = segment.endSeconds - segment.startSeconds;
  if (duration <= MAX_CHUNK_SECONDS) return [segment];

  const words = segment.text.split(/\s+/).filter(Boolean);
  const pieceCount = Math.ceil(duration / MAX_CHUNK_SECONDS);
  if (words.length < pieceCount) return [segment];

  const pieces: RawTranscriptSegment[] = [];
  let wordIndex = 0;

  for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
    const piecesLeft = pieceCount - pieceIndex;
    const wordsLeft = words.length - wordIndex;
    const idealWords = Math.ceil(wordsLeft / piecesLeft);
    let endWordIndex = Math.min(words.length, wordIndex + idealWords);

    // Prefer a nearby spoken clause boundary over a mechanical word cut.
    const searchStart = Math.max(wordIndex + 1, endWordIndex - 2);
    const latestEndWithinMaximum = Math.floor(
      (startRatioForWord(wordIndex, words.length) + MAX_CHUNK_SECONDS / duration) *
        words.length,
    );
    const searchEnd = Math.min(
      words.length - (piecesLeft - 1),
      endWordIndex + 2,
      latestEndWithinMaximum,
    );
    for (let candidate = searchStart; candidate <= searchEnd; candidate += 1) {
      if (/[.!?,;:]$/.test(words[candidate - 1])) {
        endWordIndex = candidate;
      }
    }

    const startRatio = wordIndex / words.length;
    const endRatio = endWordIndex / words.length;
    pieces.push({
      text: words.slice(wordIndex, endWordIndex).join(" "),
      startSeconds: roundTimestamp(segment.startSeconds + duration * startRatio),
      endSeconds: roundTimestamp(segment.startSeconds + duration * endRatio),
    });
    wordIndex = endWordIndex;
  }

  return pieces;
}

function startRatioForWord(wordIndex: number, wordCount: number): number {
  return wordIndex / wordCount;
}

function appendWithoutRollingDuplicate(existing: string, addition: string): string {
  if (!existing) return addition;

  const oldWords = existing.split(/\s+/);
  const newWords = addition.split(/\s+/);
  const normalizedOld = oldWords.map((word) => word.toLocaleLowerCase());
  const normalizedNew = newWords.map((word) => word.toLocaleLowerCase());

  if (
    newWords.length >= oldWords.length &&
    normalizedOld.every((word, index) => word === normalizedNew[index])
  ) {
    return addition;
  }

  const maximumOverlap = Math.min(oldWords.length, newWords.length);
  for (let overlap = maximumOverlap; overlap >= 2; overlap -= 1) {
    const oldSuffix = normalizedOld.slice(-overlap).join(" ");
    const newPrefix = normalizedNew.slice(0, overlap).join(" ");
    if (oldSuffix === newPrefix) {
      return `${existing} ${newWords.slice(overlap).join(" ")}`.trim();
    }
  }

  return `${existing} ${addition}`;
}

function isSentenceEnd(text: string): boolean {
  return /[.!?…]["'”’\])}]*$/.test(text);
}

function isClauseEnd(text: string): boolean {
  return /[,;:]["'”’\])}]*$/.test(text);
}

interface PendingChunk {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

function combinePending(first: PendingChunk, second: PendingChunk): PendingChunk {
  return {
    text: appendWithoutRollingDuplicate(first.text, second.text),
    startSeconds: first.startSeconds,
    endSeconds: Math.max(first.endSeconds, second.endSeconds),
  };
}

/**
 * Groups caption fragments into short, speakable units. Chunk timestamps always
 * use the first and last contributing cue boundaries, so clicking a chunk seeks
 * to the earliest audio needed to shadow it.
 */
export function chunkTranscriptSegments(
  inputSegments: RawTranscriptSegment[],
): TranscriptChunk[] {
  const segments = normalizeSegments(inputSegments).flatMap(splitOversizedSegment);
  if (segments.length === 0) return [];

  const pendingChunks: PendingChunk[] = [];
  let current: PendingChunk | null = null;

  const flush = () => {
    if (!current) return;
    pendingChunks.push(current);
    current = null;
  };

  for (const segment of segments) {
    if (!current) {
      current = { ...segment };
    } else {
      const gap = segment.startSeconds - current.endSeconds;
      const combinedEnd = Math.max(current.endSeconds, segment.endSeconds);
      const combinedDuration = combinedEnd - current.startSeconds;

      if (gap > MAX_CAPTION_GAP_SECONDS || combinedDuration > MAX_CHUNK_SECONDS) {
        flush();
        current = { ...segment };
      } else {
        current = combinePending(current, segment);
      }
    }

    const duration = current.endSeconds - current.startSeconds;
    if (
      (duration >= MIN_CHUNK_SECONDS && isSentenceEnd(current.text)) ||
      (duration >= 6 && isClauseEnd(current.text)) ||
      duration >= SOFT_CHUNK_SECONDS
    ) {
      flush();
    }
  }

  flush();

  // A tiny final cue is easier to shadow as part of its preceding thought when
  // doing so still respects the 12-second upper bound.
  if (pendingChunks.length > 1) {
    const last = pendingChunks[pendingChunks.length - 1];
    const previous = pendingChunks[pendingChunks.length - 2];
    const lastDuration = last.endSeconds - last.startSeconds;
    const combinedDuration = last.endSeconds - previous.startSeconds;
    const gap = last.startSeconds - previous.endSeconds;

    if (
      lastDuration < MIN_CHUNK_SECONDS &&
      gap <= MAX_CAPTION_GAP_SECONDS &&
      combinedDuration <= MAX_CHUNK_SECONDS
    ) {
      pendingChunks.splice(
        pendingChunks.length - 2,
        2,
        combinePending(previous, last),
      );
    }
  }

  return pendingChunks.map((chunk, index) => ({
    id: `chunk-${String(index + 1).padStart(3, "0")}`,
    index,
    text: chunk.text,
    startSeconds: roundTimestamp(chunk.startSeconds),
    endSeconds: roundTimestamp(chunk.endSeconds),
    durationSeconds: roundTimestamp(chunk.endSeconds - chunk.startSeconds),
  }));
}

export const mergeTranscriptSegments = chunkTranscriptSegments;
