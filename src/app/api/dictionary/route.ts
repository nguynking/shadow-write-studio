import type {
  DictionaryDefinition,
  DictionaryEntry,
  DictionaryErrorCode,
  DictionaryErrorResponse,
  DictionaryLicense,
  DictionaryMeaning,
  DictionaryPhonetic,
  DictionarySuccessResponse,
} from "@/types/dictionary";

const DICTIONARY_API_URL =
  "https://api.dictionaryapi.dev/api/v2/entries/en";
const DATAMUSE_API_URL = "https://api.datamuse.com/words";
const DATAMUSE_SOURCE_URL = "https://www.datamuse.com/api/";
const MAX_QUERY_LENGTH = 64;
const ENGLISH_TERM_PATTERN =
  /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;

type UnknownRecord = Record<string, unknown>;

function errorResponse(
  status: number,
  code: DictionaryErrorCode,
  message: string,
) {
  const body: DictionaryErrorResponse = { error: { code, message } };

  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeQuery(value: string | null) {
  if (!value) return null;

  const query = value.normalize("NFKC").trim().replace(/\s+/g, " ");

  if (
    query.length === 0 ||
    query.length > MAX_QUERY_LENGTH ||
    !ENGLISH_TERM_PATTERN.test(query)
  ) {
    return null;
  }

  return query;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(asTrimmedString)
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
}

function asHttpsUrl(value: unknown) {
  const rawUrl = asTrimmedString(value);
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizePhonetic(value: unknown): DictionaryPhonetic | null {
  const phonetic = asRecord(value);
  if (!phonetic) return null;

  const text = asTrimmedString(phonetic.text);
  const audio = asHttpsUrl(phonetic.audio);
  const sourceUrl = asHttpsUrl(phonetic.sourceUrl);

  if (!text && !audio) return null;
  return { text, audio, sourceUrl };
}

function normalizeDefinition(value: unknown): DictionaryDefinition | null {
  const definition = asRecord(value);
  const text = asTrimmedString(definition?.definition);
  if (!definition || !text) return null;

  return {
    definition: text,
    example: asTrimmedString(definition.example),
    synonyms: asStringArray(definition.synonyms),
    antonyms: asStringArray(definition.antonyms),
  };
}

function normalizeMeaning(value: unknown): DictionaryMeaning | null {
  const meaning = asRecord(value);
  const partOfSpeech = asTrimmedString(meaning?.partOfSpeech);

  if (!meaning || !partOfSpeech || !Array.isArray(meaning.definitions)) {
    return null;
  }

  const definitions = meaning.definitions
    .map(normalizeDefinition)
    .filter((item): item is DictionaryDefinition => Boolean(item))
    .slice(0, 8);

  if (definitions.length === 0) return null;
  return { partOfSpeech, definitions };
}

function normalizeLicense(value: unknown): DictionaryLicense | undefined {
  const license = asRecord(value);
  const name = asTrimmedString(license?.name);
  const url = asHttpsUrl(license?.url);

  return license && name && url ? { name, url } : undefined;
}

function normalizeEntry(value: unknown): DictionaryEntry | null {
  const entry = asRecord(value);
  const word = asTrimmedString(entry?.word);

  if (!entry || !word) return null;

  const phonetics = Array.isArray(entry.phonetics)
    ? entry.phonetics
        .map(normalizePhonetic)
        .filter((item): item is DictionaryPhonetic => Boolean(item))
        .slice(0, 8)
    : [];

  const meanings = Array.isArray(entry.meanings)
    ? entry.meanings
        .map(normalizeMeaning)
        .filter((item): item is DictionaryMeaning => Boolean(item))
        .slice(0, 8)
    : [];

  if (meanings.length === 0) return null;

  return {
    word,
    phonetic: asTrimmedString(entry.phonetic),
    phonetics,
    meanings,
    sourceUrls: Array.isArray(entry.sourceUrls)
      ? entry.sourceUrls
          .map(asHttpsUrl)
          .filter((item): item is string => Boolean(item))
          .slice(0, 4)
      : [],
    license: normalizeLicense(entry.license),
  };
}

function normalizeEntries(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeEntry)
    .filter((item): item is DictionaryEntry => Boolean(item))
    .slice(0, 4);
}

const DATAMUSE_PARTS_OF_SPEECH: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "other",
};

function normalizeDatamuseEntries(value: unknown, query: string) {
  if (!Array.isArray(value)) return [];

  const exactResult = value
    .map(asRecord)
    .find(
      (result) =>
        asTrimmedString(result?.word)?.toLocaleLowerCase("en-US") ===
        query.toLocaleLowerCase("en-US"),
    );
  if (!exactResult || !Array.isArray(exactResult.defs)) return [];

  const meanings = new Map<string, DictionaryDefinition[]>();
  for (const rawDefinition of exactResult.defs) {
    const definition = asTrimmedString(rawDefinition);
    if (!definition) continue;

    const separator = definition.indexOf("\t");
    const rawPart = separator >= 0 ? definition.slice(0, separator) : "u";
    const text = separator >= 0 ? definition.slice(separator + 1) : definition;
    const partOfSpeech = DATAMUSE_PARTS_OF_SPEECH[rawPart] ?? rawPart;
    const existing = meanings.get(partOfSpeech) ?? [];
    if (existing.length >= 3 || !text.trim()) continue;
    existing.push({
      definition: text.trim(),
      synonyms: [],
      antonyms: [],
    });
    meanings.set(partOfSpeech, existing);
  }

  if (meanings.size === 0) return [];
  const tags = asStringArray(exactResult.tags);
  const phonetic = tags.find((tag) => tag.startsWith("pron:"))?.slice(5);
  const entry: DictionaryEntry = {
    word: asTrimmedString(exactResult.word) ?? query,
    phonetic,
    phonetics: phonetic ? [{ text: phonetic }] : [],
    meanings: Array.from(meanings, ([partOfSpeech, definitions]) => ({
      partOfSpeech,
      definitions,
    })),
    sourceUrls: [DATAMUSE_SOURCE_URL],
  };

  return [entry];
}

async function fetchDatamuseFallback(query: string) {
  try {
    const url = new URL(DATAMUSE_API_URL);
    url.searchParams.set("sp", query);
    url.searchParams.set("qe", "sp");
    url.searchParams.set("md", "dpr");
    url.searchParams.set("ipa", "1");
    url.searchParams.set("max", "3");
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    return normalizeDatamuseEntries(await response.json(), query);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const query = normalizeQuery(new URL(request.url).searchParams.get("q"));

  if (!query) {
    return errorResponse(
      400,
      "INVALID_QUERY",
      "Enter one English word or phrase using letters, spaces, apostrophes, or hyphens.",
    );
  }

  let entries: DictionaryEntry[] = [];
  let primaryNotFound = false;

  try {
    const upstream = await fetch(
      `${DICTIONARY_API_URL}/${encodeURIComponent(query)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(4_500),
      },
    );
    primaryNotFound = upstream.status === 404;
    if (upstream.ok) entries = normalizeEntries(await upstream.json());
  } catch {
    entries = [];
  }

  if (entries.length === 0) entries = await fetchDatamuseFallback(query);

  if (entries.length === 0 && primaryNotFound) {
    return errorResponse(
      404,
      "NOT_FOUND",
      `No dictionary entry was found for \u201c${query}\u201d. Check the spelling or try another word.`,
    );
  }

  if (entries.length === 0) {
    return errorResponse(
      502,
      "UPSTREAM_ERROR",
      "The dictionary is unavailable right now. Try again in a moment.",
    );
  }

  const response: DictionarySuccessResponse = { query, entries };

  return Response.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
