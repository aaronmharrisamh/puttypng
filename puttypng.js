/*!
 * PuttyPNG - Press your data into a PNG. Hand it to anyone.
 * https://puttypng.com
 *
 * Protocol v1  |  Engine v1.0.0
 * A tiny, dependency-free engine that hides any data inside an ordinary lossless
 * PNG and reads it back out. Paste this whole file into your project - it is the
 * documentation of the protocol as much as the implementation of it.
 *
 * Copyright (c) 2026 Aaron Michael Harris
 * Released under the MIT License.
 */

(function (global) {
  "use strict";

  // ===========================================================================
  // SECTION 1 - HEADER / SETUP AND IDENTITY
  //
  // The engine's name, its two version numbers, and the public object that
  // everything else hangs from. PROTOCOL_VERSION changes only when the byte
  // layout changes. ENGINE_VERSION changes for any release.
  // ===========================================================================

  var PROTOCOL_VERSION = 1;   // bumps ONLY on breaking byte-layout changes
  var ENGINE_VERSION = "2.0.0";   // 2.0.0 renamed every error code: breaking for callers

  // The public object. Everything a developer touches hangs off of this.
  var PuttyPNG = {
    version: ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION
  };

  // ===========================================================================
  // SECTION 2 - ERROR SYSTEM
  //
  // One error type and one table of codes, defined before anything can fail.
  //
  // Every failure in PuttyPNG is one short, documented E## code. The engine
  // logs "PuttyPNG E##: message" to the console AND throws a PuttyPNGError that
  // carries the code, so developers can react in code without parsing strings.
  // ===========================================================================

  // Every code carries the PTY- family prefix and numbers from 00. A key holds
  // a hyphen, so each one is quoted.
  // PTY-E99 is the catch-all: an engine failure that was not classified.
  PuttyPNG.errors = {
    "PTY-E00": "Not a PuttyPNG (magic not found)",
    "PTY-E01": "Protocol version is newer than this engine can read",
    "PTY-E02": "Data is corrupted (checksum or structure mismatch)",
    "PTY-E03": "This browser cannot decompress (CompressionStream missing)",
    "PTY-E04": "Data is too large for the cover image or the size cap",
    "PTY-E05": "Wrong password, or the data could not be decrypted",
    "PTY-E06": "Encryption is not available (Web Crypto missing)",
    "PTY-E07": "A password is required but none was provided",
    "PTY-E08": "Invalid input or options",
    "PTY-E09": "The image could not be loaded or read",
    "PTY-E10": "The cover image has too few opaque pixels to use",
    "PTY-E11": "The developer tag is too long (max 65535 bytes)",
    "PTY-E99": "The engine failed in a way it did not classify"
  };

  function PuttyPNGError(code, detail) {
    var base = PuttyPNG.errors[code] || "Unknown error";
    this.name = "PuttyPNGError";
    this.code = code;
    this.message = detail ? base + " - " + detail : base;
    this.stack = (new Error()).stack;
  }
  PuttyPNGError.prototype = Object.create(Error.prototype);
  PuttyPNGError.prototype.constructor = PuttyPNGError;
  PuttyPNG.PuttyPNGError = PuttyPNGError;

  // Throw a coded error (and mirror it to the console as a brief E## line).
  function fail(code, detail) {
    var err = new PuttyPNGError(code, detail);
    if (typeof console !== "undefined" && console.error) {
      console.error("PuttyPNG " + code + ": " + err.message);
    }
    throw err;
  }

  // Wrap a public entry point so an unclassified failure still arrives as a
  // documented code. Without this a bug inside the engine reaches a caller as
  // a raw TypeError, which no error table can explain.
  //
  // A PuttyPNGError passes through untouched, so a real code is never masked.
  function classified(fn) {
    return async function () {
      try {
        return await fn.apply(this, arguments);
      } catch (err) {
        if (err instanceof PuttyPNGError) throw err;
        var wrapped = new PuttyPNGError("PTY-E99", (err && err.message) || String(err));
        wrapped.cause = err;              // keep the original for a developer
        throw wrapped;
      }
    };
  }

  // ===========================================================================
  // SECTION 3 - BYTE AND BIT HELPERS
  //
  // The lowest layer. These functions know about bytes and bits and nothing
  // about PuttyPNG. Everything above this section is built from them.
  //
  // Small, readable helpers for moving between text, bytes, base64, and the
  // big-endian integers used in the fixed header.
  // ===========================================================================

  var utf8Encoder = new TextEncoder();
  var utf8Decoder = new TextDecoder("utf-8", { fatal: false });

  function textToBytes(text) {
    return utf8Encoder.encode(text == null ? "" : String(text));
  }

  function bytesToText(bytes) {
    return utf8Decoder.decode(bytes);
  }

  // Join several Uint8Arrays into one.
  function concatBytes(chunks) {
    var total = 0, i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var offset = 0;
    for (i = 0; i < chunks.length; i++) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return out;
  }

  // Big-endian integer writers/readers used by the fixed header.
  function writeUint16(view, offset, value) {
    view[offset] = (value >>> 8) & 0xff;
    view[offset + 1] = value & 0xff;
  }
  function readUint16(view, offset) {
    return ((view[offset] << 8) | view[offset + 1]) >>> 0;
  }
  function writeUint32(view, offset, value) {
    view[offset] = (value >>> 24) & 0xff;
    view[offset + 1] = (value >>> 16) & 0xff;
    view[offset + 2] = (value >>> 8) & 0xff;
    view[offset + 3] = value & 0xff;
  }
  function readUint32(view, offset) {
    return ((view[offset] << 24) | (view[offset + 1] << 16) |
            (view[offset + 2] << 8) | view[offset + 3]) >>> 0;
  }

  // Dependency-free base64 (used to store salt/iv in the crypto metadata JSON).
  var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function bytesToBase64(bytes) {
    var out = "", i;
    for (i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64_CHARS[b0 >> 2];
      out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
      out += (i + 1 < bytes.length) ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
      out += (i + 2 < bytes.length) ? B64_CHARS[b2 & 63] : "=";
    }
    return out;
  }
  function base64ToBytes(b64) {
    var clean = String(b64).replace(/[^A-Za-z0-9+/]/g, "");
    var len = Math.floor(clean.length * 3 / 4);
    var out = new Uint8Array(len);
    var o = 0, buffer = 0, bits = 0;
    for (var i = 0; i < clean.length; i++) {
      buffer = (buffer << 6) | B64_CHARS.indexOf(clean[i]);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = (buffer >> bits) & 0xff;
      }
    }
    return out.subarray(0, o);
  }

  // ---- CRC32, the integrity check over the embedded payload --------------------

  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0 ^ -1;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ -1) >>> 0;
  }

  // ===========================================================================
  // SECTION 4 - PIXEL PLUMBING
  //
  // How a bit becomes part of an image, and how it is read back out. This is
  // the layer where the steganography happens.
  //
  // Data lives in the low bits of the R, G, B channels of FULLY OPAQUE pixels
  // (alpha === 255). Alpha is never touched, and transparent / semi-transparent
  // pixels are skipped entirely - that is what keeps the hidden bits perfectly
  // recoverable after a lossless PNG round-trip.
  //
  // Two embedding depths:
  //   standard : 3 bits into R, 2 into G, 3 into B  = 1 byte per pixel (roomy)
  //   subtle   : 1 bit into each of R, G, B         = 3 bits per pixel (invisible)
  //
  // The 18-byte fixed header is ALWAYS written at subtle depth so a decoder can
  // read it before it knows the body's depth.
  // ===========================================================================

  var DEPTH_STANDARD = [3, 2, 3];
  var DEPTH_SUBTLE = [1, 1, 1];
  var HEADER_WIDTHS = DEPTH_SUBTLE;    // header is always 1-1-1
  var HEADER_LENGTH = 18;              // bytes
  var HEADER_PIXELS = 48;              // 18 bytes * 8 bits / 3 bits-per-pixel

  // List the indices of every fully opaque pixel, in raster order.
  function opaquePixels(px, width, height) {
    var eligible = [];
    var count = width * height;
    for (var i = 0; i < count; i++) {
      if (px[i * 4 + 3] === 255) eligible.push(i);
    }
    return eligible;
  }

  // How many pixels are needed to hold N bytes at a given depth.
  function pixelsForBytes(byteCount, widths) {
    var bitsPerPixel = widths[0] + widths[1] + widths[2];
    return Math.ceil((byteCount * 8) / bitsPerPixel);
  }

  // Expand bytes into a flat array of bits, most-significant bit first.
  function bytesToBits(bytes) {
    var bits = new Uint8Array(bytes.length * 8);
    var k = 0;
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      for (var j = 7; j >= 0; j--) bits[k++] = (b >> j) & 1;
    }
    return bits;
  }

  // Re-pack a bit array (MSB first) back into bytes.
  function bitsToBytes(bits) {
    var n = Math.floor(bits.length / 8);
    var out = new Uint8Array(n);
    var k = 0;
    for (var i = 0; i < n; i++) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | (bits[k++] & 1);
      out[i] = b;
    }
    return out;
  }

  // Write a bit array into the channels of consecutive eligible pixels.
  // Returns the pixel cursor (into `eligible`) one past the last pixel used.
  function writeBits(px, eligible, startPixel, widths, bits) {
    var bo = 0;
    var pc = startPixel;
    while (bo < bits.length && pc < eligible.length) {
      var base = eligible[pc] * 4;
      for (var c = 0; c < 3; c++) {
        var w = widths[c];
        var mask = (1 << w) - 1;
        var val = 0, got = 0;
        for (var k = 0; k < w && bo < bits.length; k++) {
          val = (val << 1) | bits[bo++];
          got++;
        }
        if (got > 0) {
          if (got < w) val = val << (w - got);   // left-align a partial final group
          px[base + c] = (px[base + c] & ~mask) | (val & mask);
        }
      }
      pc++;
    }
    return pc;
  }

  // Read `numPixels` pixels starting at a cursor and return their embedded bits.
  function readBits(px, eligible, startPixel, widths, numPixels) {
    var per = widths[0] + widths[1] + widths[2];
    var bits = new Uint8Array(numPixels * per);
    var bi = 0;
    for (var n = 0; n < numPixels; n++) {
      var pc = startPixel + n;
      if (pc >= eligible.length) break;
      var base = eligible[pc] * 4;
      for (var c = 0; c < 3; c++) {
        var w = widths[c];
        var low = px[base + c] & ((1 << w) - 1);
        for (var k = w - 1; k >= 0; k--) bits[bi++] = (low >> k) & 1;
      }
    }
    return bits.subarray(0, bi);
  }

  // ===========================================================================
  // SECTION 5 - PROTOCOL FORMAT
  //
  // The wire format, in two parts: an 18-byte fixed header that any decoder
  // can read first, and the inner container it describes.
  //
  //   offset 0  : magic "PPNG"        (4 bytes)
  //   offset 4  : protocol version    (1 byte)
  //   offset 5  : flags               (1 byte)  bit0 compressed, bit1 encrypted,
  //                                             bit2 subtle depth
  //   offset 6  : dev tag length      (2 bytes, uint16)
  //   offset 8  : outer metadata len  (2 bytes, uint16)
  //   offset 10 : payload length      (4 bytes, uint32)
  //   offset 14 : CRC32 of payload    (4 bytes, uint32)
  // ===========================================================================

  var MAGIC = new Uint8Array([0x50, 0x50, 0x4e, 0x47]);   // "PPNG"
  var FLAG_COMPRESSED = 1;
  var FLAG_ENCRYPTED = 2;
  var FLAG_SUBTLE = 4;

  function buildHeader(fields) {
    var h = new Uint8Array(HEADER_LENGTH);
    h.set(MAGIC, 0);
    h[4] = fields.version & 0xff;
    h[5] = fields.flags & 0xff;
    writeUint16(h, 6, fields.tagLen);
    writeUint16(h, 8, fields.metaLen);
    writeUint32(h, 10, fields.payloadLen);
    writeUint32(h, 14, fields.crc);
    return h;
  }

  function parseHeader(h) {
    for (var i = 0; i < MAGIC.length; i++) {
      if (h[i] !== MAGIC[i]) fail("PTY-E00");
    }
    var version = h[4];
    if (version > PROTOCOL_VERSION) fail("PTY-E01", "found v" + version);
    return {
      version: version,
      flags: h[5],
      tagLen: readUint16(h, 6),
      metaLen: readUint16(h, 8),
      payloadLen: readUint32(h, 10),
      crc: readUint32(h, 14)
    };
  }

  // ---- The inner container, which holds the protected content ------------------
  //
  //   [uint16 inner-metadata length][inner-metadata JSON][data bytes]
  //
  // The inner metadata (name, type, mime) lives INSIDE the compress/encrypt
  // envelope, so an encrypted PuttyPNG reveals no filename or type.

  function buildInnerContainer(normalized) {
    var meta = { name: normalized.name || "", type: normalized.type, mime: normalized.mime };
    var metaBytes = textToBytes(JSON.stringify(meta));
    var prefix = new Uint8Array(2);
    writeUint16(prefix, 0, metaBytes.length);
    return concatBytes([prefix, metaBytes, normalized.bytes]);
  }

  function parseInnerContainer(bytes) {
    if (bytes.length < 2) fail("PTY-E02", "inner container too short");
    var metaLen = readUint16(bytes, 0);
    if (2 + metaLen > bytes.length) fail("PTY-E02", "inner metadata length overflow");
    var meta;
    try {
      meta = JSON.parse(bytesToText(bytes.subarray(2, 2 + metaLen)));
    } catch (e) {
      fail("PTY-E02", "inner metadata is not valid JSON");
    }
    return { meta: meta, data: bytes.subarray(2 + metaLen) };
  }

  // ===========================================================================
  // SECTION 6 - PROTECTION
  //
  // Two optional layers applied to the payload before it is embedded:
  // compression to make it smaller, then encryption to make it unreadable.
  // Order matters. Compressing after encrypting would gain nothing.
  //
  // On encode we try gzip and keep it only when it makes the data smaller.
  // On decode we reverse it - and if this browser lacks DecompressionStream we
  // fail cleanly with PTY-E03 rather than emit garbage.
  // ===========================================================================

  function hasCompression() { return typeof CompressionStream !== "undefined"; }
  function hasDecompression() { return typeof DecompressionStream !== "undefined"; }

  async function streamThrough(stream, bytes) {
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    var reader = stream.readable.getReader();
    var chunks = [];
    while (true) {
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
    }
    return concatBytes(chunks);
  }

  async function gzipBytes(bytes) {
    return streamThrough(new CompressionStream("gzip"), bytes);
  }
  async function gunzipBytes(bytes) {
    if (!hasDecompression()) fail("PTY-E03");
    try {
      return await streamThrough(new DecompressionStream("gzip"), bytes);
    } catch (e) {
      fail("PTY-E02", "decompression failed");
    }
  }

  // Returns compressed bytes only if smaller than the input, else null.
  async function maybeCompress(bytes) {
    if (!hasCompression()) return null;
    try {
      var gz = await gzipBytes(bytes);
      return gz.length < bytes.length ? gz : null;
    } catch (e) {
      return null;
    }
  }

  // ---- Encryption: AES-256-GCM with a PBKDF2-SHA-256 derived key ---------------
  //
  // Three modes:
  //   no password      -> nothing is encrypted. This is the default.
  //   dev-preset key   -> the page bakes in a fixed password string.
  //   user password    -> prompted on export, prompted on import.
  //
  // The password is never stored. Only the salt, iv, and iteration count
  // travel in the plaintext outer metadata, so any importer knows how to
  // derive the key once it has the password.

  var PBKDF2_ITERATIONS = 210000;

  function subtleCrypto() {
    if (typeof crypto === "undefined" || !crypto.subtle) fail("PTY-E06");
    return crypto.subtle;
  }

  async function deriveKey(password, salt, iterations) {
    var subtle = subtleCrypto();
    var keyMaterial = await subtle.importKey(
      "raw", textToBytes(password), "PBKDF2", false, ["deriveKey"]
    );
    return subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptBytes(bytes, password) {
    var subtle = subtleCrypto();
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    var cipher = new Uint8Array(
      await subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes)
    );
    return {
      cipher: cipher,
      params: {
        enc: "AES-256-GCM",
        kdf: "PBKDF2-SHA-256",
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv)
      }
    };
  }

  async function decryptBytes(cipher, password, params) {
    var subtle = subtleCrypto();
    var salt = base64ToBytes(params.salt);
    var iv = base64ToBytes(params.iv);
    var key = await deriveKey(password, salt, params.iterations || PBKDF2_ITERATIONS);
    try {
      return new Uint8Array(
        await subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipher)
      );
    } catch (e) {
      fail("PTY-E05");
    }
  }

  // ===========================================================================
  // SECTION 7 - COVER GENERATION
  //
  // Making the image that carries the data. A cover can be generated noise, a
  // generated CD, or an image the developer supplies. The generated covers are
  // built from a reusable splat primitive further down this section.
  //
  // The default cover is generated noise sized exactly to the data. Developers
  // can override with their own PNG (fitted crop/scale/center/stretch) or lock
  // the size (fixed / power-of-two). Noise generation is pure (no canvas) so the
  // engine's logic is fully testable without a browser.
  // ===========================================================================

  // The floor for an AUTO-SIZED cover. A small payload still produces a cover
  // people can see and share, rather than a thumbnail a few pixels across.
  // An explicit `size` is an instruction and is never raised to this floor.
  // A developer can move the floor with the `minSize` option.
  var MIN_SIZE = 256;
  var MAX_SIZE = 4096;

  function nextPowerOfTwo(n) {
    var p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Smallest square (side length) that can hold the header + body at this depth.
  function chooseSize(bodyBytes, widths, options) {
    options = options || {};
    var minSize = options.minSize || MIN_SIZE;
    var maxSize = options.maxSize || MAX_SIZE;
    var neededPixels = HEADER_PIXELS + pixelsForBytes(bodyBytes, widths);

    // An explicit size is an instruction, so the minimum floor does not apply
    // to it. The floor exists to stop an AUTO size from becoming too small.
    var size;
    if (options.size) {
      size = options.size;
    } else {
      size = Math.max(minSize, Math.ceil(Math.sqrt(neededPixels)));
      if (options.sizeMode === "pow2") size = Math.max(nextPowerOfTwo(minSize), nextPowerOfTwo(size));
      if (size < minSize) size = minSize;
    }
    if (size > maxSize) fail("PTY-E04", "needs " + neededPixels + "px, cap is " + maxSize + "x" + maxSize);
    if (size * size < neededPixels) fail("PTY-E04", "cover " + size + "x" + size + " holds " + (size * size) + "px, need " + neededPixels);
    return size;
  }

  // Pick output dimensions for a CUSTOM cover so it holds `neededPixels` opaque
  // pixels while ignoring the cover's own resolution (that is what stops a big
  // photo from producing a needlessly huge PuttyPNG). `aspect` is width/height.
  //
  //   - Square modes (crop/scale/center/stretch): the smallest square that fits,
  //     floored at minSize (default 256) - the same rule as the noise cover.
  //   - keepRatio: the original aspect ratio, scaled to the smallest size that
  //     fits (and scaled UP past the source resolution if the data needs it),
  //     with the shorter side floored at minSize.
  //
  // This assumes a fully opaque cover; autoFitCover() grows the result if a
  // transparent cover turns out to have fewer opaque pixels than its area.
  function coverDims(neededPixels, aspect, options) {
    options = options || {};
    var minSize = options.minSize || MIN_SIZE;
    var maxSize = options.maxSize || MAX_SIZE;
    var keepRatio = options.keepRatio === true;

    if (!isFinite(aspect) || aspect <= 0) aspect = 1;

    if (!keepRatio) {
      // Square. A fixed size overrides the auto minimum.
      var side = options.size
        ? options.size
        : Math.max(minSize, Math.ceil(Math.sqrt(neededPixels)));
      if (options.sizeMode === "pow2" && !options.size) {
        side = Math.max(nextPowerOfTwo(minSize), nextPowerOfTwo(side));
      }
      side = Math.max(minSize, Math.min(side, maxSize));
      return { w: side, h: side };
    }

    // keepRatio: solve w*h >= neededPixels with w/h == aspect.
    // A fixed size, if given, sets the LONGER side; otherwise auto-fit.
    var w, h;
    if (options.size) {
      if (aspect >= 1) { w = options.size; h = Math.round(options.size / aspect); }
      else { h = options.size; w = Math.round(options.size * aspect); }
    } else {
      h = Math.sqrt(neededPixels / aspect);
      w = aspect * h;
      w = Math.ceil(w); h = Math.ceil(h);
    }
    // Floor the shorter side at minSize (keeping the ratio).
    var shorter = Math.min(w, h);
    if (shorter < minSize) {
      var up = minSize / shorter;
      w = Math.round(w * up); h = Math.round(h * up);
    }
    // Cap the longer side at maxSize (keeping the ratio).
    var longer = Math.max(w, h);
    if (longer > maxSize) {
      var down = maxSize / longer;
      w = Math.round(w * down); h = Math.round(h * down);
    }
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  // A fully opaque field of random pixels. Pure typed-array work - no canvas.
  function generateNoiseImageData(size) {
    var data = new Uint8ClampedArray(size * size * 4);
    for (var i = 0; i < data.length; i += 4) {
      data[i] = (Math.random() * 256) | 0;
      data[i + 1] = (Math.random() * 256) | 0;
      data[i + 2] = (Math.random() * 256) | 0;
      data[i + 3] = 255;
    }
    return { data: data, width: size, height: size };
  }

  // Transparency in a cover is neat but risky: platforms routinely rewrite the RGB
  // of SEMI-transparent, anti-aliased fringe pixels (premultiply round-trips, edge
  // cleanup, flattening onto a background), which would corrupt data hidden nearby.
  // Data is only ever stored in fully opaque (alpha = 255) pixels, so the danger is
  // the soft fringe BETWEEN opaque and transparent regions.
  //
  // We harden the cover to BINARY alpha: every semi-transparent pixel (alpha 1..254)
  // is forced to fully opaque (255), while genuinely transparent pixels (alpha 0)
  // are kept. The result is that transparency is preserved where it is truly meant,
  // but no data-bearing pixel ever borders a fractional-alpha pixel, so a lossless
  // (alpha-preserving) PNG round-trip leaves every hidden byte intact.
  //
  // CAVEAT: hardening does NOT survive FLATTENING (a platform compositing the
  // transparent areas onto an opaque background). Flattening turns transparent
  // pixels opaque, which changes the set of data-bearing pixels and shifts the
  // raster-order indexing. For transport that flattens (or to be safe anywhere),
  // use a fully opaque cover (e.g. the CD's solid-background option).
  // Returns the number of pixels changed.
  function hardenCover(imageData) {
    var px = imageData.data;
    var total = imageData.width * imageData.height;
    var changed = 0;
    for (var i = 0; i < total; i++) {
      var a = px[i * 4 + 3];
      if (a !== 0 && a !== 255) {   // any anti-aliased / semi-transparent fringe
        px[i * 4 + 3] = 255;
        changed++;
      }
    }
    return changed;
  }

  // ---- The putty splat, a reusable generative primitive ------------------------
  //
  // A smooth, blobby, Gak-like closed shape. buildSplat() is pure math (points
  // only) so it is deterministic and testable without a canvas; splatCurveTo()
  // smooths those points into a closed curve on a 2D context. The same silhouette
  // is meant to be reused across PuttyPNG's generative art (the CD's centre, a
  // masked Noise blob, a floppy symbol, ...).

  // Seeded PRNG (mulberry32) so a given splat is reproducible.
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Boundary points of a splat around (cx, cy) with mean radius `radius`. Uses a
  // smooth harmonic radius function so the lobes are ROUND (Gak-like), not spiky.
  //   opts.points    - number of lobes (>= 3)
  //   opts.amplitude - lobe depth (peaks out / valleys in), 0..1
  //   opts.curve     - "curve length": low = round blobby lobes, high = longer,
  //                    reachier lobes, 0..1
  //   opts.waviness  - extra organic randomness, 0..1
  //   opts.seed      - reproducible shape
  // Densely sampled and returned in order. Scaling `radius` (same seed) yields
  // exactly concentric splats.
  function buildSplat(cx, cy, radius, opts) {
    opts = opts || {};
    var lobes = Math.max(3, Math.round(opts.points != null ? opts.points : 6));
    var amp = clamp01(opts.amplitude != null ? opts.amplitude : 0.35);
    var wav = clamp01(opts.waviness != null ? opts.waviness : 0.35);
    var curve = clamp01(opts.curve != null ? opts.curve : 0.5);
    var rand = mulberry32((opts.seed != null ? opts.seed : 1) >>> 0);

    // Organic asymmetry: a random phase, a per-lobe strength, and two low
    // harmonics of gentle noise.
    var phase = rand() * Math.PI * 2;
    var lobeStrength = [];
    for (var L = 0; L < lobes; L++) lobeStrength.push(0.5 + rand() * 1.0);    // 0.5..1.5 (organic)
    var h1f = 2 + Math.floor(rand() * 2), h1p = rand() * Math.PI * 2;
    var h2f = 3 + Math.floor(rand() * 3), h2p = rand() * Math.PI * 2;
    // Curve length -> lobe sharpness: 0 rounds the peaks, 1 stretches them out.
    var sharp = 0.6 + curve * 1.6;

    var samples = Math.max(60, lobes * 12);
    var pts = [];
    for (var i = 0; i < samples; i++) {
      var th = (i / samples) * Math.PI * 2;
      // Blend each sample toward its nearest lobe's strength for varied lobe sizes.
      var lfrac = (th / (Math.PI * 2)) * lobes;
      var li = Math.floor(lfrac) % lobes;
      var ln = (li + 1) % lobes, mix = lfrac - Math.floor(lfrac);
      var strength = lobeStrength[li] * (1 - mix) + lobeStrength[ln] * mix;
      var lobe = Math.cos(lobes * th - phase);                 // -1..1, `lobes` rounded peaks
      var shaped = (lobe < 0 ? -1 : 1) * Math.pow(Math.abs(lobe), sharp);
      shaped *= (0.55 + 0.45 * strength);
      var noise = wav * (0.6 * Math.sin(h1f * th + h1p) + 0.4 * Math.sin(h2f * th + h2p));
      var rr = radius * (1 + amp * shaped + amp * 0.6 * noise);
      if (rr < radius * 0.25) rr = radius * 0.25;              // keep it well-formed
      pts.push({ x: cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr });
    }
    return pts;
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // Append a smooth CLOSED curve through the (dense) points to the current path,
  // using a Catmull-Rom spline converted to cubic beziers.
  function splatCurveTo(ctx, pts, tension) {
    var n = pts.length;
    if (n < 3) return;
    var k = (tension != null ? tension : 0.5) / 3;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1x = p1.x + (p2.x - p0.x) * k, c1y = p1.y + (p2.y - p0.y) * k;
      var c2x = p2.x - (p3.x - p1.x) * k, c2y = p2.y - (p3.y - p1.y) * k;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
    }
    ctx.closePath();
  }

  // Begin a fresh path shaped as a splat outline (for fill / stroke / clip).
  function drawSplatPath(ctx, cx, cy, radius, opts) {
    var pts = buildSplat(cx, cy, radius, opts);
    ctx.beginPath();
    splatCurveTo(ctx, pts, 0.5);
    return pts;
  }

  // A standalone Path2D of a splat outline (for isPointInPath containment tests).
  function splatPath2D(cx, cy, radius, opts) {
    var path = new Path2D();
    splatCurveTo(path, buildSplat(cx, cy, radius, opts), 0.5);
    return path;
  }

  // ---- The generated CD cover --------------------------------------------------
  //
  // A reflective disc drawn entirely in canvas - the flagship demonstration that
  // a PuttyPNG cover can be generated in JavaScript. Transparent outside the disc
  // by default (a soft-gradient background is optional), with a curved label and
  // rim microtext. The anti-aliased rim is hardened to binary alpha so no data
  // pixel borders transparency. Only runs in a browser (needs a canvas).

  var CD_LABEL_MIN = 96;    // draw the arc label only at/above this disc size
  var CD_RIM_MIN = 128;     // draw the rim microtext only at/above this size

  // The rim microtext when the caller sets no `rimText`. It tells a person who
  // receives the image what to do with it, which the image cannot say by itself.
  var CD_RIM_DEFAULT = "Decode at PuttyPNG.com";

  // The rim text is drawn twice, at the top and the bottom of the rim. Each copy
  // gets half the circle, so it must stay inside this arc to leave a clear gap
  // on both sides. Measured in radians.
  var CD_RIM_MAX_ARC = Math.PI * 0.82;

  // Named rim text sizes, as a fraction of the disc size.
  var CD_RIM_SCALE = { small: 0.021, medium: 0.027, large: 0.034, xlarge: 0.042 };
  var CD_RIM_BUMP = 2;

  // A CSS pixel is 96 per inch and a point is 72 per inch.
  var PT_TO_PX = 96 / 72;

  // A point size for the rim is read against this disc size, then scaled to the
  // real disc. 13pt means "13pt on a 256px disc", so a 512px disc draws it twice
  // as large and the text keeps the same proportion of the rim at every size.
  var CD_RIM_REF_SIZE = 256;

  // Clear space between the hub edge and the text's ink, as a fraction of the
  // disc. The hub is drawn after the surface and its size is adjustable, so the
  // text is placed clear of it instead of sitting at a fixed radius.
  var CD_RIM_HUB_GAP = 0.012;

  // Dot-clearing defaults, both measured on a CD_RIM_REF_SIZE disc.
  var CD_TEXT_PAD_DEFAULT = 4;      // px of clear space around the text
  var CD_TEXT_CLEAR_DEFAULT = 0.25; // how much of that space is emptied

  // The clear space around rim text, scaled from the reference disc so it
  // tracks the text, which is sized the same way.
  function resolveTextPad(splat, size) {
    var pad = splat.textBuffer != null ? splat.textBuffer : CD_TEXT_PAD_DEFAULT;
    return pad * (size / CD_RIM_REF_SIZE);
  }

  // The text may run past CD_RIM_MAX_ARC and wrap the whole rim. It is only
  // reduced when it would lap over its own start, which no size can read.
  var CD_RIM_FULL_ARC = Math.PI * 2 * 0.97;

  // The raised look for the rim microtext, as fractions of the font size.
  // The disc surface below the text is a busy rainbow of stippled dots, so the
  // text needs its own light ground to stay readable at a small size.
  // A stroke sits centered on the glyph outline, so half of it grows inward and
  // narrows the holes in letters such as e and a. This ratio is kept low on
  // purpose: enough halo to separate the text, not enough to close it up.
  var CD_RIM_HALO_WIDTH = 0.26;    // outline thickness, total across the stroke
  var CD_RIM_HALO_BLUR = 0.24;     // shadow softness
  var CD_RIM_HALO_LIFT = 0.12;     // shadow offset below each letter

  // Build the outline and shadow settings for a rim text of `px` pixels.
  function rimTextStyle(px) {
    return {
      textColor: "rgba(24,24,30,0.95)",
      haloColor: "rgba(255,255,255,0.92)",
      haloWidth: Math.max(1.4, px * CD_RIM_HALO_WIDTH),
      shadowColor: "rgba(0,0,0,0.38)",
      shadowBlur: Math.max(1, px * CD_RIM_HALO_BLUR),
      shadowOffsetY: Math.max(0.6, px * CD_RIM_HALO_LIFT)
    };
  }

  // How far the finished text reaches from its own centre line, counting the
  // glyphs, the outline that sits around them, and the shadow under them.
  // The rim is placed using this, so nothing the text draws can be clipped.
  function rimInkReach(style, px) {
    return px / 2 + style.haloWidth / 2 + style.shadowBlur + style.shadowOffsetY;
  }

  // Radii (in pixels) for a square CD of the given side length.
  function cdGeometry(size) {
    var c = size / 2;
    return {
      cx: c, cy: c,
      rOuter: size * 0.48,   // disc edge
      rSheen: size * 0.46,   // reflective surface extent
      rLabel: size * 0.40,   // curved label arc radius
      rRim: size * 0.235,    // rim microtext radius
      rHub: size * 0.20,     // grey clamping hub
      rHole: size * 0.075    // transparent spindle hole
    };
  }

  // Draw a string centered on an arc around (cx, cy). `centerAngle` is where the
  // middle of the text sits (radians; -PI/2 is the top, +PI/2 the bottom). Text
  // on the bottom half is flipped so it stays upright to the viewer.
  // `spacing` adds pixels after every letter. `mode` is "stroke" to draw the
  // outlines or "fill" to draw the letters, and defaults to "fill".
  //
  // Each pass does one job on purpose. Stroking and filling a letter before
  // moving to the next one lets the next letter's outline paint over the previous
  // letter, which eats a sliver off its edge. Every outline must be laid
  // down before any letter is.
  function drawTextOnArc(ctx, text, cx, cy, radius, centerAngle, spacing, mode) {
    spacing = spacing || 0;
    var bottom = Math.sin(centerAngle) > 0;
    var dir = bottom ? -1 : 1;                 // advance direction along the arc
    var widths = [], total = 0, i;
    for (i = 0; i < text.length; i++) {
      var w = ctx.measureText(text[i]).width + spacing;
      widths.push(w); total += w;
    }
    var totalAngle = total / radius;
    var angle = centerAngle - dir * totalAngle / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < text.length; i++) {
      var charAngle = widths[i] / radius;
      var a = angle + dir * charAngle / 2;
      ctx.save();
      ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2));
      if (mode === "stroke") ctx.strokeText(text[i], 0, 0);
      else ctx.fillText(text[i], 0, 0);
      ctx.restore();
      angle += dir * charAngle;
    }
    ctx.restore();
  }

  // Draw the rim microtext as one piece.
  //
  // The text goes onto its own transparent canvas: every outline first, then
  // every letter on top. That canvas is then composited in one go with the
  // shadow applied, so the whole word casts a single drop shadow instead of
  // each letter casting its own onto its neighbours.
  function drawRimText(ctx, rimBand, geo, size, style) {
    var font = "600 " + rimBand.px + "px -apple-system, Segoe UI, Roboto, sans-serif";
    var layer = makeCanvas(size, size);
    var lc = layer.getContext("2d");
    lc.font = font;
    // Ask for shape-accurate glyphs. A browser that does not know this property
    // ignores it, and canvas text is smoothed either way.
    lc.textRendering = "geometricPrecision";
    lc.lineJoin = "round";
    lc.miterLimit = 2;
    lc.lineWidth = style.haloWidth;
    lc.strokeStyle = style.haloColor;
    lc.fillStyle = style.textColor;

    var copies = rimBand.spans.map(function (s) { return s.center; });
    var pass, c;
    for (pass = 0; pass < 2; pass++) {
      var mode = pass === 0 ? "stroke" : "fill";
      for (c = 0; c < copies.length; c++) {
        drawTextOnArc(lc, rimBand.text, geo.cx, geo.cy, rimBand.radius, copies[c], rimBand.spacing, mode);
      }
    }

    ctx.save();
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
    ctx.shadowOffsetY = style.shadowOffsetY;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  // Angular width (radians) the text would occupy at a given font + radius.
  // `spacing` is extra pixels added after every letter. It must be applied here
  // as well as when drawing, or the fit decision and the drawn text disagree.
  function arcTextAngle(ctx, text, radius, font, spacing) {
    spacing = spacing || 0;
    ctx.save(); ctx.font = font;
    var total = 0;
    for (var i = 0; i < text.length; i++) total += ctx.measureText(text[i]).width + spacing;
    ctx.restore();
    return total / radius;
  }

  // The smallest distance between two angles on a circle, in radians.
  function angleGap(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  }

  // The pixel size for the rim microtext, before any fitting.
  // rimSize accepts a number of POINTS for an exact size, or one of the names
  // in CD_RIM_SCALE to scale with the disc.
  // A number is points measured against a CD_RIM_REF_SIZE disc, then scaled to
  // the real disc, so the text keeps its proportion at any size. A name picks a
  // fraction of the disc directly.
  function resolveRimPx(rimSize, size) {
    if (typeof rimSize === "number" && rimSize > 0) {
      return Math.max(4, Math.round(rimSize * PT_TO_PX * (size / CD_RIM_REF_SIZE)));
    }
    var mult = CD_RIM_SCALE[rimSize] || CD_RIM_SCALE.medium;
    return Math.max(9, Math.round(size * mult) + CD_RIM_BUMP);
  }

  // Work out the rim microtext, its size, and how it is laid out. This runs
  // before the surface is stippled, so the dots can be cleared around the text
  // wherever the text ends up.
  //
  // Two layouts:
  //   short text -> one copy at the top and one at the bottom, mirrored.
  //   long text  -> one copy that wraps the whole rim.
  //
  // Returns null when there is no rim text, or the disc is too small to read it.
  function resolveRim(ctx, opts, geo, size, pad) {
    var text = opts.rimText != null && opts.rimText !== "" ? String(opts.rimText) : CD_RIM_DEFAULT;
    if (!text || size < CD_RIM_MIN) return null;

    var family = "px -apple-system, Segoe UI, Roboto, sans-serif";
    var px = resolveRimPx(opts.rimSize, size);
    // Letter spacing is given for a reference disc too, so it tracks the text.
    var spacing = (opts.rimSpacing || 0) * (size / CD_RIM_REF_SIZE);
    var forced = opts.rimTwoSided === true;

    // Place the text so its outline and shadow clear the hub. The hub is drawn
    // over the surface, and its size is adjustable up to a point where it would
    // otherwise swallow the rim, so the radius is worked out from the ink the
    // text really puts down rather than assumed.
    var radius, reach, arc;
    var measure = function () { return arcTextAngle(ctx, text, radius, "600 " + px + family, spacing); };

    for (;;) {
      reach = rimInkReach(rimTextStyle(px), px);
      radius = Math.max(geo.rRim, geo.rHub + reach + CD_RIM_HUB_GAP * size);
      // The text must also stay inside the reflective surface.
      if (radius + reach <= geo.rSheen || px <= 5) break;
      px -= 1;
    }

    arc = measure();

    // Two copies each need their own half of the circle, so forcing two sides
    // means the text must be reduced to fit one. Left free, the text may run
    // past that limit and wrap the rim, and is reduced only when it would lap
    // over its own start.
    var limit = forced ? CD_RIM_MAX_ARC : CD_RIM_FULL_ARC;
    while (px > 5 && arc > limit) {
      px -= 1;
      reach = rimInkReach(rimTextStyle(px), px);
      radius = Math.max(geo.rRim, geo.rHub + reach + CD_RIM_HUB_GAP * size);
      arc = measure();
    }

    var twoSided = forced || arc <= CD_RIM_MAX_ARC;

    // Where the text sits, so the imprint can clear the dots around it and
    // nowhere else. `pad` is the buffer in pixels, converted to an angle at the
    // text radius for the sideways part.
    var halfHeight = reach + pad;
    var halfArc = Math.min(Math.PI, arc / 2 + pad / radius);
    var spans = twoSided
      ? [{ center: -Math.PI / 2, half: halfArc }, { center: Math.PI / 2, half: halfArc }]
      : [{ center: -Math.PI / 2, half: halfArc }];

    return {
      text: text, px: px, arc: arc, spacing: spacing, twoSided: twoSided,
      radius: radius, rIn: radius - halfHeight, rOut: radius + halfHeight, spans: spans
    };
  }

  // The curved top label: centered at 12 o'clock, shrinking the font to fit, then
  // Resolve a label size to pixels, RESPONSIVE to the disc size. Accepts the
  // named sizes "small" | "medium" | "large" | "xlarge" (each a fraction of the
  // disc radius, so it scales with the image), or a raw pixel number (legacy).
  var CD_LABEL_SCALE = { small: 0.11, medium: 0.145, large: 0.185, xlarge: 0.23 };
  function resolveLabelFont(fontSize, geo) {
    if (typeof fontSize === "number" && fontSize > 0) return Math.round(fontSize);
    var mult = CD_LABEL_SCALE[fontSize] || CD_LABEL_SCALE.medium;
    return Math.max(9, Math.round(geo.rOuter * mult));
  }

  // wrapping onto a second (inner) arc if it is still too long.
  function drawCdLabel(ctx, label, geo, fontFamily, fontSizeOverride) {
    var maxArc = Math.PI * 0.95;               // ~171 degrees of the top
    // Start from the requested size (if any), else auto from the disc size.
    var fontSize = fontSizeOverride ? Math.round(fontSizeOverride) : Math.max(9, Math.round(geo.rOuter * 0.16));
    var minFont = 9;
    var font;

    // Shrink to fit one line if we can.
    while (fontSize >= minFont) {
      font = "600 " + fontSize + "px " + fontFamily;
      if (arcTextAngle(ctx, label, geo.rLabel, font) <= maxArc) {
        ctx.font = font; ctx.fillStyle = "rgba(30,30,35,0.92)";
        drawTextOnArc(ctx, label, geo.cx, geo.cy, geo.rLabel, -Math.PI / 2);
        return;
      }
      fontSize -= 1;
    }

    // Still too long at the minimum font: split into two lines on two arcs.
    font = "600 " + minFont + "px " + fontFamily;
    ctx.font = font; ctx.fillStyle = "rgba(30,30,35,0.92)";
    var mid = splitInTwo(label);
    var lineGap = minFont + 3;
    drawTextOnArc(ctx, mid[0], geo.cx, geo.cy, geo.rLabel, -Math.PI / 2);
    drawTextOnArc(ctx, mid[1], geo.cx, geo.cy, geo.rLabel - lineGap, -Math.PI / 2);
  }

  // "Burned-in" image imprint: render a grayscale stipple of a source image onto
  // the disc annulus, the way a 90s laser labeller (LightScribe) etched discs.
  // Darker areas of the source become denser, darker dots; light areas stay clear.
  // Confined to the ring between the hub and the outer edge; drawn beneath the
  // label so the text stays legible on top.
  function imprintStipple(ctx, img, geo, size, labelActive) {
    // Sample the source at disc resolution, cover-fit into the disc's square.
    var d = Math.max(16, Math.ceil(geo.rOuter * 2));
    var off = makeCanvas(d, d);
    var octx = off.getContext("2d", { willReadFrequently: true });
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    var iw = img.width, ih = img.height;
    var cover = Math.max(d / iw, d / ih);
    var cw = iw * cover, ch = ih * cover;
    octx.drawImage(img, (d - cw) / 2, (d - ch) / 2, cw, ch);
    var src = octx.getImageData(0, 0, d, d).data;

    var rIn = geo.rHub * 1.12;
    var rOut = geo.rOuter * 0.94;
    var step = Math.max(1.5, size / 240);                  // finer grid -> ~2x more dots
    var dotR = Math.max(0.4, step * 0.34);                 // smaller, uniform dots

    ctx.save();
    ctx.fillStyle = "rgba(12,12,16,1)";
    for (var y = -geo.rOuter; y < geo.rOuter; y += step) {
      for (var x = -geo.rOuter; x < geo.rOuter; x += step) {
        var r = Math.sqrt(x * x + y * y);
        if (r < rIn || r > rOut) continue;                 // annulus only
        var sx = (x + geo.rOuter) | 0, sy = (y + geo.rOuter) | 0;
        if (sx < 0 || sy < 0 || sx >= d || sy >= d) continue;
        var si = (sy * d + sx) * 4;
        if (src[si + 3] < 128) continue;                   // transparent source -> skip
        var lum = src[si] * 0.299 + src[si + 1] * 0.587 + src[si + 2] * 0.114;
        var darkness = 1 - lum / 255;                      // 0 (white) .. 1 (black)
        if (darkness < 0.12) continue;                     // leave light areas clear
        // Thin the imprint out under the top label band so the label stays crisp.
        if (labelActive && r > geo.rLabel * 0.78) {
          var ang = Math.atan2(y, x);
          var fromTop = Math.abs(((ang + Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (fromTop < 1.0 && Math.random() > darkness * 0.35) continue;
        }
        if (Math.random() > darkness * 1.2) continue;      // density by darkness
        var jx = geo.cx + x + (Math.random() - 0.5) * step * 0.5;   // less jitter -> uniform
        var jy = geo.cy + y + (Math.random() - 0.5) * step * 0.5;
        ctx.globalAlpha = 0.35 + darkness * 0.4;
        ctx.beginPath();
        ctx.arc(jx, jy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // The default PuttyPNG branding: our "putty splat" silhouette stippled into the
  // disc surface as ink dots, centred and ~60% of the disc across. The grey hub is
  // drawn on top afterwards, so the splat reads as putty behind the hub; dots
  // inside the hub are skipped. splat: { points, curve, waviness, amplitude, seed,
  // size } (size = fraction of the disc side; default 0.6).
  var CD_SPLAT_DEFAULT = {
    points: 5, curve: 0, waviness: 1, amplitude: 0.16, seed: 7, size: 0.6,
    dotColor: "rainbowSoft"
  };

  // The fill style for a splat dot given the chosen palette and the dot's angle
  // from centre (used for the rainbow palettes). Named palettes are solid colours.
  function splatDotStyle(palette, angle) {
    var hue = ((angle + Math.PI) / (Math.PI * 2)) * 360;   // 0..360
    switch (palette) {
      case "white": return "rgb(248,248,252)";
      case "dkgray": return "rgb(58,60,66)";
      case "ltgray": return "rgb(150,152,158)";
      case "blue": return "rgb(46,92,178)";
      case "red": return "rgb(178,44,48)";
      case "orange": return "rgb(206,112,40)";
      case "yellow": return "rgb(196,168,44)";
      case "green": return "rgb(52,142,72)";
      case "rainbowStrong": return "hsl(" + hue + ", 78%, 46%)";
      case "rainbowSoft": return "hsl(" + hue + ", 42%, 40%)";   // soft, darker than the CD sheen
      case "black":
      default: return "rgb(14,14,18)";
    }
  }

  function imprintSplat(ctx, geo, size, splat, labelActive, rimBand) {
    var s = {
      points: splat.points != null ? splat.points : CD_SPLAT_DEFAULT.points,
      curve: splat.curve != null ? splat.curve : CD_SPLAT_DEFAULT.curve,
      waviness: splat.waviness != null ? splat.waviness : CD_SPLAT_DEFAULT.waviness,
      amplitude: splat.amplitude != null ? splat.amplitude : CD_SPLAT_DEFAULT.amplitude,
      seed: splat.seed != null ? splat.seed : CD_SPLAT_DEFAULT.seed
    };
    var frac = splat.size != null ? splat.size : CD_SPLAT_DEFAULT.size;
    var radius = frac * size / 2;                         // "60% of the CD" -> radius 0.3*size

    // Draw the splat at its natural size (no fit-scaling). We instead cull any dot
    // that lands too close to the disc edge or the hub, so the imprint always keeps
    // a clean margin from both without reshaping the splat.
    var pts = buildSplat(geo.cx, geo.cy, radius, s);
    var path = new Path2D();
    splatCurveTo(path, pts, 0.5);
    // The splat's lobes reach well PAST `radius` (~1.2-1.7x), so the dot-sampling grid
    // must span the splat's TRUE extent, not `radius` -- otherwise the outer part of
    // every lobe is never sampled and the shape gets sliced into a flat box.
    var maxR = 0, mi;
    for (mi = 0; mi < pts.length; mi++) {
      var mdx = pts[mi].x - geo.cx, mdy = pts[mi].y - geo.cy;
      var mrr = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mrr > maxR) maxR = mrr;
    }

    // Adjustable dot look (px). Defaults scale gently with the disc size.
    var step = splat.separation != null ? Math.max(1, splat.separation) : Math.max(1.5, size / 240);
    var dotMin = splat.dotMin != null ? splat.dotMin : Math.max(0.4, step * 0.28);
    var dotMax = splat.dotMax != null ? splat.dotMax : Math.max(dotMin, step * 0.5);
    var textBuf = resolveTextPad(splat, size);
    // How many of the dots inside the text buffer are removed, from 0 to 1.
    // A higher value leaves the text cleaner and the surface emptier around it.
    var textClear = splat.textClear != null ? clamp01(splat.textClear) : CD_TEXT_CLEAR_DEFAULT;
    var palette = splat.dotColor || CD_SPLAT_DEFAULT.dotColor;
    var rainbow = palette === "rainbowSoft" || palette === "rainbowStrong";
    var rSkip = geo.rHub * 1.05;                          // stay 5% clear of the inner gray hub
    var rEdge = geo.rOuter * 0.95;                        // stay 5% clear of the disc border
    // Sample the full splat extent (dots past rEdge are culled below anyway), padded a
    // touch for the spline bulge between sample points, and never beyond the disc.
    var gridR = Math.min(maxR + step, geo.rOuter);

    ctx.save();
    if (!rainbow) ctx.fillStyle = splatDotStyle(palette, 0);
    ctx.globalAlpha = 0.62;
    for (var y = -gridR; y <= gridR; y += step) {
      for (var x = -gridR; x <= gridR; x += step) {
        var px = geo.cx + x, py = geo.cy + y;
        var r = Math.sqrt(x * x + y * y);
        if (r < rSkip || r > rEdge) continue;             // 5% clear of hub and edge
        if (!ctx.isPointInPath(path, px, py)) continue;   // inside the splat only
        var ang = Math.atan2(y, x);
        // Thin out around the top label so it stays crisp.
        if (labelActive && r > geo.rLabel - textBuf) {
          var fromTop = Math.abs(((ang + Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (fromTop < 1.0 && Math.random() < textClear) continue;
        }
        // Thin out around the rim text, and only there. rimBand carries the
        // band the text occupies and the arcs it runs along, both already
        // widened by the buffer, so a one-sided line clears one arc and leaves
        // the rest of the rim as it is.
        if (rimBand && r >= rimBand.rIn && r <= rimBand.rOut && Math.random() < textClear) {
          var covered = false;
          for (var sp = 0; sp < rimBand.spans.length; sp++) {
            if (angleGap(ang, rimBand.spans[sp].center) <= rimBand.spans[sp].half) { covered = true; break; }
          }
          if (covered) continue;
        }
        if (Math.random() > 0.9) continue;                // high, even fill (uniform)
        var jx = px + (Math.random() - 0.5) * step * 0.5; // low jitter -> uniform
        var jy = py + (Math.random() - 0.5) * step * 0.5;
        var dr = dotMin + Math.random() * (dotMax - dotMin);
        if (rainbow) ctx.fillStyle = splatDotStyle(palette, ang);
        ctx.beginPath();
        ctx.arc(jx, jy, dr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // The default informational rim text: "PuttyPNG | {size} | {contents|Secured}".
  function buildInfoRim(info) {
    info = info || {};
    var sz = info.size != null ? formatSize(info.size) : "";
    var contents;
    if (info.encrypted) contents = "Secured";
    else if (info.name) contents = info.name;
    else if (info.type === "text") contents = "text";
    else if (info.type === "json") contents = "JSON";
    else contents = "binary";
    return "PuttyPNG | " + sz + " | " + contents;
  }

  // Human-readable byte size.
  function formatSize(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " bytes";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  // Split a string into two roughly equal halves, preferring a space near the middle.
  function splitInTwo(text) {
    var target = Math.floor(text.length / 2);
    var left = text.lastIndexOf(" ", target);
    var right = text.indexOf(" ", target);
    var at = -1;
    if (left === -1 && right === -1) at = target;
    else if (left === -1) at = right;
    else if (right === -1) at = left;
    else at = (target - left <= right - target) ? left : right;
    return [text.slice(0, at).trim(), text.slice(at).trim()];
  }

  // Render a reflective CD of the given size. opts: { label, rimText, rimSize,
  // rimSpacing, rimTwoSided, fontFamily,
  // fontSize, solidBackground, imprint (a loaded HTMLImageElement) }. Returns
  // ImageData (not yet hardened).
  function drawCdCover(size, opts) {
    opts = opts || {};
    var geo = cdGeometry(size);
    // Adjustable hub + hole sizes (fractions of the disc side).
    var hubOpts = opts.hub || {};
    if (hubOpts.size != null) geo.rHub = size * hubOpts.size;
    if (hubOpts.holeSize != null) geo.rHole = size * hubOpts.holeSize;
    var canvas = makeCanvas(size, size);
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, size, size);

    // Optional soft-gradient background (fills the corners -> more capacity).
    if (opts.solidBackground) {
      var bg = ctx.createRadialGradient(geo.cx, geo.cy, size * 0.1, geo.cx, geo.cy, size * 0.75);
      bg.addColorStop(0, "#f4f4f6");
      bg.addColorStop(1, "#d9d9de");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
    }

    // --- Disc body: silver base ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(geo.cx, geo.cy, geo.rOuter, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    var silver = ctx.createRadialGradient(geo.cx, geo.cy, geo.rHub * 0.8, geo.cx, geo.cy, geo.rOuter);
    silver.addColorStop(0, "#d6d8dd");
    silver.addColorStop(0.5, "#eef0f3");
    silver.addColorStop(0.85, "#cccfd5");
    silver.addColorStop(1, "#b6b9c1");
    ctx.fillStyle = silver;
    ctx.fillRect(0, 0, size, size);

    // --- Rainbow diffraction sheen: a full conic sweep, weighted toward the rim ---
    var sheen;
    if (typeof ctx.createConicGradient === "function") {
      sheen = ctx.createConicGradient(-Math.PI / 2, geo.cx, geo.cy);
      sheen.addColorStop(0.00, "rgba(255,120,120,0.60)");
      sheen.addColorStop(0.14, "rgba(255,180,90,0.60)");
      sheen.addColorStop(0.28, "rgba(250,240,130,0.62)");
      sheen.addColorStop(0.42, "rgba(150,235,170,0.58)");
      sheen.addColorStop(0.56, "rgba(140,220,255,0.60)");
      sheen.addColorStop(0.70, "rgba(150,170,255,0.58)");
      sheen.addColorStop(0.84, "rgba(210,150,255,0.58)");
      sheen.addColorStop(1.00, "rgba(255,120,120,0.60)");
    } else {
      // Fallback: a diagonal rainbow band.
      sheen = ctx.createLinearGradient(0, 0, size, size);
      sheen.addColorStop(0.15, "rgba(255,180,90,0.55)");
      sheen.addColorStop(0.4, "rgba(250,240,130,0.6)");
      sheen.addColorStop(0.6, "rgba(140,220,255,0.6)");
      sheen.addColorStop(0.85, "rgba(210,150,255,0.5)");
    }
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, size, size);

    // Wash silver back over the centre so the rainbow concentrates near the rim
    // (real CD diffraction is strongest toward the outer edge).
    var wash = ctx.createRadialGradient(geo.cx, geo.cy, geo.rHub, geo.cx, geo.cy, geo.rOuter);
    wash.addColorStop(0.00, "rgba(233,235,239,0.92)");
    wash.addColorStop(0.50, "rgba(233,235,239,0.55)");
    wash.addColorStop(0.80, "rgba(233,235,239,0.16)");
    wash.addColorStop(1.00, "rgba(233,235,239,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, size, size);

    // Bias the rainbow toward one side (silver on the left, spectrum on the
    // right) so it reads like a disc catching the light rather than a full wheel.
    var side = ctx.createLinearGradient(0, 0, size, 0);
    side.addColorStop(0.00, "rgba(233,235,239,0.72)");
    side.addColorStop(0.45, "rgba(233,235,239,0.22)");
    side.addColorStop(1.00, "rgba(233,235,239,0)");
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, size, size);

    // Soft specular highlight (upper-left) for a reflective feel.
    var hx = geo.cx - geo.rOuter * 0.34, hy = geo.cy - geo.rOuter * 0.34;
    var spec = ctx.createRadialGradient(hx, hy, geo.rOuter * 0.08, hx, hy, geo.rOuter * 1.15);
    spec.addColorStop(0, "rgba(255,255,255,0.34)");
    spec.addColorStop(0.4, "rgba(255,255,255,0.08)");
    spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, size, size);

    // --- Concentric ring texture + fine stipple (also masks LSB embedding) ---
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = "#3a3a40";
    var ringStep = Math.max(2, Math.round(size / 120));
    for (var rr = geo.rHub; rr < geo.rOuter; rr += ringStep) {
      ctx.beginPath();
      ctx.arc(geo.cx, geo.cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Resolve the label up front so the stipple can clear a buffer around its arc.
    var labelActive = !!(opts.label && size >= CD_LABEL_MIN);
    var labelFontPx = resolveLabelFont(opts.fontSize, geo);
    var labelBand = labelActive
      ? { rIn: geo.rLabel - labelFontPx * 1.05, halfAngle: Math.PI * 0.52 }
      : null;

    // Resolve the rim text up front for the same reason: the imprint needs to
    // know where the text sits before it stipples dots over that band. The
    // buffer is resolved here too, because the text carries its own clear area.
    var splatOpts = opts.splat || {};
    var textPad = resolveTextPad(splatOpts, size);
    var rimBand = resolveRim(ctx, opts, geo, size, textPad);

    stippleSurface(ctx, geo, size, labelBand);

    // --- Imprint (beneath the label), still inside the disc clip ---
    // A user-supplied image wins; otherwise the default PuttyPNG "putty splat"
    // branding is stippled into the rainbow surface (the hub covers its middle).
    if (opts.imprint) {
      imprintStipple(ctx, opts.imprint, geo, size, labelActive);
    } else if (size >= CD_RIM_MIN) {
      imprintSplat(ctx, geo, size, opts.splat || {}, labelActive, rimBand);
    }

    ctx.restore();  // remove disc clip

    // --- Curved label (top) if the disc is big enough to read ---
    if (labelActive) {
      drawCdLabel(ctx, String(opts.label), geo,
        opts.fontFamily || "-apple-system, Segoe UI, Roboto, sans-serif", labelFontPx);
    }

    // --- The round clamping hub + transparent spindle hole ---
    // The hub is drawn before the rim text. resolveRim already places the text
    // clear of it, and drawing the hub first means a hub turned up to its
    // largest can never paint over the letters.
    drawCdCenter(ctx, geo, size, opts.hub || {});

    // --- Rim microtext, mirrored at top and bottom, or wrapped right around ---
    if (rimBand) {
      drawRimText(ctx, rimBand, geo, size, rimTextStyle(rimBand.px));
    }

    return ctx.getImageData(0, 0, size, size);
  }

  // Draw the CD's centre: the classic round clamping hub (grey gradient) with an
  // outer ring, a faint inner ring, and a fully transparent round spindle hole.
  // hub: { outerThickness, innerThickness } (hub/hole SIZE is applied to `geo`
  // upstream in drawCdCover). The transparent hole is what the user meant by "the
  // central whitespace treated as transparent".
  function drawCdCenter(ctx, geo, size, hub) {
    var outerW = size * (hub.outerThickness != null ? hub.outerThickness : 0.006);
    var innerW = size * (hub.innerThickness != null ? hub.innerThickness : 0.004);

    var grad = ctx.createRadialGradient(geo.cx, geo.cy, geo.rHole, geo.cx, geo.cy, geo.rHub);
    grad.addColorStop(0, "rgba(196,198,203,0.95)");
    grad.addColorStop(0.72, "rgba(210,212,217,0.95)");
    grad.addColorStop(1, "rgba(228,230,234,0.97)");
    ctx.beginPath();
    ctx.arc(geo.cx, geo.cy, geo.rHub, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = Math.max(1, outerW);
    ctx.strokeStyle = "rgba(150,152,158,0.85)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(geo.cx, geo.cy, geo.rHub * 0.62, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, innerW);
    ctx.strokeStyle = "rgba(160,162,168,0.5)";
    ctx.stroke();

    // Punch the spindle hole fully transparent. The fill must be fully opaque
    // (destination-out uses the SOURCE alpha), so use solid black.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(geo.cx, geo.cy, geo.rHole, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Fine darkening dots across the disc surface - looks like a disc and helps
  // hide the low-bit data embedding. Laid on an evenly-spaced (jittered) grid so
  // the dots have a consistent size and separation. `labelBand`, when given,
  // clears a buffer around the top label arc so the label reads cleanly.
  function stippleSurface(ctx, geo, size, labelBand) {
    var sep = Math.max(3, Math.round(size * 0.0105));   // ~2x the old density
    var dotR = Math.max(0.7, size * 0.0035);            // consistent middle size
    var jitter = sep * 0.34;
    ctx.fillStyle = "rgba(20,20,24,0.032)";             // ~20% less opaque than before
    for (var gy = -geo.rOuter; gy <= geo.rOuter; gy += sep) {
      for (var gx = -geo.rOuter; gx <= geo.rOuter; gx += sep) {
        var r = Math.sqrt(gx * gx + gy * gy);
        if (r < geo.rHub || r > geo.rOuter) continue;
        // Clear a buffer around the label arc (top sector, outer band).
        if (labelBand && r >= labelBand.rIn) {
          var ang = Math.atan2(gy, gx);
          var fromTop = Math.abs(((ang + Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (fromTop < labelBand.halfAngle) continue;
        }
        var jx = geo.cx + gx + (Math.random() - 0.5) * jitter * 2;
        var jy = geo.cy + gy + (Math.random() - 0.5) * jitter * 2;
        ctx.beginPath();
        ctx.arc(jx, jy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Size + render a generated cover to hold a prepared body. Finds the smallest
  // square (min 32, cap maxSize) whose OPAQUE pixels fit the data, growing when
  // transparency (the CD's corners + hole) leaves too few.
  //
  // To add a new generated style (e.g. "blob", "floppy"): write a
  // draw<Style>Cover(size, opts) that returns ImageData, add a branch here that
  // renders + hardens it in the same grow loop, and add its radio option in the UI.
  function fitGeneratedCover(style, prep, options) {
    options = options || {};
    if (style !== "cd") {
      // Noise is fully opaque, so the square math is exact.
      return generateNoiseImageData(chooseSize(prep.body.length, prep.widths, options));
    }
    if (!hasDOM()) fail("PTY-E09", "the CD cover requires a browser");

    var minSize = options.minSize || MIN_SIZE;
    var maxSize = options.maxSize || MAX_SIZE;
    var needed = neededPixelsFor(prep);
    var cdOpts = {
      label: options.label,
      rimText: options.rimText,
      rimSize: options.rimSize,
      rimSpacing: options.rimSpacing,
      rimTwoSided: options.rimTwoSided,
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      imprint: options.imprintImg,       // a pre-loaded HTMLImageElement (see encode)
      solidBackground: !!options.solidBackground,
      hub: options.hub,                  // { size, holeSize, outerThickness, innerThickness }
      splat: options.splat,              // default-imprint splat { points, curve, waviness, amplitude, seed, size }
      info: prep.info                    // { size, type, name, encrypted } -> informational rim text
    };

    // First guess assumes ~72% of the square is opaque disc (or 100% if solid bg).
    var fraction = options.solidBackground ? 0.98 : 0.72;
    var size = options.size || Math.max(minSize, Math.ceil(Math.sqrt(needed / fraction)));
    size = Math.min(size, maxSize);

    for (var iter = 0; iter < 8; iter++) {
      var imageData = drawCdCover(size, cdOpts);
      hardenCover(imageData);
      var opaque = opaquePixels(imageData.data, size, size).length;
      if (opaque >= needed) return imageData;
      if (size >= maxSize) break;
      var grow = Math.sqrt(needed / Math.max(1, opaque)) * 1.06;
      size = Math.min(maxSize, Math.max(size + 1, Math.ceil(size * grow)));
    }
    fail("PTY-E04", "the CD cannot hold " + needed + " opaque pixels even at " + maxSize + "px");
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new PuttyPNGError("PTY-E09")); };
      img.src = src;
    });
  }

  // Convert any decode source into an ImageData object.
  async function sourceToImageData(source) {
    if (!hasDOM()) fail("PTY-E09", "no DOM available to read the image");

    // Already ImageData-like.
    if (source && source.data && typeof source.width === "number" && typeof source.height === "number") {
      return source;
    }

    var img;
    if (typeof source === "string") {
      img = await loadImage(source);
    } else if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
      var cctx = source.getContext("2d", { willReadFrequently: true });
      return cctx.getImageData(0, 0, source.width, source.height);
    } else if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
      img = source;
    } else if (typeof Blob !== "undefined" && source instanceof Blob) {
      img = await loadImage(URL.createObjectURL(source));
    } else {
      fail("PTY-E09", "unrecognized image source");
    }

    var canvas = makeCanvas(img.width, img.height);
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height);
  }

  // Serialize an ImageData object to a lossless PNG (data URL + blob).
  async function imageDataToPng(imageData) {
    var canvas = makeCanvas(imageData.width, imageData.height);
    var ctx = canvas.getContext("2d");
    // imageData may be our plain {data,width,height}; wrap into a real ImageData.
    var real = (typeof ImageData !== "undefined" && imageData instanceof ImageData)
      ? imageData
      : new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
    ctx.putImageData(real, 0, 0);
    var dataUrl = canvas.toDataURL("image/png");
    var blob = await new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(resolve, "image/png");
      else resolve(null);
    });
    return { dataUrl: dataUrl, blob: blob };
  }

  // ===========================================================================
  // SECTION 8 - ENCODE / DECODE PIPELINE
  //
  // The orchestration. These functions take whatever a developer passed in,
  // drive every section above in the right order, and hand back a result.
  // Read this section to follow one byte from input to finished PNG.
  //
  // Turn whatever the developer handed us (text, an object, raw bytes, a File)
  // into a common shape: { bytes, name, type, mime }.
  // ===========================================================================

  async function normalizeInput(input, options) {
    options = options || {};
    if (input == null) fail("PTY-E08", "no data to encode");

    // A Blob or File (browser).
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      var buf = new Uint8Array(await input.arrayBuffer());
      return {
        bytes: buf,
        name: options.name || input.name || "",
        type: "binary",
        mime: options.mime || input.type || "application/octet-stream"
      };
    }
    if (input instanceof Uint8Array) {
      return {
        bytes: input,
        name: options.name || "",
        type: "binary",
        mime: options.mime || "application/octet-stream"
      };
    }
    if (input instanceof ArrayBuffer) {
      return {
        bytes: new Uint8Array(input),
        name: options.name || "",
        type: "binary",
        mime: options.mime || "application/octet-stream"
      };
    }
    if (typeof input === "string") {
      return {
        bytes: textToBytes(input),
        name: options.name || "",
        type: "text",
        mime: options.mime || "text/plain"
      };
    }
    if (typeof input === "object") {
      return {
        bytes: textToBytes(JSON.stringify(input)),
        name: options.name || "",
        type: "json",
        mime: "application/json"
      };
    }
    fail("PTY-E08", "unsupported input type");
  }

  // ---- Embed and extract, operating on an ImageData-like object ----------------
  //
  // These are the heart of the protocol. They take { data, width, height } and
  // either write the header+body into it or read them back. Everything above
  // canvas/PNG serialization is expressed here, which is why the self-test can
  // prove a full round-trip with no DOM.

  function embed(imageData, header, body, widths) {
    var px = imageData.data;
    var eligible = opaquePixels(px, imageData.width, imageData.height);
    var bodyPixels = pixelsForBytes(body.length, widths);
    if (eligible.length < HEADER_PIXELS + bodyPixels) {
      fail("PTY-E04", "cover holds " + eligible.length + " opaque pixels, need " + (HEADER_PIXELS + bodyPixels));
    }
    var afterHeader = writeBits(px, eligible, 0, HEADER_WIDTHS, bytesToBits(header));
    writeBits(px, eligible, afterHeader, widths, bytesToBits(body));
    return imageData;
  }

  // Read and validate the fixed header. Returns the parsed fields plus the
  // eligible-pixel list (so callers do not recompute it).
  function readHeader(imageData) {
    var px = imageData.data;
    var eligible = opaquePixels(px, imageData.width, imageData.height);
    if (eligible.length < HEADER_PIXELS) fail("PTY-E00");
    var headerBits = readBits(px, eligible, 0, HEADER_WIDTHS, HEADER_PIXELS);
    var header = bitsToBytes(headerBits).subarray(0, HEADER_LENGTH);
    var fields = parseHeader(header);
    fields.eligible = eligible;
    fields.subtle = !!(fields.flags & FLAG_SUBTLE);
    return fields;
  }

  // Pull `byteCount` body bytes starting at the first body pixel.
  function readBody(imageData, eligible, widths, byteCount) {
    var bodyPixels = pixelsForBytes(byteCount, widths);
    if (eligible.length < HEADER_PIXELS + bodyPixels) fail("PTY-E02", "image is truncated");
    var bits = readBits(imageData.data, eligible, HEADER_PIXELS, widths, bodyPixels);
    return bitsToBytes(bits).subarray(0, byteCount);
  }

  // ---- Pack and unpack: protocol orchestration, still canvas-free --------------

  // Turn the input + options into the exact bytes that will be embedded: the
  // 18-byte header and the body ([tag][outer metadata][payload]). This is where
  // compression and encryption happen. It is canvas-free, so the caller can learn
  // the final body length BEFORE it decides how big a cover needs to be.
  async function prepareBody(input, options) {
    options = options || {};
    var normalized = await normalizeInput(input, options);

    // 1) inner container (name/type/mime + data), all protectable content
    var processed = buildInnerContainer(normalized);
    var flags = 0;

    // 2) automatic compression (kept only if it helps)
    if (options.compress !== false) {
      var gz = await maybeCompress(processed);
      if (gz) { processed = gz; flags |= FLAG_COMPRESSED; }
    }

    // 3) optional encryption
    var outerMeta = new Uint8Array(0);
    if (options.password) {
      var enc = await encryptBytes(processed, options.password);
      processed = enc.cipher;
      outerMeta = textToBytes(JSON.stringify(enc.params));
      flags |= FLAG_ENCRYPTED;
    }

    // 4) depth + dev tag
    var widths = options.depth === "subtle" ? DEPTH_SUBTLE : DEPTH_STANDARD;
    if (options.depth === "subtle") flags |= FLAG_SUBTLE;
    var tagBytes = textToBytes(options.tag || "");
    if (tagBytes.length > 65535) fail("PTY-E11");

    // 5) header + body
    var payload = processed;
    var header = buildHeader({
      version: PROTOCOL_VERSION,
      flags: flags,
      tagLen: tagBytes.length,
      metaLen: outerMeta.length,
      payloadLen: payload.length,
      crc: crc32(payload)
    });
    var body = concatBytes([tagBytes, outerMeta, payload]);

    // Info about the ORIGINAL data, for the CD's informational rim text.
    var info = {
      size: normalized.bytes.length,
      type: normalized.type,
      name: normalized.name,
      encrypted: !!(flags & FLAG_ENCRYPTED)
    };

    return { header: header, body: body, widths: widths, flags: flags, info: info };
  }

  // How many opaque pixels a cover must have to hold a prepared body.
  function neededPixelsFor(prep) {
    return HEADER_PIXELS + pixelsForBytes(prep.body.length, prep.widths);
  }

  // Embed a prepared body into a given ImageData and return the result + stats.
  function assemble(prep, imageData) {
    embed(imageData, prep.header, prep.body, prep.widths);

    var eligibleCount = opaquePixels(imageData.data, imageData.width, imageData.height).length;
    var bodyCapacity = eligibleCount - HEADER_PIXELS;
    var capacityBytes = prep.widths === DEPTH_SUBTLE
      ? Math.floor(bodyCapacity * 3 / 8)
      : bodyCapacity;

    return {
      imageData: imageData,
      width: imageData.width,
      height: imageData.height,
      depth: prep.widths === DEPTH_SUBTLE ? "subtle" : "standard",
      compressed: !!(prep.flags & FLAG_COMPRESSED),
      encrypted: !!(prep.flags & FLAG_ENCRYPTED),
      bytesHidden: prep.header.length + prep.body.length,
      capacityBytes: capacityBytes,
      usedPercent: capacityBytes ? Math.round((prep.body.length / capacityBytes) * 100) : 0
    };
  }

  // Build the finished ImageData with everything embedded. `coverImageData`, if
  // given, is used as-is; otherwise noise is generated to fit. (Custom-cover
  // sizing lives in encode(), which needs the browser to rasterize the image.)
  async function pack(input, options, coverImageData) {
    var prep = await prepareBody(input, options);
    var imageData = coverImageData ||
      generateNoiseImageData(chooseSize(prep.body.length, prep.widths, options || {}));
    return assemble(prep, imageData);
  }

  // Read a peeked summary from the header (+ plaintext tag) without decrypting.
  function unpackHeader(imageData) {
    var fields = readHeader(imageData);
    var widths = fields.subtle ? DEPTH_SUBTLE : DEPTH_STANDARD;
    var tag = "";
    if (fields.tagLen > 0) {
      var body = readBody(imageData, fields.eligible, widths, fields.tagLen);
      tag = bytesToText(body.subarray(0, fields.tagLen));
    }
    return {
      isPuttyPNG: true,
      version: fields.version,
      compressed: !!(fields.flags & FLAG_COMPRESSED),
      encrypted: !!(fields.flags & FLAG_ENCRYPTED),
      depth: fields.subtle ? "subtle" : "standard",
      tag: tag,
      payloadBytes: fields.payloadLen,
      width: imageData.width,
      height: imageData.height
    };
  }

  // Full extraction: verify, decrypt, decompress, and parse into a result.
  async function unpack(imageData, options) {
    options = options || {};
    var fields = readHeader(imageData);
    var widths = fields.subtle ? DEPTH_SUBTLE : DEPTH_STANDARD;

    var bodyLen = fields.tagLen + fields.metaLen + fields.payloadLen;
    var body = readBody(imageData, fields.eligible, widths, bodyLen);

    var tagBytes = body.subarray(0, fields.tagLen);
    var outerMetaBytes = body.subarray(fields.tagLen, fields.tagLen + fields.metaLen);
    var payload = body.subarray(fields.tagLen + fields.metaLen, bodyLen);

    // integrity first - fails before we ever ask for a password
    if (crc32(payload) !== fields.crc) fail("PTY-E02");

    var processed = payload;

    // decrypt if needed
    if (fields.flags & FLAG_ENCRYPTED) {
      var params;
      try {
        params = JSON.parse(bytesToText(outerMetaBytes));
      } catch (e) {
        fail("PTY-E02", "encryption metadata unreadable");
      }
      var password = options.password;
      if (password == null && typeof PuttyPNG.passwordPrompt === "function") {
        password = await PuttyPNG.passwordPrompt({ message: "Enter password for this PuttyPNG:" });
      }
      if (password == null || password === "") fail("PTY-E07");
      processed = await decryptBytes(payload, password, params);
    }

    // decompress if needed
    if (fields.flags & FLAG_COMPRESSED) {
      processed = await gunzipBytes(processed);
    }

    // parse the inner container
    var inner = parseInnerContainer(processed);
    var meta = inner.meta || {};
    var data = inner.data;

    var result = {
      type: meta.type || "binary",
      name: meta.name || "",
      mime: meta.mime || "application/octet-stream",
      bytes: data,
      tag: fields.tagLen > 0 ? bytesToText(tagBytes) : "",
      encrypted: !!(fields.flags & FLAG_ENCRYPTED),
      compressed: !!(fields.flags & FLAG_COMPRESSED),
      depth: fields.subtle ? "subtle" : "standard",
      width: imageData.width,
      height: imageData.height
    };
    if (result.type === "text" || result.type === "json") {
      result.text = bytesToText(data);
      if (result.type === "json") {
        try { result.json = JSON.parse(result.text); } catch (e) { /* leave undefined */ }
      }
    }
    return result;
  }

  // ---- The browser layer: canvas to PNG and back -------------------------------
  //
  // Guarded, so the engine still loads and its logic still runs in a
  // non-browser environment such as Node.

  function hasDOM() { return typeof document !== "undefined"; }

  function makeCanvas(width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  // Draw a loaded image onto a w x h canvas using a fit mode, returning ImageData.
  // High-quality resampling is ON so shrinking or enlarging a cover looks smooth
  // (the decode path draws at natural size, so it stays pixel-exact regardless).
  //   crop      - fill the frame, cropping overflow (default)
  //   scale     - fit the whole image inside the frame (letterbox)
  //   center    - draw at native size, centered, no resize
  //   stretch   - distort to exactly fill the frame
  //   keepRatio - the frame already matches the image's aspect ratio, so this
  //               fills it while preserving the picture undistorted
  function fitCoverToImageData(img, w, h, fit) {
    var canvas = makeCanvas(w, h);
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    var iw = img.width, ih = img.height;

    if (fit === "stretch" || fit === "keepRatio") {
      ctx.drawImage(img, 0, 0, w, h);
    } else if (fit === "center") {
      ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
    } else if (fit === "scale") {
      var s = Math.min(w / iw, h / ih);
      var sw = iw * s, sh = ih * s;
      ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
    } else { // "crop" (cover) - default
      var c = Math.max(w / iw, h / ih);
      var cw = iw * c, ch = ih * c;
      ctx.drawImage(img, (w - cw) / 2, (h - ch) / 2, cw, ch);
    }
    return ctx.getImageData(0, 0, w, h);
  }

  // Size + fit a custom cover so it holds a prepared body. By default this
  // ignores the cover's own resolution and produces the smallest image that fits
  // (floored at minSize, default 256), scaling UP past the source resolution if
  // the data needs the room. Because a cover may contain transparency (fewer
  // opaque pixels than its area), we fit, count the opaque pixels, and grow until
  // the data fits or we hit maxSize (PTY-E04).
  function autoFitCover(coverImg, prep, options) {
    options = options || {};
    var fit = options.coverFit || "crop";
    var keepRatio = fit === "keepRatio";
    var maxSize = options.maxSize || MAX_SIZE;
    var needed = neededPixelsFor(prep);
    var aspect = coverImg.width / coverImg.height;
    if (!isFinite(aspect) || aspect <= 0) aspect = 1;

    var dimOpts = {
      minSize: options.minSize, maxSize: maxSize,
      size: options.size, sizeMode: options.sizeMode, keepRatio: keepRatio
    };

    // Target opaque count starts at `needed`; if transparency eats into it, we
    // scale the whole thing up and try again.
    var target = needed;
    var imageData = null;
    for (var iter = 0; iter < 10; iter++) {
      var d = coverDims(target, aspect, dimOpts);
      imageData = fitCoverToImageData(coverImg, d.w, d.h, fit);
      hardenCover(imageData);
      var opaque = opaquePixels(imageData.data, d.w, d.h).length;
      if (opaque >= needed) return imageData;

      // Not enough opaque pixels (transparent cover). Grow proportionally, but
      // stop if we are already pinned at the max size.
      if (Math.max(d.w, d.h) >= maxSize) break;
      // Once a fixed size has been honored once and still does not fit, stop
      // forcing it - let auto growth take over.
      dimOpts.size = undefined; dimOpts.sizeMode = undefined;
      target = Math.ceil(target * (needed / Math.max(1, opaque)) * 1.08);
    }
    fail("PTY-E04", "cover cannot hold " + needed + " opaque pixels even at " + maxSize + "px");
  }

  // ===========================================================================
  // SECTION 9 - PUBLIC API AND SELF-TEST
  //
  // Everything a developer calls, and the suite that proves it works. The
  // self-test runs in Node with no browser, and must report 33 passing.
  // ===========================================================================

  // Hide data inside a PNG. Returns { blob, dataUrl, width, height, ...stats }.
  PuttyPNG.encode = classified(async function encode(input, options) {
    options = options || {};
    var style = options.coverStyle || "noise";

    // The CD's smooth sheen defaults to subtle depth (invisible embedding). The
    // caller can still override depth explicitly.
    if (style === "cd" && options.depth == null) {
      options = Object.assign({}, options, { depth: "subtle" });
    }

    var packed;
    if (options.cover) {
      // Custom cover: prepare the body first so we know how much room the data
      // needs, then size + fit the cover to the SMALLEST image that holds it
      // (ignoring the cover's own resolution), scaling up only if required.
      if (!hasDOM()) fail("PTY-E09", "custom covers require a browser");
      var coverImg = (typeof HTMLImageElement !== "undefined" && options.cover instanceof HTMLImageElement)
        ? options.cover
        : await loadImage(typeof options.cover === "string" ? options.cover : URL.createObjectURL(options.cover));

      var prep = await prepareBody(input, options);
      var coverImageData = autoFitCover(coverImg, prep, options);   // fits + hardens
      if (opaquePixels(coverImageData.data, coverImageData.width, coverImageData.height).length < HEADER_PIXELS + 1) {
        fail("PTY-E10");
      }
      packed = assemble(prep, coverImageData);
    } else if (style === "cd") {
      // Generated CD cover: prepare the body, then size the disc to fit it.
      var cdPrep = await prepareBody(input, options);
      // Pre-load an imprint image (File/Blob/URL/Image) if one was supplied.
      if (options.imprint) {
        if (!hasDOM()) fail("PTY-E09", "the CD imprint requires a browser");
        var imprintImg = (typeof HTMLImageElement !== "undefined" && options.imprint instanceof HTMLImageElement)
          ? options.imprint
          : await loadImage(typeof options.imprint === "string" ? options.imprint : URL.createObjectURL(options.imprint));
        options = Object.assign({}, options, { imprintImg: imprintImg });
      }
      var cdImage = fitGeneratedCover("cd", cdPrep, options);       // fits + hardens
      if (opaquePixels(cdImage.data, cdImage.width, cdImage.height).length < HEADER_PIXELS + 1) {
        fail("PTY-E10");
      }
      packed = assemble(cdPrep, cdImage);
    } else {
      packed = await pack(input, options, null);
    }

    var out = {
      width: packed.width,
      height: packed.height,
      depth: packed.depth,
      compressed: packed.compressed,
      encrypted: packed.encrypted,
      bytesHidden: packed.bytesHidden,
      capacityBytes: packed.capacityBytes,
      usedPercent: packed.usedPercent,
      imageData: packed.imageData
    };

    if (hasDOM()) {
      var png = await imageDataToPng(packed.imageData);
      out.dataUrl = png.dataUrl;
      out.blob = png.blob;
    }
    return out;
  });

  // Read data back out of a PNG. Returns a result object (see unpack). If the
  // payload is a binary file and options.autoDownload is true, also downloads it.
  PuttyPNG.decode = classified(async function decode(source, options) {
    options = options || {};
    var imageData = await sourceToImageData(source);
    var result = await unpack(imageData, options);
    if (options.autoDownload && result.type === "binary") {
      PuttyPNG.download(result);
    }
    return result;
  });

  // Inspect a PuttyPNG without decrypting: version, flags, dev tag, size.
  PuttyPNG.peek = classified(async function peek(source) {
    try {
      var imageData = await sourceToImageData(source);
      return unpackHeader(imageData);
    } catch (e) {
      if (e && e.code === "PTY-E00") return { isPuttyPNG: false };
      throw e;
    }
  });

  // Convenience: save a decoded result (or a raw blob) to the user's disk.
  PuttyPNG.download = function download(resultOrBlob, filename) {
    if (!hasDOM()) fail("PTY-E09", "download requires a browser");
    var blob, name;
    if (typeof Blob !== "undefined" && resultOrBlob instanceof Blob) {
      blob = resultOrBlob;
      name = filename || "puttypng-file";
    } else {
      blob = new Blob([resultOrBlob.bytes], { type: resultOrBlob.mime || "application/octet-stream" });
      name = filename || resultOrBlob.name || "puttypng-file";
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Override point for the password prompt. Default uses the browser's native
  // prompt(); developers can replace this with a styled modal (see the docs).
  PuttyPNG.passwordPrompt = async function passwordPrompt(context) {
    if (typeof window !== "undefined" && window.prompt) {
      return window.prompt((context && context.message) || "Enter password:");
    }
    return null;
  };

  // Internals exposed for the self-test and advanced use.
  PuttyPNG.internals = {
    crc32: crc32,
    textToBytes: textToBytes,
    bytesToText: bytesToText,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    bytesToBits: bytesToBits,
    bitsToBytes: bitsToBytes,
    opaquePixels: opaquePixels,
    buildHeader: buildHeader,
    parseHeader: parseHeader,
    buildInnerContainer: buildInnerContainer,
    parseInnerContainer: parseInnerContainer,
    generateNoiseImageData: generateNoiseImageData,
    hardenCover: hardenCover,
    chooseSize: chooseSize,
    coverDims: coverDims,
    neededPixelsFor: neededPixelsFor,
    cdGeometry: cdGeometry,
    drawCdCover: drawCdCover,
    imprintStipple: imprintStipple,
    fitGeneratedCover: fitGeneratedCover,
    mulberry32: mulberry32,
    buildSplat: buildSplat,
    splatCurveTo: splatCurveTo,
    drawSplatPath: drawSplatPath,
    splatPath2D: splatPath2D,
    imprintSplat: imprintSplat,
    splatDotStyle: splatDotStyle,
    buildInfoRim: buildInfoRim,
    formatSize: formatSize,
    prepareBody: prepareBody,
    assemble: assemble,
    pack: pack,
    unpack: unpack,
    unpackHeader: unpackHeader,
    embed: embed,
    DEPTH_STANDARD: DEPTH_STANDARD,
    DEPTH_SUBTLE: DEPTH_SUBTLE
  };

  // ---- The self-test suite -----------------------------------------------------
  //
  // Registers a battery of round-trip and failure-mode checks. Runs fully in a
  // browser or in Node (it works at the ImageData level; PNG serialization is
  // lossless so it need not be exercised to prove the protocol).

  function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
  }
  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  // Encode to an ImageData (no canvas) then decode it back.
  async function roundTrip(input, options) {
    var packed = await pack(input, options || {}, null);
    return unpack(packed.imageData, options || {});
  }
  PuttyPNG._tests = [];
  function test(name, run) { PuttyPNG._tests.push({ name: name, run: run }); }

  test("CRC32 known-answer vector", async function () {
    assert(crc32(textToBytes("123456789")) === 0xcbf43926, "crc32 mismatch");
  });

  test("header build/parse round-trip", async function () {
    var h = buildHeader({ version: 1, flags: 5, tagLen: 7, metaLen: 9, payloadLen: 123456, crc: 0xdeadbeef });
    var f = parseHeader(h);
    assert(f.version === 1 && f.flags === 5 && f.tagLen === 7 && f.metaLen === 9, "header fields");
    assert(f.payloadLen === 123456 && f.crc === 0xdeadbeef, "header ints");
  });

  test("text round-trip (standard depth)", async function () {
    var r = await roundTrip("Hello, PuttyPNG!");
    assert(r.type === "text" && r.text === "Hello, PuttyPNG!", "text mismatch");
  });

  test("unicode text round-trip", async function () {
    var s = "putty éè 你好 😀 ✨";
    var r = await roundTrip(s);
    assert(r.text === s, "unicode mismatch: " + r.text);
  });

  test("JSON object round-trip", async function () {
    var obj = { game: "chess", moves: ["e4", "e5"], n: 42, nested: { ok: true } };
    var r = await roundTrip(obj);
    assert(r.type === "json" && JSON.stringify(r.json) === JSON.stringify(obj), "json mismatch");
  });

  test("binary round-trip (subtle depth)", async function () {
    var bytes = new Uint8Array(600);
    for (var i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 3) & 0xff;
    var r = await roundTrip(bytes, { depth: "subtle" });
    assert(r.type === "binary" && bytesEqual(r.bytes, bytes), "binary mismatch");
    assert(r.depth === "subtle", "depth flag lost");
  });

  test("compression is applied to compressible data", async function () {
    var repetitive = new Array(500).join("PUTTY");   // very compressible
    var packed = await pack(repetitive, {}, null);
    assert(packed.compressed === true, "expected compression to help");
    var r = await unpack(packed.imageData, {});
    assert(r.text === repetitive, "compressed text mismatch");
  });

  test("encryption round-trip with correct password", async function () {
    var r = await roundTrip("top secret", { password: "correct horse" });
    assert(r.encrypted === true, "encrypted flag missing");
    assert(r.text === "top secret", "decrypted text mismatch");
  });

  test("wrong password fails with PTY-E05", async function () {
    var packed = await pack("top secret", { password: "right" }, null);
    var code = null;
    try { await unpack(packed.imageData, { password: "wrong" }); }
    catch (e) { code = e.code; }
    assert(code === "PTY-E05", "expected PTY-E05, got " + code);
  });

  test("encrypted PuttyPNG hides filename/type until decrypted", async function () {
    var packed = await pack(new Uint8Array([1, 2, 3]), { password: "pw", name: "secret.bin" }, null);
    var peeked = unpackHeader(packed.imageData);
    assert(peeked.encrypted === true, "peek should see encrypted flag");
    assert(peeked.tag === "", "no tag expected");
    // Nothing in the peek reveals the name.
    assert(JSON.stringify(peeked).indexOf("secret.bin") === -1, "filename leaked in peek");
  });

  test("tampered payload fails CRC with PTY-E02", async function () {
    var packed = await pack("integrity matters", {}, null);
    // Flip a low bit of a body pixel (pixel 60 is well past the header).
    packed.imageData.data[60 * 4] ^= 1;
    var code = null;
    try { await unpack(packed.imageData, {}); }
    catch (e) { code = e.code; }
    assert(code === "PTY-E02", "expected PTY-E02, got " + code);
  });

  test("non-PuttyPNG image reports PTY-E00", async function () {
    var noise = generateNoiseImageData(64);
    var code = null;
    try { await unpack(noise, {}); }
    catch (e) { code = e.code; }
    assert(code === "PTY-E00", "expected PTY-E00, got " + code);
  });

  test("future protocol version reports PTY-E01", async function () {
    var packed = await pack("hi", {}, null);
    // Bump the version byte in the embedded header. Header is at subtle depth,
    // MSB-first: byte 4 (version) occupies header bits 32..39 => pixels 10..13.
    // Simplest: re-embed a header with version 99 over a fresh noise cover.
    var eligible = opaquePixels(packed.imageData.data, packed.imageData.width, packed.imageData.height);
    var badHeader = buildHeader({ version: 99, flags: 0, tagLen: 0, metaLen: 0, payloadLen: 1, crc: 0 });
    writeBits(packed.imageData.data, eligible, 0, HEADER_WIDTHS, bytesToBits(badHeader));
    var code = null;
    try { await unpack(packed.imageData, {}); }
    catch (e) { code = e.code; }
    assert(code === "PTY-E01", "expected PTY-E01, got " + code);
  });

  test("payload too large for a fixed size reports PTY-E04", async function () {
    // Incompressible random bytes with compression off, so it cannot shrink to fit.
    var big = crypto.getRandomValues(new Uint8Array(5000));
    var code = null;
    try { await pack(big, { size: 32, compress: false }, null); }   // 32x32 = 1024 px
    catch (e) { code = e.code; }
    assert(code === "PTY-E04", "expected PTY-E04, got " + code);
  });

  test("dev tag survives and is readable via peek (no decryption)", async function () {
    var packed = await pack("payload", { tag: "chess-save v3", password: "pw" }, null);
    var peeked = unpackHeader(packed.imageData);
    assert(peeked.tag === "chess-save v3", "tag mismatch: " + peeked.tag);
    assert(peeked.encrypted === true, "should still be encrypted");
  });

  test("auto-sized noise cover is 1:1 and within bounds", async function () {
    var packed = await pack("small", {}, null);
    assert(packed.width === packed.height, "cover not square");
    assert(packed.width >= MIN_SIZE && packed.width <= MAX_SIZE, "cover out of bounds");
  });

  test("hardenCover removes the semi-transparent fringe (binary alpha)", async function () {
    // Build a 4x4 cover: one fully transparent pixel, one anti-aliased fringe
    // pixel (alpha 128), the rest opaque.
    var img = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
    for (var i = 0; i < 16; i++) img.data[i * 4 + 3] = 255;
    img.data[0 * 4 + 3] = 0;      // fully transparent - should stay 0
    img.data[5 * 4 + 3] = 128;    // semi-transparent fringe - should become 255
    var changed = PuttyPNG.internals.hardenCover(img);
    assert(changed === 1, "expected exactly one pixel hardened, got " + changed);
    assert(img.data[0 * 4 + 3] === 0, "fully transparent pixel should be preserved");
    assert(img.data[5 * 4 + 3] === 255, "semi-transparent pixel should be hardened to 255");
    // No fractional alpha remains anywhere.
    for (var j = 0; j < 16; j++) {
      var a = img.data[j * 4 + 3];
      assert(a === 0 || a === 255, "fractional alpha left at pixel " + j + ": " + a);
    }
  });

  test("data survives in a cover that had transparency (after hardening)", async function () {
    // A cover with a transparent hole and a soft fringe still round-trips once
    // hardened, embedding only in the opaque pixels.
    var size = 40;
    var img = generateNoiseImageData(size);
    // Punch a transparent hole with a semi-transparent ring around it.
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var d = Math.sqrt((x - 20) * (x - 20) + (y - 20) * (y - 20));
        var idx = (y * size + x) * 4 + 3;
        if (d < 5) img.data[idx] = 0;
        else if (d < 7) img.data[idx] = 128;
      }
    }
    PuttyPNG.internals.hardenCover(img);
    var packed = await pack("hole-y cover still works", {}, img);
    var r = await unpack(packed.imageData, {});
    assert(r.text === "hole-y cover still works", "round-trip failed through hardened cover");
  });

  test("coverDims: square auto is smallest-that-fits, floored at MIN_SIZE", async function () {
    var tiny = coverDims(101, 1, {});                 // ~default text worth of pixels
    assert(tiny.w === 256 && tiny.h === 256, "tiny should floor to 256x256, got " + tiny.w + "x" + tiny.h);
    var big = coverDims(200000, 1, {});               // needs ~448px
    assert(big.w === big.h && big.w * big.h >= 200000, "big square must fit");
    assert(big.w >= 447 && big.w <= 460, "big square ~sqrt(200000), got " + big.w);
  });

  test("coverDims: custom cover size ignores native resolution", async function () {
    // A 1000-need with default floor should be ~32, NOT the source's size.
    var d = coverDims(101, 1, { minSize: 32 });
    assert(Math.max(d.w, d.h) <= 32, "auto must not inflate to source size");
  });

  test("coverDims: keepRatio preserves aspect ratio and floors short side", async function () {
    var d = coverDims(101, 2, { keepRatio: true });   // 2:1 landscape, tiny data
    assert(Math.abs(d.w / d.h - 2) < 0.15, "should keep ~2:1, got " + d.w + "x" + d.h);
    assert(Math.min(d.w, d.h) >= 256, "short side floored at 256, got " + Math.min(d.w, d.h));
  });

  test("coverDims: keepRatio scales UP to fit large data", async function () {
    var need = 500000;
    var d = coverDims(need, 2, { keepRatio: true });
    assert(Math.abs(d.w / d.h - 2) < 0.15, "ratio kept while scaling up");
    assert(d.w * d.h >= need, "keepRatio must scale up until it fits, got " + (d.w * d.h) + " < " + need);
  });

  test("coverDims: dev can override the floor via minSize", async function () {
    var d = coverDims(101, 1, { minSize: 128 });
    assert(d.w === 128 && d.h === 128, "minSize override should win, got " + d.w + "x" + d.h);
  });

  test("auto size floors at MIN_SIZE, which is 256", async function () {
    assert(MIN_SIZE === 256, "MIN_SIZE should be 256, got " + MIN_SIZE);
    var packed = await pack("hi", {}, null);
    assert(packed.width === 256 && packed.height === 256,
      "a tiny payload should still auto-size to 256x256, got " + packed.width + "x" + packed.height);
  });

  test("an explicit size is never raised to the minimum floor", async function () {
    // The floor guards AUTO sizing only. A caller asking for 64 gets 64.
    var packed = await pack("hi", { size: 64 }, null);
    assert(packed.width === 64 && packed.height === 64,
      "explicit size must win over the floor, got " + packed.width + "x" + packed.height);
  });

  test("buildSplat: densely sampled (>= 60 points, even)", async function () {
    var p = buildSplat(0, 0, 100, { points: 6 });
    assert(p.length >= 60, "expected >= 60 samples, got " + p.length);
  });

  test("buildSplat: has the requested number of lobes (radial maxima)", async function () {
    var lobes = 6;
    var pts = buildSplat(0, 0, 100, { points: lobes, amplitude: 0.4, waviness: 0, curve: 0.5, seed: 7 });
    var rs = pts.map(function (p) { return Math.sqrt(p.x * p.x + p.y * p.y); });
    var maxima = 0, n = rs.length;
    for (var i = 0; i < n; i++) {
      if (rs[i] > rs[(i - 1 + n) % n] && rs[i] >= rs[(i + 1) % n]) maxima++;
    }
    assert(maxima === lobes, "expected " + lobes + " lobes, found " + maxima);
  });

  test("buildSplat: deterministic for a seed, varies across seeds", async function () {
    var a = buildSplat(0, 0, 100, { points: 5, seed: 42 });
    var b = buildSplat(0, 0, 100, { points: 5, seed: 42 });
    var c = buildSplat(0, 0, 100, { points: 5, seed: 43 });
    assert(a[3].x === b[3].x && a[3].y === b[3].y, "same seed -> identical");
    assert(a[3].x !== c[3].x || a[3].y !== c[3].y, "different seed -> different");
  });

  test("buildSplat: radii stay within sane bounds", async function () {
    var R = 100, amp = 0.35, wav = 0.35;
    var pts = buildSplat(0, 0, R, { points: 7, amplitude: amp, waviness: wav, seed: 9 });
    var max = R * (1 + amp * 1.3 + amp * 0.45 * wav) + 1e-6;
    for (var i = 0; i < pts.length; i++) {
      var r = Math.sqrt(pts[i].x * pts[i].x + pts[i].y * pts[i].y);
      assert(r <= max && r >= R * 0.24, "vertex " + i + " r=" + r + " out of bounds (max " + max + ")");
    }
  });

  test("buildSplat: same seed scales concentrically with radius", async function () {
    var o = { points: 6, amplitude: 0.3, waviness: 0.3, seed: 7 };
    var a = buildSplat(0, 0, 50, o);
    var b = buildSplat(0, 0, 100, o);
    for (var i = 0; i < a.length; i++) {
      assert(Math.abs(b[i].x - 2 * a[i].x) < 1e-6 && Math.abs(b[i].y - 2 * a[i].y) < 1e-6,
        "vertex " + i + " not concentric");
    }
  });

  test("formatSize: bytes / KB / MB", async function () {
    assert(formatSize(320) === "320 bytes", "bytes");
    assert(formatSize(5320) === "5.2 KB", "KB, got " + formatSize(5320));
    assert(formatSize(3 * 1024 * 1024) === "3.00 MB", "MB, got " + formatSize(3 * 1024 * 1024));
  });

  test("splatDotStyle: solid palettes fixed, rainbow varies by angle", async function () {
    assert(splatDotStyle("black", 0) === "rgb(14,14,18)", "black");
    assert(splatDotStyle("blue", 1) === splatDotStyle("blue", 2), "solid is angle-independent");
    assert(splatDotStyle("rainbowSoft", 0) !== splatDotStyle("rainbowSoft", Math.PI), "rainbow varies by angle");
    assert(splatDotStyle("rainbowStrong", 0).indexOf("hsl(") === 0, "rainbow is hsl");
  });

  test("buildInfoRim: Secured when encrypted, else name/type", async function () {
    assert(buildInfoRim({ size: 5320, type: "binary", name: "x.zip", encrypted: true }) === "PuttyPNG | 5.2 KB | Secured", "encrypted -> Secured");
    assert(buildInfoRim({ size: 320, type: "text" }) === "PuttyPNG | 320 bytes | text", "text");
    assert(buildInfoRim({ size: 100, type: "json" }) === "PuttyPNG | 100 bytes | JSON", "json");
    assert(buildInfoRim({ size: 2048, type: "binary", name: "photo.jpg" }) === "PuttyPNG | 2.0 KB | photo.jpg", "file -> name");
  });

  // ---- self-test runner ------------------------------------------------------
  PuttyPNG.selfTest = async function selfTest() {
    var results = [];
    var passed = 0, failed = 0;
    for (var i = 0; i < PuttyPNG._tests.length; i++) {
      var t = PuttyPNG._tests[i];
      try {
        await t.run();
        results.push({ name: t.name, ok: true });
        passed++;
      } catch (err) {
        results.push({ name: t.name, ok: false, error: String((err && err.message) || err) });
        failed++;
      }
    }
    return { passed: passed, failed: failed, total: PuttyPNG._tests.length, results: results };
  };

  // ===========================================================================
  // Export - works as a browser global AND as a CommonJS module (Node runner).
  // ===========================================================================
  global.PuttyPNG = PuttyPNG;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = PuttyPNG;
  }

})(typeof globalThis !== "undefined" ? globalThis : this);
