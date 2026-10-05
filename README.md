# Zee — your private second brain

Save links, notes, snippets, commands, prompts and ideas on your phone. Organize them in collections, find them with instant full-text search, and ask questions in plain words using your own AI provider and API key.

All data lives in a local SQLite database on the device. API keys live in Android's secure storage.

## Offline-first
Everything local works with no internet: capture, collections, search, reminders (scheduled on the phone), editing, backup. Online-only work (link titles/descriptions, embeddings for smart search) goes into a retrying queue and runs automatically when you reconnect. Ask Zee falls back to showing matching saved items when offline.

## Save from any app (v0.3)
Zee appears in Android's Share menu for text, links, images and PDFs. Share from Instagram, Chrome, YouTube, GitHub or Gallery and it lands in your Inbox instantly, offline included. Duplicate links are detected. Files and images can also be added inside Zee, and are copied into private app storage.

## Shortcuts and Home (v0.8)
Long-press the Zee icon on your Android home screen for **New note**, **Record voice note** and **Search library**. Also: `zee://capture`, `zee://voice` and `zee://library` open those screens directly. Home sections (counts, waiting notice, coming up, recently saved) can be switched on or off in Settings.

## ThoughtMap and related items (v0.7)
- **Related items** on every item page: items you linked (solid, "linked by you") and items Zee suggests. Suggestions are computed on the phone: by meaning when embeddings exist (smart search set up), otherwise by shared words. Link a suggestion to keep it, or dismiss it and it won't come back.
- **ThoughtMap** (Library > ThoughtMap): your recent items and collections as an interactive graph. Pinch to zoom, drag to pan, tap a node to see its details and relations. Grey lines are collection membership, violet lines are your links, dashed orange lines are Zee's suggestions (can be hidden). Filter by collection and search to highlight nodes. Shows up to 80 recent items for speed.
- Links are not part of backups yet.

## Voice notes, other languages, AI reading (v0.6)
- **Voice notes:** record from the + screen, stored on the phone, playable offline. Transcribe per note with your provider (OpenAI-compatible with a transcription model such as `whisper-1`, or Gemini). Anthropic can't transcribe audio. Optionally delete the audio and keep the transcript. Auto-transcribe is off by default.
- **More scripts:** Hindi (Devanagari), Chinese, Japanese and Korean can be switched on in Settings; scanning still happens on the phone.
- **Read with AI:** for handwriting, poor photos, other languages and **PDFs**, tap Read with AI on an image or PDF. The file is uploaded to your active provider only after you confirm, and the text is saved for search. Files over 15 MB are refused. Needs a vision/PDF-capable model.

## Text in images (v0.5)
Saved screenshots and photos are scanned for text on your phone (Google ML Kit, Latin scripts), with no internet needed. The text is searchable: type `ModuleNotFoundError` in Library and the matching screenshot appears with the matching line. Edit the found text on the item page if the scan got something wrong. PDFs are saved and can be opened, but their text is not extracted yet.

## Track (v0.4)
- **Opportunities:** internships, jobs, hackathons, scholarships, events. Deadline, status, notes, source link, and an automatic reminder one day before. Create one from any saved item with "Track as opportunity".
- **Subscriptions:** price, currency, billing cycle, renewal date, manage/cancel link. Monthly and yearly totals per currency, auto-rolling renewal dates, and a reminder two days before each renewal. Marking a subscription cancelled only updates Zee; cancel with the service itself.
- Everything is local and the reminders are scheduled on the phone.

## Features (v0.2)
- Item pages: edit title/content/notes, change collection, open original, set a reminder
- Reminders with local notifications, overdue state, tap-to-open
- Link previews fetched in the background; queue with retry and backoff
- Smart (hybrid keyword + meaning) search when a provider with an embedding model is set
- Backup: share or copy as JSON, restore from clipboard

## Features (v0.1)
- Quick capture (+ button) with clipboard paste and an Inbox for unsorted items
- Collections with colors; favorites; type filters
- Full-text search (SQLite FTS5), works offline
- Ask Zee: retrieves the top matching items locally, sends only those to your provider, cites sources
- Bring-your-own provider: OpenAI-compatible (OpenAI, OpenRouter, DeepSeek, Groq, any custom URL), Anthropic, Gemini

## Build the APK on GitHub
1. Create a repo, then:
   ```
   git init && git add . && git commit -m "Zee v0.1"
   git branch -M main
   git remote add origin https://github.com/<you>/zee.git
   git push -u origin main
   ```
2. Open the **Actions** tab → **Build Android APK** (runs on every push; or press *Run workflow*).
3. When it finishes, download **zee-apk** from the run's Artifacts, unzip, and install `app-release.apk` on your phone (allow "install unknown apps").

The workflow runs `npx expo install --fix` first so dependency versions match the installed Expo SDK.

## Develop locally
```
npm install && npx expo install --fix
npx expo run:android
```

## Roadmap
Android share-sheet, files/images/PDF, OCR, reminders, opportunities, subscriptions, semantic search, backup/export, ThoughtMap.

## Signed release
1. Create a keystore once (keep it and its passwords somewhere safe; losing it means you can't update the app):
   `keytool -genkeypair -v -keystore zee.jks -alias zee -keyalg RSA -keysize 2048 -validity 10000`
2. Encode it: `base64 -w0 zee.jks` (macOS: `base64 -i zee.jks`).
3. In the repo go to Settings > Secrets and variables > Actions and add `ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
4. Tag and push: `git tag v0.4.0 && git push origin v0.4.0`. The signed APK appears under Releases.

Never commit the keystore. `.gitignore` already excludes `*.jks` and `*.keystore`.

## Privacy
Zee has no account and no server. Items, files and reminders stay on your phone. API keys are in Android secure storage. If you add an AI provider, only the few saved items matched to a question (and item text when building smart-search embeddings) are sent to that provider. Link previews fetch the saved page directly from your phone.

## Troubleshooting
- **App closes on launch:** make sure you installed `app-release.apk` from the `zee-apk` artifact. A debug build has no bundled JavaScript and cannot run without a computer running Metro.
- **Build fails with a Babel error:** `babel-preset-expo` must be listed in devDependencies (it is).
