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

  // THE SHOW, IN TIME.
  // The compressed column is used when a person acts again while a result is
  // already on screen, so an impatient second drop does not feel slow.
  var KILL_MS = 620,   KILL_MS_FAST = 260;    // clearing the old result
  var HOLD_MS = 700,   HOLD_MS_FAST = 200;    // the new one hovering, before it enters
  var INSERT_MS = 500, INSERT_MS_FAST = 260;  // a PNG sliding into the slot
  var INGEST_MS = 620, INGEST_MS_FAST = 300;  // typed data being pulled in

  // Matches the left, right, and top inset on .disc-holder in styles.css.
  var DISC_INSET = 14;

  // How many ones and zeros are drawn for the ingest. They are decoration and
  // carry no data, so the count is chosen for looks alone.
  var EJECT_MS = 420;       // matches the .disc-holder transition in styles.css
  var SPIN_STAGE_MS = 320;  // each step of the spin up, three in all
  var KILL_MIN_LIFT = 60;   // every thrown piece clears the deck by at least this

  // The celebration. Ribbons only, with a ripple, from mockup F.
  var CONFETTI_COUNT = 60;
  var CONFETTI_LIFE_MS = 2200;
  var CONFETTI_COLORS = ["#c96f52", "#a8532f", "#e0a06f", "#7fa8a0", "#8a7fb0", "#d8c15e"];

  var INGEST_DIGITS = 16;

  // How often each kill animation is chosen. The two canvas tricks are rare on
  // purpose, so they read as a surprise rather than the usual thing.
  var KILL_WEIGHTS = [
    { name: "shatter", weight: 26 },
    { name: "shred",   weight: 22 },
    { name: "fling",   weight: 20 },
    { name: "warp",    weight: 18 },
    { name: "liquify", weight: 8 },
    { name: "ants",    weight: 6 }
  ];

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
  var optDepth = document.getElementById("optDepth");
  var cdControls = document.getElementById("cdControls");
  var cdAdvanced = document.getElementById("cdAdvanced");
  var imprintInput = document.getElementById("optImprint");
  var imprintInfo = document.getElementById("imprintInfo");
  var splatControls = document.getElementById("splatControls");
  var splatDisabledNote = document.getElementById("splatDisabledNote");

  var exportText = document.getElementById("exportText");
  var inputSize = document.getElementById("inputSize");
  var fileChip = document.getElementById("fileChip");
  var fileNameEl = document.getElementById("fileName");
  var fileSizeEl = document.getElementById("fileSize");
  var attachBtn = document.getElementById("attachBtn");
  var attachInput = document.getElementById("attachInput");

  var makeBtn = document.getElementById("makeBtn");
  var dropzone = document.getElementById("dropzone");
  var importFile = document.getElementById("importFile");

  // The two steps share the wide column. Only one is visible at a time.
  var stepInput = document.getElementById("stepInput");
  var stepResult = document.getElementById("stepResult");
  var outImg = document.getElementById("outImg");
  var dropVeil = document.getElementById("dropVeil");
  var badDrop = document.getElementById("badDrop");
  var discHolder = document.getElementById("discHolder");
  var slotEl = document.getElementById("slot");
  var showLayer = document.getElementById("showLayer");
  var confettiHost = document.getElementById("confettiHost");
  var deckEl = document.getElementById("deck");
  var deckHandle = document.getElementById("deckHandle");
  var driveBtn = document.getElementById("driveBtn");
  var deckFoot = document.getElementById("deckFoot");
  var glass = document.getElementById("glass");
  var discTools = document.getElementById("discTools");

  // Page state that outlives any single function. Declared here so every
  // section can see it, and only ever changed through the functions below.
  var toastTimer = null;
  var attachedFile = null;   // when set, Make encodes this file instead of the text
  var veilDepth = 0;         // the same count, for the page-wide overlay
  var dropBusy = false;      // true while a drop is being read, so two cannot race
  var lastPng = null;        // the most recent result, for Save and Copy
  var driveState = "empty";  // "empty", "out", or "in"
  var discUrl = null;        // the blob URL of a dropped disc, held while it is loaded
  var subTabShow = null;     // set by wireSubTabs, so the cover style can switch group
  var lastIsDisc = false;    // whether the loaded cover is really a CD
  var tutLast = null;        // the same, for the Tutorial tab

  /* ==========================================================================
     SECTION 3 - HELPER FUNCTIONS
     Small, single-purpose functions with no knowledge of the page's flow.
     ========================================================================== */

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

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
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
    celebration: "ppng.pref.celebration"
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

  // Stored as "value|date". An empty value is fine: some keys only record that
  // something happened, and when.
  function stampValue(value) {
    return (value === undefined || value === null ? "" : value) + "|" + new Date().toISOString();
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

  function hasSeen(kind) {
    return readFresh(STORE_KEYS[kind], SEEN_DAYS) !== null;
  }

  function markSeen(kind) {
    writeStore(STORE_KEYS[kind], stampValue(""));
  }

  function readPref(kind) {
    return readFresh(STORE_KEYS[kind], PREF_DAYS);
  }

  function writePref(kind, on) {
    writeStore(STORE_KEYS[kind], stampValue(on ? "on" : "off"));
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

  // Report a drop failure in the panel below the current step.
  //
  // RULE: this only ever adds a panel. It never hides a step, never clears the
  // deck, and never touches the result. A bad drop costs the person nothing.
  //
  // An unknown code falls back to DRP-E99 rather than showing an empty panel.
  function dropFail(code) {
    var known = Object.prototype.hasOwnProperty.call(DROP_ERRORS, code);
    if (!known) code = "DRP-E99";
    document.getElementById("badDropMsg").textContent = DROP_ERRORS[code];
    document.getElementById("badDropCode").textContent = code;
    badDrop.classList.remove("hidden");
  }

  // Clear the panel. Called whenever something goes right, so a stale failure
  // cannot sit under a fresh result.
  function clearDropFail() {
    badDrop.classList.add("hidden");
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

  // Which kill animation plays. PuttyPNG.forceKill in the console pins one,
  // because waiting for a 6 per cent effect to appear by chance is no way to
  // build it.
  function pickKill() {
    if (window.PuttyPNGDebug && window.PuttyPNGDebug.forceKill) {
      return window.PuttyPNGDebug.forceKill;
    }
    var total = 0;
    var i;
    for (i = 0; i < KILL_WEIGHTS.length; i++) total += KILL_WEIGHTS[i].weight;
    var n = Math.random() * total;
    for (i = 0; i < KILL_WEIGHTS.length; i++) {
      n -= KILL_WEIGHTS[i].weight;
      if (n <= 0) return KILL_WEIGHTS[i].name;
    }
    return "fling";
  }

  // Where the disc sits right now, measured in slot coordinates. Used by the
  // kill, which has to start exactly where the old disc was.
  function discBox() {
    var d = outImg.getBoundingClientRect();
    return { left: d.left, top: d.top, width: d.width, height: d.height };
  }

  // Where a disc of this shape will sit once ejected. Worked out from the
  // stylesheet's own numbers, so it does not depend on what is on screen.
  function targetBox(aspect) {
    var s = slotEl.getBoundingClientRect();
    var w = Math.max(1, s.width - DISC_INSET * 2);
    return {
      left: s.left + DISC_INSET,
      top: s.top + DISC_INSET,
      width: w,
      height: w / (aspect || 1)
    };
  }

  // Everything a kill or an arrival draws goes in the page layer, which is
  // fixed and unclipped, so pieces cross the whole page instead of stopping at
  // the edge of the deck.
  function killHost() {
    var el = document.createElement("div");
    el.className = "kill-host";
    el.setAttribute("aria-hidden", "true");
    showLayer.appendChild(el);
    return el;
  }

  // One piece of the old disc. clip decides which part of the picture shows.
  function killPiece(box, src, clip) {
    var p = document.createElement("div");
    p.className = "kill-piece";
    p.style.left = box.left + "px";
    p.style.top = box.top + "px";
    p.style.width = box.width + "px";
    p.style.height = box.height + "px";
    p.style.backgroundImage = "url(" + src + ")";
    if (clip) p.style.clipPath = clip;
    return p;
  }

  function killCanvas(box) {
    var cv = document.createElement("canvas");
    cv.className = "kill-canvas";
    cv.setAttribute("aria-hidden", "true");
    cv.width = Math.max(1, Math.round(box.width));
    cv.height = Math.max(1, Math.round(box.height));
    cv.style.left = box.left + "px";
    cv.style.top = box.top + "px";
    cv.style.width = box.width + "px";
    cv.style.height = box.height + "px";
    showLayer.appendChild(cv);
    return cv;
  }

  // A wedge of the disc, from the middle out. The radius runs past the edge
  // because the piece is clipped to its own box anyway.
  function wedgeClip(a0, a1) {
    function pt(deg) {
      var r = deg * Math.PI / 180;
      return (50 + Math.cos(r) * 60).toFixed(1) + "% " + (50 + Math.sin(r) * 60).toFixed(1) + "%";
    }
    return "polygon(50% 50%, " + pt(a0) + ", " + pt((a0 + a1) / 2) + ", " + pt(a1) + ")";
  }

  // ---- The six kill animations -------------------------------------------

  // 1. Shatter: the disc breaks into wedges that fly apart.
  async function killShatter(src, box, ms) {
    var host = killHost();
    var n = 6;
    for (var i = 0; i < n; i++) {
      var a0 = (i / n) * 360;
      var a1 = ((i + 1) / n) * 360;
      var p = killPiece(box, src, wedgeClip(a0, a1));
      host.appendChild(p);
      p.style.transition = "transform " + ms + "ms cubic-bezier(.2,.6,.3,1), opacity " + ms + "ms ease-in";
      // The wedge keeps its own sideways direction. awayTransform decides the
      // vertical one, so no wedge can travel toward the slot.
      var mid = ((a0 + a1) / 2) * Math.PI / 180;
      var dist = 180 + Math.random() * 120;
      spring(p, awayTransform(Math.cos(mid) * dist, Math.sin(mid) * dist,
                              Math.random() * 120 - 60));
    }
    await wait(ms);
    host.remove();
  }

  // 2. Shred: vertical strips fall through the lip, one after another.
  async function killShred(src, box, ms) {
    var host = killHost();
    var n = 9;
    for (var i = 0; i < n; i++) {
      var left = (i / n) * 100;
      var right = 100 - ((i + 1) / n) * 100;
      var p = killPiece(box, src, "inset(0 " + right.toFixed(2) + "% 0 " + left.toFixed(2) + "%)");
      host.appendChild(p);
      var lag = i * 18;
      p.style.transition = "transform " + ms + "ms cubic-bezier(.35,0,.7,1) " + lag + "ms, " +
                           "opacity " + ms + "ms linear " + lag + "ms";
      // Fanning out from the middle as it goes.
      var spread = (i - (n - 1) / 2) * 26;
      spring(p, awayTransform(spread, box.height + 120, spread * 0.2), "0.15");
    }
    await wait(ms + n * 18);
    host.remove();
  }

  // 3. Fling: one piece, thrown off the screen, spinning.
  async function killFling(src, box, ms) {
    var host = killHost();
    var p = killPiece(box, src, null);
    host.appendChild(p);
    p.style.transition = "transform " + ms + "ms cubic-bezier(.3,.1,.6,1), opacity " + ms + "ms ease-in";
    var dir = Math.random() < 0.5 ? -1 : 1;
    spring(p, awayTransform(dir * 430, 280, dir * 540) + " scale(.45)");
    await wait(ms);
    host.remove();
  }

  // 4. Warp speed: it stretches, brightens, and is gone in a flash.
  async function killWarp(src, box, ms) {
    var host = killHost();
    var p = killPiece(box, src, null);
    host.appendChild(p);
    p.style.transition = "transform " + ms + "ms cubic-bezier(.7,0,1,.4), " +
                         "opacity " + ms + "ms ease-in, filter " + ms + "ms ease-in";
    requestAnimationFrame(function () {
      p.style.transform = "scaleX(3.4) scaleY(.05)";
      p.style.filter = "brightness(4.5) blur(3px)";
      p.style.opacity = "0";
    });
    await wait(ms);
    host.remove();
  }

  // 5. Liquify: columns of the picture slide on a wave that grows.
  // The cost is set by the deck size, not the size of the PNG, because the
  // drawing happens once per column of the canvas.
  async function killLiquify(src, box, ms) {
    var img = await loadImage(src);
    var cv = killCanvas(box);
    var ctx = cv.getContext("2d");
    var w = cv.width;
    var h = cv.height;
    var sx = img.naturalWidth / w;
    var start = now();
    await new Promise(function (done) {
      function frame() {
        var t = Math.min(1, (now() - start) / ms);
        ctx.clearRect(0, 0, w, h);
        var amp = t * h * 0.6;
        var lift = t * t * h * 1.5;          // the whole sheet rises as it melts
        for (var x = 0; x < w; x += 2) {
          var off = Math.sin((x / w) * Math.PI * 4 + t * 9) * amp - lift;
          ctx.drawImage(img, x * sx, 0, 2 * sx, img.naturalHeight, x, off, 2, h);
        }
        cv.style.opacity = String(1 - t * t);
        if (t < 1) requestAnimationFrame(frame); else done();
      }
      requestAnimationFrame(frame);
    });
    cv.remove();
  }

  // 6. Ants: the picture is sampled into ovals that crawl apart.
  // The points are large and few on purpose. Small ones read as dust.
  async function killAnts(src, box, ms) {
    var img = await loadImage(src);
    var cv = killCanvas(box);
    var ctx = cv.getContext("2d");
    var w = cv.width;
    var h = cv.height;

    var tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    var tctx = tmp.getContext("2d");
    tctx.drawImage(img, 0, 0, w, h);
    var data = tctx.getImageData(0, 0, w, h).data;

    var step = Math.max(7, Math.round(w / 20));
    var pts = [];
    for (var y = step / 2; y < h; y += step) {
      for (var x = step / 2; x < w; x += step) {
        var i = ((y | 0) * w + (x | 0)) * 4;
        if (data[i + 3] < 40) continue;
        // The angle is mirrored into the upper half, so no ant walks toward
        // the slot.
        var ang = Math.atan2(y - h / 2, x - w / 2) + (Math.random() - 0.5) * 0.8;
        if (Math.sin(ang) > 0) ang = -ang;
        pts.push({
          x: x, y: y, a: ang,
          c: "rgb(" + data[i] + "," + data[i + 1] + "," + data[i + 2] + ")",
          k: Math.random() * 6
        });
      }
    }

    var size = Math.max(2.2, step * 0.34);
    var start = now();
    await new Promise(function (done) {
      function frame() {
        var t = Math.min(1, (now() - start) / ms);
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = 1 - t * t;
        for (var k = 0; k < pts.length; k++) {
          var p = pts[k];
          var d = t * t * 160;
          var wob = Math.sin(t * 26 + p.k) * 3.5 * t;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.ellipse(p.x + Math.cos(p.a) * d + wob, p.y + Math.sin(p.a) * d,
                      size, size * 0.6, p.a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (t < 1) requestAnimationFrame(frame); else done();
      }
      requestAnimationFrame(frame);
    });
    cv.remove();
  }

  // Build the transform for a piece being thrown clear.
  //
  // RULE: dy is forced upward here, and every travelling kill builds its
  // transform through this. A piece that falls toward the slot reads as the
  // machine eating the disc, which is the opposite of destroying it.
  // Shred used to do exactly that.
  function awayTransform(dx, dy, rot) {
    var up = -Math.abs(dy) - KILL_MIN_LIFT;
    return "translate(" + dx.toFixed(0) + "px," + up.toFixed(0) + "px) rotate(" +
           rot.toFixed(0) + "deg)";
  }

  // Set the finished state on the next frame, so the browser paints the start
  // first, so the transition has two states to move between.
  function spring(el, transform, opacity) {
    requestAnimationFrame(function () {
      el.style.transform = transform;
      el.style.opacity = (opacity === undefined) ? "0" : opacity;
    });
  }

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  // Clear the old result. Returns the name of the animation that played.
  async function runKill(src, box, ms) {
    var name = pickKill();
    var run = {
      shatter: killShatter, shred: killShred, fling: killFling,
      warp: killWarp, liquify: killLiquify, ants: killAnts
    }[name] || killFling;
    if (window.PuttyPNGDebug) {
      window.PuttyPNGDebug.lastKill = name;
      if (window.PuttyPNGDebug.forceKill && console && console.log) {
        console.log("PuttyPNG kill: " + name);
      }
    }
    try {
      // A kill is decoration, and the result must arrive whatever it does.
      //
      // The cap matters: the canvas effects run on requestAnimationFrame, which
      // stops in a background tab. Without it, switching tabs part way through
      // would leave the Make button disabled until the person came back.
      await Promise.race([run(src, box, ms), wait(ms * 4 + 500)]);
    } catch (err) {
      // Fall through. The cleanup below runs either way.
    }
    clearShowLayers();
    return name;
  }

  // ---- Getting the new result in ------------------------------------------

  // A dropped PuttyPNG falls from above, hovers a beat, then slides into the
  // slot. The picture used is the one that was dropped.
  async function runInsert(src, aspect, holdMs) {
    var box = targetBox(aspect);
    var host = killHost();
    var p = killPiece(box, src, null);
    p.style.transform = "translateY(-170%) rotate(-7deg)";
    p.style.opacity = "0";
    host.appendChild(p);
    void p.offsetHeight;

    // It falls to exactly where the ejected disc sits, and stops there. The
    // real disc then takes over at the same spot, so the handover is unseen.
    p.style.transition = "transform 320ms cubic-bezier(.2,.85,.3,1), opacity 200ms ease-out";
    spring(p, "translateY(0) rotate(0deg)", "1");
    await wait(320 + holdMs);
    host.remove();
  }

  // Typed data has no picture, so ones and zeros are pulled from the box into
  // the slot instead. They are decoration and carry nothing: the payload may
  // be encrypted, and showing real bytes would suggest something is leaking.
  async function runIngest(ms) {
    var host = document.createElement("div");
    host.className = "ingest-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);

    var from = exportText.getBoundingClientRect();
    var to = slotEl.getBoundingClientRect();
    var tx = to.left + to.width / 2;
    var ty = to.top + to.height * 0.74;
    var lag = Math.round(ms * 0.45);

    for (var i = 0; i < INGEST_DIGITS; i++) {
      var b = document.createElement("span");
      b.className = "bit";
      b.textContent = Math.random() < 0.5 ? "0" : "1";
      var sx = from.left + Math.random() * from.width;
      var sy = from.top + Math.random() * from.height;
      b.style.left = sx + "px";
      b.style.top = sy + "px";
      host.appendChild(b);
      var d = Math.round(Math.random() * lag);
      b.style.transition = "transform " + ms + "ms cubic-bezier(.5,0,.9,.55) " + d + "ms, " +
                           "opacity " + ms + "ms linear " + d + "ms";
      spring(b, "translate(" + (tx - sx).toFixed(0) + "px," + (ty - sy).toFixed(0) +
                "px) scaleX(.3) scaleY(2.8)");
    }
    await wait(ms + lag);
    host.remove();
  }

  // Mark the deck as holding something. Below the collapse point an empty
  // deck is hidden, because a blank square under the box reads as a fault.
  function deckFilled() {
    document.querySelector(".module-deck").classList.add("filled");
  }

  // Size the disc for the deck.
  //
  // sizePreview writes pixel width and height, which fights the deck's own
  // width rule and squashes a non-square PNG. Here the aspect ratio is set
  // instead and the width is left to the CSS, so the shape is always true.
  function sizeDisc(img, w, h) {
    img.style.width = "";
    img.style.height = "";
    img.style.aspectRatio = w + " / " + h;
  }

  // A small, styled confirm dialog. Resolves true for confirm, false for cancel.
  function confirmModal(o) {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "modal-overlay-el";
      wrap.innerHTML =
        '<div class="modal-card" role="dialog" aria-modal="true">' +
        '<h3>' + escapeHtml(o.title || "Are you sure?") + "</h3>" +
        "<p>" + (o.message || "") + "</p>" +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-cancel>' + escapeHtml(o.cancel || "Cancel") + "</button>" +
        '<button type="button" class="btn btn-clay btn-sm" data-ok>' + escapeHtml(o.confirm || "OK") + "</button>" +
        "</div></div>";
      function close(v) { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); }
      function onKey(e) { if (e.key === "Escape") close(false); else if (e.key === "Enter") close(true); }
      wrap.addEventListener("click", function (e) { if (e.target === wrap) close(false); });
      wrap.querySelector("[data-cancel]").addEventListener("click", function () { close(false); });
      wrap.querySelector("[data-ok]").addEventListener("click", function () { close(true); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(wrap);
      wrap.querySelector("[data-ok]").focus();
    });
  }

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

  function wireDataBox() {
    exportText.addEventListener("input", updateInputSize);
    document.getElementById("fileClear").addEventListener("click", clearFile);

    // "attach a file" opens a picker, and the picker itself is the confirmation.
    attachBtn.addEventListener("click", function () { attachInput.click(); });
    attachInput.addEventListener("change", async function () {
      var file = attachInput.files && attachInput.files[0];
      if (!file) return;
      // Typed text is hidden rather than deleted, and the chip's X brings it
      // back. The question is still asked, because setting the text aside is
      // not what a person expects a file picker to do.
      if (exportText.value.trim() && !attachedFile) {
        var ok = await confirmModal({
          title: "Set the text aside?",
          message: "Hide <strong>" + escapeHtml(file.name) + "</strong> (" + formatSize(file.size) +
                   ") instead. Your text comes back if you remove the file.",
          confirm: "Attach", cancel: "Cancel"
        });
        if (!ok) { attachInput.value = ""; return; }
      }
      attachFile(file);
    });

    updateInputSize();
  }

  // The whole window is the drop target.
  //
  // dragenter and dragleave fire for every element the pointer crosses, so the
  // overlay is driven by a depth counter, never by a boolean. A boolean is
  // wrong the moment the pointer crosses a nested element.
  function wirePageDrop() {
    window.addEventListener("dragenter", function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      veilDepth++;
      showDropVeil(classifyDrag(e));
    });

    // Without preventDefault here the browser opens the dropped file and the
    // page is lost. This one line is what keeps the page on screen.
    window.addEventListener("dragover", function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
    });

    window.addEventListener("dragleave", function (e) {
      if (!dragHasFiles(e)) return;
      veilDepth--;
      if (veilDepth <= 0) hideDropVeil();
    });

    window.addEventListener("drop", function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      hideDropVeil();
      handleDrop(e);
    });

    // A drag that ends outside the window never sends a drop, so the overlay
    // is cleared here as well.
    window.addEventListener("dragend", hideDropVeil);
  }

  function wireMake() {
    makeBtn.addEventListener("click", makePuttyPNG);
  }

  // The disc lies flat when a person wants to look at it properly.
  // Hover is handled in CSS. A tap is handled here, because a touch device has
  // no hover to end.
  // The sheet, on a phone.
  //
  // It rises whenever the drive has something to show, and tucks to its handle
  // when a person taps the handle or taps the page behind it. It is not a
  // modal: no backdrop, and the page keeps scrolling, because somebody may
  // want to edit their text while a result is up.
  function wireSheet() {
    if (!deckEl || !deckHandle) return;

    deckHandle.addEventListener("click", function () {
      deckEl.classList.toggle("up");
    });

    // A tap anywhere else tucks it. The check is on the deck itself, so a tap
    // on the drive button or the disc does not close it.
    document.addEventListener("click", function (e) {
      if (!deckEl.classList.contains("up")) return;
      if (deckEl.contains(e.target)) return;
      deckEl.classList.remove("up");
    });
  }

  // Bring the sheet up. Called whenever the drive gets something, so a second
  // result opens it again even if it was tucked away.
  function raiseSheet() {
    if (deckEl) deckEl.classList.add("up");
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
  function wireDisplayToggles() {
    var anim = document.getElementById("optAnimations");
    var celeb = document.getElementById("optCelebration");
    if (!anim || !celeb) return;

    anim.checked = animationsOn;
    celeb.checked = celebrationOn;

    anim.addEventListener("change", function () {
      animationsOn = anim.checked;
      writePref("animations", animationsOn);
    });
    celeb.addEventListener("change", function () {
      celebrationOn = celeb.checked;
      writePref("celebration", celebrationOn);
      if (!celebrationOn) clearConfetti();
    });
  }

  // The drive button is the only way between the two sections now.
  function wireSteps() {
    driveBtn.addEventListener("click", onDriveButton);
  }

  function wireSaveAndCopy() {
    document.getElementById("saveBtn").addEventListener("click", function () {
      if (!lastPng) return;
      var a = document.createElement("a");
      a.href = lastPng.dataUrl;
      a.download = "puttypng.png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
    document.getElementById("copyImgBtn").addEventListener("click", async function () {
      if (!lastPng || !lastPng.blob) { toast("Nothing to copy yet", "bad"); return; }
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": lastPng.blob })]);
          toast("Image copied to clipboard", "ok");
        } else { toast("Clipboard images not supported here - use Save", "bad"); }
      } catch (e) { toast("Could not copy image", "bad"); }
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
    // Pasting an image anywhere on the page reads it.
    document.addEventListener("paste", function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
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
    optDepth.value = isCd ? "subtle" : "standard";
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

  function updateInputSize() {
    if (attachedFile) return;   // file mode shows the file size instead
    inputSize.textContent = formatSize(new TextEncoder().encode(exportText.value).length);
  }

  function attachFile(file) {
    attachedFile = file;
    fileNameEl.textContent = file.name || "(unnamed file)";
    fileSizeEl.textContent = formatSize(file.size) + (file.type ? " · " + file.type : "");
    fileChip.classList.remove("hidden");
    exportText.classList.add("hidden");
    attachBtn.classList.add("hidden");
    inputSize.textContent = formatSize(file.size);
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

  async function makePuttyPNG() {
    makeBtn.disabled = true;
    var original = makeBtn.textContent;
    makeBtn.textContent = "Pressing...";
    try {
      var opts = gatherOptions();
      // An attached file, dropped or browsed, encodes as binary with its name.
      // Otherwise the typed text is used.
      var input = attachedFile ? attachedFile : exportText.value;

      var png = await PuttyPNG.encode(input, opts);
      lastPng = png;
      // A generated CD is the only cover that is really a disc.
      lastPng.isDisc = (opts.coverStyle === "cd" && !opts.cover);
      claimDiscUrl(null);        // a made disc is a data URL, so free any blob
      setDeckFoot(madeFoot(png));
      showStep("input");
      toast("PuttyPNG created", "ok");
      // The engine has finished. Everything after this is decoration, and the
      // result is already safe whether or not it plays.
      await presentResult(png.dataUrl, lastPng.isDisc, "ingest", false);
      maybeCelebrate("make");
    } catch (err) {
      toast(friendly(err), "bad");
    } finally {
      makeBtn.disabled = false;
      makeBtn.textContent = original;
    }
  }

  // ---- THE DRIVE ----------------------------------------------------------

  // The drive has three states and one button. The button always says what
  // pressing it will do.
  //
  // RULE: nothing else may set the button text, the footer, the window, or the
  // disc buttons. They are all read from here. Two places writing the same
  // thing is how hover and the tap class drifted apart in Part 1.
  function setDriveState(state) {
    driveState = state;
    var empty = (state === "empty");
    var loaded = (state === "in");

    if (!empty) raiseSheet();
    driveBtn.classList.toggle("hidden", empty);
    driveBtn.textContent = loaded ? "Eject PuttyPNG" : "Decode PuttyPNG";
    deckFoot.classList.toggle("hidden", empty);
    glass.classList.toggle("lit", loaded);
    discTools.classList.toggle("hidden", state !== "out");
  }

  // The slim display under the drive. It describes whichever disc the drive
  // has, in or out, because those details have no other home.
  function setDeckFoot(rows) {
    if (!rows) { deckFoot.innerHTML = ""; return; }
    deckFoot.innerHTML = rows.map(function (r) {
      return '<div class="stat-row"><span class="k">' + r[0] +
             '</span><span class="v">' + r[1] + "</span></div>";
    }).join("");
  }

  // A disc that was made here. The engine reports every field.
  function madeFoot(png) {
    return [
      ["Image", png.width + " &times; " + png.height + " px"],
      ["Hidden", png.bytesHidden.toLocaleString() + " bytes"],
      ["Capacity used", png.usedPercent + "%"],
      ["Depth", png.depth],
      ["Compressed", png.compressed ? "yes" : "no"],
      ["Encrypted", png.encrypted ? "yes (AES-256)" : "no"]
    ];
  }

  // A disc that came from somewhere else. Its capacity is unknown, so that row
  // is left out rather than guessed at.
  function loadedFoot(result, w, h) {
    var rows = [["Image", w + " &times; " + h + " px"]];
    if (result.name) rows.push(["Name", escapeHtml(result.name)]);
    rows.push(["Type", result.type]);
    rows.push(["Depth", result.depth]);
    rows.push(["Compressed", result.compressed ? "yes" : "no"]);
    rows.push(["Encrypted", result.encrypted ? "yes (AES-256)" : "no"]);
    return rows;
  }

  // ---- The spin illusion --------------------------------------------------

  // Smear a disc through a turn by drawing it many times at small offsets.
  //
  // A CD is radially symmetric, so a smear across the FULL circle looks the
  // same at every angle. That is the whole trick: once it is baked, the
  // picture can sit perfectly still and still read as spinning too fast to
  // follow, and nothing has to keep drawing.
  function bakeSpin(img, size, samples, spreadDeg) {
    var c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    var x = c.getContext("2d");
    for (var i = 0; i < samples; i++) {
      // The first sample is drawn solid. Blending every one at 1/samples only
      // reaches about two thirds opacity, and the dark window showed through
      // it, so the smear looked washed out rather than fast.
      x.globalAlpha = (i === 0) ? 1 : 1 / samples;
      var a = (spreadDeg * (i / (samples - 1) - 0.5)) * Math.PI / 180;
      x.save();
      x.translate(size / 2, size / 2);
      x.rotate(a);
      x.drawImage(img, -size / 2, -size / 2, size, size);
      x.restore();
    }
    return c;
  }

  // Spin the loaded disc up, then hand over to a still picture and stop.
  //
  // Stage 1 is a real rotation. Stages 2 and 3 are baked once and never
  // redrawn, so the drive costs nothing for the rest of the visit.
  async function spinUp(src) {
    glass.innerHTML = "";
    var size = Math.max(24, Math.round(glass.getBoundingClientRect().width)) || 90;
    var img = await loadImage(src);

    // With animations off, show the disc sharp and still. A blurred still
    // would suggest motion to a person who asked for none.
    if (!animationsOn) {
      var flat = document.createElement("img");
      flat.src = src;
      glass.appendChild(flat);
      return;
    }

    var live = document.createElement("img");
    live.src = src;
    live.className = "spin-live";
    var mid = bakeSpin(img, size, 10, 30);
    var full = bakeSpin(img, size, 36, 360);
    mid.style.opacity = "0";
    full.style.opacity = "0";
    glass.appendChild(live);
    glass.appendChild(mid);
    glass.appendChild(full);

    await wait(SPIN_STAGE_MS);
    mid.style.opacity = "1";
    await wait(SPIN_STAGE_MS);
    full.style.opacity = "1";
    await wait(SPIN_STAGE_MS);

    // Only the still frame is left, so no work remains.
    live.remove();
    mid.remove();
  }

  function stopSpin() {
    glass.innerHTML = "";
  }

  // The one control on the drive. What it does depends on the state, and its
  // label always says which.
  async function onDriveButton() {
    if (driveState === "in") await driveEject();
    else if (driveState === "out") await driveDecode();
  }

  // Draw the disc in and read it. This is the same work a drop does, started
  // from a disc the person is already holding.
  async function driveDecode() {
    var src = outImg.src;
    if (!src) return;
    driveBtn.disabled = true;
    try {
      var result = await PuttyPNG.decode(src);
      showResult(result);
      await loadDisc();
      setDriveState("in");
      await spinUp(src);
      maybeCelebrate("read");
    } catch (err) {
      toast(friendly(err), "bad");
      // The disc never left, so put the drive back as it was.
      setDriveState("out");
    } finally {
      driveBtn.disabled = false;
    }
  }

  // Hand the disc back. It comes straight out, with no spin down.
  async function driveEject() {
    driveBtn.disabled = true;
    stopSpin();
    showStep("input");
    await ejectDisc(lastIsDisc);
    setDriveState("out");
    driveBtn.disabled = false;
  }

  // Put a result on screen, with the whole show around it.
  //
  // ORDER, and the reason for it:
  //   kill the old result  ->  bring the new one in  ->  eject it
  //
  // This runs only after the caller has a good result in hand. Nothing here
  // ever decides whether a result is valid, which is what makes a bad drop
  // harmless: the guard in handleDrop returns long before this is reached.
  //
  // kind is "insert" when a real PNG arrived, or "ingest" when data was typed.
  // fast compresses every step, for a person who acts again straight away.
  async function presentResult(src, isDisc, kind, fast) {
    var img = await loadImage(src);
    var aspect = img.naturalWidth / img.naturalHeight;
    lastIsDisc = isDisc;

    clearShowLayers();
    stopSpin();

    // Clear whatever the drive was holding. This is the only place a result is
    // destroyed, and it runs long after the caller proved the new one is good.
    var hadResult = !outImg.classList.contains("hidden");
    if (animationsOn && hadResult) {
      var box = discBox();
      var oldSrc = outImg.src;
      outImg.classList.add("hidden");
      await runKill(oldSrc, box, fast ? KILL_MS_FAST : KILL_MS);
    }

    if (kind === "insert") {
      // A dropped PuttyPNG falls in front of the page, then the real disc
      // takes over at the same spot and slides into the machine.
      if (animationsOn) {
        await Promise.race([runInsert(src, aspect, fast ? HOLD_MS_FAST : HOLD_MS), wait(4000)]);
        clearShowLayers();
      }
      applyDisc(src, img.naturalWidth, img.naturalHeight);
      placeDiscOut();
      await loadDisc();
      setDriveState("in");
      await spinUp(src);
      return;
    }

    // Typed data has no picture to slide in, so the ones and zeros stand in
    // for it, and the finished disc is handed straight to the person.
    if (animationsOn) {
      await Promise.race([runIngest(fast ? INGEST_MS_FAST : INGEST_MS), wait(4000)]);
      clearShowLayers();
    }
    applyDisc(src, img.naturalWidth, img.naturalHeight);
    await ejectDisc(isDisc);
    setDriveState("out");
  }

  // Put the disc in the ejected place with no movement, so it can take over
  // from the arriving copy without a visible jump.
  function placeDiscOut() {
    discHolder.classList.remove("loading");
    discHolder.classList.add("instant", "out", "above");
    void discHolder.offsetHeight;
    discHolder.classList.remove("instant");
  }

  // Point the deck at a picture and give it the right shape.
  function applyDisc(src, w, h) {
    outImg.src = src;
    sizeDisc(outImg, w, h);
    outImg.classList.remove("hidden");
    deckFilled();
  }

  // Send the disc out of the slot.
  //
  // isDisc decides the spin. A CD cover is a disc and spinning says so. A noise
  // cover, a custom image, or somebody else's decoded PNG is not, and spinning
  // one would be a lie.
  //
  // With animationsOn false this puts the disc in its finished place with no
  // motion, which is the path that proves the engine needs none of this.
  function ejectDisc(isDisc) {
    if (!discHolder) return Promise.resolve();

    outImg.classList.remove("hidden");
    deckFilled();

    // Start from the resting place every time, so a second result plays the
    // whole move rather than jumping from wherever the last one stopped.
    discHolder.classList.remove("out", "instant", "loading", "above");
    discHolder.classList.toggle("no-spin", !isDisc);

    if (!animationsOn) {
      discHolder.classList.add("instant", "out", "above");
      return Promise.resolve();
    }

    // Read a layout value to force the browser to apply the resting state
    // before the ejected one. Without this the two are batched into one paint
    // and no transition runs.
    void discHolder.offsetHeight;
    discHolder.classList.add("out");

    return wait(EJECT_MS).then(function () {
      // Clear of the lip now, so the disc can sit above the machine. The
      // change cannot be seen, because nothing overlaps at this point.
      discHolder.classList.add("above");
    });
  }

  // Draw the disc back into the machine. It goes behind the face on the way,
  // which is what makes the slot look like a hole rather than a picture.
  function loadDisc() {
    if (!discHolder) return Promise.resolve();
    discHolder.classList.remove("above");
    if (!animationsOn) {
      discHolder.classList.add("instant");
      discHolder.classList.remove("out");
      return Promise.resolve();
    }
    discHolder.classList.add("loading");
    return wait(EJECT_MS).then(function () {
      discHolder.classList.remove("out");
    });
  }

  // Swap the wide column between step one and step two.
  // which is "input", "made", or "read". The deck is never hidden, so the
  // result image stays put whichever step is on screen.
  // The wide column holds two named sections and shows one of them.
  // "input" is What you'd like to encode. "read" is What was inside.
  function showStep(which) {
    clearDropFail();
    var onResult = (which === "read");
    stepInput.classList.toggle("hidden", onResult);
    stepResult.classList.toggle("hidden", !onResult);
  }

  function showResult(result) {
    var badges = document.getElementById("resultBadges");
    var chips = [];
    chips.push('<span class="badge">type: ' + result.type + "</span>");
    if (result.name) chips.push('<span class="badge">' + escapeHtml(result.name) + "</span>");
    if (result.encrypted) chips.push('<span class="badge">encrypted</span>');
    if (result.compressed) chips.push('<span class="badge">compressed</span>');
    if (result.tag) chips.push('<span class="badge">tag: ' + escapeHtml(result.tag) + "</span>");
    chips.push('<span class="badge">' + result.depth + "</span>");
    badges.innerHTML = chips.join("");

    var textWrap = document.getElementById("resultTextWrap");
    var actions = document.getElementById("resultActions");
    actions.innerHTML = "";
    if (result.type === "binary") {
      textWrap.classList.add("hidden");
      var btn = document.createElement("button");
      btn.className = "btn btn-clay btn-sm";
      btn.type = "button";
      btn.textContent = "Download " + (result.name || "file");
      btn.addEventListener("click", function () { PuttyPNG.download(result); });
      actions.appendChild(btn);
    } else {
      textWrap.classList.remove("hidden");
      document.getElementById("resultText").textContent = result.text || "";
    }
    // A decode can start from the How it works tab, so bring the person back
    // to where the result is shown.
    switchTab("puttypng");
    showStep("read");
    toast("PuttyPNG decoded", "ok");
  }

  // A dropped file, handled in a fixed order.
  //
  // RULE: nothing already on screen is touched until the new result is known
  // to be good. Every early return leaves the page exactly as it was. In
  // Phase 2 the kill animation hangs off the success path, never off the drop
  // itself, which is what makes a bad drop harmless.
  async function handleDrop(e) {
    if (dropBusy) { dropFail("DRP-E06"); return; }
    clearDropFail();

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
      // A result already on screen means this is a second action, so the show
      // runs at the compressed timings.
      var busy = !outImg.classList.contains("hidden");
      await readSource(file, busy);   // the only path that replaces the result
    } catch (err) {
      // peek and decode throw engine errors. A file that is not really a PNG
      // fails inside the engine, so it is reported as a drop problem.
      if (err && err.code === "PTY-E09") dropFail("DRP-E05");
      else toast(friendly(err), "bad");
    } finally {
      dropBusy = false;
    }
  }

  // Take a dropped file as the thing to hide, and show the box again so the
  // person can see what they are about to press.
  function attachDropped(file) {
    attachFile(file);
    showStep("input");
    toast("Attached " + (file.name || "file"), "ok");
  }

  async function readSource(source, fast) {
    try {
      var result = await PuttyPNG.decode(source);
      showResult(result);
      await showDeckImage(source, result, fast);
    } catch (err) {
      toast(friendly(err), "bad");
    }
  }

  // Show the PNG that was read, so a person sees the picture they handed over.
  //
  // A decoded PNG belongs to somebody else and its cover style is unknown, so
  // it always comes out flat, with no spin.
  async function showDeckImage(source, result, fast) {
    if (!(source instanceof Blob)) return;
    // The URL has to stay alive for as long as this disc is the disc, because
    // the drive reads it again when a person presses Decode. Only one is ever
    // held, and it is released when the next disc takes its place.
    claimDiscUrl(URL.createObjectURL(source));
    // The display is filled before the show starts, not after it. Waiting for
    // the spin to finish left the footer a second behind the disc.
    var img = await loadImage(discUrl);
    setDeckFoot(loadedFoot(result, img.naturalWidth, img.naturalHeight));
    await presentResult(discUrl, false, "insert", fast);
    maybeCelebrate("read");
  }

  function claimDiscUrl(url) {
    if (discUrl && discUrl !== url) URL.revokeObjectURL(discUrl);
    discUrl = url;
  }

  /* ==========================================================================
     SECTION 6 - CLEANUP / FINALIZATION
     Putting things back to a known state after an interaction ends.
     ========================================================================== */

  // Call whenever an inner control shows or hides, which changes the drawer's
  // height, so an open drawer fits the new content instead of clipping it.
  // Remove everything the show may have left in the deck or on the page.
  //
  // Twenty results in a row must not leave twenty sets of pieces behind, and
  // an animation cut short by a second action must not keep drawing.
  function clearShowLayers() {
    var junk = document.querySelectorAll(".kill-host, .kill-canvas, .ingest-host");
    for (var i = 0; i < junk.length; i++) junk[i].remove();
  }

  // Back to step one. The typed text is kept on purpose, because a person
  // usually wants to change one thing and press Make again.
  function resetToInput() {
    showStep("input");
  }

  function releaseDrawerHeight() {
    if (advDrawer.classList.contains("open")) advDrawer.style.maxHeight = "none";
  }

  function clearFile() {
    attachedFile = null;
    fileChip.classList.add("hidden");
    exportText.classList.remove("hidden");
    attachBtn.classList.remove("hidden");
    attachInput.value = "";
    updateInputSize();
  }

  /* ==========================================================================
     SECTION 7 - ENTRY POINT / ORCHESTRATION
     The one place the page starts. The order below is the order the page was
     wired in before this file existed, and it must stay that way.
     ========================================================================== */

  function init() {
    // A small development surface. forceKill pins one animation so it can be
    // watched, lastKill reports what played, and awayTransform is exposed so
    // its rule can be checked without waiting for a frame to run.
    window.PuttyPNGDebug = window.PuttyPNGDebug || {};
    window.PuttyPNGDebug.awayTransform = awayTransform;
    window.PuttyPNGDebug.launchTransform = launchTransform;

    // A choice made in Advanced wins, in both directions. With no choice
    // stored, the browser's own reduced-motion setting decides the movement,
    // and the celebration stays on.
    var savedAnim = readPref("animations");
    animationsOn = (savedAnim === null) ? !prefersLessMotion() : (savedAnim === "on");
    var savedCeleb = readPref("celebration");
    celebrationOn = (savedCeleb === null) ? true : (savedCeleb === "on");

    wireTabs();
    wireDrawer();
    wireOptionFields();
    wireDataBox();
    wirePageDrop();
    wireMake();
    wireSteps();
    wireDisplayToggles();
    wireSubTabs();
    wireSheet();
    wireSaveAndCopy();
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
