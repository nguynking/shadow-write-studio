export type DictionaryPhonetic = {
  text?: string;
  audio?: string;
  sourceUrl?: string;
};

export type DictionaryDefinition = {
  definition: string;
  example?: string;
  synonyms: string[];
  antonyms: string[];
};

export type DictionaryMeaning = {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
};

export type DictionaryLicense = {
  name: string;
  url: string;
};

export type DictionaryEntry = {
  word: string;
  phonetic?: string;
  phonetics: DictionaryPhonetic[];
  meanings: DictionaryMeaning[];
  sourceUrls: string[];
  license?: DictionaryLicense;
};

export type DictionarySuccessResponse = {
  query: string;
  entries: DictionaryEntry[];
};

export type DictionaryErrorCode =
  | "INVALID_QUERY"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR";

export type DictionaryErrorResponse = {
  error: {
    code: DictionaryErrorCode;
    message: string;
  };
};

export type DictionaryApiResponse =
  | DictionarySuccessResponse
  | DictionaryErrorResponse;

