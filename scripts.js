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
     THE HOME BOARD
     Make and Load, the two columns a first visitor sees. The playground on the
     OldPuttyPNG tab keeps its own constants below.
     ========================================================================== */

  // THE RUNGS. Capacities measured from the engine at the deeper depth, which
  // is 3/2/3 bits and so one byte for every opaque pixel of the CD cover.
  // Each rung keeps its own colour, so the finished bands read as a record of
  // the climb. The ladder steps gray, yellow, orange, hot orange, so a change
  // of rung is a change of hue and not only a change of shade.
  var RUNGS = [
    { px: 256,  cap: 46698,   color: [124, 124, 132] },
    { px: 512,  cap: 186032,  color: [226, 183,  47] },
    { px: 1024, cap: 742231,  color: [231, 130,  30] },
    { px: 2048, cap: 2965695, color: [226,  85,  26] }
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

  // The drive button's two arrows. Down means the disc is going in, up means
  // it is coming out, so the icon says the same thing as the label.
  var ARROW_DOWN =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<path d="M12 5v13m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_UP =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<path d="M12 19V6m0 0l-5 5m5-5l5 5" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // THE FASCIA AT REST.
  // The drive keeps its whole display, with or without a disc. An empty drive
  // shows its six labels and no reading, the way an instrument does. These
  // labels are used until a disc has been read.
  var BLANK_READING = "-";
  var RESTING_LABELS = ["Size", "Data", "Used", "Depth", "Zip", "Lock"];

  // THE SHOW, IN TIME.
  // The compressed column is used when a person acts again while a result is
  // already on screen, so an impatient second drop does not feel slow.
  var KILL_MS = 620,   KILL_MS_FAST = 260;    // clearing the old result
  var HOLD_MS = 700,   HOLD_MS_FAST = 200;    // the new one hovering, before it enters
  var INSERT_MS = 500, INSERT_MS_FAST = 260;  // a PNG sliding into the slot
  // THE FORMATION.
  // A new PuttyPNG appears where an ejected disc sits. The ones and zeros fly
  // to that same place while it appears. Both take the formation time and both
  // run on the same curve, so they finish together by construction rather than
  // by two numbers being kept in step by hand.
  var FORM_MS = 620;              // the whole formation, digits and disc alike
  var FORM_OVERLAP = 20;          // per cent of the clear-out it starts over
  var FORM_EASE = "cubic-bezier(.42, 0, .58, 1)";   // ease-in-out, both parts
  var FORM_MS_MIN = 200, FORM_MS_MAX = 1600;
  var FORM_OVERLAP_MAX = 60;

  // Matches the left, right, and top inset on .disc-holder in styles.css.
  var DISC_INSET = 14;

  // ONE MOVE EACH WAY. Both match a rule in styles.css.
  var EJECT_MS = 300;       // out of the machine, rising 5px past the rest place
  var LOAD_MS = 400;        // back in, lifting 45px before it drops
  var SPIN_STAGE_MS = 320;      // each step of the spin up, three in all
  var WIN_SLIDE_MS = 220;   // the disc sliding into the window, or back out
  // A turnaround part way through a move never takes less than this, so a
  // disc a hair from home still reads as a move rather than as a jump.
  var DISC_MIN_MS = 90;
  // A plain curve, for a move that starts part way. The designed curves wind
  // up by dipping below their start, and a half way disc would visibly go the
  // wrong way first.
  var DISC_EASE = "cubic-bezier(.25, .1, .25, 1)";
  // How long a decode may run before the button says so. A decode of a 256px
  // cover finishes in a few milliseconds, and a label that flashes up for one
  // frame is noise rather than news.
  var DECODE_SAY_MS = 140;
  // THE RAW PIXELS VIEW.
  // The widest the picture may be drawn, and the most times life size it may
  // be shown at. Three is enough to count the stipple and still fit a laptop.
  var PIXEL_VIEW_MAX = 520;
  var PIXEL_VIEW_STEPS = 3;
  var WIN_LEAD_MS = 60;     // how far ahead of the disc the window empties
  // One turn. Matches the rule on .spin-rotor.turning in styles.css.
  var SPIN_TURN_MS = 1400;
  var KILL_MIN_LIFT = 60;   // every thrown piece clears the deck by at least this

  // A flight of ones and zeros that is culled before it lands flares and goes
  // out over this time. Something that pops out of existence reads as a fault.
  var SPARK_MS = 260;

  // The celebration. Ribbons only, with a ripple, from mockup F.
  var CONFETTI_COUNT = 60;
  var CONFETTI_LIFE_MS = 2200;
  var CONFETTI_COLORS = ["#c96f52", "#a8532f", "#e0a06f", "#7fa8a0", "#8a7fb0", "#d8c15e"];

  // How many ones and zeros are drawn for one flight. They are decoration and
  // carry no data, so the count is chosen for looks alone.
  var INGEST_DIGITS = 16;

  // WHAT THE MAKE BUTTON SAYS, STAGE BY STAGE.
  // The words follow the order the work really runs in: the data is taken
  // first, then the old disc is thrown out, then the new one is pressed.
  var STAGE_GRAB = "Grabbing your bytes...";
  var STAGE_TOSS = "Tossing the old one...";
  var STAGE_PRESS = "Pressing...";
  // The shortest time a stage stays on the button. Encoding a short line of
  // text can finish inside one frame, and a label nobody can read is worse
  // than no label at all.
  var MAKE_STAGE_MS = 450;

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
    "optRimSize", "optRimSpacing",
    "optFormMs", "optFormOverlap"
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
  var driveShelf = document.getElementById("driveShelf");
  var driveLamp = document.getElementById("driveLamp");
  var glassWrap = document.getElementById("glassWrap");
  var wingL = document.getElementById("wingL");
  var wingR = document.getElementById("wingR");
  var driveIcon = document.getElementById("driveIcon");
  var driveLabel = document.getElementById("driveLabel");
  var glass = document.getElementById("glass");
  var discTools = document.getElementById("discTools");
  var pixelBtn = document.getElementById("pixelBtn");

  // Page state that outlives any single function. Declared here so every
  // section can see it, and only ever changed through the functions below.
  var toastTimer = null;
  var attachedFile = null;   // when set, Make encodes this file instead of the text
  var veilDepth = 0;         // the same count, for the page-wide overlay
  var dropBusy = false;      // true while a drop is being read, so two cannot race
  var lastPng = null;        // the most recent result, for Save and Copy
  var driveState = "empty";  // "empty", "out", or "in"
  var decoding = false;      // real work is running, and a second press must wait
  var discRun = 0;           // which disc move is current, so a stale timer cannot fire
  var discTimer = 0;
  var step = "input";        // which section the wide column is showing
  var deckRows = null;       // the six values of the last disc read, or null
  var discUrl = null;        // the blob URL of a dropped disc, held while it is loaded
  var subTabShow = null;     // set by wireSubTabs, so the cover style can switch group
  var lastIsDisc = false;    // whether the loaded cover is really a CD
  var tutLast = null;        // the same, for the Tutorial tab

  // The home board's own state. It is kept apart from the playground's above,
  // because the two panels hold different things and neither may read the
  // other's. Both are on the page at once while OldPuttyPNG exists.
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

  // Which rung holds this many packed bytes, or one past the end when none does.
  function rungFor(bytes) {
    for (var i = 0; i < RUNGS.length; i++) if (bytes <= RUNGS[i].cap) return i;
    return RUNGS.length;
  }

  // The outer band is the rung you are on. Finished rungs share the inner
  // third, split by the square root of their capacity so the innermost stays
  // visible. A straight capacity split would make the 256 ring a hairline.
  function bandsFor(k) {
    if (k === 0) return [{ i: 0, r0: R_IN, r1: R_OUT }];
    var out = [], innerT = BAND_SPAN * 0.34, outerT = BAND_SPAN * 0.66, w = [], sum = 0, i;
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
    // Kill pieces only. A flight of ones and zeros overlaps the end of a kill
    // by design, so sweeping the show here would cut that flight in half.
    clearKillLayers();
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
  //
  // THE FLIGHT OWNS ITSELF. It is started, never waited for, and nothing that
  // clears the show may touch it. The clear-out of the old disc ends in the
  // middle of a flight by design, and a flight cut short there is the one
  // fault this part exists to prevent.
  //
  // ms is how long one digit flies for. to is the rectangle the digits fly at,
  // so the caller decides where the disc is forming. Returns the host element.
  function launchIngest(ms, to) {
    var host = document.createElement("div");
    host.className = "ingest-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);

    var from = exportText.getBoundingClientRect();
    var tx = to.left + to.width / 2;
    var ty = to.top + to.height / 2;

    // A development surface, the same as lastKill. Each digit is aimed by a
    // transform set inside requestAnimationFrame, and that cannot be read back
    // under a headless virtual clock, so where they were aimed is recorded.
    if (window.PuttyPNGDebug) window.PuttyPNGDebug.lastAim = { x: tx, y: ty };

    // EVERY DIGIT LANDS BY ms. The stagger is taken out of the flight, not
    // added after it, so the last digit arrives as the disc finishes.
    var lag = Math.round(ms * 0.35);
    var fly = ms - lag;

    // Every digit is built first and sent on its way after ONE forced reflow,
    // rather than one animation frame each. That gives the browser a start
    // state for all sixteen at once, which is one layout instead of sixteen,
    // and it does not depend on an animation frame ever arriving.
    var flying = [];
    for (var i = 0; i < INGEST_DIGITS; i++) {
      // Drawn once in the markup and used here, so sixteen digits cost one
      // shape each rather than sixteen glyphs to lay out.
      var b = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      b.setAttribute("class", "bit");
      b.setAttribute("viewBox", "0 0 12 16");
      var u = document.createElementNS("http://www.w3.org/2000/svg", "use");
      u.setAttribute("href", Math.random() < 0.5 ? "#bit0" : "#bit1");
      b.appendChild(u);
      var sx = from.left + Math.random() * from.width;
      var sy = from.top + Math.random() * from.height;
      b.style.left = sx + "px";
      b.style.top = sy + "px";
      var d = Math.round(Math.random() * lag);
      b.style.transition = "transform " + fly + "ms " + FORM_EASE + " " + d + "ms, " +
                           "opacity " + fly + "ms linear " + d + "ms";
      host.appendChild(b);
      flying.push([b, "translate(" + (tx - sx).toFixed(0) + "px," +
                      (ty - sy).toFixed(0) + "px) scaleX(.3) scaleY(2.8)"]);
    }
    void host.offsetHeight;
    for (var k = 0; k < flying.length; k++) {
      flying[k][0].style.transform = flying[k][1];
      flying[k][0].style.opacity = "0";
    }
    // THE HOST GOES WHEN THE LAST DIGIT HAS REALLY LANDED, counted off the
    // browser's own transition endings. A timer would have to guess, and a
    // guess one frame short cuts the tail off the flight.
    //
    // The timer here is only a backstop. Transitions do not run in a
    // background tab, and a person who looks away must not come back to a
    // page with sixteen digits stuck on it.
    var landed = 0, ended = false, guard = 0;
    function land(how) {
      if (ended) return;
      ended = true;
      clearTimeout(guard);
      host.removeEventListener("transitionend", onEnd);
      if (window.PuttyPNGDebug) window.PuttyPNGDebug.lastLanding = how;
      // A culled flight is already spoken for: its flare takes the host away.
      if (host.dataset.culled !== "1") host.remove();
    }
    function onEnd(e) {
      if (e.propertyName !== "transform") return;
      landed++;
      if (landed >= INGEST_DIGITS) land("transitions");
    }
    host.addEventListener("transitionend", onEnd);
    guard = setTimeout(function () { land("backstop"); }, ms + 500);
    return host;
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
    // THE OVERLAY BELONGS TO THE PLAYGROUND. The home board carries two
    // targets of its own and answers on each of them, so the overlay only
    // offers itself while the playground is the panel on screen. Its handlers
    // still run at the window, below the board's, which stop what they take.
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

    wireFormationFields();
  }

  // The three formation settings. They are here rather than in the page code
  // so the feel can be tuned without an edit.
  //
  // The range and the number beside it are already kept in step by bindSlider,
  // so only the range is read.
  function wireFormationFields() {
    var style = document.getElementById("optFormStyle");
    var ms = document.getElementById("optFormMs");
    var msNum = document.getElementById("optFormMsNum");
    var ov = document.getElementById("optFormOverlap");
    var ovNum = document.getElementById("optFormOverlapNum");
    if (!style || !ms || !ov) return;

    style.value = formStyle;
    ms.value = msNum.value = formMs;
    ov.value = ovNum.value = formOverlap;

    style.addEventListener("change", function () {
      formStyle = FORMATIONS[style.value] ? style.value : "fade";
      writeSetting("formStyle", formStyle);
    });
    function onMs() {
      formMs = Number(ms.value);
      writeSetting("formMs", String(formMs));
    }
    function onOverlap() {
      formOverlap = Number(ov.value);
      writeSetting("formOverlap", String(formOverlap));
    }
    ms.addEventListener("change", onMs);
    msNum.addEventListener("change", onMs);
    ov.addEventListener("change", onOverlap);
    ovNum.addEventListener("change", onOverlap);
  }

  // The drive button is the only way between the two sections now.
  function wireSteps() {
    driveBtn.addEventListener("click", onDriveButton);
  }

  // THE RAW PIXELS. The deck draws the picture smoothed, because it is drawn
  // smaller than it really is. This is the one place it is shown at its true
  // size with no smoothing, which is where the stippling and the rim text can
  // be seen.
  function showPixels() {
    var src = outImg.src;
    if (!src) return;
    var w = outImg.naturalWidth || 256;
    var h = outImg.naturalHeight || 256;

    var wrap = document.createElement("div");
    wrap.className = "modal-overlay-el";
    wrap.innerHTML =
      '<div class="modal-card pixel-card" role="dialog" aria-modal="true" aria-label="The real pixels">' +
      "<h3>The real pixels</h3>" +
      '<div class="pixel-frame"><img alt="Your PuttyPNG at its true size" ' +
      'width="' + w + '" height="' + h + '"></div>' +
      '<p class="small muted"><span data-scale></span> The deck draws it smaller ' +
      "and smooth, which is why it looks softer there. Right-click this picture, " +
      "or either button on the disc, to take the original file.</p>" +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-clay btn-sm" data-ok>Close</button></div></div>';
    // The source is set on the element rather than in the markup, so a data
    // URL never has to survive being written into a string.
    var shot = wrap.querySelector("img");
    shot.src = src;

    function close() { wrap.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape" || e.key === "Enter") close(); }
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    wrap.querySelector("[data-ok]").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);

    // NEAREST NEIGHBOUR CAN ONLY PUT A WHOLE NUMBER OF DEVICE PIXELS UNDER
    // EACH IMAGE PIXEL. A screen at 125 or 150 per cent gives 1.25 or 1.5 of
    // them, so some image pixels come out one device pixel wide and their
    // neighbours two, which is the uneven blockiness this view exists to
    // avoid. The width is worked out from the device ratio instead, so every
    // image pixel gets the same whole number and every block is square.
    //
    // RULE: the room is MEASURED, after the card is on the page. The card
    // decides how much space the picture has, not the window, and a width
    // worked out from the window was clamped by the frame without a word.
    var dpr = window.devicePixelRatio || 1;
    var room = Math.min(wrap.querySelector(".pixel-frame").clientWidth, PIXEL_VIEW_MAX);
    var step = Math.floor((room * dpr) / w);
    var even = step >= 1;
    if (step > PIXEL_VIEW_STEPS) step = PIXEL_VIEW_STEPS;
    // Below one device pixel per image pixel there is no honest way to show
    // them, so the picture is fitted and smoothed rather than made uneven.
    var shown = even ? (w * step / dpr) : room;

    shot.style.width = Math.round(shown * 100) / 100 + "px";
    shot.style.height = "auto";
    if (even) shot.classList.add("even");
    wrap.querySelector("[data-scale]").textContent =
      w + " by " + h + ", shown at " +
      (even ? step + " to 1, with no smoothing."
            : "the size it fits, smoothed, because there is no room to show it true.");
    if (window.PuttyPNGDebug) {
      window.PuttyPNGDebug.lastPixelView = { dpr: dpr, step: step, css: shown, even: even };
    }

    wrap.querySelector("[data-ok]").focus();
  }

  function downloadPng() {
    if (!lastPng) return;
    var a = document.createElement("a");
    a.href = lastPng.dataUrl;
    a.download = "puttypng.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  async function copyPng() {
    if (!lastPng || !lastPng.blob) { toast("Nothing to copy yet", "bad"); return; }
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": lastPng.blob })]);
        toast("Image copied to clipboard", "ok");
      } else { toast("Clipboard images not supported here - use Download", "bad"); }
    } catch (e) { toast("Could not copy image", "bad"); }
  }

  // The same two acts are offered twice: named on the picture, and as icons
  // above the window. One handler each, so the two copies cannot drift.
  function wireSaveAndCopy() {
    document.getElementById("saveBtn").addEventListener("click", downloadPng);
    document.getElementById("winSaveBtn").addEventListener("click", downloadPng);
    document.getElementById("copyImgBtn").addEventListener("click", copyPng);
    document.getElementById("winCopyBtn").addEventListener("click", copyPng);
    document.getElementById("pixelBtn").addEventListener("click", showPixels);
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

  // ---- WHAT THE MAKE BUTTON SAYS ------------------------------------------

  // The resting words are read from the markup, so the button and the page can
  // never drift apart.
  var MAKE_LABEL = makeBtn.textContent;

  // A queue, because the work does not wait for the words. Encoding a short
  // line of text finishes long before its stage has been on screen for
  // MAKE_STAGE_MS, so a stage that arrives too early is held and painted when
  // the one before it has had its time.
  //
  // The generation number is what stops a late stage from landing on top of a
  // make that has already started after it.
  var stageQueue = [], stageShownAt = 0, stageTimer = 0, stageRun = 0;

  function stagePaint(text) {
    makeBtn.textContent = text;
    stageShownAt = now();
  }

  function stagePump(gen) {
    stageTimer = 0;
    if (gen !== stageRun || !stageQueue.length) return;
    var left = MAKE_STAGE_MS - (now() - stageShownAt);
    if (left > 0) {
      stageTimer = setTimeout(function () { stagePump(gen); }, left);
      return;
    }
    stagePaint(stageQueue.shift());
    if (stageQueue.length) {
      stageTimer = setTimeout(function () { stagePump(gen); }, MAKE_STAGE_MS);
    }
  }

  function stageSay(text) {
    stageQueue.push(text);
    if (!stageTimer) stagePump(stageRun);
  }

  // A new make takes the button over at once, whatever the last one still had
  // queued.
  function stageBegin() {
    stageRun++;
    clearTimeout(stageTimer);
    stageTimer = 0;
    stageQueue.length = 0;
    stagePaint(STAGE_GRAB);
  }

  function stageEnd() {
    stageSay(MAKE_LABEL);
  }

  async function makePuttyPNG() {
    makeBtn.disabled = true;
    stageBegin();
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
      await presentResult(png.dataUrl, lastPng.isDisc, "ingest", false, stageSay);
      maybeCelebrate("make");
    } catch (err) {
      toast(friendly(err), "bad");
    } finally {
      // The button is free again at once. Only the words wait, so the last
      // stage stays readable without holding a person up.
      makeBtn.disabled = false;
      stageEnd();
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
    // The shelf hides but keeps its space, so the six values never move.
    driveShelf.classList.toggle("empty", empty);
    driveLamp.classList.toggle("lit", loaded);
    // The two acts on the window are only offered when there is a disc in it.
    glassWrap.classList.toggle("has-disc", loaded);
    driveLabel.textContent = loaded ? "Eject PuttyPNG" : "Decode PuttyPNG";
    driveIcon.innerHTML = loaded ? ARROW_UP : ARROW_DOWN;
    // The window and the values describe what is INSIDE. The fascia is drawn
    // in every state, so an empty drive reads as a machine with nothing in it.
    // Only the reading changes: lit means the values on show are real.
    glass.classList.toggle("lit", loaded);
    wingL.classList.toggle("lit", loaded);
    wingR.classList.toggle("lit", loaded);
    renderFascia();
    discTools.classList.toggle("hidden", state !== "out");
    // The same rule as the two on the picture: there is nothing to look at
    // unless a picture is on show.
    pixelBtn.classList.toggle("hidden", state !== "out");
  }

  // The six values, wing and wing around the window.
  //
  // Short labels on purpose: each wing is about 80 pixels, and a long label
  // would push the value onto a second line.
  // RULE: this remembers the values. renderFascia decides what is drawn.
  // Only a loaded drive shows a real reading.
  function setDeckFoot(rows) {
    deckRows = rows || null;
    renderFascia();
  }

  // Draw the fascia for the state the drive is in.
  //
  // The fascia is never emptied. An empty drive keeps its six labels and shows
  // no reading, so the display always says what it will tell you once a disc
  // is in.
  function renderFascia() {
    var rows = (driveState === "in" && deckRows) ? deckRows : restingRows();
    function cells(list) {
      return list.map(function (r) {
        return '<div class="cell"><span class="k">' + r[0] +
               '</span><span class="v">' + r[1] + "</span></div>";
      }).join("");
    }
    wingL.innerHTML = cells(rows.slice(0, 3));
    wingR.innerHTML = cells(rows.slice(3, 6));
  }

  // The labels of the last disc, with no reading against them. Keeping those
  // labels stops them changing when a disc goes in or comes out.
  function restingRows() {
    var labels = deckRows
      ? deckRows.map(function (r) { return r[0]; })
      : RESTING_LABELS;
    return labels.map(function (k) { return [k, BLANK_READING]; });
  }

  // A disc that was made here. The engine reports every field.
  function madeFoot(png) {
    return [
      ["Size", png.width + " x " + png.height],
      ["Data", formatSize(png.bytesHidden)],
      ["Used", png.usedPercent + "%"],
      ["Depth", png.depth],
      ["Zip", png.compressed ? "yes" : "no"],
      ["Lock", png.encrypted ? "yes" : "no"]
    ];
  }

  // A disc that came from somewhere else. Its capacity is unknown, so that row
  // carries the payload type instead of a number that would be a guess.
  function loadedFoot(result, w, h) {
    return [
      ["Size", w + " x " + h],
      ["Type", result.type],
      ["Name", result.name ? escapeHtml(result.name) : "none"],
      ["Depth", result.depth],
      ["Zip", result.compressed ? "yes" : "no"],
      ["Lock", result.encrypted ? "yes" : "no"]
    ];
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

  // Fill the window and spin the disc up.
  //
  // ORDER, and the reason for it: the disc slides all the way in FIRST, cut
  // off by the window as it goes, and only then does it turn. A disc that
  // turned on the way in would read as already running before it had arrived.
  //
  // delayMs holds the slide back, so the window can be timed to fill as the
  // real disc reaches the machine.
  //
  // RULE: no smear may cover a whole turn. A full smear is the same picture at
  // every angle, so turning it would show nothing at all. Every level here is
  // a part turn for that reason.
  async function spinUp(src, delayMs) {
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

    // The wrapper slides. The rotor inside it turns. Keeping the two apart
    // means neither move can disturb the other.
    var wrap = document.createElement("div");
    wrap.className = "spin-wrap";
    var rotor = document.createElement("div");
    rotor.className = "spin-rotor";
    wrap.appendChild(rotor);

    var live = document.createElement("img");
    live.src = src;
    live.className = "spin-frame";
    var mid = bakeSpin(img, size, 10, 26);
    var full = bakeSpin(img, size, 22, 70);
    mid.className = "spin-frame";
    full.className = "spin-frame";
    mid.style.opacity = "0";
    full.style.opacity = "0";
    rotor.appendChild(live);
    rotor.appendChild(mid);
    rotor.appendChild(full);
    glass.appendChild(wrap);

    // The start of the slide has to be painted before the end of it is set.
    void wrap.offsetHeight;
    if (delayMs) await wait(delayMs);
    wrap.classList.add("seated");
    await wait(WIN_SLIDE_MS);

    // ALL THE WAY IN. Now it turns, and the blur winds up over it.
    rotor.classList.add("turning");
    if (window.PuttyPNGDebug) window.PuttyPNGDebug.spinAt = "turning";

    await wait(SPIN_STAGE_MS);
    mid.style.opacity = "1";
    await wait(SPIN_STAGE_MS);
    full.style.opacity = "1";
    await wait(SPIN_STAGE_MS);

    // Only the heaviest frame is left, so no work remains but the turn.
    live.remove();
    mid.remove();
  }

  // Put the disc in the machine and fill the window as it arrives, so the two
  // read as one act rather than two.
  async function putItIn(src) {
    // The drive reads as loaded from the moment it takes the disc, so a press
    // during the move offers Eject rather than starting the read again.
    setDriveState("in");
    var going = loadDisc();
    var filling = animationsOn
      ? spinUp(src, Math.max(0, LOAD_MS - WIN_SLIDE_MS))
      : spinUp(src, 0);
    await going;
    await filling;
  }

  // THE WAYS A NEW DISC CAN APPEAR.
  // One for now. Another is added here, and nothing that calls formDisc has to
  // change. Each takes the picture and the time it has to work in.
  var FORMATIONS = {
    fade: function (img, ms) {
      img.style.transition = "opacity " + ms + "ms " + FORM_EASE;
      img.style.opacity = "1";
    }
  };

  // A new PuttyPNG arrives WHERE AN EJECTED DISC SITS, not inside the window.
  // The ones and zeros fly to the same place while it appears, so a person
  // sees their data become the thing they are handed.
  //
  // The window stays dark all the way through. The disc never goes into the
  // machine here, which is what leaves the next step worth pressing.
  async function formDisc(src, w, h, ms) {
    // The picture is put in its resting place first, with no move, so the
    // digits have a real place to fly at.
    applyDisc(src, w, h);
    placeDiscOut();
    outImg.style.transition = "none";
    outImg.style.opacity = "0";
    void outImg.offsetHeight;

    var appear = FORMATIONS[formStyle] || FORMATIONS.fade;
    appear(outImg, ms);
    // Launched, not waited for. The digits are given the same time and the
    // same curve as the disc, so the two land together, but from here neither
    // one can cut the other short.
    launchIngest(ms, discBox());
    await wait(ms);
    outImg.style.transition = "";
    outImg.style.opacity = "";
  }

  // Stop the drive dead, wherever the turn had got to, and empty the window.
  //
  // RULE: the angle is pinned BEFORE the animation comes off. Without that the
  // disc would snap back to nought degrees, which reads as a fault rather than
  // as a stop.
  function stopSpin() {
    var wrap = glass.querySelector(".spin-wrap");
    if (!wrap) { glass.innerHTML = ""; return; }

    var rotor = wrap.querySelector(".spin-rotor");
    if (rotor) {
      var at = window.getComputedStyle(rotor).transform;
      rotor.classList.remove("turning");
      if (at && at !== "none") rotor.style.transform = at;
      if (window.PuttyPNGDebug) window.PuttyPNGDebug.spinAt = "stopped";
    }
    if (!animationsOn) { glass.innerHTML = ""; return; }

    // It leaves the way it came. Only this wrapper is taken away, because a
    // new one may already be sliding in behind it.
    wrap.classList.remove("seated");
    setTimeout(function () {
      if (wrap.parentNode === glass) wrap.remove();
    }, WIN_SLIDE_MS + 40);
  }

  // The one control on the drive. What it does depends on the state, and its
  // label always says which.
  async function onDriveButton() {
    var run = (driveState === "in") ? driveEject()
            : (driveState === "out") ? driveDecode()
            : Promise.resolve();
    // A development surface, the same as lastKill. The button is never locked
    // now, so this is the only way anything outside can tell when the drive
    // has finished what it was asked to do.
    if (window.PuttyPNGDebug) window.PuttyPNGDebug.driveDone = run;
    await run;
  }

  // Draw the disc in and read it. This is the same work a drop does, started
  // from a disc the person is already holding.
  // Read the disc, then draw it in.
  //
  // The button is NOT locked for the length of the show. It is held only while
  // real work runs, which for a 256px cover is a few milliseconds. Everything
  // after that is decoration, and a press during decoration turns the disc
  // around at once.
  async function driveDecode() {
    var src = outImg.src;
    if (!src || decoding) return;
    decoding = true;
    // The state flips before the disc moves, so a press during the move reads
    // the new intent and sends the disc back out rather than starting again.
    var say = setTimeout(function () { driveLabel.textContent = "Reading PuttyPNG..."; }, DECODE_SAY_MS);
    try {
      var result = await PuttyPNG.decode(src);
      clearTimeout(say);
      decoding = false;
      showResult(result);
      await putItIn(src);
      maybeCelebrate("read");
    } catch (err) {
      clearTimeout(say);
      decoding = false;
      toast(friendly(err), "bad");
      // The disc never left, so put the drive back as it was.
      setDriveState("out");
    }
  }

  // Hand the disc back. It comes straight out, with no spin down.
  async function driveEject() {
    // The state flips first, so a press part way through reads the new intent.
    setDriveState("out");
    // The window empties first, and the disc follows, so the window reads as
    // the thing that handed the disc back.
    stopSpin();
    showStep("input");
    await wait(WIN_LEAD_MS);
    await ejectDisc(lastIsDisc);
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
  // stage is optional. When it is given it is called with the words for each
  // stage as that stage starts, so a button can say what is happening.
  async function presentResult(src, isDisc, kind, fast, stage) {
    var img = await loadImage(src);
    var aspect = img.naturalWidth / img.naturalHeight;
    lastIsDisc = isDisc;

    // Kill pieces only. A flight left over from an earlier result is left
    // alone: it is decoration on a path of its own, and cutting it here would
    // make a person who acts twice in a row watch half an animation.
    clearKillLayers();
    stopSpin();

    // Clear whatever the drive was holding. This is the only place a result is
    // destroyed, and it runs long after the caller proved the new one is good.
    //
    // A drop waits for the old disc to be gone, because the new one arrives
    // from off the page and the two would collide. Typed data does not wait:
    // the new disc starts to form while the last of the old one is still
    // clearing, so the two read as one act rather than two.
    var killing = null;
    var killMs = fast ? KILL_MS_FAST : KILL_MS;
    var hadResult = !outImg.classList.contains("hidden");
    if (animationsOn && hadResult) {
      var box = discBox();
      var oldSrc = outImg.src;
      outImg.classList.add("hidden");
      if (stage) stage(STAGE_TOSS);
      killing = runKill(oldSrc, box, killMs);
      if (kind === "insert") { await killing; killing = null; }
      else await wait(Math.round(killMs * (1 - formOverlap / 100)));
    }

    if (kind === "insert") {
      // A dropped PuttyPNG falls in front of the page, then the real disc
      // takes over at the same spot and slides into the machine.
      if (animationsOn) {
        await Promise.race([runInsert(src, aspect, fast ? HOLD_MS_FAST : HOLD_MS), wait(4000)]);
        clearKillLayers();
      }
      applyDisc(src, img.naturalWidth, img.naturalHeight);
      placeDiscOut();
      await putItIn(src);
      return;
    }

    // Typed data has no picture to slide in, and it never goes into the
    // machine. The disc forms already ejected, so the next step can be pressed
    // the moment the formation ends.
    if (animationsOn) {
      var ms = fast ? Math.round(FORM_MS_MIN + (formMs - FORM_MS_MIN) * 0.4) : formMs;
      if (stage) stage(STAGE_PRESS);
      await Promise.race([formDisc(src, img.naturalWidth, img.naturalHeight, ms), wait(6000)]);
      // Only now, because clearing a layer mid-flight would cut the kill off.
      // The flight is not swept here either. It has an ending of its own, so
      // the cap above can never take the digits down with it.
      if (killing) await killing;
      clearKillLayers();
    } else {
      applyDisc(src, img.naturalWidth, img.naturalHeight);
      placeDiscOut();
    }
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
  // Where the picture is now, in pixels down from the resting place. It is
  // read out of the matrix the browser is painting, so a move that was
  // interrupted is measured where it really is and not where it was sent.
  function discY() {
    var t = window.getComputedStyle(discHolder).transform;
    if (!t || t === "none") return 0;
    var m = /matrix(3d)?\(([^)]+)\)/.exec(t);
    if (!m) return 0;
    var n = m[2].split(",").map(Number);
    return m[1] ? n[13] : n[5];
  }

  // ONE MOVE, FROM WHEREVER IT IS.
  //
  // A press pins the picture at the point it has reached, hands the target
  // back to the stylesheet, and times the trip by the distance that is left.
  // A disc almost home comes back almost at once instead of taking the whole
  // four hundred milliseconds.
  //
  // RULE: a move that starts AT REST keeps its designed curve, which rises
  // past the resting place or winds up before it drops. A move that starts
  // part way uses a plain curve instead, because a curve that dips below its
  // own start would send a half way disc the wrong way first.
  function moveDisc(toOut) {
    discRun++;
    var mine = discRun;
    clearTimeout(discTimer);

    var span = discHolder.getBoundingClientRect().height * 1.2;
    var atY = discY();
    var toY = toOut ? 0 : span;
    var part = span > 0 ? Math.min(1, Math.abs(toY - atY) / span) : 1;
    var full = toOut ? EJECT_MS : LOAD_MS;
    var partWay = part < 0.995;
    var ms = partWay ? Math.max(DISC_MIN_MS, Math.round(full * part)) : full;

    if (partWay) {
      // Pin it where it is painted, and commit that before anything else, or
      // the browser folds the two states into one paint and nothing moves.
      discHolder.style.transition = "none";
      discHolder.style.transform = window.getComputedStyle(discHolder).transform;
      void discHolder.offsetHeight;
      // The stylesheet owns the target again. Only the timing is set here.
      discHolder.classList.toggle("out", toOut);
      discHolder.classList.toggle("loading", !toOut);
      discHolder.classList.remove("above");
      discHolder.style.transition = "transform " + ms + "ms " + DISC_EASE;
      discHolder.style.transform = "";
    } else {
      discHolder.style.transition = "";
      discHolder.style.transform = "";
      void discHolder.offsetHeight;
      discHolder.classList.toggle("out", toOut);
      discHolder.classList.toggle("loading", !toOut);
      if (!toOut) discHolder.classList.remove("above");
    }

    if (window.PuttyPNGDebug) {
      window.PuttyPNGDebug.lastMove = { to: toOut ? "out" : "in", ms: ms, partWay: partWay };
    }

    return new Promise(function (resolve) {
      discTimer = setTimeout(function () {
        if (mine !== discRun) return resolve();
        discHolder.style.transition = "";
        // THE LAYER CHANGE, AT REST. The resting place clears the line, so the
        // picture covers neither the face nor the opening and the change
        // cannot be seen.
        if (toOut) discHolder.classList.add("above");
        resolve();
      }, ms);
    });
  }

  function ejectDisc(isDisc) {
    if (!discHolder) return Promise.resolve();

    outImg.classList.remove("hidden");
    deckFilled();
    discHolder.classList.remove("instant");
    discHolder.classList.toggle("no-spin", !isDisc);

    if (!animationsOn) {
      discRun++;
      clearTimeout(discTimer);
      discHolder.classList.add("instant", "out", "above");
      discHolder.classList.remove("loading");
      return Promise.resolve();
    }

    return moveDisc(true);
  }

  // Draw the disc back into the machine. It goes behind the face on the way,
  // which is what makes the slot look like a hole rather than a picture.
  function loadDisc() {
    if (!discHolder) return Promise.resolve();

    // The place the digits are flying at is about to be inside the machine,
    // so any flight still in the air is culled.
    retireDigits();

    if (!animationsOn) {
      discRun++;
      clearTimeout(discTimer);
      discHolder.classList.add("instant");
      discHolder.classList.remove("out", "above");
      return Promise.resolve();
    }

    // RULE: "out" comes off in the same breath as the move starts. While it is
    // set, the hover rule outranks "loading", so a pointer resting on the deck
    // would hold the disc at the resting place and the move would never run.
    // moveDisc does both, and takes the layer with it.
    return moveDisc(false);
  }

  // Swap the wide column between step one and step two.
  // which is "input", "made", or "read". The deck is never hidden, so the
  // result image stays put whichever step is on screen.
  // The wide column holds two named sections and shows one of them.
  // "input" is What you'd like to encode. "read" is What was inside.
  function showStep(which) {
    clearDropFail();
    // A flight belongs to the screen it started on. When the wide column
    // swaps, the box the digits were pulled from has gone, so anything still
    // in the air is culled.
    if (which !== step) retireDigits();
    step = which;
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
    // to where the result is shown. That is the playground, not the home: the
    // home reads a disc in its own Load column and never uses this path.
    switchTab("oldputtypng");
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
      var cap = over ? RUNGS[RUNGS.length - 1].cap : RUNGS[k].cap;
      var floor = k === 0 ? 0 : RUNGS[k - 1].cap;
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
      var total = over ? RUNGS[RUNGS.length - 1].cap : cap;
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
    var rung = RUNGS[Math.min(homeLastRung, RUNGS.length - 1)];
    var band = rung.cap - (homeLastRung ? RUNGS[homeLastRung - 1].cap : 0);
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

  // Throw away whatever is in the tray, then run then() once it has gone.
  function tossDisc(then) {
    if (!homeDiscOut) { if (then) then(); return; }
    homeDiscOut = false;
    $("cd").classList.add("gone");
    setTimeout(function () { resetDisc(); if (then) then(); }, DISC_TOSS_MS);
  }

  async function pressHomeDisc() {
    if (homePressing) return;
    homePressing = true;
    var btn = $("homeMakeBtn"), lab = $("makeLabel"), label = lab.innerHTML;
    btn.disabled = true;
    lab.textContent = "Pressing...";
    try {
      var input = homeAttached ? homeAttached.bytes : ($("makeText").value || "(empty)");
      var opts = { coverStyle: "cd", depth: "standard", maxSize: 2048 };
      // The engine takes a name and a type in its options, so a file comes out
      // of the other end still knowing what it was called.
      if (homeAttached) { opts.name = homeAttached.name; opts.mime = homeAttached.mime; }
      var png = await PuttyPNG.encode(input, opts);
      homeLastBlob = png.blob;
      tossDisc(function () {
        var cd = $("cd");
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
      setTimeout(resetDisc, DISC_TOSS_MS);
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

  // Call whenever an inner control shows or hides, which changes the drawer's
  // height, so an open drawer fits the new content instead of clipping it.
  // Remove everything the show may have left in the deck or on the page.
  //
  // Twenty results in a row must not leave twenty sets of pieces behind, and
  // an animation cut short by a second action must not keep drawing.
  function clearKillLayers() {
    var junk = document.querySelectorAll(".kill-host, .kill-canvas");
    for (var i = 0; i < junk.length; i++) junk[i].remove();
  }

  // Cull every flight still in the air, and report how many digits went.
  //
  // A flight is never yanked. Each digit stops where it is and flares out,
  // because something that pops out of existence reads as a fault rather than
  // as an ending.
  function retireDigits() {
    var hosts = document.querySelectorAll(".ingest-host");
    var culled = 0;
    for (var i = 0; i < hosts.length; i++) culled += sparkleOut(hosts[i]);
    if (window.PuttyPNGDebug) {
      window.PuttyPNGDebug.lastCull = { digits: culled, at: now() };
    }
    return culled;
  }

  // Stop one flight where it is and flare it out.
  //
  // RULE: the running move is pinned before the flare is set. Dropping the
  // transform out of the transition list without pinning it first would send
  // every digit to the end of its course inside one frame.
  function sparkleOut(host) {
    var bits = host.querySelectorAll(".bit");
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      var seen = window.getComputedStyle(b);
      var at = (seen.transform === "none") ? "" : seen.transform + " ";
      b.style.transition = "none";
      b.style.transform = seen.transform;
      b.style.opacity = seen.opacity;
      void b.offsetHeight;
      b.style.transition = "transform " + SPARK_MS + "ms ease-out, " +
                           "opacity " + SPARK_MS + "ms ease-out, " +
                           "filter " + SPARK_MS + "ms ease-out";
      b.style.transform = at + "scale(1.7)";
      // Set here and not in the class, because the pinned value above is
      // inline and would outrank it.
      b.style.opacity = "0";
      b.classList.add("spark");
    }
    // Marked, so the flight's own ending knows the host is spoken for.
    host.dataset.culled = "1";
    setTimeout(function () { host.remove(); }, SPARK_MS + 60);
    return bits.length;
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
    // watched, lastKill reports what played, lastAim reports where the digits
    // were sent, and the two transform rules are exposed so they can be
    // checked without waiting for a frame to run.
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

    // The formation. A stored choice wins, and anything outside what the
    // control allows is ignored rather than trusted.
    formMs = FORM_MS;
    formOverlap = FORM_OVERLAP;
    var savedStyle = readSetting("formStyle");
    if (savedStyle && FORMATIONS[savedStyle]) formStyle = savedStyle;
    var savedMs = readNumber("formMs", FORM_MS_MIN, FORM_MS_MAX);
    if (savedMs !== null) formMs = savedMs;
    var savedOverlap = readNumber("formOverlap", 0, FORM_OVERLAP_MAX);
    if (savedOverlap !== null) formOverlap = savedOverlap;

    // The drive owns its own display, including the empty one, so the resting
    // fascia is drawn from the same function every other state comes from.
    setDriveState("empty");

    wireTabs();
    wireHome();
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
