/* ==========================================================================
   scripts.js - All page behavior for the PuttyPNG site.

   This file wires the page to the engine. It holds no steganography of its
   own: every byte-level operation belongs to puttypng.js, and this file only
   reads the form, calls the engine, and shows the answer.

   The file is divided into seven sections. Nothing here runs until the last
   line, which calls init(). Read the sections in order and the page assembles
   itself from fixed values, to helpers, to wiring, to the work itself.

   Requires: puttypng.js must load first. It defines the global PuttyPNG
   object that this file consumes.
   ========================================================================== */

(function () {
  "use strict";

  /* ==========================================================================
     SECTION 1 - HEADER / SETUP
     One IIFE wraps the whole file so the page adds no global names. The engine
     is reached through the global PuttyPNG object only.
     ========================================================================== */

  /* ==========================================================================
     SECTION 2 - CONSTANTS AND CONFIG
     Fixed values and the element handles the page reuses. Nothing here makes a
     decision. These are the names everything else refers to.
     ========================================================================== */

  // Timings, in milliseconds.
  var TOAST_MS = 2600;
  var COPY_FEEDBACK_MS = 1400;
  var SCROLL_DELAY_MS = 40;

  /* ==========================================================================
     THE BOARD
     Make and Load, the two columns the page opens on, and the deck the disc
     comes out of. Advanced hangs below them and is read at the moment of the
     press.
     ========================================================================== */

  // THE RUNGS. Capacities measured from the engine at the deeper depth, which
  // is 3/2/3 bits and so one byte for every opaque pixel of the CD cover.
  // Each rung keeps its own colour, so the finished bands read as a record of
  // the climb. The ladder steps gray, yellow, orange, hot orange, so a change
  // of rung is a change of hue and not only a change of shade.
  /* WHAT FITS, MEASURED FROM THE ENGINE.
     cap is with the jewel case behind the disc, which makes every pixel of the
     square opaque. clear is the bare disc, whose corners carry nothing.

     Each number is the opaque pixel count less 111 bytes, which is what the
     header costs. It is the same 111 at every size and either way, and it was
     found by encoding against a pinned ceiling: a fixed size on its own is
     where the engine starts, not where it stops, so a search that does not pin
     maxSize measures nothing but the engine's willingness to grow. */
  var RUNGS = [
    { px: 256,  cap: 65425,   clear: 46635,   color: [124, 124, 132] },
    { px: 512,  cap: 262033,  clear: 185969,  color: [226, 183,  47] },
    { px: 1024, cap: 1048465, clear: 742168,  color: [231, 130,  30] },
    { px: 2048, cap: 4194193, clear: 2965632, color: [226,  85,  26] }
  ];

  // Past the largest disc there is no rung, only a warning.
  var RUNG_OVER_COLOR = [198, 40, 40];

  // The donut, in the meter's own 100 by 100 co-ordinates.
  var R_OUT = 45;
  var R_IN = 21;
  var BAND_SPAN = R_OUT - R_IN;
  var MIN_BAND = 2.2;        // no finished ring may be thinner than this
  var HANDOFF = 0.75;        // where a rung starts fading into the next one
  var WARN_AT = 0.65;        // where the dotted line sits, ahead of that fade

  // The label grows exactly as the button shrinks, which is the joke.
  var RUNG_LABELS = [
    "Make a PuttyPNG",
    "Make a <em>BIG</em> PuttyPNG",
    "Make a <em>GIGANTIC</em> PuttyPNG",
    "Make a <em>VERY MASSIVE</em> PuttyPNG"
  ];
  var RUNG_LABEL_OVER = "<em>TOO MUCH</em>";

  // What share of the Make column the donut takes at each rung, and the pixel
  // width it can never drop below.
  var RUNG_SHARE = [0.28, 0.39, 0.50, 0.60];
  var METER_MIN_PX = 104;

  // Timings for the home board, in milliseconds.
  var RUNG_MOVE_MS = 460;      // one rung sliding inward as the next grows out
  var DISSOLVE_MS = 250;       // a deleted stretch of band coming apart
  var DISSOLVE_BITS = 40;      // how many pieces it comes apart into
  var HOME_SETTLE_MS = 110;    // how long typing settles before the meter redraws
  var READING_DELAY_MS = 130;  // how long a decode runs before it says it is working
  var HOME_FLASH_MS = 30;      // long enough for one painted frame of white
  var HOME_CONFIRM_MS = 1500;  // how long a control says it did its job
  var DISC_TOSS_MS = 360;      // a disc shrinking away
  var DISC_EJECT_MS = 20;      // the pause before a fresh disc is told to come out
  var DISC_DRAG_MS = 300;      // the carried copy fading after it is let go
  var DISC_SLACK_PX = 5;       // movement before a press counts as a drag
  var HOME_SAVE_MS = 4000;     // how long a download URL is kept alive

  // The line art the home board draws for itself. One shape serves every place
  // that needs it, so a mark can never drift between two copies of itself.
  var D_COPY = "M9.5 9.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" +
               "M15.5 6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2";
  var D_DOWN = "M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 20h15";
  var D_X = "M7.5 7.5l9 9M16.5 7.5l-9 9";
  var D_FILE = "M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5zM13.5 3v5.5H19";
  var D_TICK = "M5 12.5l4.5 4.5L19 7.5";

  var SVG_NS = "http://www.w3.org/2000/svg";

  // Engine error codes translated for a reader. The E## code stays visible so
  // a message can still be matched against the error table in the Docs tab.
  // Plain wording for the engine codes a person is most likely to meet.
  // Keys are quoted because a code carries a hyphen.
  var FRIENDLY_ERRORS = {
    "PTY-E00": "That image is not a PuttyPNG.",
    "PTY-E01": "This PuttyPNG needs a newer version of the engine.",
    "PTY-E02": "This PuttyPNG looks corrupted - it may have been re-saved lossily.",
    "PTY-E04": "That data is too large for the chosen image size.",
    "PTY-E05": "Wrong password.",
    "PTY-E07": "This PuttyPNG is encrypted - a password is needed.",
    "PTY-E10": "That cover image has too little opaque area to hold data."
  };

  // Every slider that is paired with a matching number field. The number field
  // is found by adding "Num" to the slider id.
  // THE SWITCH.
  // Two separate preferences. Animation is the motion. Celebration is the
  // confetti. A person may want the second without the first.
  //
  // Every animation checks animationsOn and, when it is off, jumps straight to
  // the finished state. Nothing is lost visually: the disc still appears, it
  // appears at once. This is what lets the engine be judged on its own.
  //
  // Phase 2 Part 3 adds the controls and the storage. This part only reads the
  // browser's own reduced-motion setting and honours it.
  var animationsOn = true;
  var celebrationOn = true;

  // The formation, as it is running now. The defaults are the FORM_ constants
  // and a stored choice replaces them at startup.
  var formStyle = "fade";
  var formMs = 620;
  var formOverlap = 20;

    '<path d="M12 5v13m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    '<path d="M12 19V6m0 0l-5 5m5-5l5 5" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';






  // The celebration. Ribbons only, with a ripple, from mockup F.
  var CONFETTI_COUNT = 60;
  var CONFETTI_LIFE_MS = 2200;
  var CONFETTI_COLORS = ["#c96f52", "#a8532f", "#e0a06f", "#7fa8a0", "#8a7fb0", "#d8c15e"];




  // Everything that can go wrong with a drop, before the engine sees a file.
  // Engine failures keep their own codes and are never repeated here, so one
  // event always has one code.
  var DROP_ERRORS = {
    "DRP-E00": "That is not a file.",
    "DRP-E01": "That is a folder. Drop a single file.",
    "DRP-E02": "One file at a time.",
    "DRP-E03": "That file is empty.",
    "DRP-E04": "That file is too large to read here.",
    "DRP-E05": "That PNG could not be opened as an image.",
    "DRP-E06": "Wait for the current drop to finish.",
    "DRP-E99": "That drop failed for an unknown reason."
  };

  // What the overlay says for each kind of drag. A PNG is the only ambiguous
  // case, because it may be a PuttyPNG to read or an image to hide.
  var VEIL_WORDS = {
    png:   ["Drop it anywhere", "A PuttyPNG decodes. Any other PNG attaches."],
    image: ["Attach this image", "It gets hidden inside your PuttyPNG."],
    other: ["Attach this file", "It gets hidden inside your PuttyPNG."],
    many:  ["One file at a time", "Drop a single file."]
  };

  // A drop has to fit in memory twice over, once as bytes and once as pixels.
  var MAX_DROP_BYTES = 64 * 1024 * 1024;

  var SLIDER_IDS = [
    "splHubSize", "splHoleSize", "splOuter", "splInner",
    "splPoints", "splCurve", "splWaviness", "splAmplitude", "splSize",
    "splDotSep", "splDotMin", "splDotMax", "splTextBuffer", "splTextClear",
    "optRimSize", "optRimSpacing"
  ];

  // What the engine snippet card says when it cannot show the real source.
  // There are two different reasons, and each one gets its own message.
  var ENGINE_SOURCE_LOCAL =
    "This page is open from a local file, so the browser will not let it read " +
    "puttypng.js.\n" +
    "Use the \"Download puttypng.js\" link below to get the engine.";

  var ENGINE_SOURCE_FAILED =
    "puttypng.js could not be loaded.\n" +
    "Check that the file sits next to index.html on the server.";

  var MIT_LICENSE =
    "MIT License\n\n" +
    "Copyright (c) 2026 Aaron Michael Harris\n\n" +
    "Permission is hereby granted, free of charge, to any person obtaining a copy\n" +
    "of this software and associated documentation files (the \"Software\"), to deal\n" +
    "in the Software without restriction, including without limitation the rights\n" +
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n" +
    "copies of the Software, and to permit persons to whom the Software is\n" +
    "furnished to do so, subject to the following conditions:\n\n" +
    "The above copyright notice and this permission notice shall be included in all\n" +
    "copies or substantial portions of the Software.\n\n" +
    "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n" +
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n" +
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n" +
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n" +
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n" +
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n" +
    "SOFTWARE.\n";

  // Element handles. These are looked up once because the page reuses them.
  // A control used in exactly one place is looked up where it is used instead.
  var toastEl = document.getElementById("toast");

  var advToggle = document.getElementById("advToggle");
  var advDrawer = document.getElementById("advDrawer");

  var sizeMode = document.getElementById("optSizeMode");
  var fixedSizeField = document.getElementById("fixedSizeField");
  var minSizeField = document.getElementById("minSizeField");
  var coverInput = document.getElementById("optCover");
  var coverFitField = document.getElementById("coverFitField");
  var cdControls = document.getElementById("cdControls");
  var cdAdvanced = document.getElementById("cdAdvanced");
  var imprintInput = document.getElementById("optImprint");
  var imprintInfo = document.getElementById("imprintInfo");
  var splatControls = document.getElementById("splatControls");
  var splatDisabledNote = document.getElementById("splatDisabledNote");


  var dropzone = document.getElementById("dropzone");
  var importFile = document.getElementById("importFile");

  var dropVeil = document.getElementById("dropVeil");
  var confettiHost = document.getElementById("confettiHost");

  // Page state that outlives any single function. Declared here so every
  // section can see it, and only ever changed through the functions below.
  var toastTimer = null;
  var veilDepth = 0;         // the same count, for the page-wide overlay
  var dropBusy = false;      // true while a drop is being read, so two cannot race
  var step = "input";        // which section the wide column is showing
  var subTabShow = null;     // set by wireSubTabs, so the cover style can switch group
  var tutLast = null;        // the same, for the Tutorial tab

  // The board's own state. Nothing outside the board reads or writes any of
  // it: a drop from another tab comes in through readSource and
  // takeHomeAttachment, and both of those go through the board's own code.
  var homeAttached = null;   // when set, Make presses this file instead of the text
  var homeLastBlob = null;   // the disc in the tray, for Copy, Save, and Load
  var homeLoadedBlob = null; // the disc showing in Load, for its own Copy and Save
  var homeDiscOut = false;   // a disc is sitting in the tray
  var homePressing = false;  // a press is running, and a second must wait
  var homeDrag = null;       // the disc being carried, or null
  var homeSettleTimer = 0;   // the wait after a keystroke before the meter redraws
  var homeRunToken = 0;      // which meter run is current, so a stale one cannot paint
  var homeReadTimer = 0;     // the wait before a decode says it is working
  var homeReadDepth = 0;     // how many decodes are running, so two cannot race
  var homeShownRung = 0;     // the rung the column width is currently set for
  var homeShownBands = null; // the ring layout on screen, which a change eases away from
  var homeShownFrac = 0;
  var homeMoveTimer = 0;
  var homeCurBand = { r0: R_IN, r1: R_OUT };  // the outer ring, where the cut is drawn
  var homeLastPacked = 0;    // the last measured packed size, to tell a delete from an add
  var homeLastDeg = 0;       // where the cut stood, so a delete knows what it is eating
  var homeLastRaw = 0;       // the raw size on the last keystroke, before compression
  var homeLastRung = 0;
  var homeDiscRun = 0;       // which disc is the current one, so a late toss
                             // cannot clear a disc that arrived after it
  var homeEncoder = new TextEncoder();

  /* ==========================================================================
     SECTION 3 - HELPER FUNCTIONS
     Small, single-purpose functions with no knowledge of the page's flow.
     ========================================================================== */

  // The home board reaches for a lot of small pieces by name, so it asks for
  // them one at a time rather than holding a handle to each.
  function $(id) { return document.getElementById(id); }

  // Whether the home board is the panel on screen. The page-wide drop overlay
  // and the page-wide paste both stand down while it is, because the board
  // carries two targets of its own and would otherwise read a file twice.
  function homeIsShowing() {
    var panel = $("tab-puttypng");
    return !!panel && panel.classList.contains("active");
  }

  // Show a short message at the bottom of the screen. kind is "ok" or "bad".
  function toast(message, kind) {
    toastEl.textContent = message;
    toastEl.className = "show" + (kind ? " " + kind : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ""; }, TOAST_MS);
  }

  // Turn an engine error into a readable line, keeping the E## code visible.
  function friendly(err) {
    var code = err && err.code;
    var text = FRIENDLY_ERRORS[code] || (err && err.message) || "Something went wrong";
    return text + (code ? " (" + code + ")" : "");
  }


  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Turn HTML entities back into characters. The snippet sources are stored
  // escaped in the markup so a browser cannot try to run them.
  function decodeEntities(s) {
    var t = document.createElement("textarea");
    t.innerHTML = s;
    return t.value;
  }

  /* ==========================================================================
     THE HOME BOARD - DRAWING AND MEASURING
     ========================================================================== */

  // One line-art mark, built rather than written into the markup, so the same
  // shape serves every control that needs it.
  function homeIcon(d, size, stroke) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' +
           '<path d="' + d + '" fill="none" stroke="' + (stroke || "currentColor") +
           '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  // A control that has done its job says so, then goes quiet again.
  function confirmDone(el, word) {
    if (el.dataset.busy) return;
    el.dataset.busy = "1";
    var was = el.innerHTML;
    el.classList.add("done");
    el.innerHTML = homeIcon(D_TICK, el.classList.contains("say") ? 15 : 13, "#ffffff") +
                   (word ? "<span>" + word + "</span>" : "");
    setTimeout(function () {
      el.innerHTML = was;
      el.classList.remove("done");
      delete el.dataset.busy;
    }, HOME_CONFIRM_MS);
  }

  // One round X, in the softer red, with a white cross. The loaded panel and
  // the attached file chip both wear it.
  function makeXButton(label, extraClass) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "xbtn" + (extraClass ? " " + extraClass : "");
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">' +
      '<path d="' + D_X + '" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>';
    return b;
  }

  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

  function mixColor(a, b, t) {
    return rgb([0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }));
  }

  // A point on the donut, measured clockwise from the top.
  function polar(deg, r) {
    var a = (deg - 90) * Math.PI / 180;
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
  }

  function setRadialLine(el, deg, r0, r1) {
    var p0 = polar(deg, r0), p1 = polar(deg, r1);
    el.setAttribute("x1", p0.x); el.setAttribute("y1", p0.y);
    el.setAttribute("x2", p1.x); el.setAttribute("y2", p1.y);
  }

  /* WHAT ONE DISC HOLDS AT THE CHOSEN DEPTH. The rung capacities were measured
     at the standard depth, which is one byte for every opaque pixel. The subtle
     depth writes three bits to the same pixel, so it holds three eighths as
     much and the reading has to say so. */
  function depthFactor() {
    var sel = $("optDepth");
    return sel && sel.value === "subtle" ? 3 / 8 : 1;
  }

  // Leaving the background out costs about three tenths of the square.
  function backgroundIsSolid() {
    var box = $("optSolidBg");
    return !box || box.checked;
  }

  function capOf(i) {
    var base = backgroundIsSolid() ? RUNGS[i].cap : RUNGS[i].clear;
    return Math.round(base * depthFactor());
  }

  // Which rung holds this many packed bytes, or one past the end when none does.
  function rungFor(bytes) {
    for (var i = 0; i < RUNGS.length; i++) if (bytes <= capOf(i)) return i;
    return RUNGS.length;
  }

  // The outer band is the rung you are on. Finished rungs share the inner
  // third, split by the square root of their capacity so the innermost stays
  // visible. A straight capacity split would make the 256 ring a hairline.
  function bandsFor(k) {
    if (k === 0) return [{ i: 0, r0: R_IN, r1: R_OUT }];
    var out = [], innerT = BAND_SPAN * 0.34, outerT = BAND_SPAN * 0.66, w = [], sum = 0, i;
    // Always the same number, so the rings keep their widths when the
    // background is switched. Only how full they are should change.
    for (i = 0; i < k; i++) { var v = Math.sqrt(RUNGS[i].cap); w.push(v); sum += v; }
    var r = R_IN;
    for (i = 0; i < k; i++) {
      var t = Math.max(MIN_BAND, innerT * w[i] / sum);
      out.push({ i: i, r0: r, r1: r + t, done: true });
      r += t;
    }
    out.push({ i: k, r0: R_OUT - outerT, r1: R_OUT });
    return out;
  }

  // A rung rests at its own colour, then hands over to the next one from three
  // quarters, so you arrive at a boundary already wearing where you are going.
  function colorFor(k, frac) {
    if (k >= RUNGS.length) return rgb(RUNG_OVER_COLOR);
    var base = RUNGS[k].color;
    var next = (k + 1 < RUNGS.length) ? RUNGS[k + 1].color : RUNG_OVER_COLOR;
    if (frac <= HANDOFF) return rgb(base);
    return mixColor(base, next, Math.min(1, (frac - HANDOFF) / (1 - HANDOFF)));
  }

  // The shorter of two ring layouts is padded with bands of no width. That is
  // where a new ring is born and where a lost one goes.
  function padBands(layout, len) {
    var out = layout.slice();
    while (out.length < len) out.push({ i: out.length, r0: R_OUT, r1: R_OUT, done: true });
    return out;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // The home board's own sizes. Short, because they sit under a small donut.
  function homeFmt(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(2) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " bytes";
  }

  // What the meter measures. The engine compresses before it fills a disc, so
  // the honest number is the packed size and not what was typed.
  async function packedSize(bytes) {
    if (typeof CompressionStream === "undefined") return bytes.byteLength;
    var cs = new CompressionStream("deflate-raw");
    var blob = new Blob([bytes]);
    var packed = await new Response(blob.stream().pipeThrough(cs)).blob();
    return Math.min(packed.size, bytes.byteLength);
  }

  function pointerInside(el, e) {
    var r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  // Save bytes to disk under a name. Used by every download the home offers.
  function saveBytes(href, name, revoke) {
    var a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, HOME_SAVE_MS);
  }

  // What is being dragged, from the little a browser reveals mid-drag.
  // The file name and its bytes are not readable until the drop lands, so a
  // PNG can only be called a candidate, never confirmed.
  function classifyDrag(e) {
    var items = e.dataTransfer && e.dataTransfer.items;
    if (!items) return "none";
    var files = 0;
    var png = 0;
    var image = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind !== "file") continue;
      files++;
      if (items[i].type === "image/png") png++;
      else if (items[i].type.indexOf("image/") === 0) image++;
    }
    if (files === 0) return "none";
    if (files > 1) return "many";
    if (png === 1) return "png";
    if (image === 1) return "image";
    return "other";
  }

  // Raise the overlay and say what this particular drag will do.
  function showDropVeil(kind) {
    var words = VEIL_WORDS[kind] || VEIL_WORDS.other;
    document.getElementById("dropBig").textContent = words[0];
    document.getElementById("dropSub").textContent = words[1];
    dropVeil.classList.remove("hidden");
  }

  function hideDropVeil() {
    veilDepth = 0;
    dropVeil.classList.add("hidden");
  }

  // ---- Remembering things on this device ---------------------------------

  // localStorage has no expiry of its own, so every value carries the date it
  // was written and is treated as absent once its window has passed.
  var STORE_KEYS = {
    make: "ppng.seen.make",
    read: "ppng.seen.read",
    animations: "ppng.pref.animations",
    celebration: "ppng.pref.celebration",
    formStyle: "ppng.pref.formStyle",
    formMs: "ppng.pref.formMs",
    formOverlap: "ppng.pref.formOverlap"
  };

  var SEEN_DAYS = 7;      // the celebration comes back for someone returning
  var PREF_DAYS = 730;    // a choice is kept for about two years
  var DAY_MS = 86400000;

  // A private window, or a browser set to block site data, THROWS on access
  // rather than returning null. Every read and write is wrapped, and the page
  // works with none of this: the confetti fires and both switches are on.
  function readStore(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, value);
    } catch (err) {
      // Nothing can be done, and nothing needs to be. The page works without it.
    }
  }


  // The stored value, or null when it is missing, unreadable, or too old.
  function readFresh(key, days) {
    var raw = readStore(key);
    if (!raw) return null;
    var cut = raw.lastIndexOf("|");
    if (cut < 0) return null;
    var when = Date.parse(raw.slice(cut + 1));
    if (!when) return null;
    if (Date.now() - when > days * DAY_MS) return null;
    return raw.slice(0, cut);
  }

  // Stored as "value|date". An empty value is fine: some keys only record that
  // something happened, and when.
  function stampValue(value) {
    return (value === undefined || value === null ? "" : value) + "|" + new Date().toISOString();
  }

  function hasSeen(kind) {
    return readFresh(STORE_KEYS[kind], SEEN_DAYS) !== null;
  }

  function markSeen(kind) {
    writeStore(STORE_KEYS[kind], stampValue(""));
  }

  // A stored choice, or null when there is none and when it has expired.
  function readSetting(kind) {
    return readFresh(STORE_KEYS[kind], PREF_DAYS);
  }
  function writeSetting(kind, value) {
    writeStore(STORE_KEYS[kind], stampValue(value));
  }

  // A stored number, or null when there is none, it has expired, or it falls
  // outside what the control allows.
  //
  // RULE: an empty or missing value must not read as zero. Number("") is 0,
  // and 0 is inside most of these ranges, so it would look like a real choice.
  function readNumber(kind, lo, hi) {
    var raw = readSetting(kind);
    if (raw === null || raw === "") return null;
    var v = Number(raw);
    if (!isFinite(v) || v < lo || v > hi) return null;
    return v;
  }

  // The two switches are a setting that reads "on" or "off".
  function readPref(kind) {
    return readSetting(kind);
  }
  function writePref(kind, on) {
    writeSetting(kind, on ? "on" : "off");
  }

  // ---- The celebration ----------------------------------------------------

  // One ribbon, drawn inline so nothing is fetched. A file would break on a
  // local path and would make this a five file site.
  function ribbonSvg(color) {
    return '<svg viewBox="0 0 14 44" width="14" height="44" aria-hidden="true">' +
           '<path class="rib" d="M7 1 C 2 10, 12 19, 7 28 S 2 39, 7 43" ' +
           'fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/>' +
           "</svg>";
  }

  // Throw ribbons from a point on the screen.
  //
  // Every ribbon removes itself when its fall ends, so twenty celebrations do
  // not leave twenty sets of ribbons behind.
  // Where a ribbon starts.
  //
  // Fired: a little outside the left or right edge, low down, like a cannon
  // at the foot of the page.
  // Still: on screen and spread out, because a ribbon fading off the edge
  // would never be seen.
  function launchPoint(fromLeft, still) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (still) {
      return {
        x: (fromLeft ? 0.08 : 0.55) * w + Math.random() * 0.35 * w,
        y: 0.35 * h + Math.random() * 0.45 * h
      };
    }
    return {
      x: fromLeft ? -24 : w + 10,
      y: h * (0.62 + Math.random() * 0.34)
    };
  }

  // Where a ribbon goes.
  //
  // RULE: dy is always negative. The ribbons are fired UP and inward from the
  // two edges, so the burst opens across the page rather than raining onto it.
  // Kept pure and separate so the direction can be checked without waiting for
  // a frame to run, the same way awayTransform is.
  function launchTransform(fromLeft, w, h, r1, r2, r3) {
    var across = (0.45 + r1 * 0.6) * w;
    var up = (0.55 + r2 * 0.7) * h;
    var turn = (r3 - 0.5) * 460;
    return "translate(" + (fromLeft ? across : -across).toFixed(0) + "px," +
           (-up).toFixed(0) + "px) rotate(" + turn.toFixed(0) + "deg)";
  }

  function burstConfetti() {
    if (!celebrationOn || !confettiHost) return;

    // Reduced motion is honored in a smaller way here than for movement: the
    // ribbons appear and fade where they are, rather than being fired.
    var still = prefersLessMotion();
    var count = window.innerWidth < 640 ? Math.round(CONFETTI_COUNT * 0.6) : CONFETTI_COUNT;

    for (var i = 0; i < count; i++) {
      var fromLeft = (i % 2 === 0);          // half from each side, alternating
      var el = document.createElement("div");
      el.className = "ribbon" + (still ? " fade-only" : "");
      el.innerHTML = ribbonSvg(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);

      var spot = launchPoint(fromLeft, still);
      el.style.left = spot.x.toFixed(0) + "px";
      el.style.top = spot.y.toFixed(0) + "px";

      // Each ribbon starts at its own point in the ripple, or sixty of them
      // would wave in step and read as one object.
      el.firstChild.firstChild.style.animationDelay = (-Math.random() * 600).toFixed(0) + "ms";

      confettiHost.appendChild(el);
      flyRibbon(el, fromLeft, still);
    }
  }



  function flyRibbon(el, fromLeft, still) {
    var life = CONFETTI_LIFE_MS + Math.random() * 600;
    if (still) {
      el.style.transition = "opacity " + life + "ms ease-out";
      requestAnimationFrame(function () { el.style.opacity = "0"; });
    } else {
      // Ease out, so it leaves fast and slows as it climbs, the way something
      // thrown does.
      el.style.transition = "transform " + life + "ms cubic-bezier(.14,.62,.32,1), " +
                            "opacity " + life + "ms linear " + Math.round(life * 0.55) + "ms";
      var t = launchTransform(fromLeft, window.innerWidth, window.innerHeight,
                              Math.random(), Math.random(), Math.random());
      requestAnimationFrame(function () {
        el.style.transform = t;
        el.style.opacity = "0";
      });
    }
    setTimeout(function () { el.remove(); }, life + 80);
  }

  function clearConfetti() {
    if (confettiHost) confettiHost.innerHTML = "";
  }

  // Celebrate the first make, and the first read. Not every one, and each is
  // remembered on its own, so a person who has made one still gets a moment
  // the first time they read one.
  function maybeCelebrate(kind) {
    if (hasSeen(kind)) return;
    markSeen(kind);
    burstConfetti();
  }

  // A person who has asked their system for less motion gets none by default.
  // Part 3 adds a control that can override this in either direction, because
  // an explicit choice should beat a system setting.
  function prefersLessMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // True when the drop carries a directory. The entry API is the only
  // reliable way to tell, because a folder looks like an empty typeless file.
  function isFolderDrop(e) {
    var items = e.dataTransfer && e.dataTransfer.items;
    if (!items || !items.length || !items[0].webkitGetAsEntry) return false;
    var entry = items[0].webkitGetAsEntry();
    return !!(entry && entry.isDirectory);
  }

  // Report a drop failure, keeping its DRP code visible so the message can
  // still be matched against the drop table in the Docs tab.
  //
  // RULE: a bad drop costs the person nothing. Nothing on the board is
  // cleared, replaced, or hidden by one.
  //
  // An unknown code falls back to DRP-E99 rather than saying nothing.
  function dropFail(code) {
    var known = Object.prototype.hasOwnProperty.call(DROP_ERRORS, code);
    if (!known) code = "DRP-E99";
    toast(DROP_ERRORS[code] + " (" + code + ")", "bad");
  }

  // True only when the drag carries files, so a plain text drag passes through.
  function dragHasFiles(e) {
    return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1);
  }

  // ---- The show: shared helpers ------------------------------------------

  function wait(ms) {
    return new Promise(function (done) { setTimeout(done, ms); });
  }

  // Load a source and hand back the element, so its real size is known before
  // anything is drawn with it.
  function loadImage(src) {
    return new Promise(function (done, fail) {
      var im = new Image();
      im.onload = function () { done(im); };
      im.onerror = fail;
      im.src = src;
    });
  }








  // ---- The six kill animations -------------------------------------------









  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }


  // ---- Getting the new result in ------------------------------------------






  // Build the password prompt shown in the Custom prompt snippet. The Docs tab
  // runs this exact function, so the example a reader copies is the live one.
  function makeStyledPrompt() {
    return function (context) {
      return new Promise(function (resolve) {
        var wrap = document.createElement("div");
        wrap.style.cssText =
          "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;" +
          "align-items:center;justify-content:center;z-index:9999";
        wrap.innerHTML =
          "<form style='background:#fff;border-radius:14px;padding:22px;width:300px;" +
          "font-family:system-ui;box-shadow:0 20px 60px rgba(0,0,0,.3)'>" +
          "<h3 style='margin:0 0 10px'>Password</h3>" +
          "<p style='margin:0 0 12px;color:#666;font-size:14px'>" + (context.message || "") + "</p>" +
          "<input type='password' style='width:100%;padding:10px;border:1px solid #ccc;" +
          "border-radius:8px;font-size:15px'>" +
          "<div style='display:flex;gap:8px;justify-content:flex-end;margin-top:14px'>" +
          "<button type='button' data-x style='padding:8px 14px'>Cancel</button>" +
          "<button style='padding:8px 14px;background:#111;color:#fff;border:none;" +
          "border-radius:999px'>Open</button></div></form>";
        var input = wrap.querySelector("input");
        function close(value) { wrap.remove(); resolve(value); }
        wrap.querySelector("[data-x]").onclick = function () { close(null); };
        wrap.querySelector("form").onsubmit = function (e) { e.preventDefault(); close(input.value); };
        document.body.appendChild(wrap);
        input.focus();
      });
    };
  }

  /* ==========================================================================
     SECTION 4 - INITIALIZATION
     One function per area of the page. Each attaches listeners and sets the
     starting state. They run once, in the order listed in Section 7.
     ========================================================================== */

  function wireTabs() {
    document.getElementById("tabs").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-tab]");
      if (!btn) return;
      switchTab(btn.getAttribute("data-tab"));
    });
    // In-page links that jump to another tab, optionally to an anchor within it.
    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-gototab]");
      if (!link) return;
      e.preventDefault();
      switchTab(link.getAttribute("data-gototab"));
      var href = link.getAttribute("href");
      if (href && href.charAt(0) === "#" && href.length > 1) {
        var target = document.getElementById(href.slice(1));
        if (target) setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, SCROLL_DELAY_MS);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function wireDrawer() {
    advDrawer.addEventListener("transitionend", function (e) {
      // Once fully open, drop the fixed cap so the content is free to grow or shrink.
      if (e.propertyName === "max-height" && advDrawer.classList.contains("open")) {
        advDrawer.style.maxHeight = "none";
      }
    });
    advToggle.addEventListener("click", function () {
      setDrawerOpen(!advDrawer.classList.contains("open"));
    });
  }

  function wireOptionFields() {
    // Show fixed-size and cover-fit fields only when they apply.
    sizeMode.addEventListener("change", function () {
      var isFixed = sizeMode.value === "fixed";
      fixedSizeField.classList.toggle("hidden", !isFixed);
      minSizeField.classList.toggle("hidden", isFixed);
      releaseDrawerHeight();
    });
    coverInput.addEventListener("change", function () {
      coverFitField.classList.toggle("hidden", !coverInput.files || !coverInput.files.length);
      releaseDrawerHeight();
    });

    document.querySelectorAll('input[name="coverStyle"]').forEach(function (r) {
      r.addEventListener("change", onCoverStyleChange);
    });
    onCoverStyleChange();   // set the initial state, which is CD

    imprintInput.addEventListener("change", onImprintChange);

    SLIDER_IDS.forEach(bindSlider);

    document.getElementById("splShuffle").addEventListener("click", function () {
      document.getElementById("splSeed").value = Math.floor(Math.random() * 10000);
    });
  }

  // Keep one range slider and its number field showing the same value.
  function bindSlider(id) {
    var range = document.getElementById(id);
    var num = document.getElementById(id + "Num");
    if (!range || !num) return;
    range.addEventListener("input", function () { num.value = range.value; });
    num.addEventListener("input", function () { range.value = num.value; });
  }


  // The whole window is the drop target.
  //
  // dragenter and dragleave fire for every element the pointer crosses, so the
  // overlay is driven by a depth counter, never by a boolean. A boolean is
  // wrong the moment the pointer crosses a nested element.
  function wirePageDrop() {
    // THE OVERLAY IS FOR THE OTHER TABS. The board carries two targets of its
    // own and answers on each of them, so the overlay stands down while the
    // board is the panel on screen and offers itself everywhere else. Its
    // handlers still run at the window, below the board's, which stop what
    // they take.
    window.addEventListener("dragenter", function (e) {
      if (homeIsShowing() || !dragHasFiles(e)) return;
      e.preventDefault();
      veilDepth++;
      showDropVeil(classifyDrag(e));
    });

    // Without preventDefault here the browser opens the dropped file and the
    // page is lost. This one line is what keeps the page on screen, so it runs
    // whichever panel is showing.
    window.addEventListener("dragover", function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
    });

    window.addEventListener("dragleave", function (e) {
      if (homeIsShowing() || !dragHasFiles(e)) return;
      veilDepth--;
      if (veilDepth <= 0) hideDropVeil();
    });

    window.addEventListener("drop", function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      if (homeIsShowing()) return;
      hideDropVeil();
      handleDrop(e);
    });

    // A drag that ends outside the window never sends a drop, so the overlay
    // is cleared here as well.
    window.addEventListener("dragend", hideDropVeil);
  }




  // Advanced, in six groups.
  //
  // RULE: releaseDrawerHeight() must run on every switch. The drawer measures
  // its own height once when it opens, and each group is a different height,
  // so without this the drawer clips whatever is taller than the first one.
  function wireSubTabs() {
    var tabs = document.querySelectorAll(".subtabs button");
    var panels = document.querySelectorAll(".subpanel");
    if (!tabs.length) return;

    function show(key) {
      var i;
      for (i = 0; i < tabs.length; i++) {
        var on = tabs[i].getAttribute("data-sub") === key;
        tabs[i].classList.toggle("active", on);
        tabs[i].setAttribute("aria-selected", on ? "true" : "false");
      }
      for (i = 0; i < panels.length; i++) {
        panels[i].classList.toggle("hidden", panels[i].getAttribute("data-sub") !== key);
      }
      releaseDrawerHeight();
    }

    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        if (this.disabled) return;
        show(this.getAttribute("data-sub"));
      });
    }
    subTabShow = show;
  }

  // A noise cover has no disc and no splat to set.
  function syncSubTabs(isCd) {
    var tabs = document.querySelectorAll(".subtabs button");
    for (var i = 0; i < tabs.length; i++) {
      var key = tabs[i].getAttribute("data-sub");
      var off = !isCd && (key === "disc" || key === "splat");
      tabs[i].disabled = off;
      // Never leave a person looking at a group that has been switched off.
      if (off && tabs[i].classList.contains("active") && subTabShow) subTabShow("cover");
    }
  }

  // The two display switches. They are independent on purpose.
  //
  // Animations off still lets the confetti fire, because it is a reward rather
  // than a transition, and somebody who dislikes movement may still want the
  // moment. Anyone who wants neither turns off both.
  // With animation off, everything on the board arrives at its finished state
  // rather than moving to it. One class carries that to every rule at once.
  function applyMotionPreference() {
    document.body.classList.toggle("still", !animationsOn);
  }

  function wireDisplayToggles() {
    var anim = document.getElementById("optAnimations");
    var celeb = document.getElementById("optCelebration");
    if (!anim || !celeb) return;

    anim.checked = animationsOn;
    celeb.checked = celebrationOn;
    applyMotionPreference();

    anim.addEventListener("change", function () {
      animationsOn = anim.checked;
      writePref("animations", animationsOn);
      applyMotionPreference();
    });
    celeb.addEventListener("change", function () {
      celebrationOn = celeb.checked;
      writePref("celebration", celebrationOn);
      if (!celebrationOn) clearConfetti();
    });
  }







  function wireReader() {
    dropzone.addEventListener("click", function () { importFile.click(); });
    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); importFile.click(); }
    });
    importFile.addEventListener("change", function () {
      if (importFile.files && importFile.files[0]) readSource(importFile.files[0]);
    });
    dropzone.addEventListener("dragover", function (e) { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("drag-over"); });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (f.type === "image/jpeg") { toast("JPEG is lossy - PuttyPNG needs a PNG", "bad"); return; }
      readSource(f);
    });
    /* Pasting an image anywhere on the page reads it. There is one such
       listener, and it hands the picture to whichever panel is showing, so a
       paste is never read twice. */
    document.addEventListener("paste", function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      if (homeIsShowing()) {
        // Typing into the Make box is not an attempt to load a disc.
        if (e.target === $("makeText")) return;
        var png = pngFrom(items);
        if (png) { e.preventDefault(); readHomeFile(png); }
        return;
      }
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image/") === 0) {
          if (items[i].type === "image/jpeg") { toast("JPEG is lossy - PuttyPNG needs a PNG", "bad"); return; }
          readSource(items[i].getAsFile());
          return;
        }
      }
    });
  }

  function wireSnippets() {
    loadEngineSource();
    document.getElementById("importerCode").textContent =
      decodeEntities(document.getElementById("importerSource").textContent);
    document.getElementById("exporterCode").textContent =
      decodeEntities(document.getElementById("exporterSource").textContent);

    document.querySelectorAll(".copy-btn").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var el = document.getElementById(btn.getAttribute("data-copy"));
        var text = el.textContent;
        try {
          await navigator.clipboard.writeText(text);
          var original = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = original; }, COPY_FEEDBACK_MS);
        } catch (e) { toast("Copy failed - select and copy manually", "bad"); }
      });
    });
  }

  // Fill the engine snippet card with the real puttypng.js bytes.
  // A browser blocks fetch against a file:// path, so a person who opens the
  // saved folder directly gets the download link instead of a broken card.
  function loadEngineSource() {
    var codeEl = document.getElementById("engineCode");
    if (!codeEl) return;

    // A browser blocks fetch against a file:// path. Test the protocol first,
    // so a person opening the folder directly is told the real reason instead
    // of being shown a server error that does not apply to them.
    if (location.protocol === "file:") {
      codeEl.textContent = ENGINE_SOURCE_LOCAL;
      return;
    }

    fetch("puttypng.js")
      .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (text) { codeEl.textContent = text; })
      .catch(function () { codeEl.textContent = ENGINE_SOURCE_FAILED; });
  }

  function renderErrorTable() {
    var body = document.getElementById("errorTableBody");
    if (!body || typeof PuttyPNG === "undefined" || !PuttyPNG.errors) return;
    var rows = "";
    Object.keys(PuttyPNG.errors).forEach(function (code) {
      rows += "<tr><td class='err-code'>" + code + "</td><td>" + escapeHtml(PuttyPNG.errors[code]) + "</td></tr>";
    });
    body.innerHTML = rows;
  }

  // The page's own drop failures, listed beside the engine's.
  function renderDropTable() {
    var body = document.getElementById("dropTableBody");
    if (!body) return;
    var rows = "";
    Object.keys(DROP_ERRORS).forEach(function (code) {
      rows += "<tr><td class='err-code'>" + code + "</td><td>" + escapeHtml(DROP_ERRORS[code]) + "</td></tr>";
    });
    body.innerHTML = rows;
  }

  // Old code beside new code. This exists because the number moved as well as
  // gaining a prefix, so an old bug report cannot be read by number alone.
  function renderMigrationTable() {
    var body = document.getElementById("migrateTableBody");
    if (!body || typeof PuttyPNG === "undefined" || !PuttyPNG.errors) return;
    var rows = "";
    for (var i = 1; i <= 12; i++) {
      var oldCode = "E" + (i < 10 ? "0" + i : i);
      var newCode = "PTY-E" + (i - 1 < 10 ? "0" + (i - 1) : i - 1);
      rows += "<tr><td class='err-code'>" + oldCode + "</td><td class='err-code'>" + newCode +
              "</td><td>" + escapeHtml(PuttyPNG.errors[newCode] || "") + "</td></tr>";
    }
    body.innerHTML = rows;
  }

  function renderLicense() {
    var el = document.getElementById("licenseText");
    if (el) el.textContent = MIT_LICENSE;
  }

  function wireTutorial() {
    var tutMake = document.getElementById("tutMakeBtn");
    var tutRead = document.getElementById("tutReadBtn");
    if (!tutMake) return;

    tutMake.addEventListener("click", async function () {
      try {
        var png = await PuttyPNG.encode(document.getElementById("tutText").value || "(empty)");
        tutLast = png;
        document.getElementById("tutImg").src = png.dataUrl;
        document.getElementById("tutPreview").style.display = "flex";
        document.getElementById("tutResult").textContent = 'Now press "Read it back".';
        tutRead.disabled = false;
        toast("Made a PuttyPNG", "ok");
      } catch (e) { toast(friendly(e), "bad"); }
    });
    tutRead.addEventListener("click", async function () {
      if (!tutLast) return;
      try {
        var r = await PuttyPNG.decode(tutLast.dataUrl);
        document.getElementById("tutResult").textContent = 'It says: “' + (r.text || "") + '”';
        toast("Read it back", "ok");
      } catch (e) { toast(friendly(e), "bad"); }
    });
  }

  function wirePromptDemo() {
    var tryPrompt = document.getElementById("tryPromptBtn");
    if (!tryPrompt) return;
    tryPrompt.addEventListener("click", async function () {
      var out = document.getElementById("tryPromptOut");
      var styled = makeStyledPrompt();
      var pw = await styled({ message: "Preview only - type anything and press Open." });
      out.textContent = (pw === null)
        ? "Cancelled - the promise resolved to null."
        : ("Resolved with a password of length " + pw.length + " (nothing is stored).");
    });
  }

  /* ==========================================================================
     THE HOME BOARD
     Every listener the two columns and the deck need, in one place.
     ========================================================================== */

  function wireHome() {
    wireHomeMake();
    wireHomeDisc();
    wireHomeLoad();

    // The first paint. force skips the settle wait and the two effects, so an
    // empty box starts at a drawn ring rather than a blank one.
    setMeterWidth(0);
    updateHomeMeter(true);
    window.addEventListener("resize", function () { setMeterWidth(homeShownRung); });
  }

  function wireHomeMake() {
    $("makeText").addEventListener("input", function () { noteHomeInput(); updateHomeMeter(); });

    $("homeAttachBtn").addEventListener("click", function () { $("attachIn").click(); });
    $("attachIn").addEventListener("change", function () {
      var f = this.files[0];
      this.value = "";
      takeHomeAttachment(f);
    });

    // The whole chip is the button, so there is no small target to find in it.
    $("filePill").addEventListener("click", dropHomeAttachment);
    $("filePill").title = "Press to take this attachment off";

    /* THE MAKE BOX TAKES A FILE THE SAME WAY THE LOAD ZONE TAKES A DISC.
       A count is kept rather than a flag, because dragging across a child
       fires leave for the parent and the veil would flicker on every inner
       edge. Each handler stops the event, so the page-wide overlay above the
       board never sees it. */
    var mb = $("makeBox"), depth = 0;
    function showVeil(on) {
      mb.classList.toggle("over", on);
      if (!on) depth = 0;
    }
    mb.addEventListener("dragenter", function (e) {
      e.preventDefault(); e.stopPropagation();
      depth++;
      showVeil(true);
    });
    mb.addEventListener("dragover", function (e) { e.preventDefault(); e.stopPropagation(); });
    mb.addEventListener("dragleave", function (e) {
      e.stopPropagation();
      depth = Math.max(0, depth - 1);
      if (depth === 0) showVeil(false);
    });
    mb.addEventListener("drop", function (e) {
      e.preventDefault(); e.stopPropagation();
      showVeil(false);
      takeHomeAttachment(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    // The reading depends on the depth, so a change of depth redraws it.
    var depth = $("optDepth");
    if (depth) depth.addEventListener("change", function () { updateHomeMeter(true); });

    /* ONE SETTING, TWO CONTROLS. The switch under the button and the one in
       Advanced are the same thing said two ways round, so each follows the
       other and the reading is redrawn whichever was used. */
    var clear = $("clearBg"), solid = $("optSolidBg");
    if (clear && solid) {
      clear.checked = !solid.checked;
      clear.addEventListener("change", function () {
        solid.checked = !clear.checked;
        if (homeDiscOut) tossDisc();
        updateHomeMeter(true);
      });
      solid.addEventListener("change", function () {
        clear.checked = !solid.checked;
        if (homeDiscOut) tossDisc();
        updateHomeMeter(true);
      });
    }

    $("homeMakeBtn").addEventListener("click", pressHomeDisc);
  }

  function wireHomeDisc() {
    var cd = $("cd");

    // The tip is a button too, so the invitation and the act are one thing.
    $("cdTipCopy").innerHTML = homeIcon(D_COPY, 15) + "<span>Copy me and paste to a friend!</span>";
    $("cdCopy").innerHTML = homeIcon(D_COPY, 13) + "<span>Copy</span>";
    $("cdSave").innerHTML = homeIcon(D_DOWN, 13) + "<span>Download</span>";

    $("cdCopy").addEventListener("click", function () { copyHomeDisc(this, "Copied!"); });
    $("cdTipCopy").addEventListener("click", function () { copyHomeDisc(this, "Copied!"); });
    $("cdSave").addEventListener("click", function () {
      if (!homeLastBlob) return;
      saveBytes(URL.createObjectURL(homeLastBlob), "puttypng.png", true);
      confirmDone(this, "Saved!");
    });

    // The disc going takes its two chips with it, because the tip only shows
    // while the disc is out. Nothing else has to be cleared by hand.
    $("bin").addEventListener("click", function () { tossDisc(); });

    cd.addEventListener("pointerdown", function (e) {
      if (!homeDiscOut || e.button !== 0) return;
      e.preventDefault();
      homeDrag = { x: e.clientX, y: e.clientY, live: false, ghost: null, r: cd.getBoundingClientRect() };
    });

    document.addEventListener("pointermove", function (e) {
      if (!homeDrag) return;
      var dx = e.clientX - homeDrag.x, dy = e.clientY - homeDrag.y;
      if (!homeDrag.live) {
        // A press is not a drag until it has moved, so a click on the disc
        // does not throw a copy of it across the page.
        if (Math.abs(dx) + Math.abs(dy) < DISC_SLACK_PX) return;
        homeDrag.live = true;
        var g = cd.cloneNode(true);
        g.removeAttribute("id");
        g.className = "cd ghost";
        g.style.left = homeDrag.r.left + "px";
        g.style.top = homeDrag.r.top + "px";
        g.style.width = homeDrag.r.width + "px";
        g.style.height = homeDrag.r.height + "px";
        document.body.appendChild(g);
        homeDrag.ghost = g;
        cd.classList.add("lifted");
      }
      homeDrag.ghost.style.transform = "translate(" + dx + "px," + dy + "px)";
      $("zone").classList.toggle("over", pointerInside($("zone"), e));
    });

    document.addEventListener("pointerup", endDiscDrag);
    document.addEventListener("pointercancel", function () { endDiscDrag(null); });
  }

  function wireHomeLoad() {
    var zone = $("zone");

    ["dragenter", "dragover"].forEach(function (n) {
      zone.addEventListener(n, function (e) {
        e.preventDefault(); e.stopPropagation();
        zone.classList.add("over");
      });
    });
    zone.addEventListener("dragleave", function (e) {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("over");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove("over");
      readHomeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    $("openBtn").addEventListener("click", function () { $("openIn").click(); });
    $("openIn").addEventListener("change", function () {
      readHomeFile(this.files[0]);
      this.value = "";
    });

    /* A page cannot fake a paste, so asking for the clipboard needs the
       permission API and is not offered by every browser. Ctrl+V is
       always there, and it lands on the invisible field over the zone. */
    $("pasteBtn").addEventListener("click", async function () {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        toast("This browser will not hand a page the clipboard. Press Ctrl+V instead.", "bad");
        return;
      }
      try {
        var items = await navigator.clipboard.read();
        for (var i = 0; i < items.length; i++) {
          if (items[i].types.indexOf("image/png") >= 0) {
            var blob = await items[i].getType("image/png");
            readHomeFile(new File([blob], "from the clipboard.png", { type: "image/png" }));
            return;
          }
        }
        toast("There is no picture on the clipboard.", "bad");
      } catch (err) {
        toast("The clipboard was not shared. Press Ctrl+V instead.", "bad");
      }
    });

    // Two marks and no words, sitting on the picture only while it is hovered.
    var tools = $("thumbTools");
    function tool(d, label, run) {
      var b = document.createElement("button");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = homeIcon(d, 13);
      b.addEventListener("click", run);
      tools.appendChild(b);
    }
    tool(D_COPY, "Copy this PuttyPNG", async function () {
      if (!homeLoadedBlob) { toast("This one came from a link, so it cannot be copied.", "bad"); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": homeLoadedBlob })]);
        confirmDone(this);
      } catch (err) {
        toast("This browser would not let the page copy it.", "bad");
      }
    });
    tool(D_DOWN, "Download this PuttyPNG", function () {
      var href = homeLoadedBlob ? URL.createObjectURL(homeLoadedBlob) : $("gotImg").src;
      saveBytes(href, ($("gotName").textContent || "puttypng") + ".png", !!homeLoadedBlob);
      confirmDone(this);
    });

    var x = makeXButton("Remove this PuttyPNG");
    x.addEventListener("click", clearHomeLoaded);
    zone.appendChild(x);
  }

  /* ==========================================================================
     SECTION 5 - CORE LOGIC
     The work the page exists to do: read the form, drive the engine, and show
     what came back.
     ========================================================================== */

  function switchTab(name) {
    document.querySelectorAll("nav.tabs button").forEach(function (b) {
      var on = b.getAttribute("data-tab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + name);
    });
  }

  // Drive the drawer height from script so it can never clip its content:
  // animate max-height to the measured scrollHeight, then release it to "none"
  // once open, so later height changes show in full.
  function setDrawerOpen(open) {
    advToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      advDrawer.classList.add("open");
      advDrawer.style.maxHeight = advDrawer.scrollHeight + "px";
    } else {
      // Pin to the current pixel height first so the collapse can animate from it.
      advDrawer.style.maxHeight = advDrawer.scrollHeight + "px";
      advDrawer.offsetHeight;                       // force reflow
      advDrawer.classList.remove("open");
      advDrawer.style.maxHeight = "0px";
    }
  }

  // Cover style: show the CD-only controls for CD, and default the depth to
  // subtle for CD or standard for noise. A person can still override the depth.
  function onCoverStyleChange() {
    var style = (document.querySelector('input[name="coverStyle"]:checked') || {}).value || "cd";
    var isCd = style === "cd";
    cdControls.classList.toggle("hidden", !isCd);
    cdAdvanced.classList.toggle("hidden", !isCd);
    syncSubTabs(isCd);
    /* THE COVER DOES NOT PICK THE DEPTH. It used to force subtle for a CD,
       which would cut every disc to three eighths of its room without a
       word of it: the rung capacities are measured at the standard depth on
       a CD cover, and the meter reads against them. Depth is its own choice
       now, and it rests at standard. */
    releaseDrawerHeight();
  }

  // An imprint image replaces the default putty-splat branding.
  function onImprintChange() {
    var f = imprintInput.files && imprintInput.files[0];
    imprintInfo.textContent = f ? ("Imprinting: " + f.name + " (burned-in, replaces the splat)") : "";
    // Grey out the splat sliders when a custom imprint image is in use.
    splatControls.style.opacity = f ? "0.5" : "";
    splatDisabledNote.style.display = f ? "block" : "none";
    releaseDrawerHeight();
  }



  // Read every control in the form and build the options object the engine takes.
  function gatherOptions() {
    var opts = {};
    var pw = document.getElementById("optPassword").value;
    if (pw) opts.password = pw;
    var tag = document.getElementById("optTag").value;
    if (tag) opts.tag = tag;
    opts.depth = document.getElementById("optDepth").value;
    opts.compress = document.getElementById("optCompress").checked;
    var mode = sizeMode.value;
    if (mode === "pow2") opts.sizeMode = "pow2";
    else if (mode === "fixed") opts.size = parseInt(document.getElementById("optFixedSize").value, 10) || 256;

    // The floor applies to an auto or power-of-two size. A fixed size is an
    // instruction, so the engine ignores the floor and the field is hidden.
    if (mode !== "fixed") {
      var min = parseInt(document.getElementById("optMinSize").value, 10);
      if (min > 0) opts.minSize = min;
    }

    // Cover style: a custom uploaded image always wins, otherwise noise or CD.
    var style = document.querySelector('input[name="coverStyle"]:checked');
    style = style ? style.value : "cd";
    if (coverInput.files && coverInput.files[0]) {
      opts.cover = coverInput.files[0];
      opts.coverFit = document.getElementById("optCoverFit").value;
    } else if (style === "cd") {
      opts.coverStyle = "cd";
      var label = document.getElementById("optLabel").value;
      if (label) opts.label = label;
      opts.solidBackground = document.getElementById("optSolidBg").checked;
      var imprintFile = document.getElementById("optImprint").files;
      if (imprintFile && imprintFile[0]) opts.imprint = imprintFile[0];
      opts.fontFamily = document.getElementById("optFontFamily").value;
      opts.fontSize = document.getElementById("optFontSize").value;   // small|medium|large|xlarge
      var rim = document.getElementById("optRimText").value;
      if (rim) opts.rimText = rim;
      // Points and spacing are both read against a 256px disc, then scaled.
      opts.rimSize = parseFloat(document.getElementById("optRimSize").value) || 13;
      opts.rimSpacing = parseFloat(document.getElementById("optRimSpacing").value) || 0;
      opts.rimTwoSided = document.getElementById("optRimTwoSided").checked;

      // Hub, the round center: sizes plus gray-ring thicknesses.
      opts.hub = {
        size: parseInt(document.getElementById("splHubSize").value, 10) / 100,
        holeSize: parseInt(document.getElementById("splHoleSize").value, 10) / 100,
        outerThickness: parseInt(document.getElementById("splOuter").value, 10) / 1000,
        innerThickness: parseInt(document.getElementById("splInner").value, 10) / 1000
      };
      // The default putty-splat imprint, ignored when a custom imprint image is set.
      opts.splat = {
        points: parseInt(document.getElementById("splPoints").value, 10),
        curve: parseInt(document.getElementById("splCurve").value, 10) / 100,
        waviness: parseInt(document.getElementById("splWaviness").value, 10) / 100,
        amplitude: parseInt(document.getElementById("splAmplitude").value, 10) / 100,
        seed: parseInt(document.getElementById("splSeed").value, 10) || 0,
        size: parseInt(document.getElementById("splSize").value, 10) / 100,
        dotColor: document.getElementById("splDotColor").value,
        separation: parseFloat(document.getElementById("splDotSep").value),
        dotMin: parseFloat(document.getElementById("splDotMin").value),
        dotMax: parseFloat(document.getElementById("splDotMax").value),
        textBuffer: parseFloat(document.getElementById("splTextBuffer").value),
        textClear: parseInt(document.getElementById("splTextClear").value, 10) / 100
      };
    } else {
      opts.coverStyle = "noise";
    }
    return opts;
  }

  // ---- WHAT THE MAKE BUTTON SAYS ------------------------------------------









  // ---- THE DRIVE ----------------------------------------------------------







  // ---- The spin illusion --------------------------------------------------



















  // A dropped file, handled in a fixed order.
  //
  // RULE: nothing already on screen is touched until the new result is known
  // to be good. Every early return leaves the page exactly as it was. In
  // Phase 2 the kill animation hangs off the success path, never off the drop
  // itself, which is what makes a bad drop harmless.
  // Take a dropped file as the thing to hide. The board is brought forward
  // first, because the file is about to appear on it.
  function attachDropped(file) {
    switchTab("puttypng");
    takeHomeAttachment(file);
    toast("Attached " + (file.name || "file"), "ok");
  }

  async function handleDrop(e) {
    if (dropBusy) { dropFail("DRP-E06"); return; }

    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) { dropFail("DRP-E00"); return; }
    if (files.length > 1) { dropFail("DRP-E02"); return; }

    // A folder arrives as a File with no type and no size, so it has to be
    // named before the empty-file check, or it reports the wrong reason.
    if (isFolderDrop(e)) { dropFail("DRP-E01"); return; }

    var file = files[0];
    if (file.size === 0) { dropFail("DRP-E03"); return; }
    if (file.size > MAX_DROP_BYTES) { dropFail("DRP-E04"); return; }

    // Anything that is not a PNG cannot hold a PuttyPNG, so it is a file to
    // hide. No guessing and no error.
    if (file.type !== "image/png") { attachDropped(file); return; }

    dropBusy = true;
    try {
      var head = await PuttyPNG.peek(file);
      if (!head.isPuttyPNG) {
        // A plain PNG is still a perfectly good thing to hide. Say what
        // happened, because silence would read as a failure to decode.
        attachDropped(file);
        toast("Not a PuttyPNG, so it was attached as a file", "ok");
        return;
      }
      await readSource(file);
    } catch (err) {
      // peek and decode throw engine errors. A file that is not really a PNG
      // fails inside the engine, so it is reported as a drop problem.
      if (err && err.code === "PTY-E09") dropFail("DRP-E05");
      else toast(friendly(err), "bad");
    } finally {
      dropBusy = false;
    }
  }


  /* EVERY READ ENDS IN THE SAME PLACE. A drop on the page, a paste, and the
     bounded zone on the How it works tab all arrive here, and all of them
     show their result in the board's Load column. */
  async function readSource(source) {
    switchTab("puttypng");
    await readHomeFile(source);
    if (document.getElementById("zone").classList.contains("has")) maybeCelebrate("read");
  }



  /* ==========================================================================
     THE HOME BOARD - THE METER
     A donut that fills clockwise as data is added. Each finished rung keeps
     its own ring, pushed inward by the one after it, so the picture is a
     record of the climb rather than a single bar.
     ========================================================================== */

  /* THE SQUEEZE. Each rung gives the donut a larger share of the card, and the
     button gives that width up. The share is turned into pixels from the
     MEASURED card, because the action bar and the deck below it are different
     widths and a per cent would resolve differently in each of them.
     One token drives the donut, the slot, the disc, and the deck together. */
  function setMeterWidth(k) {
    homeShownRung = Math.min(k, RUNG_SHARE.length - 1);
    var col = document.querySelector(".col.make");
    if (!col) return;
    var pad = parseFloat(getComputedStyle(col).paddingLeft) || 0;
    var inner = col.clientWidth - pad * 2;
    if (inner <= 0) return;
    var px = Math.max(METER_MIN_PX, Math.round(inner * RUNG_SHARE[homeShownRung]));
    // The token is set on the root, because that is where every rule that
    // reads it resolves. Setting it on the column would leave the deck behind.
    document.documentElement.style.setProperty("--meter-col", px + "px");
  }

  // Draw one ring layout. Returns where the cut ended up, in degrees, so a
  // later delete knows what stretch of band it has to eat.
  function paintMeter(bands, k, frac, over) {
    var g = $("bands");
    g.textContent = "";
    bands.forEach(function (b) {
      var mid = (b.r0 + b.r1) / 2, w = b.r1 - b.r0, C = 2 * Math.PI * mid;
      var track = document.createElementNS(SVG_NS, "circle");
      track.setAttribute("cx", 50); track.setAttribute("cy", 50); track.setAttribute("r", mid);
      track.setAttribute("fill", "none"); track.setAttribute("stroke", "#e9e9ee");
      track.setAttribute("stroke-width", w);
      g.appendChild(track);

      if (!b.done) homeCurBand = { r0: b.r0, r1: b.r1 };
      if (b.r1 - b.r0 < 0.01) return;
      var f = b.done || over ? 1 : frac;
      if (f <= 0) return;
      var arc = document.createElementNS(SVG_NS, "circle");
      arc.setAttribute("cx", 50); arc.setAttribute("cy", 50); arc.setAttribute("r", mid);
      arc.setAttribute("fill", "none");
      arc.setAttribute("stroke", b.done ? rgb(RUNGS[Math.min(b.i, RUNGS.length - 1)].color)
                                        : colorFor(k, frac));
      arc.setAttribute("stroke-width", w);
      arc.setAttribute("stroke-dasharray", (C * f) + " " + C);
      arc.setAttribute("transform", "rotate(-90 50 50)");
      g.appendChild(arc);
    });

    /* The two lines are held under four rendered pixels however large the
       donut grows. The viewBox is 100 across, so one unit is worth the
       meter's measured width divided by a hundred. */
    var px = $("meter").getBoundingClientRect().width || 100;
    var ceiling = 400 / px;
    $("cut").setAttribute("stroke-width", Math.min(0.8, ceiling));
    $("mark65").setAttribute("stroke-width", Math.min(0.65, ceiling));

    var deg = over ? 359.9 : frac * 360;
    setRadialLine($("cut"), deg, homeCurBand.r0, homeCurBand.r1);
    $("cut").setAttribute("opacity", frac > 0 || over ? 1 : 0);

    /* The dotted line marks the point on this rung where things start to get
       interesting, a little ahead of the colour handoff. */
    setRadialLine($("mark65"), WARN_AT * 360, homeCurBand.r0 - 1.5, homeCurBand.r1 + 1.5);
    $("mark65").setAttribute("opacity", over ? 0 : 1);

    $("meterwrap").classList.toggle("over", over);
    return deg;
  }

  /* GAINING A RUNG IS A MOVE, NOT A JUMP. The old bands slide inward and thin
     while the new outer ring grows out of nothing, so the change can be
     watched rather than merely noticed. A timer drives it, not a frame
     callback, because a frame callback does not run in a headless test. */
  function drawMeter(k, frac) {
    var over = k >= RUNGS.length;
    var target = bandsFor(over ? RUNGS.length - 1 : k);
    clearTimeout(homeMoveTimer);

    if (!homeShownBands || homeShownBands.length === target.length) {
      homeShownBands = target;
      homeShownFrac = frac;
      return paintMeter(target, k, frac, over);
    }

    var len = Math.max(homeShownBands.length, target.length);
    var from = padBands(homeShownBands, len), to = padBands(target, len);
    var f0 = homeShownFrac, start = Date.now(), deg = paintMeter(to, k, frac, over);
    homeShownBands = target;
    homeShownFrac = frac;

    (function step() {
      var t = Math.min(1, (Date.now() - start) / RUNG_MOVE_MS);
      var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      var mid = to.map(function (b, i) {
        return { i: b.i, done: b.done, r0: lerp(from[i].r0, b.r0, e), r1: lerp(from[i].r1, b.r1, e) };
      });
      paintMeter(mid, k, lerp(f0, frac, e), over);
      if (t < 1) homeMoveTimer = setTimeout(step, 16);
    })();
    return deg;
  }

  /* A large arrival washes the whole ring rather than only the line. It is
     fired from the raw byte change so it lands on the same frame as the
     keystroke, and again when a rung is gained. */
  function flashRing() {
    var f = $("ringflash");
    f.classList.remove("on");
    void f.getBoundingClientRect();
    f.classList.add("on");
    setTimeout(function () { f.classList.remove("on"); }, HOME_FLASH_MS);
  }

  /* Any input throws the cut back to full white, wherever its fade had
     reached. This is called from the input itself and not from the update, so
     the first painted frame is already white and nothing waits on the
     compression to finish. */
  function flashCut() {
    var cut = $("cut");
    cut.classList.remove("flash");
    void cut.getBoundingClientRect();
    cut.classList.add("flash");
    setTimeout(function () { cut.classList.remove("flash"); }, HOME_FLASH_MS);
  }

  /* THE DELETION LAYER. A delete takes the stretch of band that is going away
     and pulls it apart bit by bit. Every bit starts fully solid and reaches
     nothing exactly at the end of the window, so the whole effect is a clean
     hundred to zero. The stagger only decides when each one sets off. */
  function dissolveArc(fromDeg, toDeg) {
    var g = $("dissolve");
    g.textContent = "";
    // A tiny delete still has to be visible, so it is given a little arc to eat.
    if (Math.abs(fromDeg - toDeg) < 5) fromDeg = toDeg + 5;
    var bits = [], i;
    for (i = 0; i < DISSOLVE_BITS; i++) {
      var t = Math.random();
      var p = polar(toDeg + (fromDeg - toDeg) * t,
                    homeCurBand.r0 + Math.random() * (homeCurBand.r1 - homeCurBand.r0));
      var el = document.createElementNS(SVG_NS, "rect");
      el.setAttribute("width", 1.7); el.setAttribute("height", 1.7);
      el.setAttribute("fill", "#8d8d97");
      g.appendChild(el);
      bits.push({
        el: el, x: p.x, y: p.y,
        dx: (Math.random() - 0.5) * 11, dy: (Math.random() - 0.5) * 11,
        // Each bit waits its own share of the first half before it sets off,
        // and every one of them lands on nothing at the same moment.
        t0: Math.random() * 0.45
      });
    }
    var start = Date.now();
    (function step() {
      var p = (Date.now() - start) / DISSOLVE_MS;
      for (var j = 0; j < bits.length; j++) {
        var b = bits[j], q = Math.max(0, Math.min(1, (p - b.t0) / (1 - b.t0)));
        b.el.setAttribute("x", b.x - 0.85 + b.dx * q);
        b.el.setAttribute("y", b.y - 0.85 + b.dy * q);
        b.el.setAttribute("opacity", (1 - q).toFixed(3));
      }
      if (p < 1) setTimeout(step, 16); else g.textContent = "";
    })();
  }

  // What would be pressed right now: the attachment if there is one, or the
  // text in the box.
  function currentHomeBytes() {
    if (homeAttached) return homeAttached.bytes;
    return homeEncoder.encode($("makeText").value);
  }

  // Redraw the meter for whatever the box holds. force skips the settle wait
  // and the two effects, for the first paint and for a cleared box.
  function updateHomeMeter(force) {
    clearTimeout(homeSettleTimer);
    homeSettleTimer = setTimeout(async function () {
      var token = ++homeRunToken;
      var bytes = currentHomeBytes();
      var packed = await packedSize(bytes);
      if (token !== homeRunToken) return;

      var k = rungFor(packed);
      var over = k >= RUNGS.length;
      var cap = capOf(over ? RUNGS.length - 1 : k);
      var floor = k === 0 ? 0 : capOf(k - 1);
      var frac = over ? 1 : Math.max(0, Math.min(1, (packed - floor) / (cap - floor)));

      // Gaining a rung is a big enough moment to wash the ring, even when the
      // few bytes that did it were far too small to notice on their own.
      if (!force && k > homeLastRung) flashRing();
      homeLastRung = k;
      setMeterWidth(k);

      $("makeLabel").innerHTML = over ? RUNG_LABEL_OVER : RUNG_LABELS[k];
      // The adjective wears the colour of the rung that earned it.
      var word = $("makeLabel").querySelector("em");
      if (word) word.style.color = over ? rgb(RUNG_OVER_COLOR) : rgb(RUNGS[k].color);

      var deg = drawMeter(k, frac);

      // Only the taking away waits for the real numbers. The flash already ran
      // at the moment of the keystroke.
      if (!force && packed < homeLastPacked) dissolveArc(homeLastDeg, deg);
      if (over && packed !== homeLastPacked) {
        var w = $("meterwrap");
        w.classList.remove("judder");
        void w.getBoundingClientRect();
        w.classList.add("judder");
      }
      homeLastPacked = packed;
      homeLastDeg = deg;

      // The whole donut, inner rings included, is how full this disc is, so
      // the reading is the packed size against the whole disc and not against
      // the outer band alone.
      var total = over ? capOf(RUNGS.length - 1) : cap;
      $("usage").textContent = homeFmt(packed);
      var of = document.createElement("i");
      // "used of" rather than a bare "of", so the number reads as room left.
      of.textContent = "used of " + homeFmt(total) + (over ? " max" : "");
      $("usage").appendChild(of);
      $("rungNo").textContent = over ? "(past the 2048 disc)" : "(" + RUNGS[k].px + " disc)";

      $("homeMakeBtn").disabled = over;
    }, force ? 0 : HOME_SETTLE_MS);
  }

  /* WHAT COUNTS AS LARGE. The raw byte change is known on the keystroke, long
     before the compression finishes, so a big paste can wash the ring on the
     same frame rather than a tenth of a second later. */
  function noteHomeInput() {
    // What is in the tray was pressed from what the box used to hold. One
    // letter is enough to make it wrong, so it goes.
    if (homeDiscOut) tossDisc();
    var raw = currentHomeBytes().byteLength;
    var top = Math.min(homeLastRung, RUNGS.length - 1);
    var band = capOf(top) - (homeLastRung ? capOf(homeLastRung - 1) : 0);
    flashCut();
    if (Math.abs(raw - homeLastRaw) > band * 0.05) flashRing();
    homeLastRaw = raw;
  }

  /* ==========================================================================
     THE HOME BOARD - THE ATTACHMENT
     One payload at a time: text or one file, never both together. See
     addendums.ini for why, and for what would have to change first.
     ========================================================================== */

  function showHomeAttachment() {
    var pill = $("filePill");
    $("fileIcon").innerHTML = homeIcon(D_FILE, 15);
    $("homeFileName").textContent = homeAttached.name;
    $("homeFileSize").textContent = homeFmt(homeAttached.bytes.length);
    $("fileX").innerHTML = homeIcon(D_X, 14);
    pill.hidden = false;
    $("makeBox").classList.add("has");
    // The box is hidden behind the chip, so it must not be reachable by tab.
    $("makeText").disabled = true;
  }

  function dropHomeAttachment() {
    homeAttached = null;
    $("filePill").hidden = true;
    $("makeBox").classList.remove("has");
    $("makeText").disabled = false;
    noteHomeInput();
    updateHomeMeter();
  }

  async function takeHomeAttachment(f) {
    if (!f) return;
    homeAttached = {
      name: f.name,
      mime: f.type || "application/octet-stream",
      bytes: new Uint8Array(await f.arrayBuffer())
    };
    showHomeAttachment();
    noteHomeInput();
    updateHomeMeter();
  }

  /* ==========================================================================
     THE HOME BOARD - MAKE, AND THE DISC THAT COMES OUT
     ========================================================================== */

  function resetDisc() {
    var cd = $("cd");
    cd.style.transition = "none";
    cd.classList.remove("out", "gone", "lifted");
    void cd.getBoundingClientRect();
    cd.style.transition = "";
  }

  /* Throw away whatever is in the tray, then run then() once it has gone.

     THE CLEAR-UP CHECKS IT IS STILL THE CURRENT ONE. Pressing Make within a
     third of a second of a change used to leave an empty tray: the change
     started a toss, the press put a fresh disc in before that toss finished,
     and the toss then cleared the disc that had arrived meanwhile. */
  function tossDisc(then) {
    if (!homeDiscOut) { if (then) then(); return; }
    homeDiscOut = false;
    var run = homeDiscRun;
    $("cd").classList.add("gone");
    setTimeout(function () {
      if (run === homeDiscRun) resetDisc();
      if (then) then();
    }, DISC_TOSS_MS);
  }

  async function pressHomeDisc() {
    if (homePressing) return;
    homePressing = true;
    var btn = $("homeMakeBtn"), lab = $("makeLabel"), label = lab.innerHTML;
    btn.disabled = true;
    lab.textContent = "Pressing...";
    try {
      var input = homeAttached ? homeAttached.bytes : ($("makeText").value || "(empty)");
      /* EVERY ADVANCED SETTING REACHES THE ENGINE. The drawer is read in full
         and the board only fills in what it was not told: the ladder's top
         rung as a ceiling, unless Advanced named a size of its own. */
      var opts = gatherOptions();
      if (!opts.size) opts.maxSize = RUNGS[RUNGS.length - 1].px;
      // The engine takes a name and a type in its options, so a file comes out
      // of the other end still knowing what it was called.
      if (homeAttached) { opts.name = homeAttached.name; opts.mime = homeAttached.mime; }
      var png = await PuttyPNG.encode(input, opts);
      homeLastBlob = png.blob;
      maybeCelebrate("make");
      tossDisc(function () {
        var cd = $("cd");
        // This disc is the current one now, and it starts from a clean slot
        // whatever an unfinished toss left behind.
        homeDiscRun++;
        resetDisc();
        cd.src = png.dataUrl;
        // A timer, not requestAnimationFrame. The frame callback does not run
        // in a headless test, and the disc would then never be told to come out.
        setTimeout(function () { cd.classList.add("out"); homeDiscOut = true; }, DISC_EJECT_MS);
      });
    } catch (err) {
      toast(friendly(err), "bad");
    }
    lab.innerHTML = label;
    btn.disabled = false;
    homePressing = false;
  }

  async function copyHomeDisc(el, word) {
    if (!homeLastBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": homeLastBlob })]);
      confirmDone(el, word);
    } catch (err) {
      toast("This browser would not let the page copy it.", "bad");
    }
  }

  /* CARRYING A DISC. A copy of it follows the pointer and the original stays
     as a trace in the slot, so the tray never looks empty mid-move.
     THERE IS ONLY ONE PLACE TO PUT ONE DOWN. The bin is a button, so a release
     anywhere but Load carries the disc back to its slot. */
  function endDiscDrag(e) {
    if (!homeDrag) return;
    var d = homeDrag;
    homeDrag = null;
    if (!d.live) return;
    var cd = $("cd"), zone = $("zone");
    zone.classList.remove("over");
    var g = d.ghost;
    if (!!e && pointerInside(zone, e)) {
      g.style.transition = "transform .25s ease, opacity .25s ease";
      g.style.transform += " scale(.4)";
      g.style.opacity = 0;
      cd.classList.remove("lifted");
      loadHomeFromSrc(cd.src, "the one you made", homeLastBlob);
      homeDiscOut = false;
      cd.classList.add("gone");
      var run = homeDiscRun;
      setTimeout(function () { if (run === homeDiscRun) resetDisc(); }, DISC_TOSS_MS);
    } else {
      g.style.transition = "transform .25s ease";
      g.style.transform = "translate(0,0)";
      setTimeout(function () { cd.classList.remove("lifted"); }, 240);
    }
    setTimeout(function () { g.remove(); }, DISC_DRAG_MS);
  }

  /* ==========================================================================
     THE HOME BOARD - LOAD
     ========================================================================== */

  /* READING TAKES REAL TIME ON A LARGE DISC. The notice waits a moment before
     it appears, so a small one is read and shown without a flicker of it. */
  function startReading() {
    homeReadDepth++;
    clearTimeout(homeReadTimer);
    homeReadTimer = setTimeout(function () {
      if (homeReadDepth > 0) $("zone").classList.add("reading");
    }, READING_DELAY_MS);
  }

  function stopReading() {
    homeReadDepth = Math.max(0, homeReadDepth - 1);
    if (homeReadDepth === 0) {
      clearTimeout(homeReadTimer);
      $("zone").classList.remove("reading");
    }
  }

  async function readHomeFile(file) {
    if (!file) return;
    if (!/png/i.test(file.type) && !/\.png$/i.test(file.name || "")) {
      toast("That is not a PNG. A PuttyPNG has to stay a PNG.", "bad");
      return;
    }
    var url = URL.createObjectURL(file);
    startReading();
    try {
      var res = await PuttyPNG.decode(file);
      showHomeLoaded(url, file.name || "pasted.png", res, file);
    } catch (err) {
      if (err && err.code === "PTY-E00") {
        // A plain PNG is still worth showing. It is empty.
        showHomeLoaded(url, file.name || "pasted.png", null, file);
        toast(friendly(err), "bad");
        return;
      }
      toast(friendly(err), "bad");
    } finally {
      stopReading();
    }
  }

  async function loadHomeFromSrc(src, name, blob) {
    startReading();
    try {
      showHomeLoaded(src, name, await PuttyPNG.decode(src), blob);
    } catch (err) {
      showHomeLoaded(src, name, null, blob);
      toast(friendly(err), "bad");
    } finally {
      stopReading();
    }
  }

  /* What came out is shown as the disc and its name, then whatever came out as
     a file, then the text. A file gets its own chip with a download arrow, so
     it can be taken on its own rather than through the picture. */
  function showHomeLoaded(url, name, res, blob) {
    homeLoadedBlob = blob || null;
    $("gotImg").src = url;
    $("gotName").textContent = name;
    $("gotFiles").textContent = "";
    var text = null;

    if (res === null) {
      $("gotSize").textContent = "no PuttyPNG data inside";
    } else if (res.text != null) {
      text = res.text;
      $("gotSize").textContent = homeFmt(res.bytes.length) + " of text inside";
    } else {
      $("gotSize").textContent = "one file inside";
      addHomeFileChip(res.name || "a file", res.bytes, res.mime);
    }
    // All of it. The panel is meant to hold a whole book if one went in.
    $("gotText").textContent = text === null ? "" : text;
    $("gotBody").classList.toggle("filesonly", !text && $("gotFiles").children.length > 0);
    $("zone").classList.add("has");
  }

  // The whole chip takes the file. Nothing asks for a small target inside it.
  function addHomeFileChip(name, bytes, mime) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pill";
    chip.title = "Press to save " + name;
    chip.innerHTML = '<span class="ic">' + homeIcon(D_FILE, 15) + "</span>" +
      '<span class="nm"></span><span class="sz"></span>' +
      '<span class="act-ic">' + homeIcon(D_DOWN, 14) + "</span>";
    chip.querySelector(".nm").textContent = name;
    chip.querySelector(".sz").textContent = homeFmt(bytes.length);
    chip.addEventListener("click", function () {
      var href = URL.createObjectURL(new Blob([bytes], { type: mime || "application/octet-stream" }));
      saveBytes(href, name, true);
      var slot = chip.querySelector(".act-ic");
      slot.innerHTML = homeIcon(D_TICK, 14);
      slot.style.color = "var(--ok)";
      setTimeout(function () {
        slot.innerHTML = homeIcon(D_DOWN, 14);
        slot.style.color = "";
      }, HOME_CONFIRM_MS);
    });
    $("gotFiles").appendChild(chip);
  }

  function clearHomeLoaded() {
    homeLoadedBlob = null;
    $("zone").classList.remove("has");
    $("gotImg").removeAttribute("src");
    $("gotFiles").textContent = "";
    $("gotText").textContent = "";
    $("gotBody").classList.remove("filesonly");
    $("sink").value = "";
  }

  // The first PNG on a clipboard, or nothing.
  function pngFrom(items) {
    for (var i = 0; items && i < items.length; i++) {
      if (/^image\/png/.test(items[i].type)) return items[i].getAsFile();
    }
    return null;
  }

  /* ==========================================================================
     SECTION 6 - CLEANUP / FINALIZATION
     Putting things back to a known state after an interaction ends.
     ========================================================================== */





  function releaseDrawerHeight() {
    if (advDrawer.classList.contains("open")) advDrawer.style.maxHeight = "none";
  }


  /* ==========================================================================
     SECTION 7 - ENTRY POINT / ORCHESTRATION
     The one place the page starts. The order below is the order the page was
     wired in before this file existed, and it must stay that way.
     ========================================================================== */

  function init() {
    // A small development surface. The confetti's transform rule is exposed
    // so a test can check it without waiting for a frame to run.
    window.PuttyPNGDebug = window.PuttyPNGDebug || {};
    window.PuttyPNGDebug.launchTransform = launchTransform;

    // A choice made in Advanced wins, in both directions. With no choice
    // stored, the browser's own reduced-motion setting decides the movement,
    // and the celebration stays on.
    var savedAnim = readPref("animations");
    animationsOn = (savedAnim === null) ? !prefersLessMotion() : (savedAnim === "on");
    var savedCeleb = readPref("celebration");
    celebrationOn = (savedCeleb === null) ? true : (savedCeleb === "on");

    wireTabs();
    wireHome();
    wireDrawer();
    wireOptionFields();
    wirePageDrop();
    wireDisplayToggles();
    wireSubTabs();
    wireReader();
    wireSnippets();
    renderErrorTable();
    renderDropTable();
    renderMigrationTable();
    renderLicense();
    wireTutorial();
    wirePromptDemo();
  }

  init();
})();
