# PuttyPNG

Press your data into a PNG. Hand it to anyone.

PuttyPNG hides any data inside an ordinary lossless PNG and reads it back out.
Text, a JSON object, a whole file: it goes into the low bits of the image and
the picture still looks like a picture. Because most places let you paste a
lossless PNG without mangling it, the image becomes a universal envelope. No
server, no link that expires, no account to sign into.

## Running it

Open `index.html`. There is nothing to install and nothing to build.

Serving the folder over HTTP is better than opening the file directly, because
a browser blocks `fetch` against a `file://` path. Making and reading a
PuttyPNG works either way, but the engine source card on the How it works tab
can only fill itself over HTTP.

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
