# ShadowWrite Studio

**Hear it. Rebuild it. Use it.**

ShadowWrite Studio turns short, authentic English clips into active speaking and writing practice. Choose a time-aligned sentence, shadow the speaker, record yourself, rebuild the sentence from memory, then reuse its language in your own writing.

The app is designed for learners who already understand English well but cannot retrieve it quickly when speaking or writing.

Live app: [shadow-write-studio.vercel.app](https://shadow-write-studio.vercel.app)

## Why this works

Comprehension is mostly recognition: the sound, subtitle, or surrounding context supplies cues. Speaking and writing are retrieval: you must generate the words, order, rhythm, and phrasing without those cues.

ShadowWrite progressively removes support:

1. **Hear** the sentence in its original context.
2. **Shadow** its rhythm and phrasing while the model is available.
3. **Rebuild** the exact sentence after hiding it.
4. **Use** a useful phrase in a new, personal sentence.
5. **Review** saved sentences and recent attempts later.

Shadowing lowers the listening and articulation barrier. Retrieval and transformation are what turn copied language into language the learner can use independently.

## Current features

- Import a public English YouTube video, or start with the built-in example.
- Fall back to Gemini timecoded transcription when YouTube blocks caption access from the server.
- Paste WebVTT or SubRip captions when automatic transcript retrieval fails.
- Group caption fragments into short, speakable units from 3 to 12 seconds.
- Search the transcript, select a sentence, seek to its timestamp, and loop it.
- Change playback speed while practicing.
- Record speech with the browser microphone and compare it with the original clip.
- Rebuild a hidden sentence and receive deterministic word-level recall feedback.
- Write a personal sentence and check basic mechanics plus target-phrase use.
- Look up definitions, pronunciation, examples, synonyms, and antonyms.
- Hear a word or phrase in real video contexts through the YouGlish widget.
- Save sentences and track attempts, recall accuracy, and practice streaks locally.
- Use the responsive Practice, Word context, and Notebook views on desktop or mobile.

ShadowWrite does not assign a pronunciation or native-accent score. The current speaking flow uses direct A/B listening because a generic score would imply more certainty than the prototype can support.

## Run locally

Requirements:

- Node.js 22 or newer
- npm
- A modern browser with JavaScript, third-party embeds, and optional microphone access enabled

No database is required. Vercel deployments authenticate to AI Gateway automatically with OIDC. The Vercel team must have AI Gateway credits activated for automatic transcription fallback.

```bash
git clone https://github.com/nguynking/shadow-write-studio.git
cd shadow-write-studio
npm ci
npx vercel link
npx vercel env pull .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

Before opening a pull request, run:

```bash
npm run lint
npm test
npm run build
```

## Architecture

| Layer | Responsibility |
| --- | --- |
| Next.js 16 App Router and React 19 | Application shell, route handlers, rendering, and responsive UI |
| `StudioApp` | Coordinates the active video, transcript selection, practice modes, notebook, and progress |
| YouTube IFrame Player API | Embedded playback, timestamp seeking, looping, and playback speed |
| `POST /api/transcript` | Validates imports, retrieves captions, falls back to Gemini through Vercel AI Gateway, parses VTT/SRT, and returns practice chunks |
| Transcript utilities | Decode caption text, parse timestamps, remove rolling duplicates, and group cues into speakable units |
| `GET /api/dictionary` | Normalizes Free Dictionary API results, with Datamuse definitions as a timeout fallback |
| YouGlish JavaScript widget | Supplies timestamped real-world word and phrase examples |
| Browser `MediaRecorder` | Captures voice for immediate local playback |
| Versioned `localStorage` | Persists saved content, attempts, and aggregate practice statistics |
| Deterministic scoring | Compares rebuilt words and checks simple writing mechanics without an AI dependency |

The prototype has no database, authentication system, background worker, or server-side user profile.

## API contracts

### `POST /api/transcript`

Builds a practice session from a YouTube source, pasted captions, or both.

Automatic attempt:

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "en"
}
```

Reliable manual fallback:

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "transcriptText": "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nA timed sentence.",
  "format": "vtt",
  "language": "en"
}
```

The route also accepts an 11-character `videoId`, `srt` as the format, and an optional `title` for caption-only imports.

Success:

```json
{
  "source": "youtube",
  "transcriptMethod": "captions",
  "video": {
    "id": "VIDEO_ID",
    "title": "Video title",
    "author": "Channel",
    "durationSeconds": 240,
    "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID"
  },
  "chunks": [
    {
      "id": "chunk-id",
      "index": 0,
      "text": "A short, speakable unit.",
      "startSeconds": 1,
      "endSeconds": 4,
      "durationSeconds": 3
    }
  ]
}
```

Error responses use this shape:

```json
{
  "error": {
    "code": "CAPTIONS_NOT_FOUND",
    "message": "This video has no captions. Try another video or paste an SRT/VTT file."
  }
}
```

Important limits:

- Videos and pasted caption timelines are limited to 30 minutes.
- Pasted caption text is limited to 1,500,000 characters.
- Direct YouTube caption retrieval falls back after 25 seconds. AI transcription can take up to four minutes.
- Transcript responses use `Cache-Control: no-store`.

### `GET /api/dictionary?q=<term>`

Returns normalized English dictionary entries from [Free Dictionary API](https://dictionaryapi.dev/). If that service times out, the route falls back to definition and pronunciation metadata from the [Datamuse API](https://www.datamuse.com/api/).

```json
{
  "query": "rebuild",
  "entries": [
    {
      "word": "rebuild",
      "phonetic": "...",
      "phonetics": [],
      "meanings": [],
      "sourceUrls": []
    }
  ]
}
```

Queries may contain letters, spaces, apostrophes, and hyphens, up to 64 characters. Errors use `INVALID_QUERY`, `NOT_FOUND`, or `UPSTREAM_ERROR`. Successful upstream results are cached at the server edge for one day, with stale reuse for up to seven days.

## Transcript reliability

The app first uses `youtube-transcript-plus` with YouTube's public privacy-enhanced embed page. The embed page avoids a common cloud-hosting bot check on the normal watch page and still supplies the player caption tracks. When YouTube blocks both public caption paths, the app sends the public YouTube URL to Gemini 3.7 Flash through Vercel AI Gateway and asks for verbatim, time-aligned English speech.

AI-generated timings are useful but not guaranteed to be frame-perfect. The interface labels AI-created transcripts so learners can check each phrase against the embedded video. The manual VTT/SRT path remains the most predictable fallback.

YouTube's official `captions.list` method returns caption-track metadata and requires authorization. Its official `captions.download` method requires the authenticated user to have permission to edit the video. The official API therefore cannot download transcript text for every arbitrary public URL.

If both automatic paths fail:

1. Keep the YouTube link in the source field.
2. Choose **Paste VTT or SRT**.
3. Paste complete timecoded captions and select their format.
4. Build the practice again.

Caption timestamps are also not frame-perfect. The YouTube player seeks to the nearest available keyframe, and source captions may begin early or late.

## Privacy and local data

- Saved sentences, saved words, writing attempts, and aggregate statistics are stored in versioned browser `localStorage`.
- Voice recordings are held as temporary browser object URLs for immediate playback. This application does not upload or persist the audio.
- Clearing site data, changing browsers, or using another device removes or separates local progress.
- Transcript route responses are not cached by this application.
- If direct caption retrieval fails, the public YouTube URL and video content are processed by Google Gemini through Vercel AI Gateway to create timed speech. Do not use private, sensitive, or confidential videos.
- Dictionary queries pass through this server to Free Dictionary API and, when needed, Datamuse.
- YouTube and YouGlish embeds load third-party scripts and media. Their own privacy policies and terms apply.

Do not use sensitive or confidential material in pasted transcripts.

## YouGlish and YouTube terms

Real-world context clips are provided by the official [YouGlish widget](https://youglish.com/api/doc/widget) and remain visibly attributed as **Powered by YouGlish.com**. Review the [YouGlish API documentation](https://youglish.com/api/doc/js-api) and contact YouGlish before high-volume, commercial, or mobile-app use.

Use of embedded YouTube content is subject to the [YouTube Terms of Service](https://www.youtube.com/static?template=terms), [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies), and [Google Privacy Policy](https://policies.google.com/privacy). Do not download, reproduce, or process media unless the user owns it or has permission to do so.

## Production roadmap

1. Expand supported transcript sources:
   - OAuth-based YouTube Captions API import for videos the signed-in user owns or can edit.
   - User-uploaded VTT/SRT as a first-class source.
   - User-owned audio and video uploads with explicit consent and retention controls.
2. Add authentication, encrypted server-side progress, export, deletion, and cross-device sync.
3. Add a productive review scheduler for saved phrases and recurring errors.
4. Add staged writing feedback that asks for self-repair before showing a correction.
5. Add comprehensibility, stress, rhythm, and pause feedback only after validating it for second-language speech. Avoid a generic native-likeness score.
6. Add observability, abuse controls, upstream rate limiting, retries, and licensed dictionary data.
7. Add end-to-end tests for transcript import, playback seeking, recording permission, and local-data recovery.

## Research and official references

Learning design:

- [Systematic review of shadowing for second-language pronunciation](https://doi.org/10.1080/29984475.2025.2546827)
- [Mobile shadowing effects on fluency, comprehensibility, and accentedness](https://doi.org/10.1075/jslp.3.1.02foo)
- [Output attention and corrective feedback in shadowing](https://doi.org/10.1177/0033688220937628)
- [Formulaic sequences and reduced pausing for intermediate learners](https://doi.org/10.1002/tesq.556)
- [Retrieval practice with corrective feedback in second-language learning](https://doi.org/10.1177/13621688211053525)
- [Spaced practice in second-language learning: meta-analysis](https://doi.org/10.1111/lang.12479)
- [Written corrective feedback: meta-analysis](https://doi.org/10.1177/13621688221147374)
- [Distributed practice and second-language fluency development](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/effects-of-distributed-practice-on-second-language-fluency-development/4F6787916C198376CAD222934D3B37E4)

Platform behavior:

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube `captions.list`](https://developers.google.com/youtube/v3/docs/captions/list)
- [YouTube `captions.download`](https://developers.google.com/youtube/v3/docs/captions/download)
- [Gemini video understanding and public YouTube URLs](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [YouGlish JavaScript API](https://youglish.com/api/doc/js-api)
- [Free Dictionary API](https://dictionaryapi.dev/)
- [Datamuse API](https://www.datamuse.com/api/)

## License

No open-source license has been declared yet. Add one before accepting external contributions or redistributing the project.
