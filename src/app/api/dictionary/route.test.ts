import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const upstreamEntry = [
  {
    word: "hello",
    phonetic: "həˈləʊ",
    phonetics: [
      {
        text: "həˈləʊ",
        audio: "//ssl.gstatic.com/dictionary/static/sounds/hello.mp3",
      },
    ],
    meanings: [
      {
        partOfSpeech: "exclamation",
        definitions: [
          {
            definition: "Used as a greeting.",
            example: "Hello there!",
            synonyms: ["hi"],
            antonyms: [],
          },
        ],
      },
    ],
    sourceUrls: ["https://en.wiktionary.org/wiki/hello"],
    license: {
      name: "CC BY-SA 3.0",
      url: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  },
];

describe("GET /api/dictionary", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("rejects a missing or unsafe query before calling the upstream API", async () => {
    const missingResponse = await GET(
      new Request("http://localhost/api/dictionary"),
    );
    const unsafeResponse = await GET(
      new Request("http://localhost/api/dictionary?q=hello%3Cscript%3E"),
    );

    expect(missingResponse.status).toBe(400);
    expect(unsafeResponse.status).toBe(400);
    await expect(unsafeResponse.json()).resolves.toMatchObject({
      error: { code: "INVALID_QUERY" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes the validated term and returns normalized dictionary data", async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        {
          ...upstreamEntry[0],
          word: "ice cream",
        },
      ]),
    );

    const response = await GET(
      new Request("http://localhost/api/dictionary?q=%20ice%20%20cream%20"),
    );
    const payload = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dictionaryapi.dev/api/v2/entries/en/ice%20cream",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(payload).toMatchObject({
      query: "ice cream",
      entries: [
        {
          word: "ice cream",
          phonetics: [
            {
              audio:
                "https://ssl.gstatic.com/dictionary/static/sounds/hello.mp3",
            },
          ],
          meanings: [
            {
              partOfSpeech: "exclamation",
              definitions: [{ definition: "Used as a greeting." }],
            },
          ],
        },
      ],
    });
  });

  it("maps an upstream 404 to a useful same-origin 404", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ title: "No Definitions Found" }, { status: 404 }),
    );

    const response = await GET(
      new Request("http://localhost/api/dictionary?q=notaword"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message:
          "No dictionary entry was found for “notaword”. Check the spelling or try another word.",
      },
    });
  });

  it("maps upstream failures without exposing provider details", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ internal: "rate limit token" }, { status: 429 }),
    );

    const response = await GET(
      new Request("http://localhost/api/dictionary?q=hello"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message:
          "The dictionary is unavailable right now. Try again in a moment.",
      },
    });
  });

  it("maps network errors to a retryable response", async () => {
    fetchMock.mockRejectedValue(new TypeError("network failed"));

    const response = await GET(
      new Request("http://localhost/api/dictionary?q=hello"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_ERROR" },
    });
  });
});

