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
  var FRIENDLY_ERRORS = {
    E01: "That image is not a PuttyPNG.",
    E02: "This PuttyPNG needs a newer version of the engine.",
    E03: "This PuttyPNG looks corrupted - it may have been re-saved lossily.",
    E05: "That data is too large for the chosen image size.",
    E06: "Wrong password.",
    E08: "This PuttyPNG is encrypted - a password is needed.",
    E11: "That cover image has too little opaque area to hold data."
  };

  // Every slider that is paired with a matching number field. The number field
  // is found by adding "Num" to the slider id.
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
  var dataDrop = document.getElementById("dataDrop");
  var fileChip = document.getElementById("fileChip");
  var fileNameEl = document.getElementById("fileName");
  var fileSizeEl = document.getElementById("fileSize");
  var attachBtn = document.getElementById("attachBtn");
  var attachInput = document.getElementById("attachInput");

  var makeBtn = document.getElementById("makeBtn");
  var dropzone = document.getElementById("dropzone");
  var importFile = document.getElementById("importFile");
  var resultBox = document.getElementById("resultBox");

  // Page state that outlives any single function. Declared here so every
  // section can see it, and only ever changed through the functions below.
  var toastTimer = null;
  var attachedFile = null;   // when set, Make encodes this file instead of the text
  var dropCount = 0;         // nested dragenter and dragleave events, counted
  var lastPng = null;        // the most recent result, for Save and Copy
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

  // True only when the drag carries files, so a plain text drag passes through.
  function dragHasFiles(e) {
    return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1);
  }

  // Scale a preview image to the real PNG aspect ratio, longest side = longSide,
  // so the checkered frame hugs the true shape. A square stays square, 2:1 stays 2:1.
  function sizePreview(img, w, h, longSide) {
    longSide = longSide || 200;
    var scale = longSide / Math.max(w, h);
    img.style.width = Math.max(1, Math.round(w * scale)) + "px";
    img.style.height = Math.max(1, Math.round(h * scale)) + "px";
  }

  function statsHtml(png) {
    function row(k, v) { return '<div class="stat-row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>"; }
    return row("Image", png.width + " &times; " + png.height + " px") +
           row("Hidden", png.bytesHidden.toLocaleString() + " bytes") +
           row("Capacity used", png.usedPercent + "%") +
           row("Depth", png.depth) +
           row("Compressed", png.compressed ? "yes" : "no") +
           row("Encrypted", png.encrypted ? "yes (AES-256)" : "no");
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
    attachInput.addEventListener("change", function () {
      if (attachInput.files && attachInput.files[0]) attachFile(attachInput.files[0]);
    });

    // Dragging a file onto the data box shows a drop overlay, then asks first.
    dataDrop.addEventListener("dragenter", function (e) {
      if (!dragHasFiles(e)) return;                 // let normal text drags through
      e.preventDefault(); dropCount++; dataDrop.classList.add("drag-over");
    });
    dataDrop.addEventListener("dragover", function (e) { if (dragHasFiles(e)) e.preventDefault(); });
    dataDrop.addEventListener("dragleave", function () {
      dropCount--; if (dropCount <= 0) resetDropState();
    });
    dataDrop.addEventListener("drop", async function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      resetDropState();
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      var ok = await confirmModal({
        title: "Replace the contents?",
        message: "Hide <strong>" + escapeHtml(file.name) + "</strong> (" + formatSize(file.size) +
                 ") in your PuttyPNG instead of the text above?",
        confirm: "Replace", cancel: "Cancel"
      });
      if (ok) attachFile(file);
    });

    updateInputSize();
  }

  function wireMake() {
    makeBtn.addEventListener("click", makePuttyPNG);
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
      var outImg = document.getElementById("outImg");
      outImg.src = png.dataUrl;
      sizePreview(outImg, png.width, png.height);   // keep the true aspect ratio
      document.getElementById("outStats").innerHTML = statsHtml(png);
      document.getElementById("output").classList.remove("hidden");
      toast("PuttyPNG created", "ok");
    } catch (err) {
      toast(friendly(err), "bad");
    } finally {
      makeBtn.disabled = false;
      makeBtn.textContent = original;
    }
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
    resultBox.classList.remove("hidden");
    toast("PuttyPNG decoded", "ok");
  }

  async function readSource(source) {
    try {
      var result = await PuttyPNG.decode(source);
      showResult(result);
    } catch (err) {
      toast(friendly(err), "bad");
    }
  }

  /* ==========================================================================
     SECTION 6 - CLEANUP / FINALIZATION
     Putting things back to a known state after an interaction ends.
     ========================================================================== */

  // Call whenever an inner control shows or hides, which changes the drawer's
  // height, so an open drawer fits the new content instead of clipping it.
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

  // Clear the drag counter and the drop-in visual together, so a cancelled drag
  // cannot leave the data box highlighted.
  function resetDropState() {
    dropCount = 0;
    dataDrop.classList.remove("drag-over");
  }

  /* ==========================================================================
     SECTION 7 - ENTRY POINT / ORCHESTRATION
     The one place the page starts. The order below is the order the page was
     wired in before this file existed, and it must stay that way.
     ========================================================================== */

  function init() {
    wireTabs();
    wireDrawer();
    wireOptionFields();
    wireDataBox();
    wireMake();
    wireSaveAndCopy();
    wireReader();
    wireSnippets();
    renderErrorTable();
    renderLicense();
    wireTutorial();
    wirePromptDemo();
  }

  init();
})();
