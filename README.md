# PuttyPNG

Press your data into a PNG. Hand it to anyone.

PuttyPNG hides any data inside an ordinary lossless PNG and reads it back out.
Text, a JSON object, a whole file: it goes into the low bits of the image and
the picture still looks like a picture. Because most places let you paste a
lossless PNG without mangling it, the image becomes a universal envelope. No
server, no link that expires, no account to sign into.

## Running it

Open `index.html`. There is nothing to install and nothing to build.

Current release: page **2.11.2**, engine **2.2.1**, protocol **1**.

Serving the folder over HTTP is better than opening the file directly, because
a browser blocks `fetch` against a `file://` path. Making and reading a
PuttyPNG works either way, but the engine source card on the How it works tab
can only fill itself over HTTP.

## Editing a disc title

After making a disc, press **Edit Title** on desktop or **Edit** at the lower
left of the mobile result. The editor starts with the current wording and
previews changes before saving. Use your own words, choose another saying, or
use the attached filename. Long filenames lose their middle on the disc and
keep their extension; the embedded file keeps its complete original name.
The filename row appears only when an attached file can supply a title.

Save title updates the downloadable and copyable PNG using the same contents,
password, and cover settings. Cancel leaves the finished PNG unchanged.

The board selects from 130 sayings: ten each for typed text, general
attachments, ten popular file families, and protected contents. File families
include PDF, Word, Excel/CSV, PowerPoint, OpenDocument text/spreadsheets/slides,
text/Markdown files, images, and archives. The small contents arc uses a word
count for typed text or a size and file type for attachments. Its arrow points
toward **Paste into PuttyPNG.com**.

Each press of Make picks a random saying when no title has been chosen,
excluding the previous automatic saying for those contents. Saved custom
titles and filename titles stay selected. Changing the background keeps the
current title.

Password-protected discs use generic sayings and **Locked contents inside!**.
The automatic writing includes no filename, file type, size, or word count.
The filename row is hidden while protected. A custom title is still visible
without the password, as the editor explains.

## The files

| File | Holds |
|---|---|
| `index.html` | The board: make a PuttyPNG, read one back. Seven sections. |
| `docs.html` | API, protocol, cover styles, error codes, recipes. Seven sections. |
| `how-it-works.html` | The tutorial, a live drop zone, and the code to copy. Seven sections. |
| `download.html` | Two ways to the code. Seven sections. |
| `about.html` | The idea, the author, the licence. Seven sections. |
| `styles.css` | All presentation. Seven sections. |
| `scripts.js` | All page behavior. Seven sections. |
| `puttypng.js` | The engine. Nine sections. |

Every page carries the same head, masthead, navigation, and footer, marked with
`SYNC` comments. `.devtools/sync-chrome.mjs` checks the five copies agree.

Only `index.html` and `how-it-works.html` load `puttypng.js`, because the other
three cannot use it.

Beside them sit `fonts/`, which holds the one display face the page sets its
name and its two column headings in, and `assets/`, which holds the icons and
the flag. Both are served from the folder and never over a network. Delete
`fonts/` and the page falls back to a system face.

No build step and no dependencies. Drop the folder on any static host and it
runs.

## Using the engine on its own

`puttypng.js` is standalone. It is the only file you need, it carries the whole
protocol, and it works as a browser global or as a CommonJS module.

```html
<script src="puttypng.js"></script>
<script>
  const png = await PuttyPNG.encode("a secret");
  const out = await PuttyPNG.decode(png.dataUrl);
  console.log(out.text);            // "a secret"
</script>
```

Options cover compression, AES-256-GCM encryption with a PBKDF2-SHA-256 derived
key, a plaintext developer tag readable with `peek()`, embedding depth, and the
cover image. The Docs tab on the page is the full reference.

## Tests

The engine ships its own harness. There is no `test/` directory.

```
node -e "require('./puttypng.js'); PuttyPNG.selfTest().then(r => console.log(r.passed, r.failed, r.total))"
```

It must report `33 0 33`. The suite covers the CRC32 known-answer vector, header
build and parse, round trips for text, unicode, JSON, and binary, compression
behavior, encryption with the right and wrong password, transparency hardening,
and the error codes.

## License

MIT. Copyright (c) 2026 Aaron Michael Harris.
