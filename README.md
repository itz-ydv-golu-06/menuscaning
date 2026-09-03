# CardScan

A business-card scanner that runs entirely in the browser. Point your
phone camera at a visiting card, it reads and categorizes the text, you
check/correct the fields, and it's saved to a local contact list you can
export to Excel, CSV, PDF, Word or your phone's address book (.vcf).

Everything — the photo, the OCR, the storage — stays on the device. The
only network calls are: loading the app itself, Google Fonts, and a
one-time download of the OCR language file (cached after first use).

## Run it locally

No build step — it's a static site.

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or a desktop browser
```

Camera access requires HTTPS (or `localhost`), so for testing on a phone
over your LAN you'll need a tunnel (e.g. `npx localtunnel --port 8000`) or
just deploy to GitHub Pages (see below) and test on the live URL.

## Deploy with GitHub Pages

1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch** → branch `main`, folder `/ (root)`
3. Your app will be live at `https://<username>.github.io/<repo>/`

## Convert to an Android APK

`.github/workflows/build-apk.yml` uses Google's **Bubblewrap** CLI to wrap
the installed PWA in a Trusted Web Activity and produce an `.apk`.

1. Deploy to GitHub Pages first (the workflow needs a live HTTPS URL).
2. Edit `PWA_URL` in the workflow file to match your Pages URL.
3. Go to the **Actions** tab → **Build Android APK** → **Run workflow**.
4. Download the `cardscan-apk` artifact when it finishes.

Bubblewrap's `init` step is interactive, so this workflow is a starting
point — if it fails on first run, the Action log will show exactly which
prompt it stalled on; adjust the `bubblewrap init` step accordingly (or
run `bubblewrap init` once locally, commit the generated `twa-project/`
folder, and simplify the workflow to just `bubblewrap build`). The
resulting APK is unsigned; for the Play Store you'll need Bubblewrap to
generate (or you to supply) a signing key.

## Project structure

```
index.html           app shell, all screens
css/styles.css        design system
js/storage.js         IndexedDB contact storage
js/parser.js          OCR text -> categorized fields
js/camera.js          camera capture + light image enhancement
js/ocr.js              Tesseract.js wrapper
js/export.js            xlsx / csv / pdf / doc / vcf export
js/app.js               screen routing & UI logic
manifest.json          PWA manifest (used by Bubblewrap for the APK)
sw.js                  offline app-shell caching
.github/workflows/     APK build action
```

## Known limitations (v1)

- OCR field-matching is heuristic (regex + keyword rules), not true AI —
  it's solid on standard Indian visiting-card layouts but will occasionally
  misfile a line on very unusual designs. Always reviewable/editable before
  saving, by design.
- Card images are stored as compressed JPEG data URLs in IndexedDB; very
  heavy usage (thousands of cards) will use meaningful device storage —
  check **Settings -> Storage used**.
- Word export is HTML saved with a `.doc` extension (opens fine in Word,
  not a native `.docx`).
