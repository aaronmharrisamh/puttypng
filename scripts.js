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
     Make, and the card beside it: Load, the Made! card the disc comes out
     into, or Loaded!. Advanced hangs below them and is read at the moment of
     the press.
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

  /* WHAT THE BOARD SAYS. Every string a person reads on the board is here, so
     the wording can be checked in one place rather than hunted through the
     code that happens to print it. */
  var SAY = {
    empty:    "Whatever you embed will go inside the PuttyPNG image!",
    fits:     "Everything fits so far. Make a PuttyPNG out of it!",
    over:     "That is more than the largest disc holds. Take a little out and it will fit.",
    nothing:  "You need to embed something first!",
    attached: "Attached successfully!",
    made:     'Your <button type="button" class="peeklink" id="peekOpen">content</button> is now in this PuttyPNG!',
    loadIdle: "Drop a PuttyPNG here, or open one.",
    loaded:   "PuttyPNG loaded successfully!",
    reading:  "Decoding...",
    noPaste:  "There was no PuttyPNG on the clipboard. Copy the picture, then press Paste one!",
    /* A picture that holds nothing is still a good thing to hide, so it is
       attached rather than refused. The second half of the sentence is the
       important half: it says what became of the words it covered up. */
    tookPlain: "Attached successfully! Nothing was hidden in that picture, so it " +
               "became the file to hide. Your note is still here, and it comes " +
               "back if you remove the file.",
    askPlain:  "Nothing is hidden in that picture. Do you want to embed the picture " +
               "instead? Your note stays, and it comes back if you remove the file.",
    contents:  "The PuttyPNG&rsquo;s contents:",
    /* A PASTE THAT DOES NOTHING MUST SAY WHY. Words pasted onto the page rather
       than into a field are not a picture. A paste with neither words nor a
       file names what it did carry, so a phone that hands the page something
       odd is reported rather than ignored. */
    pasteWords: "That paste was words, not a picture. Copy the picture itself, then paste again.",
    pasteOdd:   "That paste held nothing the page can use: ",
    pasteEmpty: "That paste was empty.",
    /* How to paste without the Paste one! button. It depends on what the
       person is holding: a phone has no Ctrl key and a mouse has no long press. */
    pasteKey:   "Press Ctrl+V instead.",
    pasteTap:   "Long-press the box and choose Paste instead.",
    /* WHAT THE QUESTION SAYS WHEN AN EXAMPLE WOULD REPLACE SOMETHING. An
       example clears the board before it loads, so this is asked whenever
       there is anything on it, and it is asked every time. */
    egTitle:  "You have something here",
    egAsk:    "An example replaces what is here. You cannot undo this.",
    egYes:    "Yes, replace it",
    /* WHAT THE QUESTION SAYS WHEN A PUTTYPNG WOULD REPLACE THE ONE MADE. Made!
       and Loaded! share one card, so opening one closes the other, and the
       picture in Made! is nowhere else until it is downloaded or copied. */
    replaceTitle: "Are you sure?",
    replaceAsk:   "Opening this one replaces the PuttyPNG you made. Download or copy yours first if you want to keep it.",
    replaceYes:   "Yes, open it",
    examplesFailed: "The examples did not load. Check the connection and pick again."
  };

  /* HOW BIG THE METER IS. One rule for both shapes: the meter takes a share of
     the column that holds it, inside a floor and a ceiling.
     The shares differ because the rows differ. A desktop column is about 410px
     and a phone row is about 303px, but the phone also has to leave the button
     enough width to hold "Make a VERY MASSIVE PuttyPNG". The touch numbers were
     tuned on the R5 mockup and reproduce its sizes at that width.
     The ceiling stops a large phone or a small tablet growing the meter past
     what the button can survive. The desktop has never had one, and Infinity
     keeps it that way. */
  var METER_TUNING = {
    wide:  { share: [0.28,  0.39,  0.50,  0.60 ], min: 104, max: Infinity },
    touch: { share: [0.145, 0.178, 0.211, 0.244], min: 40,  max: 96 }
  };

  /* HOW BIG THE FINISHED PUTTYPNG IS. It is not the meter. The meter shares a
     row with a button that has to hold words, so it gives width up. The disc
     has a row to itself, so it takes the width the picture is worth.

     ON A DESKTOP IT IS THE SIZE THE PICTURE REALLY IS, where the room exists
     for that. A 256px PuttyPNG is drawn 256px across, so what sits in the window
     is the thing a person is about to send rather than a thumbnail of it.
     The larger rungs cannot be true: a 512px disc does not fit a 448px column,
     and a 2048px one never will. They take a share of the column instead,
     ramping to nine tenths of it, so the step from rung to rung is still
     something a person can see. Whichever is smaller wins, which is what makes
     256 exact and everything above it proportional, and the window's own room
     inside the Made! card is the ceiling over both.

     A PHONE HAS NO TABLE. It had R5's four absolute sizes until v2.17.0 and
     four shares after that, and neither could say the one thing that matters
     on a small screen: that a 256px picture is small and a 512px one is not.
     phoneDiscSize() ramps between those two facts instead. */
  var DISC_TUNING = {
    wide: [0.575, 0.683, 0.792, 0.90]
  };

  // How much white is left between the widest disc and the window's edge.
  var DISC_GUTTER_PX = 8;

  // Timings for the home board, in milliseconds.
  var RUNG_MOVE_MS = 460;      // one rung sliding inward as the next grows out
  var DISSOLVE_MS = 250;       // a deleted stretch of band coming apart
  var DISSOLVE_BITS = 40;      // how many pieces it comes apart into
  var HOME_SETTLE_MS = 110;    // how long typing settles before the meter redraws
  var GLOW_SETTLE_MS = 300;    // and how long before the glow comes back, which is
                               // longer, so it never flickers on a keystroke
  var READING_DELAY_MS = 130;  // how long a decode runs before it says it is working
  var HOME_FLASH_MS = 30;      // long enough for one painted frame of white
  var HOME_CONFIRM_MS = 1500;  // how long a control says it did its job
  var DISC_TOSS_MS = 360;      // a disc shrinking away
  var DISC_EJECT_MS = 20;      // the pause before a fresh disc is told to come out
  var HOME_SAVE_MS = 4000;     // how long a download URL is kept alive
  var VIEW_SLIDE_MS = 500;     // one screen sliding out as the next slides in
  var VIEW_SLIDE_SLACK_MS = 60;  // what a slow phone takes to picture the new screen
  var VIEW_SLIDE_START_MS = 250; // a slide not begun by then, with nothing drawn, is given up
  var VIEW_SLIDE_WAIT_MS = 700;  // and one not begun by then is given up whatever is drawn

  /* THE SHOW BETWEEN MAKE AND MADE, TIMED IN ONE PLACE.
     The stage in Section 5 reads every one of these, and hands the stylesheet
     the four lengths it needs as custom properties, so not one of these numbers
     has a second copy in the sheet that could move on one side only.
     THE LAST LETTER IS IN BEFORE THE DISC IS PULLED. That is why the stagger is
     the difference between the two: a letter takes IL_FALL_MS whenever it sets
     off, and the last one sets off early enough to land on time. */
  var IL_FALL_MS = 1700;       // one letter's fall, from breaking off to swallowed
  var IL_SUCK_AT_MS = 3000;    // when the disc is pulled in, every letter in by then
  var IL_SUCK_MS = 400;        // how long that pull takes
  var IL_FLARE_MS = 420;       // the flare as the disc lands, which ends the show
  var IL_DISC_AT_MS = 1150;    // when the disc starts to form over the light
  var IL_DISC_MS = 1450;       // how long it takes to form, block by block
  var IL_TOTAL_MS = IL_SUCK_AT_MS + IL_SUCK_MS + IL_FLARE_MS;
  /* A SHOW AFTER THE FIRST IN A VISIT IS SHORTER. The first one shows what
     pressing does, and waiting the whole length again is only waiting. Every
     length above is multiplied by this share once a person has seen a show
     play out, so one number sets how much shorter, and every rule between the
     lengths still holds at any share. 1 turns it off. */
  var IL_AGAIN_SHARE = 0.5;
  // Where the visit remembers it. sessionStorage, so a new visit starts long.
  var IL_SEEN_KEY = "ppng.visit.interludeSeen";
  var IL_PIECES_MAX = 220;     // letters up to this many, then words, then lines
  /* EVERY STYLE THAT DECIDES WHERE A LINE BREAKS. The show copies these from
     the Make box onto an invisible copy of it, so the copy breaks its lines in
     the places the box does and can say where each letter sat. A style left off
     this list is a line that breaks one word early or late. */
  var IL_WRAP_STYLES = ["fontFamily", "fontSize", "fontWeight", "fontStyle",
    "fontStretch", "fontVariant", "fontKerning", "fontFeatureSettings",
    "lineHeight", "letterSpacing", "wordSpacing", "textTransform", "textIndent",
    "textAlign", "direction", "whiteSpace", "wordBreak", "overflowWrap",
    "lineBreak", "hyphens", "tabSize", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft"];
  var IL_SPIN_DEG = 540;       // how far a sprite turns on its way in
  /* THE DISC IS A GRID CUT TO A CIRCLE, NOT A SET OF RINGS. Rings were the
     first shape and they read as a flower: every block lines up with the one
     outside it, and the gaps between them run out from the middle as spokes. A
     grid has the edge a disc has, and the squares left in it are what makes it
     read as a picture still forming. All three are shares of the stage's own
     radius, so the disc is the same disc on any screen. */
  var IL_DISC_CELL = 0.20;     // one block and its gap, against that radius
  var IL_DISC_IN = 0.34;       // the hole in the middle, where the light is
  var IL_DISC_OUT = 0.94;      // and the rim

  // The line art the home board draws for itself. One shape serves every place
  // that needs it, so a mark can never drift between two copies of itself.
  var D_COPY = "M9.5 9.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" +
               "M15.5 6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2";
  var D_DOWN = "M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 20h15";
  var D_X = "M7.5 7.5l9 9M16.5 7.5l-9 9";
  var D_FILE = "M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5zM13.5 3v5.5H19";
  var D_TICK = "M5 12.5l4.5 4.5L19 7.5";
  /* EDIT TITLE: A PENCIL OVER A LINE OF WRITING. The mark before it was a
     tapered rod with a rounded back and one band across the neck, which is
     the silhouette of an eyedropper, and it read as one.
     Three things make it a pencil instead. The back is cut square rather than
     rounded. The ferrule is a band across the body, far enough from the back
     that the two do not merge at this size. The line underneath says the
     thing being changed is writing.
     Nothing is closer than about four units to anything else, because at 18px
     a 1.9 stroke lands near 1.4px and two lines any nearer read as a smudge. */
  var D_WRITE = "M5 21h14 M5.2 16.8 L6 11.7 L15.9 1.8 L19.9 5.8 L10 15.7 Z M12.7 5 L16.7 9";
  // R5's marks for the phone's Made screen. Each is one path with two
  // subpaths, because homeIcon draws one path and both of these are stroked.
  var D_AGAIN = "M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5";
  var D_PLANE = "M21 3 10.5 13.5M21 3 14.5 21l-4-7.5L3 9.5z";

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

  /* THE CELEBRATION, OFF FOR NOW.
     One switch, and this is it. It decides what a person gets before they
     have chosen anything. The Advanced control still turns the confetti on,
     and a choice made there is remembered on that device and beats this.
     It is declared above what reads it on purpose: var hoists, so the other
     way round this would read undefined without a word. */
  var CELEBRATION_DEFAULT = false;
  var celebrationOn = CELEBRATION_DEFAULT;

  /* THE SHOW IS ON UNTIL SOMEBODY TURNS IT OFF. It is the answer to what
     pressing the button does, so a first visit gets it. Animations off turns it
     off as well, which is not a second preference: the show is movement and
     nothing else. */
  var interludeShow = true;

  // The formation, as it is running now. The defaults are the FORM_ constants
  // and a stored choice replaces them at startup.
  var formStyle = "fade";
  var formMs = 620;
  var formOverlap = 20;

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

  /* Ten sayings per family. Password protection selects the locked pool
     before any filename or extension is read. */
  var DISC_SAYINGS = {
    "text": {
      "extensions": [],
      "sayings": [
        "This picture has words inside!",
        "A note lives in this PNG!",
        "More than pixels. A message!",
        "Your next read is in this image!",
        "Words, tucked into a picture!",
        "Open this PNG. Read the note!",
        "This disc has something to say!",
        "A whole message, pictured here!",
        "Yes, you can read what's inside!",
        "A little image. A real note!"
      ]
    },
    "attachment": {
      "extensions": [],
      "sayings": [
        "A whole file lives in this PNG!",
        "This picture carries a file!",
        "More in here than pixels!",
        "One image. A file tucked inside!",
        "Your file took the picture route!",
        "Open this image. Get the file!",
        "A little disc with a file inside!",
        "There's an attachment in here!",
        "This PNG comes with contents!",
        "A file, pressed into a picture!"
      ]
    },
    "pdf": {
      "extensions": [
        ".pdf"
      ],
      "sayings": [
        "A whole PDF lives in this PNG!",
        "This picture has pages inside!",
        "Your PDF took the scenic route!",
        "Open this image. Find the PDF!",
        "Pages, tucked into a picture!",
        "More than pixels. A PDF!",
        "A little image. A whole PDF!",
        "This disc is carrying a PDF!",
        "Yes, there's a PDF in here!",
        "A PDF, pressed into a picture!"
      ]
    },
    "word": {
      "extensions": [
        ".doc",
        ".docx",
        ".docm"
      ],
      "sayings": [
        "A Word document lives in here!",
        "This PNG has a document inside!",
        "Your document is in the picture!",
        "Open this image. Find the doc!",
        "A whole document, pictured here!",
        "More than pixels. A Word file!",
        "This little disc carries a doc!",
        "A Word file took the image route!",
        "Yes, the document is inside!",
        "A document, pressed into a PNG!"
      ]
    },
    "excel": {
      "extensions": [
        ".xls",
        ".xlsx",
        ".xlsm",
        ".csv"
      ],
      "sayings": [
        "A spreadsheet lives in this PNG!",
        "This picture has cells inside!",
        "Rows and columns, tucked inside!",
        "Your spreadsheet is in the picture!",
        "Open this PNG. Find the sheet!",
        "More than pixels. A spreadsheet!",
        "A whole sheet fits in here!",
        "This disc is carrying a spreadsheet!",
        "Yes, the spreadsheet is inside!",
        "A spreadsheet, packed as a picture!"
      ]
    },
    "slides": {
      "extensions": [
        ".ppt",
        ".pptx",
        ".pptm",
        ".ppsx"
      ],
      "sayings": [
        "A whole slide deck lives in here!",
        "This picture has slides inside!",
        "Your presentation is in this PNG!",
        "Open this image. Find the slides!",
        "A slide deck, tucked into a disc!",
        "More than pixels. A presentation!",
        "Slides took the picture route!",
        "This little PNG carries a deck!",
        "Yes, the presentation is inside!",
        "A presentation, pressed into a PNG!"
      ]
    },
    "odt": {
      "extensions": [
        ".odt",
        ".ott"
      ],
      "sayings": [
        "An OpenDocument lives in here!",
        "This PNG carries an ODT file!",
        "Your ODT document is in the picture!",
        "Open this image. Find the ODT!",
        "An ODT file, tucked into a disc!",
        "More than pixels. An OpenDocument!",
        "A document took the PNG route!",
        "This picture holds your ODT file!",
        "Yes, there's an OpenDocument inside!",
        "An OpenDocument, pressed into a PNG!"
      ]
    },
    "ods": {
      "extensions": [
        ".ods",
        ".ots"
      ],
      "sayings": [
        "An ODS spreadsheet lives in here!",
        "This PNG carries an ODS file!",
        "Your ODS sheet is in the picture!",
        "Open this image. Find the ODS!",
        "An ODS sheet, tucked into a disc!",
        "More than pixels. An ODS sheet!",
        "An open-format sheet fits in here!",
        "This picture holds your ODS file!",
        "Yes, there's an ODS file inside!",
        "An ODS spreadsheet, pressed into a PNG!"
      ]
    },
    "odp": {
      "extensions": [
        ".odp",
        ".otp"
      ],
      "sayings": [
        "An ODP presentation lives in here!",
        "This PNG carries an ODP file!",
        "Your ODP slides are in the picture!",
        "Open this image. Find the ODP!",
        "An ODP deck, tucked into a disc!",
        "More than pixels. An ODP deck!",
        "An open-format deck fits in here!",
        "This picture holds your ODP file!",
        "Yes, there's an ODP file inside!",
        "An ODP presentation, pressed into a PNG!"
      ]
    },
    "textfile": {
      "extensions": [
        ".txt",
        ".md",
        ".log"
      ],
      "sayings": [
        "A whole text file lives in here!",
        "This PNG has a text file inside!",
        "Your text file is in the picture!",
        "Open this image. Find the text!",
        "A text file, tucked into a disc!",
        "More than pixels. A text file!",
        "A little picture carries this text!",
        "This image has a file to read!",
        "Yes, there's a text file in here!",
        "A text file, pressed into a PNG!"
      ]
    },
    "image": {
      "extensions": [
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".svg",
        ".avif"
      ],
      "sayings": [
        "There's another image inside!",
        "A picture, tucked into a picture!",
        "This PNG carries an image file!",
        "Open this image. Find the other!",
        "One picture with another inside!",
        "More than a cover. An image file!",
        "Your image is packed in this disc!",
        "This picture has a picture to share!",
        "Yes, a whole image lives in here!",
        "An image file, pressed into a PNG!"
      ]
    },
    "archive": {
      "extensions": [
        ".zip",
        ".7z",
        ".rar",
        ".tar",
        ".gz"
      ],
      "sayings": [
        "An archive lives in this PNG!",
        "This picture carries an archive!",
        "A whole archive, tucked inside!",
        "Open this image. Find the archive!",
        "Your archive took the image route!",
        "More than pixels. An archive!",
        "An archive fits in this little disc!",
        "This PNG has a package inside!",
        "Yes, the archive is in here!",
        "An archive, pressed into a picture!"
      ]
    },
    "locked": {
      "extensions": [],
      "sayings": [
        "Something is locked inside this PNG!",
        "This picture opens with a password!",
        "Locked contents, tucked inside!",
        "A little image with a secret inside!",
        "More than pixels. Locked contents!",
        "This disc has a password on it!",
        "A secret, pressed into a picture!",
        "Open with a password to see inside!",
        "Yes, there's something locked in here!",
        "Your password opens what's inside!"
      ]
    }
  };

  // Keep both ends and the extension visible on the marker title.
  var DISC_NAME_MAX = 42;
  /* THE LONGEST THE DISC WAS DESIGNED FOR. Measured against the board's own
     130 sayings: the longest is 40 characters and the mean is 32. The limit
     was 64, which allowed half again more than anything the disc carries, and
     the engine then took the middle out of it to fit the arc. */
  var DISC_TITLE_MAX = 40;

  /* THE TWO FACES THE DISC IS WRITTEN IN. A canvas cannot use a font the
     document has not fetched, and it falls back to another face without
     saying so, so both are loaded before the first disc is pressed. They are
     not loaded with the page, because nothing needs them until then. */
  var DISC_FACES = ['400 20px "Permanent Marker"', '400 20px "Caveat Brush"'];

  var SLIDER_IDS = [
    "splHubSize", "splHoleSize", "splOuter", "splInner",
    "splPoints", "splCurve", "splWaviness", "splAmplitude", "splSize",
    "splDotSep", "splDotMin", "splDotMax", "splTextBuffer", "splTextClear"
  ];

  // What the engine snippet card says when a server is present but the file
  // cannot be read. The disk case is markup, not script: see engineCodeLocal.
  var ENGINE_SOURCE_FAILED =
    "puttypng.js could not be loaded.\n" +
    "Check that the file sits next to index.html on the server.";

  // Each Make chooses a new automatic saying. The background switch keeps the
  // saying a picture carries, because it presses that picture's own label again.
  var homeSaying = null;
  var homeEditedLabel = null;
  var homeLabelLocked = false;
  // The title of the example on the board, until anything on the board changes.
  var homeExampleTitle = null;
  var homeMade = null;
  var homeTitleDraft = null;
  var homeTitleSaving = false;

  // The faces, once. A promise, so a second press waits rather than refetching.
  var discFontsReady = null;

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
  /* Which sentence the attach reading uses. Attaching from the paperclip is
     plain good news. Attaching a picture that turned out to hold nothing has
     to say what became of the words it covered up. */
  var homeAttachedSay = "";
  // What came out of the last PuttyPNG read, for Copy Contents. Null for a
  // file, which has a chip of its own instead.
  var homeLoadedText = null;
  var homeLastBlob = null;   // the disc in Made!'s window, for Copy and Save
  var homeLoadedBlob = null; // the disc showing in Load, for its own Copy and Save
  var homeDiscOut = false;   // a disc is out, in Made!'s window
  var homeDiscSide = 0;      // the side of the picture in the window, once it has loaded
  var homePressing = false;  // a press is running, and a second must wait
  var homeSettleTimer = 0;   // the wait after a keystroke before the meter redraws
  var homeRunToken = 0;      // which meter run is current, so a stale one cannot paint
  var homeReadTimer = 0;     // the wait before a decode says it is working
  var homeReadDepth = 0;     // how many decodes are running, so two cannot race
  var homeShownRung = 0;     // the rung the column width is currently set for

  /* THE SIDE OF THE PICTURE THE ENGINE WOULD MAKE, in pixels, or 0 before the
     first measurement. The rung is a capacity band and the picture is the
     smallest square that holds the data above a 256px floor, so the two are
     different numbers: a book sits on the 512 rung inside a 397px picture.
     The engine works this out in PuttyPNG.planSize, because the arithmetic is
     byte-level and belongs there rather than here. */
  var homeTrueSide = 0;
  var bigWarnClosed = false; // the cross was pressed, so it stays closed
  var BIG_PASTE_PX = 512;    // past this a chat app recompresses and breaks it

  /* THE EXAMPLES BEHIND THE EXAMPLES DROPDOWN. Nothing records which example
     is on the board: the slot says what was picked for four seconds and then
     goes back to offering, and the box and the meter show the rest. There is
     no deck either, because a person chooses rather than being dealt to. */
  var examplesReady = null;  // the promise for examples.js, held so it loads once
  var egFlashTimer = 0;      // the wait before the slot goes back to offering

  // The glow chain. Three flags, and stageFor() reads the board for the rest.
  var glowTouched = false;   // the box has been typed in at least once
  var glowSettled = true;    // typing has stopped for long enough to light up
  var glowDone = false;      // the chain has been walked, and stays off
  var glowTimer = 0;
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
  /* WHICH PAGE IS THIS. There are five, and each one carries its own main
     block. The board is the only page with a Make column and a Load column,
     so the presence of the board is the question every drop handler asks. */
  function onBoardPage() { return !!$("board"); }

  /* WHAT THE PERSON IS HOLDING. A live query, not a stored flag: it re-answers
     when the window changes and when a tablet rotates. The stylesheet asks the
     same question in CSS, and this is the same question asked in JavaScript,
     so the two can never disagree about the shape on screen. */
  var touchPointer = window.matchMedia("(hover: none), (pointer: coarse)");

  /* WHICH SCREEN THE PHONE IS ON, AND WHICH CARD A DESKTOP SHOWS. A phone shows
     the one region named here. A desktop shows Make beside the card it names:
     Load, Made! or Loaded!. One attribute for both shapes keeps one code path,
     which is the whole reason there is one block of markup. */
  /* IT HANDS BACK A PROMISE THAT RESOLVES WHEN THE SCREEN HAS ARRIVED: at once
     when nothing moves, and once the slide or the fade is over when something
     does. A caller that has more to do on the new screen waits on it, so nothing
     starts moving on a screen that is still moving itself.
     changed() RUNS THE MOMENT THE NEW SCREEN IS IN PLACE, before a frame of it
     is drawn. It is the one moment a caller can lay something out on a screen
     that is about to slide in, so the screen arrives already showing it. */
  function setView(name, slide, changed) {
    var grid = $("boardGrid");
    var done = Promise.resolve();
    done.underway = done;
    done.ended = done;
    if (!grid) return done;
    var turn = ++viewTurn;
    var from = grid.getAttribute("data-view");
    if (from !== name) {
      if (slide && canSlide()) return transitionView(grid, name, changed, turn, "vt-slide");
      /* A DESKTOP FADES WHENEVER ITS PICTURE CHANGES. The show dims the page as
         it comes up and clears as it goes, and the right-hand card changes
         between Load, Made! and Loaded!, which a phone changes at once as it
         always has. THE ONE CHANGE THAT DOES NOT FADE IS A SKIP: the show has
         taken its dim down before it asks, so there is nothing left to fade. */
      if (canFade() && (slide || (from !== "making" && name !== "making"))) {
        return transitionView(grid, name, changed, turn, "vt-fade");
      }
    }

    /* A CHANGE THAT DOES NOT SLIDE ENDS ANY SLIDE STILL RUNNING. Skipping the
       show part way through its slide goes back to Make at once, and a slide
       left to finish would carry the show's screen in over the one asked for. */
    if (activeSlide) activeSlide.skipTransition();
    if (grid.getAttribute("data-view") !== name) showView(grid, name);
    if (changed) changed();
    return done;
  }

  // Everything a change of screen does, whether or not the change slides.
  function showView(grid, name) {
    grid.setAttribute("data-view", name);
    focusView(name);
    paintGlow();
    paintMakeSay(false);
    paintCardSay();
    paintMadeScreen();
  }

  /* A SLIDE NEEDS A PHONE, MOVEMENT, AND A BROWSER THAT CAN DO IT. A desktop
     keeps Make on screen through every change, so a slide would carry the card
     a person is working in away with the one that changed. Animations off is a
     person asking for nothing to move. A browser without view transitions
     changes screen at once, the way every screen changed before there was a
     slide. */
  function canSlide() {
    return touchPointer.matches && animationsOn &&
           typeof document.startViewTransition === "function";
  }

  /* A FADE IS THE DESKTOP'S HALF OF THE SAME QUESTION. A mouse, movement, and a
     browser that can picture the page before and after a change. */
  function canFade() {
    return !touchPointer.matches && animationsOn &&
           typeof document.startViewTransition === "function";
  }

  /* THE OLD SCREEN SLIDES OUT AS THE NEW ONE SLIDES IN.
     A view transition, because the view contract cannot give a slide anything
     to move. A screen the grid does not ask for is display:none, so there is no
     outgoing screen left on the page. The browser pictures the board before the
     change and after it, and slides the two pictures past each other over a
     page that has already changed underneath. Nothing in the contract bends.
     It used to be the arriving screen alone, 22 per cent of the way over 280ms,
     with the old one gone before it started: a snap with a short run-up.

     ONLY THE BOARD SLIDES, AND ONLY WHILE IT SLIDES. vt-slide names the board
     and takes the name off the page, so the masthead and the footer stand still
     rather than fading through themselves. The class comes off when the slide is
     over, because a board named for good would change the fade between pages.

     A DESKTOP FADES INSTEAD, THROUGH THE SAME ROUTINE. vt-fade leaves the page
     named, so the browser fades the whole page from its picture before the
     change to its picture after: the dim comes in round the show or clears away
     from it, and one card gives way to the next. It has the slide's length and
     curve, so the two shapes move at the same pace, and every guard below holds
     for both.

     THE SHOW IS NOT MADE TO WAIT ON A SLIDE THAT NEVER COMES. finished is the
     browser's word that the slide is over, and a browser that cannot draw the
     slide gives that word four seconds late. A timer that starts when the new
     screen is in place stands in for it, so the most anyone waits is the slide. */
  var activeSlide = null;
  var slideRun = 0;

  /* EVERY CHANGE OF SCREEN TAKES A TURN, AND A SLIDE ONLY LANDS ON ITS OWN.
     The browser runs a slide's change a frame or two after it is asked for.
     Anything that changes the screen in between, a skip in the first instant
     of the show being the one that happens, has already decided where the board
     is, and a late change would put the show's screen back over it. */
  var viewTurn = 0;

  function transitionView(grid, name, changed, turn, kind) {
    var root = document.documentElement;
    var run = ++slideRun;
    root.style.setProperty("--slide", VIEW_SLIDE_MS + "ms");
    root.classList.add(kind);

    var slide = null, begun = false;
    var markUnderway = function () {};
    var underway = new Promise(function (resolve) { markUnderway = resolve; });
    // Ended is when the browser has let go of the slide: finished, or given up.
    var markEnded = function () {};
    var ended = new Promise(function (resolve) { markEnded = resolve; });

    var arrived = new Promise(function (resolve) {
      var landed = false;
      function arrive() {
        if (landed) return;
        landed = true;
        markUnderway();
        resolve();
      }
      slide = document.startViewTransition(function () {
        begun = true;
        if (turn !== viewTurn) return;
        showView(grid, name);
        if (changed) changed();
        setTimeout(arrive, VIEW_SLIDE_MS + VIEW_SLIDE_SLACK_MS);
      });
      activeSlide = slide;
      function over() {
        markEnded();
        // A later slide owns the class now, and taking it off would unname the
        // board in the middle of that one.
        if (run !== slideRun) return arrive();
        activeSlide = null;
        root.classList.remove(kind);
        arrive();
      }
      slide.finished.then(over, over);
    });

    /* UNDER WAY IS WHEN BOTH PICTURES ARE TAKEN. From there the slide runs off
       the main thread, and heavy work cannot make it stutter, so a caller with
       heavy work to do waits for this rather than for the whole slide. */
    slide.ready.then(markUnderway, markUnderway);

    /* A SLIDE THAT HAS NOT BEGUN IS GIVEN UP, SOONER WHEN NOTHING IS DRAWN.
       A browser has to picture the old screen before the slide can begin, and
       a person is looking at a screen that has stopped responding while it does.
       A phone at nearly three pixels to the point took 193ms to picture the Make
       screen, so a single short wait would give up slides a phone was part way
       through taking. A browser that is drawing frames is given VIEW_SLIDE_WAIT_MS.
       One that has drawn none is not going to slide at all, and is given up at
       VIEW_SLIDE_START_MS: that is the test harness, every time.
       THE FRAME IS ONLY LISTENED FOR. Nothing waits on it, because a frame
       callback never runs in a headless test; the timers do the work. */
    var drawing = false;
    requestAnimationFrame(function () { drawing = true; });
    setTimeout(function () {
      if (!begun && !drawing) slide.skipTransition();
    }, VIEW_SLIDE_START_MS);
    setTimeout(function () {
      if (!begun) slide.skipTransition();
    }, VIEW_SLIDE_WAIT_MS);

    arrived.underway = underway;
    arrived.ended = ended;
    return arrived;
  }

  /* WHERE FOCUS GOES WHEN THE SCREEN CHANGES. The heading of the view that is
     now on screen. It is the one element every screen has, it names the screen,
     and tabindex="-1" lets it take focus without joining the tab order.
     Without this, focus is left on a button that has left the page, and the
     next tab starts again at the top of the document.
     A DESKTOP IS NOT FOCUSED HERE. Make stays on screen through every change
     there, and a person may be typing in it while the card beside it changes.
     Focus moves on a desktop only where the control that was pressed goes with
     its card: the show, and the cross on Made! or Loaded!. */
  var VIEW_HEAD = { make: "headMake", made: "headMake", making: "headMaking",
    loaded: "headLoad" };

  function focusView(name) {
    if (!touchPointer.matches) return;
    var head = $(VIEW_HEAD[name]);
    if (head) head.focus();
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

  // The short size format. It began under the board's donut, where there is no
  // room for a long one, and the How it works result block uses it too.
  function homeFmt(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(2) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " bytes";
  }

  /* ------------------------------------------------------------------------
     THE WRITING ON THE DISC

     Three lines, and the board fills in the two it knows about. The engine
     draws them; everything here decides what they say.
     ------------------------------------------------------------------------ */

  // Select the protected pool before inspecting the attachment.
  function discCategory(attachment, locked) {
    if (locked) return "locked";
    if (!attachment) return "text";
    var ext = discExtension(attachment.name);
    var keys = Object.keys(DISC_SAYINGS);
    for (var i = 0; i < keys.length; i++) {
      if (DISC_SAYINGS[keys[i]].extensions.indexOf(ext) >= 0) return keys[i];
    }
    return "attachment";
  }

  function discExtension(name) {
    var match = /\.[^.\\/]+$/.exec(String(name || ""));
    return match ? match[0].toLowerCase() : "";
  }

  // Choose a different saying when one is already displayed.
  function pickDiscSaying(locked, previous, category) {
    var pool = DISC_SAYINGS[category || discCategory(homeAttached, locked)].sayings;
    var choices = pool.filter(function (saying) { return saying !== previous; });
    return choices[Math.floor(Math.random() * choices.length)];
  }

  /* A file name short enough for one arc, cut in the middle so both ends
     survive. A name is what a person recognises, and the start and the
     extension carry more of that than the middle does. */
  function shortDiscName(name) {
    var characters = Array.from(String(name || ""));
    if (characters.length <= DISC_NAME_MAX) return characters.join("");
    var dot = characters.lastIndexOf(".");
    var ext = dot > 0 ? characters.slice(dot) : [];
    var base = dot > 0 ? characters.slice(0, dot) : characters;
    var keep = DISC_NAME_MAX - ext.length - 1;
    if (keep < 4) {
      return characters.slice(0, 25).join("") + "\u2026" + characters.slice(-16).join("");
    }
    var head = Math.ceil(keep * 0.62);
    return base.slice(0, head).join("") + "\u2026" + base.slice(base.length - (keep - head)).join("") + ext.join("");
  }

  // A protected disc names no content, size, type, or word count.
  function discInfoLine(input, locked) {
    if (locked) return "Locked contents inside!";
    if (typeof input === "string") {
      var found = input.trim().match(/\S+/g);
      var n = found ? found.length : 0;
      return n.toLocaleString("en-US") + (n === 1 ? " word" : " words") + " of text inside!";
    }
    var size = homeFmt(input.length).replace(/\.0+(?= KB| MB)/, "");
    var category = discCategory(homeAttached, false);
    var type = category === "attachment" ? "file" : discExtension(homeAttached.name).slice(1).toUpperCase();
    return size + " " + type + " inside!";
  }

  // The board supplies wording; the engine draws and embeds it.
  function applyDiscWriting(input, opts) {
    var locked = !!opts.password;
    homeSaying = pickDiscSaying(locked, homeSaying);
    if (locked) {
      // A public title from an earlier press must not cross into a locked disc.
      if (opts.label && opts.label.trim() && !homeLabelLocked) opts.label = null;
      if (opts.infoText !== " ") opts.infoText = discInfoLine(input, true);
    }
    /* AN EXAMPLE NAMES ITSELF, and only while it is still what the board holds.
       The drawer's own words win over it. A locked disc never takes it, because
       a title that names the contents is a content detail on the outside. */
    if (opts.label == null && !locked && homeExampleTitle) opts.label = homeExampleTitle;
    if (opts.label == null) opts.label = homeSaying;
    if (opts.infoText == null) opts.infoText = discInfoLine(input, locked);
  }

  // The two faces, fetched once and awaited before a disc is pressed.
  function ensureDiscFonts() {
    if (discFontsReady) return discFontsReady;
    if (!document.fonts || !document.fonts.load) return (discFontsReady = Promise.resolve());
    discFontsReady = Promise.all(DISC_FACES.map(function (f) {
      return document.fonts.load(f).catch(function () {});
    }));
    return discFontsReady;
  }

  /* THE EXAMPLES ARE 440KB OF OTHER PEOPLE'S WRITING, so they are not on the
     page until somebody asks for them. A script tag rather than a fetch,
     because Chrome refuses fetch on file:// and the site promises to work from
     a disk. The promise is held so a second press waits on the first load
     instead of adding a second tag, and a failed load clears it so the next
     press can try again. */
  function ensureExamples() {
    if (examplesReady) return examplesReady;
    examplesReady = new Promise(function (ok, no) {
      if (window.PUTTYPNG_EXAMPLES) return ok(window.PUTTYPNG_EXAMPLES);
      var tag = document.createElement("script");
      tag.src = "examples.js";
      tag.onload = function () {
        if (window.PUTTYPNG_EXAMPLES) ok(window.PUTTYPNG_EXAMPLES);
        else { examplesReady = null; no(new Error("examples.js set nothing")); }
      };
      tag.onerror = function () {
        examplesReady = null;
        no(new Error("examples.js did not load"));
      };
      document.head.appendChild(tag);
    });
    return examplesReady;
  }

  /* ONE OF A KIND, AT RANDOM. The dropdown offers words or a file, not five
     titles: somebody who wants to see the thing work does not want to read a
     menu first. The board chooses which one, and the slot then says which one
     it chose.
     IT NEVER GIVES THE SAME ONE TWICE RUNNING WHEN IT HAS A CHOICE. Three text
     examples chosen with no memory repeat one press in three, and a person who
     asks for another and gets the same one reads it as broken. A kind with one
     example gives that one every time. */
  var lastOfKind = {};

  function randomOfKind(all, kind) {
    var pool = all.filter(function (e) { return e.kind === kind; });
    if (!pool.length) return null;
    if (pool.length > 1 && lastOfKind[kind]) {
      pool = pool.filter(function (e) { return e.id !== lastOfKind[kind]; });
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    lastOfKind[kind] = pick.id;
    return pick;
  }

  /* One line of writing, read off its group in the drawer. The style names
     match the engine's, so nothing is translated on the way through.
     Show turned off writes a single space, which is how the engine is told a
     line has no words. That is not the same as leaving the field empty: an
     absent option means the board fills the words in itself. */
  function readDiscLine(key, wordsKey, opts) {
    var v = function (name) { return document.getElementById("opt" + key + name); };
    var box = document.getElementById(
      key === "Label" ? "optLabel" : key === "Rim" ? "optRimText" : "optInfoText");
    var words = box ? box.value.trim() : "";
    if (!v("On").checked) opts[wordsKey] = " ";
    else if (words) opts[wordsKey] = words;
    opts[key.toLowerCase() + "Style"] = {
      font: v("Font").value,
      size: parseFloat(v("Size").value),
      ink: v("Ink").value,
      pos: v("Pos").value,
      radius: parseFloat(v("Radius").value),
      arc: parseFloat(v("Arc").value),
      weight: v("Weight").value,
      mode: v("Mode").value,
      opacity: parseFloat(v("Opacity").value),
      outline: v("Outline").value,
      outlineWidth: parseFloat(v("OutlineW").value),
      shadow: v("Shadow").value,
      shadowAlpha: parseFloat(v("ShadowA").value),
      shadowBlur: parseFloat(v("ShadowBlur").value),
      shadowDrop: parseFloat(v("ShadowDrop").value)
    };
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
    interlude: "ppng.pref.interlude",
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

  /* THE CURRENT PAGE, SAID TWICE. The stylesheet marks the link by colour
     from the class on the body element. A colour is not an announcement, so
     the same fact is put on the link as an attribute for a screen reader.
     The cascade cannot set an attribute, which is why this is script. */
  function markCurrentPage() {
    var nav = $("tabs");
    if (!nav) return;
    var here = (document.body.className.match(/\bp-([a-z]+)\b/) || [])[1];
    if (!here) return;
    var link = nav.querySelector('a[data-page="' + here + '"]');
    if (link) link.setAttribute("aria-current", "page");
  }

  function wireDrawer() {
    if (!advToggle || !advDrawer) return;
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
    if (!sizeMode) return;
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
    // No overlay on this page means the page does not take a dropped file.
    if (!dropVeil) return;
    // THE OVERLAY IS FOR THE OTHER TABS. The board carries two targets of its
    // own and answers on each of them, so the overlay stands down while the
    // board is the panel on screen and offers itself everywhere else. Its
    // handlers still run at the window, below the board's, which stop what
    // they take.
    window.addEventListener("dragenter", function (e) {
      if (onBoardPage() || !dragHasFiles(e)) return;
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
      if (onBoardPage() || !dragHasFiles(e)) return;
      veilDepth--;
      if (veilDepth <= 0) hideDropVeil();
    });

    window.addEventListener("drop", function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      if (onBoardPage()) return;
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
    var show = document.getElementById("optInterlude");
    if (!anim || !celeb) return;

    anim.checked = animationsOn;
    celeb.checked = celebrationOn;
    // The show's switch and the box on the panel are one preference, so it is
    // painted rather than set here, and the same routine paints both of them.
    paintInterludePref();
    if (show) {
      show.addEventListener("change", function () {
        setInterludePref(show.checked);
      });
    }
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







  /* THE BOUNDED ZONE, which only the How it works page carries. */
  function wireBoundedZone() {
    if (!dropzone || !importFile) return;
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
  }

  /* PASTE, ON EVERY PAGE THAT CAN READ ONE. This used to live inside the
     bounded zone's wiring, which after the split would have left the board
     unable to take a paste at all. */
  function wirePaste() {
    document.addEventListener("paste", function (e) {
      if ($("titleDialog") && $("titleDialog").open) return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      if (onBoardPage()) {
        /* A PASTE IS A DROP. A PNG is peeked, so a PuttyPNG opens and a plain
           picture becomes the file to hide. Any other file is attached, the
           way a file dropped on the box is.
           THE MAKE BOX IS NOT EXEMPT ANY MORE. On a phone it is the only place
           Paste is offered at all: Android shows Paste on a focused field and
           nowhere else, and the Load column is off screen there. Until
           v2.10.1 the box refused every paste, so a long-press Paste of a
           PuttyPNG did nothing and said nothing.
           Words pasted into a field are still words: they carry no file and
           fall through to the browser. Anything else is named, so a paste
           that does nothing never does it in silence. */
        var file = fileFrom(items);
        if (file) {
          e.preventDefault();
          if (/^image\/png/.test(file.type)) readHomeFile(file);
          else takeHomeAttachment(file);
          return;
        }
        if (hasText(items) && isTyping(e.target)) return;
        e.preventDefault();
        toast(hasText(items) ? SAY.pasteWords : pasteHeld(items), "bad");
        return;
      }
      if (!$("dropzone")) return;
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
    // so a person opening the folder directly gets the link instead of a
    // server error that does not apply to them.
    if (location.protocol === "file:") {
      codeEl.classList.add("hidden");
      var local = document.getElementById("engineCodeLocal");
      if (local) local.classList.remove("hidden");
      return;
    }

    fetch("puttypng.js")
      .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (text) { codeEl.textContent = text; })
      .catch(function () { codeEl.textContent = ENGINE_SOURCE_FAILED; });
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
     Every listener Make and the card beside it need, in one place.
     ========================================================================== */

  /* THE MENU BESIDE THE HEADING. It keeps its own listeners, because nothing
     repaints the heading row. That is the whole reason it moved out of the
     reading: a control in there was rewritten away every time the board
     changed state.

     IT IS A MENU RATHER THAN A SELECT BECAUSE OF THE MARKS. An option in a
     native select renders as plain text, so a row cannot carry an icon. Doing
     it by hand means the open and close, the keys and the focus are all
     written here, which is the cost of the marks. */
  function egMenuOpen() {
    return $("egMenu") && !$("egMenu").hidden;
  }

  function openEgMenu() {
    $("egMenu").hidden = false;
    $("egPick").setAttribute("aria-expanded", "true");
    var first = $("egMenu").querySelector(".egitem");
    if (first) first.focus();
  }

  /* CLOSING ALWAYS PUTS THE FOCUS BACK, unless the board is about to take it
     somewhere better. A menu that closes and leaves the focus on the page body
     loses a keyboard reader their place. */
  function closeEgMenu(refocus) {
    if (!$("egMenu")) return;
    $("egMenu").hidden = true;
    $("egPick").setAttribute("aria-expanded", "false");
    if (refocus) $("egPick").focus();
  }

  function wireExamples() {
    var btn = $("egPick"), menu = $("egMenu");
    if (!btn || !menu) return;

    btn.addEventListener("click", function () {
      if (egMenuOpen()) closeEgMenu(true); else openEgMenu();
    });

    menu.addEventListener("click", function (e) {
      var item = e.target.closest && e.target.closest(".egitem");
      if (!item) return;
      closeEgMenu(false);
      offerExample(item.getAttribute("data-kind"));
    });

    /* THE ARROW KEYS WALK THE ROWS, which is what a menu is expected to do and
       what a select gave for nothing. Home and End are the same idea at the
       ends. Escape closes and hands the focus back. */
    menu.addEventListener("keydown", function (e) {
      var items = [].slice.call(menu.querySelectorAll(".egitem"));
      var at = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); return closeEgMenu(true); }
      if (e.key === "ArrowDown") { e.preventDefault(); items[(at + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
    });

    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openEgMenu(); }
    });

    /* A PRESS ANYWHERE ELSE CLOSES IT, and without handing the focus back:
       somebody who pressed another control is on their way there. */
    document.addEventListener("pointerdown", function (e) {
      if (!egMenuOpen()) return;
      if (e.target.closest && e.target.closest(".egwrap")) return;
      closeEgMenu(false);
    });
  }

  function wireHome() {
    if (!onBoardPage()) return;
    wireHomeMake();
    wireHomeDisc();
    wireTitleEditor();
    wireHomeLoad();
    wireExamples();
    wireInterlude();

    // Before the first paint of the board, because this decides which card a
    // control is drawn in, and a control that arrives and then jumps has
    // already been read in the wrong place.
    placeWayOut();

    // The first paint. force skips the settle wait and the two effects, so an
    // empty box starts at a drawn ring rather than a blank one.
    setBoardSizes(0);
    updateHomeMeter(true);
    growMakeBox();
    paintPlaceholder();
    paintGlow();
    wirePeek();
    paintMakeSay(false);
    window.addEventListener("resize", function () { setBoardSizes(homeShownRung); });

    /* A TABLET THAT ROTATES CHANGES SHAPE WITHOUT A RELOAD. The query re-answers
       on its own, so everything that reads it has to be asked again when it
       does. That is the sizes, the box height, the placeholder, the two
       controls that live in a different card on each shape, and the two
       readings, because a phone says Made! under the Make heading and a desktop
       says it under the heading over the right-hand cell.
       The listener takes no argument from the event: setBoardSizes reads a rung
       index, and handing it a MediaQueryListEvent would clamp to NaN and size
       the board in NaN pixels. */
    touchPointer.addEventListener("change", function () {
      placeWayOut();
      setBoardSizes(homeShownRung);
      growMakeBox();
      paintPlaceholder();
      paintMakeSay(false);
      paintCardSay();
    });
  }

  /* ------------------------------------------------------------------------
     WHERE A CONTROL LIVES DEPENDS ON WHAT THE PERSON IS HOLDING.

     THE ELEMENTS ARE MOVED, NEVER COPIED. There is one of each in the page and
     the gate counts them. A second copy would mean a repeated id, two sets of
     listeners on one job, and a screen reader reading the same button twice.
     A listener is held against the element, so it survives the move and does
     not have to be attached again.
     ------------------------------------------------------------------------ */

  /* THE WAY OUT OF MAKE.
     A desktop shows Make and Load side by side, so the two Load buttons belong
     in the Load column beside the drop zone they share. A phone shows one
     screen at a time, so the same two buttons have to be reachable from Make.
     R5 puts them under the Make button, behind a divider that says they are
     an alternative and not a leftover. */
  function placeWayOut() {
    var ordiv = $("ordiv"), chips = $("loadChips"), openIn = $("openIn");
    var bar = document.querySelector(".actbar");
    var adv = document.querySelector(".actbar .adv-row");
    var note = document.querySelector(".col.load .dropnote");
    if (!ordiv || !chips || !bar || !adv || !note || !openIn) return;
    if (touchPointer.matches) {
      // Ahead of the Advanced row, so the reading order is the button, the
      // divider, the two buttons, then Advanced: the order the eye takes them.
      bar.insertBefore(ordiv, adv);
      bar.insertBefore(chips, adv);
    } else {
      // Ahead of the hidden file input, which is where they started, so the
      // column reads the same after a move back as it did before the move.
      note.insertBefore(ordiv, openIn);
      note.insertBefore(chips, openIn);
    }
  }

  function paintDiscEdit() {
    var button = $("discEdit");
    if (!button) return;
    button.hidden = !homeDiscOut || !homeMade || homeMade.opts.coverStyle !== "cd" || !!homeMade.opts.cover;
    button.disabled = homePressing || homeTitleSaving;
  }

  /* WHAT THE EMPTY BOX ASKS FOR. A finger cannot drop a file, so the phone is
     not offered it. The sheet already hides four other lines that name a drop,
     but a placeholder is an attribute and no rule can reach it. */
  function paintPlaceholder() {
    var ta = $("makeText");
    if (!ta) return;
    ta.placeholder = touchPointer.matches
      ? "Paste some text or attach a file, then hit 'Make a PuttyPNG'"
      : "Type, paste, or drop in an attachment!";
  }

  /* THE BOX GROWS DOWNWARD ON A PHONE. A textarea will not size itself to its
     content, so the height is set from what the content needs.
     The floor and the ceiling live in styles.css, and this reads them back
     rather than repeating them, so there is one place to change a number.
     On a desktop the box keeps the fixed height its card gives it, and this
     does nothing. */
  function growMakeBox() {
    var ta = $("makeText");
    if (!ta) return;
    if (!touchPointer.matches) { ta.style.height = ""; return; }
    var cs = getComputedStyle(ta);
    var min = parseFloat(cs.minHeight) || 0;
    var max = parseFloat(cs.maxHeight) || Infinity;
    // Measured from zero, or the box can only ever get taller.
    ta.style.height = "0px";
    ta.style.height = Math.min(max, Math.max(min, ta.scrollHeight)) + "px";
  }

  /* WHICH STOP IS LIT. A pure function of the board: no timer runs the chain
     and nothing is stored about where it has got to, so it cannot get out of
     step with what is on screen. A tutorial written as a sequence of timers is
     a tutorial that ends up pointing at the wrong thing.

     The order matters. Done beats everything, an unsettled box beats the rest
     so the glow never flickers on a keystroke, and the view decides before the
     box contents do. */
  function stageFor() {
    if (glowDone) return "done";
    if (!glowSettled) return "idle";

    var grid = $("boardGrid");
    var view = grid ? grid.getAttribute("data-view") : "make";
    if (view === "made") return "copy";
    if (view === "loaded") return "done";
    // The glow points at what to do next, and during the show there is nothing
    // to do. Every light is out until the picture arrives.
    if (view === "making") return "idle";

    var ta = $("makeText");
    var has = (ta && ta.value.length > 0) || !!homeAttached;
    if (!glowTouched && !has) return "box";
    return has ? "make" : "idle";
  }

  /* Light the one stop the board is at, and put the other two out. */
  function paintGlow() {
    if (!$("makeBox")) return;
    var stage = stageFor();
    $("makeBox").classList.toggle("glow", stage === "box");
    var ic = document.querySelector(".act .ic");
    if (ic) ic.classList.toggle("glow", stage === "make");
    /* THE LAST STOP IS COPY, in the row under the picture on both shapes. A
       desktop's was a chip beside the disc until v2.24.0, while this button
       waited out of sight for a phone to move it. */
    var copy = $("cdCopy");
    if (copy) copy.classList.toggle("glow", stage === "copy");
  }

  /* A keystroke puts the chain out until the typing settles. The wait is
     longer than the meter's, so the glow is not the thing that flickers. */
  function noteGlowTyping() {
    glowTouched = true;
    glowSettled = false;
    paintGlow();
    clearTimeout(glowTimer);
    glowTimer = setTimeout(function () { glowSettled = true; paintGlow(); }, GLOW_SETTLE_MS);
  }

  /* THE VISIBLE WORD REPORTS THE STATE. Solid while the picture is solid, and
     the knob sits with it. The accessible name opens with the same word, which
     is what WCAG 2.5.3 asks for, then says what pressing will do. */
  function paintSolidWord() {
    var vis = $("solidBg"), word = $("solidWord");
    if (!vis || !word) return;
    var solid = vis.checked;
    word.textContent = solid ? "Solid" : "See-thru";
    vis.setAttribute("aria-label", solid
      ? "Solid. The picture has a white background. Uncheck to make it see-thru."
      : "See-thru. The picture has no background. Check to make it solid.");
  }

  /* THE NOTICE FOLLOWS THE PRESS THAT CAUSED IT. It is shown only once a
     see-thru PuttyPNG exists, and it goes the moment the switch goes back. */
  function paintTransNote() {
    var note = $("transNote");
    if (!note) return;
    note.hidden = backgroundIsSolid() || !homeDiscOut;
  }

  /* THE CORNER, WHICH IS ONE SLOT WITH TWO JOBS.
     It is derived from the same two facts as the reading under the heading:
     which screen this is, and whether the board is carrying anything. The two
     must never disagree, so they are painted together.
     On Make it says Clear, and it is not there at all while the board is
     empty: a screen with nothing on it must not offer a way to empty it.
     On Made it says Close. A desktop shows every region at once, so it has no
     screen to close, and the stylesheet keeps the whole control off there. */
  function paintCorner() {
    var btn = $("cornerBtn");
    if (!btn) return;
    var grid = $("boardGrid");
    var view = grid ? grid.getAttribute("data-view") : "make";
    var ta = $("makeText");
    var carrying = !!(ta && ta.value.length) || !!homeAttached;
    /* EVERY SCREEN IS NAMED, AND THERE IS NO ELSE. The show in the middle has
       no corner: it is a screen a person waits through rather than one they
       work on, and the skip control on the panel is its way out. Written as an
       else, the show took the loaded screen's job and offered to close a
       PuttyPNG nobody had opened. */
    var job = view === "make" ? (carrying ? "clear" : "")
            : view === "made" ? "close"
            : view === "loaded" ? "closeload" : "";

    /* THE CORNER BELONGS TO THE HEADING THAT IS ON SCREEN, and there is one of
       it. The loaded screen shows the Load heading, so the button moves there
       and comes back when the board does. It goes in front of the reading,
       which takes a row of its own below both of them. */
    var sayEl = $(view === "loaded" ? "loadSay" : "makeSay");
    if (sayEl && btn.nextElementSibling !== sayEl) {
      sayEl.parentElement.insertBefore(btn, sayEl);
    }

    btn.hidden = !job;
    /* Nothing to rewrite while the job is the same. This runs on every
       keystroke, and rebuilding the mark each time is work for no change. */
    if (!job || btn.dataset.job === job) return;
    btn.dataset.job = job;
    btn.innerHTML = '<span class="pill">' + homeIcon(D_X, 15) +
                    (job === "clear" ? "Clear" : "Close") + "</span>";
    btn.setAttribute("aria-label", job === "clear"
      ? "Clear the board"
      : job === "close"
        ? "Close this PuttyPNG and go back to Make"
        : "Close the PuttyPNG you opened and go back to Make");
  }

  /* CLOSE GOES BACK TO MAKE, AND THE WORDS ARE STILL THERE.
     Nothing clears the text box when a PuttyPNG is pressed, so what a person
     typed is still in it. Closing is a change of screen and not a loss, and on
     a desktop it is Load coming back into the right-hand cell.
     THE CARD IS EMPTIED INSIDE THE CHANGE THAT SHOWS IT GOING. A desktop fades
     from its picture of the page before to its picture after, and the browser
     takes the first picture a frame after it is asked. A card emptied before
     then is already empty in the picture it fades from, and it snaps. */
  function closeToMake() {
    setView("make", false, function () {
      tossDisc();
      paintMadeScreen();
    });
    focusCardHead();
  }

  /* THE CROSS GOES WITH ITS CARD ON A DESKTOP, so the focus it held goes to the
     heading over the cell, which names the card that took its place. Left on a
     button that has left the page, the next Tab starts at the top of the
     document. A phone's change of screen has focused its own heading already. */
  function focusCardHead() {
    if (touchPointer.matches) return;
    var head = $("headLoad");
    if (head) head.focus();
  }

  /* CLEAR EMPTIES THE BOARD AND LEAVES THE PERSON WHERE THEY ARE.
     It is a white control and not a red one: nothing here can be lost that
     was not the person's own to begin with. */
  /* refocus puts the caret back in the empty box, which is right when a
     person pressed Clear and wrong when an example is about to fill it: on a
     phone the focus opens the keyboard over the board they were looking at. */
  function clearBoard(refocus) {
    if (homeAttached) dropHomeAttachment();
    var ta = $("makeText");
    if (ta) { ta.value = ""; if (refocus) ta.focus(); }
    noteHomeInput();
    growMakeBox();
    updateHomeMeter(true);
    paintGlow();
    paintMakeSay(false);
  }

  /* WHAT MADE! SHOWS. Derived from two facts: which screen the board is on, and
     whether a disc is out. The row, the caption and the sign off arrive with the
     disc, on both shapes, and the way back at the foot is a phone's alone. */
  function paintMadeScreen() {
    paintTransNote();
    paintDiscEdit();
    var grid = $("boardGrid");
    var on = (grid ? grid.getAttribute("data-view") : "make") === "made" && homeDiscOut;
    ["discNote", "sendIt", "madeActs", "againRow"].forEach(function (id) {
      var el = $(id);
      if (el) el.hidden = !on;
    });
    paintDiscFacts();
  }

  /* THE TWO THINGS THAT ARE READ OFF THE PICTURE ITSELF. Both need the image
     to have loaded, because that is the only place its width is written down,
     so both are called from the one place that waits for it. */
  function paintDiscFacts() {
    paintDiscNote();
    paintSendNotes();
  }

  /* THE NOTES AND THEIR NUMBERS.
     Three notes can apply to one picture: a see-thru background, a picture
     over the size a chat app will recompress, and how to send it through
     Telegram, which applies to every picture. A lone note is "Note:" and a set
     is "Note 1:", "Note 2:" and on, because a Note 1 with nothing under it
     reads as a list with an item missing from it.
     Every number is cleared before any is written, so a note left on its own
     when another goes does not keep the number it had in the set. */
  function paintSendNotes() {
    var box = $("sendNotes"), big = $("bigNote"), cd = $("cd"), tg = $("tgNote");
    if (!box || !big || !cd || !tg) return;

    /* THIS ONE IS ABOUT THE FINISHED PICTURE, so it is measured off the
       picture. The warning under the Make button is about a picture that does
       not exist yet, which is a different sentence at a different moment. */
    big.hidden = !homeDiscOut || !cd.naturalWidth || cd.naturalWidth <= BIG_PASTE_PX;
    // Every picture can be compressed on the way, so this one comes with every disc.
    tg.hidden = !homeDiscOut;

    var all = [$("transNote"), big, tg];
    all.forEach(function (el) { numberNote(el, ""); });
    /* NUMBERED IN THE ORDER THEY STAND, read off the box and not off a list here,
       so a note placed out of turn is still Note 1 when it is the first a person
       reads. */
    var shown = Array.prototype.filter.call(box.children, function (el) {
      return all.indexOf(el) >= 0 && !el.hidden;
    });
    if (shown.length > 1) {
      shown.forEach(function (el, i) { numberNote(el, " " + (i + 1)); });
    }
    box.hidden = shown.length === 0;
  }

  // The number is a span of its own, so writing one never rewrites the word.
  function numberNote(el, text) {
    var n = el ? el.querySelector(".nno") : null;
    if (n) n.textContent = text;
  }

  /* WHAT THE PICTURE IS. The engine returns a data URL and a blob and no
     dimensions, so the width and the height are read off the image the board
     is already showing. One line of copy is not a reason to move puttypng.js. */
  function paintDiscNote() {
    var note = $("discNote"), cd = $("cd");
    if (!note || !cd) return;
    note.textContent = (cd.naturalWidth && homeLastBlob)
      ? cd.naturalWidth + " x " + cd.naturalHeight +
        " · " + homeFmt(homeLastBlob.size) + " on disk"
      : "";
  }

  /* PRESSING THE SWITCH RESTYLES THE PICTURE. IT DOES NOT THROW IT AWAY.
     The switch used to sit on the Make screen, where a press rarely had a
     finished picture to spoil, so emptying the window was enough. It stands in
     the picture's window on both shapes now, and a control that empties the
     window it stands in reads as a fault rather than a setting.
     The press restyles the picture that is out, pressing it again with this one
     setting changed. Nothing here waits on it: it is a promise, the button says
     it is working, and the disc arrives when it arrives.
     setView("made") inside it is a no-op while the board is already on Made!,
     so focus stays on the switch the person pressed. */
  function afterBackgroundChange() {
    paintSolidWord();
    paintMadeScreen();
    updateHomeMeter(true);
    if (homeDiscOut) pressHomeDisc(true);
  }

  /* THE READING UNDER A HEADING, AND THE ONLY THING THAT WRITES ONE.
     Two states, which are R5's: "quiet" while a person is working, and "ok"
     once something has finished, which is green and carries a tick.
     The tick is aria-hidden. The words beside it already say the same thing,
     and #loadSay is a live region, so a reader that announced both would say
     it twice in one breath.
     RULE: callers pass a string from SAY and nothing else. This writes HTML so
     the Made line can carry its peek button, and a string from anywhere else
     would be markup a person supplied. */
  function paintSay(line, kind, html) {
    if (!line) return;
    line.className = "say" + (kind === "ok" ? " ok" : "");
    line.innerHTML = (kind === "ok"
      ? '<span class="mark" aria-hidden="true">' + homeIcon(D_TICK, 15) + "</span>"
      : "") + "<span>" + html + "</span>";
  }

  /* WHAT THE MAKE COLUMN SAYS. Derived, like the glow: the board is read and
     the line follows, so it cannot report a state the board has left. */
  function paintMakeSay(over) {
    var line = $("makeSay");
    if (!line) return;
    // The corner reads the same two facts as the line and must never
    // disagree with it, so it is painted here and not on its own timer.
    paintCorner();
    var grid = $("boardGrid");
    var view = grid ? grid.getAttribute("data-view") : "make";
    /* A PHONE SAYS MADE! UNDER THIS HEADING, which is the heading its Made!
       screen shows. A desktop's Made! is a card with a heading of its own, and
       this line goes on talking about the next picture. */
    if (view === "made" && touchPointer.matches) {
      paintSay(line, "ok", SAY.made); wirePeekLink(); return;
    }
    if (over) { paintSay(line, "quiet", SAY.over); return; }
    if (homeAttached) { paintSay(line, "ok", homeAttachedSay); return; }
    var ta = $("makeText");
    paintSay(line, "quiet", (ta && ta.value.length) ? SAY.fits : SAY.empty);
  }

  /* WHAT THE HEADING OVER THE RIGHT-HAND CELL SAYS WHILE NOTHING IS BEING READ.
     It names the card in the cell, so it is painted whenever the card changes.
     A desktop's Made! card stands in that cell, so a desktop says the Made line
     here, and a phone says it under the Make heading.
     IT IS THE BOARD'S ONE LIVE REGION, so a sentence already on it is not
     written again: a screen reader reads a rewritten line out a second time.
     The show stands over the board and changes nothing under the dim, so the
     line is left as it is while the show runs. */
  function paintCardSay() {
    var line = $("loadSay"), grid = $("boardGrid");
    if (!line || !grid) return;
    var view = grid.getAttribute("data-view");
    if (view === "making") return;
    var made = view === "made" && !touchPointer.matches;
    var kind = made || view === "loaded" ? "ok" : "quiet";
    var html = made ? SAY.made : view === "loaded" ? SAY.loaded : SAY.loadIdle;
    var same = line.textContent === html.replace(/<[^>]*>/g, "") &&
               line.classList.contains("ok") === (kind === "ok");
    if (same) return;
    paintSay(line, kind, html);
    if (made) wirePeekLink();
  }

  /* THE CONTENTS PANEL. It decodes the finished PuttyPNG and shows what came
     back out. It does not repeat what was typed: the app already knows that,
     and showing it would prove nothing. Reading it back out of the picture is
     the only version of this that is evidence. */
  var peekLast = null;      // the text that came back, or null when a file did

  function wirePeekLink() {
    var link = $("peekOpen");
    if (link) link.addEventListener("click", openPeek);
  }

  async function openPeek() {
    var wrap = $("peekWrap");
    if (!wrap || !homeLastBlob) return;
    wrap.classList.remove("hidden");
    $("peekWhat").textContent = "Reading it back out of the picture...";
    $("peekBody").textContent = "";
    $("peekCopy").hidden = true;
    peekLast = null;
    $("peekClose").focus();
    try {
      var res = await PuttyPNG.decode(homeLastBlob);
      if (res.text != null) {
        peekLast = res.text;
        $("peekWhat").textContent = "This came back out of the picture, not out of the box you typed in.";
        $("peekBody").textContent = res.text;
        // Copy is offered only where there is text to copy. A file has none,
        // and a button that copies an empty string and says it worked is worse
        // than no button.
        $("peekCopy").hidden = false;
      } else {
        $("peekWhat").textContent = "It holds a file: " + (res.name || "a file") +
          ", " + homeFmt(res.bytes ? res.bytes.length : 0) + ".";
        $("peekBody").textContent = "";
      }
    } catch (err) {
      $("peekWhat").textContent = friendly(err);
    }
  }

  function closePeek() {
    var wrap = $("peekWrap");
    if (wrap) wrap.classList.add("hidden");
    var link = $("peekOpen");
    if (link) link.focus();
  }

  function wirePeek() {
    var wrap = $("peekWrap");
    if (!wrap) return;
    $("peekClose").addEventListener("click", closePeek);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) closePeek(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !wrap.classList.contains("hidden")) closePeek();
    });
    $("peekCopy").addEventListener("click", async function () {
      if (peekLast == null) return;          // the guard, not a courtesy
      try {
        await navigator.clipboard.writeText(peekLast);
        confirmDone(this, "Copied!");
      } catch (err) { toast("This browser would not let the page copy it.", "bad"); }
    });
  }

  function wireHomeMake() {
    $("makeText").addEventListener("input", function () {
      noteHomeInput(); updateHomeMeter(); growMakeBox(); noteGlowTyping();
      /* The corner is a control, not a reading. The reading is painted inside
         the meter's settle, which is right for a line that changes on every
         key, and too late for a button a person is looking for. */
      paintCorner();
    });

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

    /* ONE SETTING, TWO CONTROLS, AND NOW THEY AGREE. Until v2.6.11 the switch
       under the button said Transparent and the one in Advanced said Solid, so
       each had to invert the other. Both now say the same thing, so each
       assigns and the mirroring is half the code it was. */
    var vis = $("solidBg"), adv = $("optSolidBg");
    if (vis && adv) {
      vis.checked = adv.checked;
      vis.addEventListener("change", function () {
        adv.checked = vis.checked;
        afterBackgroundChange();
      });
      adv.addEventListener("change", function () {
        vis.checked = adv.checked;
        afterBackgroundChange();
      });
      paintSolidWord();
    }

    $("homeMakeBtn").addEventListener("click", function () { pressHomeDisc(false); });

    /* ONE LISTENER FOR ONE CONTROL. Which job it does is read off the button
       when it is pressed, so the two jobs cannot drift apart from the label
       paintCorner wrote on it. */
    $("cornerBtn").addEventListener("click", function () {
      if (this.dataset.job === "clear") clearBoard(true);
      else if (this.dataset.job === "closeload") clearHomeLoaded();
      else closeToMake();
    });
  }

  function wireHomeDisc() {
    /* 18px, where the board's other marks are 15 and 16. This one has to hold
       its own beside a bold label, and on a phone it sits on the picture
       window rather than on the page's white. The label's own size does not
       move: it is 12px in both pills. */
    $("discEdit").innerHTML = homeIcon(D_WRITE, 18) + $("discEdit").innerHTML;

    $("cdCopy").innerHTML = homeIcon(D_COPY, 13) + "<span>Copy</span>";
    $("cdSave").innerHTML = homeIcon(D_DOWN, 13) + "<span>Download</span>";

    /* THE LOADED SCREEN'S TWO CONTROLS. Copy Contents takes what the engine
       returned, not what is on screen: the box is read only from v2.9.1, so
       the two can never disagree, and reading the element back would have been
       reading our own rendering rather than the PuttyPNG.
       OK, done! and the corner's Close do the same job, offered at the top and
       at the bottom, and neither touches the Make box. */
    $("copyContents").innerHTML = homeIcon(D_COPY, 15) + "<span>Copy Contents</span>";
    $("doneBtn").innerHTML = homeIcon(D_TICK, 15) + "<span>OK, done!</span>";

    $("copyContents").addEventListener("click", async function () {
      if (homeLoadedText == null) return;      // the guard, not a courtesy
      try {
        await navigator.clipboard.writeText(homeLoadedText);
        confirmDone(this, "Copied!");
      } catch (err) {
        toast("This browser would not let the page copy it.", "bad");
      }
    });

    $("doneBtn").addEventListener("click", clearHomeLoaded);

    /* ONE LISTENER EACH, WHATEVER ASKED. The answer is read back off
       askPending rather than decided here, so a third thing that learns to ask
       needs no change to either button. */
    $("plainYes").addEventListener("click", function () {
      var go = askPending;
      closePlainAsk();
      if (go) go();
    });

    $("plainNo").addEventListener("click", function () {
      closePlainAsk();
      var ta = $("makeText");
      if (ta) ta.focus();
    });

    /* ESCAPE CLOSES A NATIVE DIALOG WITHOUT ASKING THE PAGE, so the answer it
       was holding has to be dropped here rather than in the Cancel button.
       Otherwise the next question would carry the last one's Yes.

       THE GUARD IS NOT DECORATION. A dialog's close event is queued, not fired
       on the spot, so one closed and reopened in quick succession delivers the
       first close after the second question is already up. Without the guard
       that wiped the new answer and Yes did nothing, which showed up as a
       probe that failed about one run in two. */
    $("plainAsk").addEventListener("close", function () {
      if (!$("plainAsk").open) askPending = null;
    });

    $("bigWarnX").addEventListener("click", function () {
      bigWarnClosed = true;
      paintBigWarn();
    });

    // Made!'s two marks are drawn once: neither changes.
    $("sendItMark").innerHTML = homeIcon(D_PLANE, 18);
    $("againBtn").innerHTML = homeIcon(D_AGAIN, 16) + "<span>Make another one!</span>";
    // The same action the corner's Close does, offered again at the bottom so
    // a person who has scrolled does not have to scroll back up to leave.
    $("againBtn").addEventListener("click", closeToMake);

    /* A DESKTOP CLOSES MADE! WITH THE CROSS LOADED! WEARS. It is the same
       generated button on the card's corner, so the right-hand cell closes the
       same way whichever card is up, and it does what a phone's Close does. The
       stylesheet keeps it off a phone, which has the heading's corner. */
    var deck = document.querySelector(".deckrow");
    if (deck) {
      var madeX = makeXButton("Close this PuttyPNG");
      madeX.addEventListener("click", closeToMake);
      deck.appendChild(madeX);
    }

    /* THE LAST STOP. Copy is what leads somewhere, a message to a friend, so it
       is the one that ends the chain. Download leads to a folder and never
       glows: two lit controls side by side is a pair of distractions, not a
       chain. The latch holds for the session and starts again on a reload. */
    $("cdCopy").addEventListener("click", function () {
      glowDone = true; paintGlow();
      copyHomeDisc(this, "Copied!");
    });
    $("cdSave").addEventListener("click", function () { saveHomeDisc(this); });
  }

  /* ------------------------------------------------------------------------
     THE TITLE EDITOR
     Drafts preview separately. Saving re-encodes the finished disc's payload
     and options, so changing the label cannot replace its contents.
     ------------------------------------------------------------------------ */

  function titleDraftWords(draft) {
    return draft.text.trim().replace(/\s+/g, " ");
  }

  function titleEditorSize() {
    var dialog = $("titleDialog");
    if (!dialog || !dialog.open) return;
    var viewport = window.visualViewport;
    var height = viewport ? viewport.height : window.innerHeight;
    var inset = viewport ? Math.max(0, window.innerHeight - height - viewport.offsetTop) : 0;
    dialog.style.setProperty("--title-height", Math.max(160, height - 16) + "px");
    dialog.style.setProperty("--title-keyboard-inset", inset + "px");
  }

  function openTitleEditor() {
    if (!homeMade || !homeDiscOut || homePressing || homeTitleSaving) return;
    var text = homeMade.customText || homeMade.opts.label.trim() || pickDiscSaying(!!homeMade.opts.password, null, homeMade.category);
    homeTitleDraft = { text: text, made: homeMade };
    paintTitleDraft(true);
    $("titleDialog").showModal();
    titleEditorSize();
    if (touchPointer.matches) $("titleHeading").focus();
    else { $("titleInput").focus(); $("titleInput").select(); }
  }

  /* THE ONE SENTENCE SAYS WHICHEVER THING MATTERS. A title is drawn on the
     outside of the disc, so on a protected one it is readable without the
     password. That is worth saying and it is worth saying instead of the
     ordinary line, not beside it. */
  function paintTitleDraft(fillInput) {
    var draft = homeTitleDraft;
    if (!draft) return;
    var input = $("titleInput"), locked = !!draft.made.opts.password;
    var words = titleDraftWords(draft);
    if (fillInput) input.value = draft.text;
    $("titleHelp").textContent = locked
      ? "These words show on the disc without the password."
      : "Write the words that go on the outside of your disc.";
    /* THE FIELD'S maxlength IS NOT THE WHOLE GUARD. It stops a longer title
        being typed or pasted and does nothing about one set in code, so the
        length is checked here as well as declared there. */
    var tooLong = draft.text.length > DISC_TITLE_MAX;
    var invalid = !words || tooLong;
    $("titleError").hidden = !invalid;
    $("titleError").textContent = tooLong
      ? "Keep the title to " + DISC_TITLE_MAX + " characters."
      : invalid ? "Enter a title." : "";
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
    $("titleSave").disabled = invalid || homeTitleSaving;
    $("titleInput").disabled = homeTitleSaving;
    $("titleCount").textContent = draft.text.length + " / " + DISC_TITLE_MAX;
  }

  async function saveDiscTitle(event) {
    event.preventDefault();
    var draft = homeTitleDraft;
    if (!draft || homeTitleSaving || homePressing) return;
    var words = titleDraftWords(draft);
    if (!words || draft.text.length > DISC_TITLE_MAX) { paintTitleDraft(false); return; }
    var made = draft.made;
    var opts = Object.assign({}, made.opts, { label: words });
    homeTitleSaving = true;
    $("homeMakeBtn").disabled = true;
    $("titleSave").textContent = "Saving...";
    paintDiscEdit();
    paintTitleDraft(false);
    try {
      await ensureDiscFonts();
      var png = await PuttyPNG.encode(made.input, opts);
      // Decode the image surface before replacing the blob and its visible preview.
      var image = new Image();
      image.src = png.dataUrl;
      await image.decode();
      if (homeTitleDraft !== draft || homeMade !== made || !homeDiscOut) return;
      homeLastBlob = png.blob;
      homeMade.opts = opts;
      homeMade.customText = draft.text.trim().replace(/\s+/g, " ");
      homeLabelLocked = !!opts.password;
      homeEditedLabel = homeMade.customText;
      $("optLabel").value = homeEditedLabel;
      $("optLabelOn").checked = true;
      $("cd").src = png.dataUrl;
      paintDiscNote();
      closeTitleEditor();
      toast("Title saved. Your contents are unchanged.", "ok");
    } catch (err) {
      if (homeTitleDraft === draft) {
        $("titleError").textContent = "The title was not saved. " + friendly(err);
        $("titleError").hidden = false;
      }
    } finally {
      homeTitleSaving = false;
      $("homeMakeBtn").disabled = false;
      $("titleSave").textContent = "Save title";
      paintDiscEdit();
      if (homeTitleDraft === draft) {
        $("titleInput").disabled = false;
        $("titleSave").disabled = false;
      }
    }
  }

  function closeTitleEditor() {
    homeTitleDraft = null;
    if ($("titleDialog").open) $("titleDialog").close();
  }

  function wireTitleEditor() {
    var dialog = $("titleDialog");
    $("discEdit").addEventListener("click", openTitleEditor);
    $("titleInput").addEventListener("input", function () {
      if (!homeTitleDraft) return;
      homeTitleDraft.text = this.value;
      paintTitleDraft(false);
    });
    $("titleForm").addEventListener("submit", saveDiscTitle);
    $("titleClose").addEventListener("click", closeTitleEditor);
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); closeTitleEditor(); });
    dialog.addEventListener("close", function () {
      if (dialog.open) return;
      closeTitleEditor();
      if (homeDiscOut) $("discEdit").focus({ preventScroll: true });
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") return;
      var fields = Array.from(dialog.querySelectorAll("button:not(:disabled), textarea:not(:disabled), input:not(:disabled)"));
      var first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $("titleHeading"))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    dialog.addEventListener("dragover", function (event) { event.preventDefault(); event.stopPropagation(); });
    dialog.addEventListener("drop", function (event) { event.preventDefault(); event.stopPropagation(); });
    $("optLabel").addEventListener("input", function () {
      homeEditedLabel = null;
      homeLabelLocked = !!$("optPassword").value;
    });
    window.addEventListener("resize", titleEditorSize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", titleEditorSize);
      window.visualViewport.addEventListener("scroll", titleEditorSize);
    }
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

    /* A PUTTYPNG DROPPED ON MADE! IS READ THE WAY ONE DROPPED ON LOAD IS. Made!
       stands in Load's cell on a desktop, and a drop there would land on nothing
       else. The read asks before it replaces the picture that is out. */
    var deck = document.querySelector(".deckrow");
    if (deck) {
      ["dragenter", "dragover"].forEach(function (n) {
        deck.addEventListener(n, function (e) {
          e.preventDefault(); e.stopPropagation();
          deck.classList.add("over");
        });
      });
      deck.addEventListener("dragleave", function (e) {
        if (!deck.contains(e.relatedTarget)) deck.classList.remove("over");
      });
      deck.addEventListener("drop", function (e) {
        e.preventDefault(); e.stopPropagation();
        deck.classList.remove("over");
        readHomeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });
    }

    $("openBtn").addEventListener("click", function () { $("openIn").click(); });
    $("openIn").addEventListener("change", function () {
      readHomeFile(this.files[0]);
      this.value = "";
    });

    /* A page cannot fake a paste, so asking for the clipboard needs the
       permission API and is not offered by every browser. The other way is
       always there: on a mouse Ctrl+V lands on the invisible field over the
       zone, and on a phone a long press on the box offers Paste, which the
       box takes from v2.10.1. The advice names whichever the person has. */
    $("pasteBtn").addEventListener("click", async function () {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        toast("This browser will not hand a page the clipboard. " + howToPaste(), "bad");
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
        toast(SAY.noPaste, "bad");
      } catch (err) {
        toast("The clipboard was not shared. " + howToPaste(), "bad");
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
      opts.solidBackground = document.getElementById("optSolidBg").checked;
      var imprintFile = document.getElementById("optImprint").files;
      if (imprintFile && imprintFile[0]) opts.imprint = imprintFile[0];

      /* THE THREE LINES ARE READ THE SAME WAY, because on the disc they are
         the same thing: words on an arc with a style. Sizes are points read
         against a 256px disc and scaled from there. */
      readDiscLine("Label", "label", opts);
      readDiscLine("Rim", "rimText", opts);
      readDiscLine("Info", "infoText", opts);

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
  // Take a dropped file as the thing to hide. Hiding needs the Make column,
  // and only the board has one, so anywhere else this is said plainly rather
  // than silently doing nothing.
  function attachDropped(file) {
    if (!onBoardPage()) {
      toast("That is not a PuttyPNG. Hide a file on the PuttyPNG page.", "bad");
      return;
    }
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


  /* EVERY READ ENDS HERE, AND THIS DECIDES WHERE IT SHOWS. The board has a
     Load column. The How it works page has one small result block instead.
     A page carries exactly one of the two, so the page picks the display and
     no caller has to know which page it is on. */
  async function readSource(source) {
    if ($("zone")) {
      await readHomeFile(source);
      if ($("zone").classList.contains("has")) maybeCelebrate("read");
      return;
    }
    await readBoundedFile(source);
  }

  /* THE SMALL READER, on the How it works page. It shows what came out beside
     the code that would get you the same thing, which is the whole point of
     that page. It shares no markup with the board. */
  async function readBoundedFile(file) {
    var out = $("zoneResult");
    if (!out || !file) return;

    function say(html, kind) {
      out.className = "zone-result " + (kind || "");
      out.innerHTML = html;
    }

    if (!/png/i.test(file.type) && !/\.png$/i.test(file.name || "")) {
      say("<strong>" + safe(file.name || "That file") + "</strong> is not a PNG. " +
          "A PuttyPNG has to stay a PNG.", "bad");
      return;
    }

    say("Reading " + safe(file.name || "the file") + "...");
    try {
      var res = await PuttyPNG.decode(file);
      // The engine returns name, not filename. The board words a missing name
      // as "a file", so both pages describe one PuttyPNG the same way.
      var body = res.type === "binary"
        ? "<p class=\"small\">It holds a file: <strong>" + safe(res.name || "a file") +
          "</strong>, " + homeFmt(res.bytes ? res.bytes.length : 0) + ".</p>"
        : "<pre class=\"zone-text\">" + safe(String(res.text || "").slice(0, 600)) + "</pre>";
      say("<p class=\"small\"><strong>" + safe(file.name || "pasted.png") +
          "</strong> opened. " + (res.encrypted ? "It was encrypted. " : "") + "</p>" + body, "ok");
      maybeCelebrate("read");
    } catch (err) {
      say("<p class=\"small\"><strong>" + safe(file.name || "That PNG") + "</strong> did not open. " +
          safe(friendly(err)) + "</p>", "bad");
    }
  }

  // Text from a decoded file is somebody else's text. It is put on the page as
  // text, never as markup.
  function safe(v) {
    return String(v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }



  /* ==========================================================================
     THE HOME BOARD - THE METER
     A donut that fills clockwise as data is added. Each finished rung keeps
     its own ring, pushed inward by the one after it, so the picture is a
     record of the climb rather than a single bar.
     ========================================================================== */

  /* THE SQUEEZE, AND THE PICTURE. Each rung gives the donut a larger share of
     the card, and the button gives that width up. The disc grows with it. Both
     are turned into pixels from the MEASURED card, because the action bar and
     the picture's window are different widths and a per cent would resolve
     differently in each of them.

     The two are written apart. The donut shares a row with a button that holds
     words, and the disc has a window to itself, so each reads its own tuning. */
  // True once the sizes have been written at least once. The first write
  // happens on arrival and must not animate. See setBoardSizes.
  var boardSized = false;

  /* HOW WIDE A PHONE DRAWS A PICTURE OF THIS SIDE, in a window with this much
     room in it.
     TRUE SIZE AT THE FLOOR, THE WHOLE WINDOW AT THE PASTE LIMIT. A 256px
     PuttyPNG is drawn at 256px, which is the size it really is and the
     smallest the board makes, so the smallest picture looks like the small
     thing it is. From there the drawing grows with the picture, and by the
     time the picture reaches the size a chat app would recompress it at, it
     fills the window. Past that it stays filled: a picture already too large
     to paste has nothing left to say by growing further.
     Both ends are read from where they are named, so neither can move on one
     side only, and the room is the ceiling for a screen too narrow to hold
     even the floor. */
  function phoneDiscSize(side, room) {
    var from = RUNGS[0].px;
    var to = BIG_PASTE_PX;
    var t = Math.max(0, Math.min(1, (side - from) / (to - from)));
    return Math.min(room, Math.round(from + t * (room - from)));
  }

  /* WHICH RUNG A PICTURE OF THIS SIDE STANDS ON: the smallest disc as wide as
     it. A picture in the window takes its share from the rung it was pressed on,
     and not from the rung the Make box has reached since. */
  function rungOfSide(side) {
    for (var i = 0; i < RUNGS.length; i++) {
      if (side <= RUNGS[i].px) return i;
    }
    return RUNGS.length - 1;
  }

  function setBoardSizes(k) {
    homeShownRung = Math.min(k, RUNGS.length - 1);
    var col = document.querySelector(".col.make");
    if (!col) return;
    var pad = parseFloat(getComputedStyle(col).paddingLeft) || 0;
    var inner = col.clientWidth - pad * 2;
    if (inner <= 0) return;

    var t = METER_TUNING[touchPointer.matches ? "touch" : "wide"];
    var meter = Math.min(t.max, Math.max(t.min, Math.round(inner * t.share[homeShownRung])));

    /* THE MAKE CARD IS MEASURED, NOT THE MADE! CARD. The two are the same width
       on both shapes, and the Make card is on screen whenever the next picture's
       size can change. */
    var slot;
    var colW = col.getBoundingClientRect().width || inner + pad * 2;
    /* THE PICTURE IN THE WINDOW DECIDES ITS OWN SIZE ONCE IT HAS LOADED. Until
       then the size is the plan for what the Make box holds, which is what the
       next press makes. A desktop's Make box can hold the next note while Made!
       still shows the last picture, and that picture must not grow and shrink
       with the typing beside it. */
    var side = homeDiscSide || homeTrueSide || RUNGS[homeShownRung].px;
    if (touchPointer.matches) {
      /* THE PICTURE'S OWN SIZE DECIDES IT, not the rung. A rung is a band, and
         the whole of the smallest band is drawn at one size on a phone: the
         difference between 200 and 65,000 bytes is what the meter is for.
         What a person needs from the picture is whether it is small enough to
         paste, and that is what the ramp draws.
         The card is what is measured, not the window, because the two are
         never on screen at once on a phone and they are the same width. */
      var room = Math.max(0, Math.round(colW) - 2 - DISC_GUTTER_PX * 2);
      slot = phoneDiscSize(side, room);
    } else {
      /* THE TRUE PICTURE WINS OVER THE RUNG. The rung is a band, and a disc
         drawn at the band's top would be wider than the file really is. The
         rung is the fallback for the first paint, before anything has been
         measured.
         THE WINDOW'S ROOM IS THE CEILING. The Made! card has the Make card's
         frame, so its window is the card's inside less its own edge, and the
         gutter a phone leaves is left here too. */
      var rung = homeDiscSide ? rungOfSide(homeDiscSide) : homeShownRung;
      var roomW = Math.max(0, Math.round(inner) - 2 - DISC_GUTTER_PX * 2);
      slot = Math.round(Math.min(side, colW * DISC_TUNING.wide[rung], roomW));
    }

    // Both tokens are set on the root, because that is where every rule that
    // reads them resolves. Setting them on the column would leave Made!'s
    // window behind.
    var root = document.documentElement.style;

    /* THE FIRST WRITE MUST NOT ANIMATE. The stylesheet has to declare some
       value for --meter-col before script runs, and it declares the desktop's.
       A phone therefore paints a 116px donut, gets told 60px here, and the
       action bar transitions between the two over 520ms while a person is
       reading the screen for the first time.
       Suppressing the transition for this one write turns that slide into a
       single frame nobody sees. Later writes still animate, because a donut
       growing as the disc fills is the thing the animation is for.
       The read of offsetWidth is what forces the change to apply while the
       transition is still off. Without it both writes are one style pass and
       the animation runs anyway. */
    var bar = document.querySelector(".actbar");
    var first = bar && !boardSized;
    if (first) bar.style.transition = "none";

    root.setProperty("--meter-col", meter + "px");
    root.setProperty("--slot-w", slot + "px");

    if (first) {
      void bar.offsetWidth;
      bar.style.transition = "";
      boardSized = true;
    }
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

  /* WHAT A PRESS WOULD HAND THE ENGINE. One place, because the meter asks the
     engine how big the picture will be and the press then makes it: if the two
     read the board differently, the warning describes a disc nobody gets. */
  function currentHomeInput() {
    return homeAttached ? homeAttached.bytes : ($("makeText").value || "(empty)");
  }

  /* THE WARNING UNDER THE MAKE BUTTON. Past 512 pixels a chat app recompresses
     the picture and the data stops reading back, so this is about correctness
     and not about taste. It is derived, like everything else on this board:
     nothing remembers whether it is showing, so it cannot report a state the
     board has left. The cross is the one piece of memory, and it lasts the
     visit. */
  function paintBigWarn() {
    var el = $("bigWarn");
    if (!el) return;
    // It closes itself when the picture comes back under the limit, which is
    // the answer to the warning rather than a dismissal of it. The cross is a
    // dismissal and lasts the visit: somebody who has read it once and chosen
    // to send the file should not be told again on every keystroke.
    el.hidden = bigWarnClosed || homeTrueSide <= BIG_PASTE_PX;

    /* IT DESCRIBES THE BUTTON RATHER THAN ANNOUNCING ITSELF. `#loadSay` is the
       board's one live region, and a second one lets two voices talk over each
       other. Hung on the Make button instead, a screen reader reads the warning
       at the moment somebody focuses the control it is about, which is later
       than a live region would say it and better placed. */
    var btn = $("homeMakeBtn");
    if (!btn) return;
    if (el.hidden) btn.removeAttribute("aria-describedby");
    else btn.setAttribute("aria-describedby", "bigWarnText");
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

      /* HOW BIG THE PICTURE WILL REALLY BE. Asked of the engine, which owns
         the arithmetic, and with the drawer's own settings so a change to the
         depth or the background moves the answer. A failure here must not
         stop the meter: the rung is what the ring is drawn from, and the true
         size only decides the window's width and the warning. */
      try {
        var plan = await PuttyPNG.planSize(currentHomeInput(), gatherOptions());
        if (token !== homeRunToken) return;
        homeTrueSide = plan.side;
      } catch (e) {
        homeTrueSide = 0;
      }
      paintBigWarn();

      var k = rungFor(packed);
      var over = k >= RUNGS.length;
      var cap = capOf(over ? RUNGS.length - 1 : k);
      var floor = k === 0 ? 0 : capOf(k - 1);
      var frac = over ? 1 : Math.max(0, Math.min(1, (packed - floor) / (cap - floor)));

      // Gaining a rung is a big enough moment to wash the ring, even when the
      // few bytes that did it were far too small to notice on their own.
      if (!force && k > homeLastRung) flashRing();
      homeLastRung = k;
      setBoardSizes(k);

      paintMakeSay(over);
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
      // The word is a span of its own because a phone drops it: styles.css
      // hides it in the touch block, so the label never breaks a line there.
      var used = document.createElement("span");
      used.className = "used";
      used.textContent = "used ";
      of.appendChild(used);
      of.appendChild(document.createTextNode("of " + homeFmt(total) + (over ? " max" : "")));
      $("usage").appendChild(of);
      $("rungNo").textContent = over ? "(past the 2048 disc)" : "(" + RUNGS[k].px + " disc)";

      $("homeMakeBtn").disabled = over;
    }, force ? 0 : HOME_SETTLE_MS);
  }

  /* WHAT COUNTS AS LARGE. The raw byte change is known on the keystroke, long
     before the compression finishes, so a big paste can wash the ring on the
     same frame rather than a tenth of a second later. */
  function noteHomeInput() {
    /* THE PICTURE THAT IS OUT STAYS. Make is the next picture and Made! is the
       last one, and a person can see which is which: on a desktop the two stand
       side by side, and a phone's Make screen never has one out. It was thrown
       away on the first letter typed until v2.24.0, because the tray sat under
       the box it was pressed from and read as that box's picture. */
    // A different PuttyPNG deserves its own saying, and its own title.
    homeSaying = null;
    homeExampleTitle = null;
    if (homeEditedLabel !== null && $("optLabel").value === homeEditedLabel) $("optLabel").value = "";
    homeEditedLabel = null;
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
    // An attachment counts as something to press, so taking one off can put
    // the chain back to the empty box.
    paintGlow();
    paintMakeSay(false);
  }

  async function takeHomeAttachment(f, sayWhat) {
    if (!f) return;
    homeAttachedSay = sayWhat || SAY.attached;
    homeAttached = {
      name: f.name,
      mime: f.type || "application/octet-stream",
      bytes: new Uint8Array(await f.arrayBuffer())
    };
    showHomeAttachment();
    noteHomeInput();
    updateHomeMeter();
    // A file is something to press, so the chain moves to the Make button
    // without a key ever being struck.
    glowTouched = true;
    paintGlow();
    paintMakeSay(false);
  }

  /* ==========================================================================
     THE HOME BOARD - THE EXAMPLES
     An example is not a special kind of content. A text example takes the
     path a paste takes and a file example takes the path a drop takes, so the
     board cannot treat one differently from the thing it stands for.
     ========================================================================== */

  /* A TEXT EXAMPLE FILLS THE BOX. Every call below is one the input listener
     already makes on a keystroke, in the same order. The one it does not make
     is noteGlowTyping(), which starts the wait for a person to stop typing,
     and nobody is typing. */
  function applyTextExample(ex) {
    var ta = $("makeText");
    if (!ta) return;
    ta.value = ex.body;
    // A whole book leaves the view at the end of it. The title is the line
    // that says what a person is looking at, so the box goes back to the top.
    ta.scrollTop = 0;
    noteHomeInput();
    growMakeBox();
    /* FORCED, BECAUSE THE CONTENT ARRIVED WHOLE. The settle wait exists to
       stop the meter redrawing on every keystroke, and there were no
       keystrokes. Clear does the same for the same reason, and the disc is
       pressed straight after this, so the slot has to be the right size
       before it arrives rather than a tenth of a second later. */
    updateHomeMeter(true);
    glowTouched = true;
    paintGlow();
  }

  /* A FILE EXAMPLE ATTACHES. takeHomeAttachment reads the bytes, shows the
     file card, disables the box, moves the glow and paints the reading, so
     there is nothing to do here but build the file. The board was emptied
     before this ran, so there is no note underneath to protect. */
  function applyFileExample(ex) {
    var file = new File([ex.body], ex.name, { type: ex.mime });
    return takeHomeAttachment(file, ex.say);
  }

  /* WHAT THE SLOT SAYS AFTER A PICK. A tick and a short name for four seconds,
     then back to offering, so the control always ends up looking like
     something a person can use again. The words belong to the first option
     because that is the row the closed slot shows; writing them there keeps
     the whole control a real dropdown, which is what gives a phone its own
     picker and a keyboard its own behaviour. */
  var EG_FLASH_MS = 4000;
  var EG_OFFER = "Examples";

  /* THE SHORT NAME THE TICK SHOWS. The list rows carry a title and a size
     because a person is choosing between them; the tick has one job, which is
     to say that the thing they chose went in. */
  var EG_SHORT = { tom: "Tom Sawyer", cal: "Calendar" };

  function flashExamplePick(shortName) {
    var slot = $("egLabel");
    if (!slot) return;
    clearTimeout(egFlashTimer);
    slot.textContent = "✓ " + shortName;
    egFlashTimer = setTimeout(function () { slot.textContent = EG_OFFER; }, EG_FLASH_MS);
  }

  /* PUT AN EXAMPLE ON THE BOARD. It does not press the disc: a person presses
     Make when they are ready, the way they would with anything they typed.

     IT REPLACES WHAT IS THERE. The board is emptied first, the note and any
     attached file together, so an example never lands on top of something. */
  async function pickExample(kind) {
    if (homePressing) return;
    try {
      var all = await ensureExamples();
      var ex = randomOfKind(all, kind);
      if (!ex) return;
      clearBoard();
      if (ex.kind === "file") await applyFileExample(ex);
      else applyTextExample(ex);
      // After the example is on: putting it there went through noteHomeInput,
      // which forgets any title, and this is the title for what is there now.
      homeExampleTitle = ex.title || null;
      /* THE METER IS TOLD AT ONCE, WHICHEVER PATH RAN. The settle wait exists
         so the meter does not redraw on every keystroke, and an example is not
         typed. The attach path waits by default, so without this the rung and
         the label still described whatever was on the board before. */
      updateHomeMeter(true);
      toast(ex.say, "ok");
      paintMakeSay(false);
      flashExamplePick(EG_SHORT[ex.id] || ex.name);
    } catch (err) {
      toast(SAY.examplesFailed, "bad");
    }
  }

  /* ANYTHING AT ALL ON THE BOARD MEANS ASKING FIRST, and asking every time.
     One rule reads more clearly than a rule that knows which cases could lose
     work, and the panel is the board's own. A cancelled question loads
     nothing and leaves the slot offering. */
  function offerExample(kind) {
    var ta = $("makeText");
    var carrying = !!homeAttached || !!(ta && ta.value.length);
    if (!carrying) return pickExample(kind);
    askHome({ title: SAY.egTitle, body: SAY.egAsk, yes: SAY.egYes },
      function () { pickExample(kind); });
  }

  /* ==========================================================================
     THE INTERLUDE - THE SHOW BETWEEN MAKE AND MADE

     What a person handed over breaks apart, is drawn into the middle, and a
     disc forms over the light before the whole lot is swallowed. It answers
     nothing and it proves nothing. It is here to show what pressing the button
     does, which is the one thing about this site a person cannot see.

     IT HANGS ON ONE SEAM. playInterlude() returns a promise and the press waits
     on it. With no stage, with animations off, or for a person who has asked
     never to see it again, that promise is already resolved and the press runs
     exactly as it ran before there was a show. That is the whole of the
     contract: another show replaces INTERLUDE, and deleting this block and its
     region leaves the board working.

     THE STAGE IS FOUR MEMBERS AND NOTHING ELSE KNOWS WHAT IS IN THEM. ms is how
     long the show runs once it is moving, build() lays it out standing still,
     start() sets it moving, and clear() takes it off again. The seam decides
     when each is called; the timeline inside them is the stage's own business.
     THE SEAM ALSO DECIDES THE SHARE. build() and start() are handed the share
     of ms this show gets, and the seam's clock runs out at that share, so a
     show that replaces this one has only to spend what it is given.
     ========================================================================== */

  var ilTimers = [];       // every timer the show owns, so skipping cancels all
  var ilResolve = null;    // what the press is waiting on
  var ilRunning = false;
  var ilRun = 0;           // which show this is, so a late step of an old one stops
  var ilOver = false;      // its time is up, and it is only waiting to be taken down

  function ilLater(fn, ms) { ilTimers.push(setTimeout(fn, ms)); }

  function ilStopTimers() {
    for (var i = 0; i < ilTimers.length; i++) clearTimeout(ilTimers[i]);
    ilTimers = [];
  }

  /* Whether there is a show at all. Two things have to agree: the person's own
     choice, and the movement setting, because this is movement and nothing but,
     so animations off takes it with everything else. */
  function interludeOn() {
    return interludeShow && animationsOn;
  }

  /* SEEN ONCE IN THIS VISIT. sessionStorage lasts as long as the tab: across a
     reload and the other four pages, and a new visit starts with the whole show
     again. A browser that refuses storage keeps the answer for this page.
     A SHOW IS SEEN WHEN IT HAS PLAYED ITS WHOLE TIME. One skipped part way
     through was not watched, so the next one is still the whole show. */
  var ilSeenHere = false;

  function interludeSeen() {
    try { return ilSeenHere || sessionStorage.getItem(IL_SEEN_KEY) === "1"; }
    catch (err) { return ilSeenHere; }
  }

  function markInterludeSeen() {
    ilSeenHere = true;
    try { sessionStorage.setItem(IL_SEEN_KEY, "1"); }
    catch (err) { /* this page still remembers it */ }
  }

  // How much of its whole time the next show gets.
  function interludeShare() {
    return interludeSeen() ? IL_AGAIN_SHARE : 1;
  }

  /* EVERY LENGTH IN THE SHOW, AT A SHARE OF ITS WHOLE TIME. One share scales
     them all together, so the last letter still lands before the pull, and the
     colour turn and the glint still end as the pull begins. */
  function ilLengths(share) {
    return { fall: IL_FALL_MS * share, suckAt: IL_SUCK_AT_MS * share,
             suck: IL_SUCK_MS * share, flare: IL_FLARE_MS * share,
             discAt: IL_DISC_AT_MS * share, disc: IL_DISC_MS * share };
  }

  /* ONE BIT, TWO CONTROLS, AND THEY CANNOT DRIFT. The switch in Advanced says
     whether there is a show. The box on the panel says whether to always skip
     one, which is the same bit read the other way round. Both go through here,
     and nothing else writes the preference.
     THE PANEL'S BOX NEEDS THE SWITCH IN ADVANCED TO EXIST. Ticking it turns off
     the screen it is on, so without a second place to untick it the only way
     back would be clearing the site's data. */
  function setInterludePref(on) {
    interludeShow = !!on;
    writePref("interlude", interludeShow);
    paintInterludePref();
  }

  function paintInterludePref() {
    var sw = $("optInterlude"), box = $("ilAlways");
    if (sw) sw.checked = interludeShow;
    if (box) box.checked = !interludeShow;
  }

  /* WHAT BREAKS APART IS WHAT WAS IN VIEW, LAID OUT AS IT WAS SEEN.
     Measured on the Make screen before the change to the show begins, because
     on a phone the box stops being on the page the moment that change runs.

     A source is the box's own size, how its edge looked, the card an attached
     file sits on, and the pieces. Every piece carries its place, measured from
     the box's top left corner, what it draws, and how it is written. */
  function interludeSource() {
    var box = $("makeBox");
    if (!box) return null;
    var boxRect = box.getBoundingClientRect();
    var source = { w: boxRect.width, h: boxRect.height, look: "", card: null,
                   pieces: [], wrapHeight: 0 };
    if (homeAttached) ilMeasureFileRow(source, boxRect);
    else ilMeasureText(source, $("makeText"), boxRect);
    return source;
  }

  // How a box's edge looked, read off the page so its copy is drawn the same.
  function ilEdgeLook(cs) {
    return "border:" + cs.borderTopWidth + " " + cs.borderTopStyle + " " +
           cs.borderTopColor + ";border-radius:" + cs.borderTopLeftRadius +
           ";background-color:" + cs.backgroundColor + ";box-shadow:" + cs.boxShadow + ";";
  }

  // How a piece of writing looked, read off the page.
  function ilTextLook(cs, colour) {
    return "font-family:" + cs.fontFamily + ";font-size:" + cs.fontSize +
           ";font-weight:" + cs.fontWeight + ";font-style:" + cs.fontStyle +
           ";letter-spacing:" + cs.letterSpacing + ";color:" + (colour || cs.color) + ";";
  }

  /* ONE ENTRY FOR EACH LETTER A PERSON WOULD COUNT. A flag or an accented letter
     built from several code points is one piece, not several pieces of one. */
  function ilGraphemes(text) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
                        function (s) { return { text: s.segment, index: s.index }; });
    }
    var out = [], at = 0;
    Array.from(text).forEach(function (ch) { out.push({ text: ch, index: at }); at += ch.length; });
    return out;
  }

  /* THE BOX CANNOT SAY WHERE ITS LETTERS ARE, SO A COPY OF IT DOES.
     A text box tells a page how far it has scrolled and how tall it is, and
     nothing about the lines inside it. An invisible copy with every style that
     decides a line break, the same text and the same width breaks its lines in
     the same places, and a range over its text says where each letter sits.
     wrapHeight is kept so a probe can hold the copy's height to the box's own.

     IN VIEW MEANS IN THE BOX'S WINDOW AND ON THE SCREEN. A long note scrolled
     inside the box, or a box partly scrolled off the top of a phone, shows only
     part of itself, and only that part comes across. */
  function ilMeasureText(source, ta, boxRect) {
    var cs = getComputedStyle(ta);
    var typed = ta.value;
    var shown = typed.length ? typed : (ta.placeholder || "");
    source.look = ilEdgeLook(cs);
    if (!shown) return;

    var copy = document.createElement("div");
    for (var i = 0; i < IL_WRAP_STYLES.length; i++) {
      copy.style[IL_WRAP_STYLES[i]] = cs[IL_WRAP_STYLES[i]];
    }
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    var bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    /* THE WIDTH THE WRITING REALLY HAS: inside the padding, and without the
       scroll bar a desktop takes out of it. clientWidth is already short of
       both borders and the scroll bar. */
    copy.style.cssText += "box-sizing:content-box;border:0;position:fixed;left:0;top:0;" +
      "visibility:hidden;pointer-events:none;width:" + (ta.clientWidth - padL - padR) + "px;";
    // A text box keeps a line for a newline at its very end, and a div drops it.
    copy.textContent = shown + "\u200b";
    document.body.appendChild(copy);
    source.wrapHeight = copy.scrollHeight;

    var taRect = ta.getBoundingClientRect();
    // From a place in the copy to a place in the box, scroll included.
    var offX = taRect.left - boxRect.left + bl;
    var offY = taRect.top - boxRect.top + bt - ta.scrollTop;
    var viewTop = Math.max(taRect.top + bt, 0) - boxRect.top;
    var viewBottom = Math.min(taRect.top + bt + ta.clientHeight, window.innerHeight) - boxRect.top;

    var look = ilTextLook(cs, typed.length ? "" : getComputedStyle(ta, "::placeholder").color);
    var node = copy.firstChild, range = document.createRange();
    var parts = ilGraphemes(shown);

    function place(i) {
      range.setStart(node, parts[i].index);
      range.setEnd(node, parts[i].index + parts[i].text.length);
      var rects = range.getClientRects();
      for (var k = 0; k < rects.length; k++) {
        if (rects[k].width > 0 && rects[k].height > 0) {
          return { x: rects[k].left + offX, y: rects[k].top + offY,
                   w: rects[k].width, h: rects[k].height };
        }
      }
      return null;
    }

    /* THE FIRST LETTER IN VIEW IS FOUND WITHOUT MEASURING EVERY LETTER ABOVE IT.
       Writing only runs downward, so a halving search over the letters finds
       the first one whose line reaches into view, however long the note is. A
       letter with nothing to measure, such as a newline, is looked past. */
    var lo = 0, hi = parts.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1, probe = mid, at = null;
      while (probe < hi && !(at = place(probe))) probe++;
      if (at && at.y + at.h <= viewTop) lo = probe + 1;
      else hi = mid;
    }

    var letters = [], word = 0;
    for (var j = lo; j < parts.length; j++) {
      if (/^\s+$/.test(parts[j].text)) { word++; continue; }
      var got = place(j);
      if (!got) continue;
      if (got.y >= viewBottom) break;
      /* A LETTER COMES ACROSS WHEN ITS MIDDLE WAS IN VIEW. A line with only a
         sliver showing at the box's edge was not read, and taken whole it would
         appear below the copy's edge the moment the edge faded. */
      var middle = got.y + got.h / 2;
      if (middle < viewTop || middle > viewBottom) continue;
      letters.push({ text: parts[j].text, index: parts[j].index,
                     end: parts[j].index + parts[j].text.length, word: word,
                     x: got.x, y: got.y, w: got.w, h: got.h, style: look, cls: "il-ch" });
    }
    copy.parentNode.removeChild(copy);
    source.pieces = ilGroupPieces(letters, shown);
  }

  /* LETTERS WHILE THERE ARE FEW ENOUGH, THEN WORDS, THEN LINES. A full box on
     a phone holds about 600 letters, and every piece is two boxes and two
     animations. Past IL_PIECES_MAX the same writing breaks apart in bigger
     pieces, and each is drawn as the run of text it covers, so the box reads
     the same at rest whichever size its pieces are. */
  function ilGroupPieces(letters, text) {
    if (letters.length <= IL_PIECES_MAX) return letters;
    var words = ilJoin(letters, text, function (a, b) {
      return a.word === b.word && Math.abs(a.y - b.y) < 1;
    });
    if (words.length <= IL_PIECES_MAX) return words;
    return ilJoin(letters, text, function (a, b) { return Math.abs(a.y - b.y) < 1; });
  }

  // Runs of neighbouring letters that belong together, as one piece each.
  function ilJoin(letters, text, together) {
    var out = [], piece = null, last = null;
    for (var i = 0; i < letters.length; i++) {
      var l = letters[i];
      if (piece && together(last, l)) {
        piece.left = Math.min(piece.left, l.x);
        piece.right = Math.max(piece.right, l.x + l.w);
        piece.end = l.end;
      } else {
        if (piece) out.push(piece);
        piece = { left: l.x, right: l.x + l.w, y: l.y, h: l.h, index: l.index,
                  end: l.end, style: l.style, cls: l.cls };
      }
      last = l;
    }
    if (piece) out.push(piece);
    for (var j = 0; j < out.length; j++) {
      out[j].x = out[j].left;
      out[j].w = out[j].right - out[j].left;
      out[j].text = text.slice(out[j].index, out[j].end);
    }
    return out;
  }

  /* AN ATTACHED FILE IS MEASURED WHERE IT STANDS. Its row is ordinary page
     content, so each part can say where it is without a copy: the card it sits
     on, the file's mark, its name letter by letter, its size, and the cross. */
  function ilMeasureFileRow(source, boxRect) {
    var pill = $("filePill");
    if (!pill) return;
    var pr = pill.getBoundingClientRect();
    source.card = { x: pr.left - boxRect.left, y: pr.top - boxRect.top,
                    w: pr.width, h: pr.height, look: ilEdgeLook(getComputedStyle(pill)) };
    var pieces = [];
    ilMarkPiece(pieces, $("fileIcon"), boxRect);

    /* A LONG NAME IS CUT SHORT WITH AN ELLIPSIS, AND COMES ACROSS CUT SHORT.
       The letters past the end of the name's own box are there in the page and
       not seen, so they are left out, and the ellipsis the browser drew in their
       place is written as a piece of its own where they began. */
    var name = $("homeFileName");
    if (name && name.firstChild) {
      var ns = getComputedStyle(name), look = ilTextLook(ns), range = document.createRange();
      var nr = name.getBoundingClientRect();
      var full = name.scrollWidth > name.clientWidth + 0.5 && ns.textOverflow === "ellipsis";
      /* THE ELLIPSIS TAKES ROOM OF ITS OWN, so the letters it covers are the
         last ones that would have fitted, not only the ones past the edge. Its
         width is read in the name's own font. */
      var room = nr.right;
      if (full) {
        var pen = document.createElement("canvas").getContext("2d");
        pen.font = ns.fontStyle + " " + ns.fontWeight + " " + ns.fontSize + " " + ns.fontFamily;
        room -= pen.measureText("\u2026").width;
      }
      var gone = null;
      ilGraphemes(name.textContent).forEach(function (p) {
        if (/^\s+$/.test(p.text)) return;
        range.setStart(name.firstChild, p.index);
        range.setEnd(name.firstChild, p.index + p.text.length);
        var r = range.getBoundingClientRect();
        if (!r.width) return;
        if (gone || (full && r.right > room + 0.5)) { gone = gone || r; return; }
        pieces.push({ text: p.text, x: r.left - boxRect.left, y: r.top - boxRect.top,
                      w: r.width, h: r.height, style: look, cls: "il-ch" });
      });
      if (gone) {
        pieces.push({ text: "\u2026", x: gone.left - boxRect.left, y: gone.top - boxRect.top,
                      w: Math.max(1, nr.right - gone.left), h: gone.height,
                      style: look, cls: "il-ch" });
      }
    }

    /* THE SIZE COMES ACROSS WHOLE. On a phone it carries "goes inside" from the
       stylesheet, which no range can reach, so it is one piece the width of its
       own line with the words it showed. */
    var size = $("homeFileSize");
    if (size && size.getClientRects().length) {
      var sr = size.getBoundingClientRect();
      var after = getComputedStyle(size, "::after").content;
      var tail = after && after !== "none" && after !== "normal" ? after.replace(/^"|"$/g, "") : "";
      pieces.push({ text: size.textContent + tail, x: sr.left - boxRect.left,
                    y: sr.top - boxRect.top, w: sr.width, h: sr.height,
                    style: ilTextLook(getComputedStyle(size)), cls: "il-ch" });
    }
    ilMarkPiece(pieces, $("fileX"), boxRect);
    source.pieces = pieces;
  }

  /* A MARK IS COPIED WITH THE TILE IT SITS ON. The file's mark has a pale tile
     behind it on a phone, and the tile is part of what was seen. The drawing is
     the page's own, cloned rather than drawn again, so it cannot differ. */
  function ilMarkPiece(pieces, el, boxRect) {
    if (!el || !el.getClientRects().length) return;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var svg = el.querySelector("svg");
    var sr = svg ? svg.getBoundingClientRect() : null;
    pieces.push({ x: r.left - boxRect.left, y: r.top - boxRect.top, w: r.width, h: r.height,
                  node: svg, markW: sr ? sr.width : 0, markH: sr ? sr.height : 0,
                  style: "color:" + cs.color + ";background-color:" + cs.backgroundColor +
                         ";border-radius:" + cs.borderTopLeftRadius + ";", cls: "il-mark" });
  }

  /* THE COPY OF THE BOX, AT THE BOX'S OWN SIZE. Its pieces are laid out at the
     size they were measured at and the whole frame is scaled to fit the stage,
     so no line is broken a second time and nothing moves against anything
     else. It is centred on the light, which is why every piece that falls to
     the middle of the frame lands in the light. */
  function ilFillFrame(frame, source, side) {
    while (frame.firstChild) frame.removeChild(frame.firstChild);
    if (!source) { frame.removeAttribute("style"); return; }
    var s = Math.min(1, side / source.w, side / source.h);
    frame.style.cssText = source.look + "width:" + source.w + "px;height:" + source.h +
      "px;margin:" + (-source.h / 2) + "px 0 0 " + (-source.w / 2) + "px;" +
      "transform:scale(" + s.toFixed(4) + ");";
    if (source.card) {
      var card = document.createElement("i");
      card.className = "il-card-copy";
      card.style.cssText = source.card.look + "left:" + source.card.x + "px;top:" +
        source.card.y + "px;width:" + source.card.w + "px;height:" + source.card.h + "px;";
      frame.appendChild(card);
    }
  }

  /* A SPRITE IS TWO BOXES, AND THE REASON IS THE SPIRAL. The orbit turns and
     the sprite inside it walks straight in, so what is drawn is a curve and the
     stylesheet needs no trigonometry. The angle and the radius are worked out
     here, once, and the place in x and y is never used again.
     The angle is set on the orbit alone. Custom properties inherit, so the
     sprite reads the same one to take the orbit's turn back off itself. */
  function ilSprite(spot, delayMs, spin) {
    var orbit = document.createElement("i");
    var a = Math.atan2(spot.y, spot.x) * 180 / Math.PI;
    var r = Math.sqrt(spot.x * spot.x + spot.y * spot.y);

    orbit.className = "il-orbit " + spot.cls + "-orbit";
    orbit.style.setProperty("--a", a.toFixed(2) + "deg");
    orbit.style.setProperty("--spin", Math.round(spin) + "deg");
    orbit.style.setProperty("--d", Math.round(delayMs) + "ms");

    var el = document.createElement("i");
    el.className = "il-sprite " + spot.cls;
    /* A MEASURED PIECE IS DRAWN AT THE SIZE IT WAS MEASURED, in the look it had.
       Its box is exactly the box it filled on Make, so centring the box on the
       place it came from puts its writing back where it was. */
    if (spot.style) {
      el.style.cssText = spot.style + "width:" + spot.w.toFixed(2) + "px;height:" +
        spot.h.toFixed(2) + "px;line-height:" + spot.h.toFixed(2) + "px;";
    }
    el.style.setProperty("--r", r.toFixed(1) + "px");
    if (spot.text) el.textContent = spot.text;
    if (spot.node) {
      var mark = spot.node.cloneNode(true);
      mark.removeAttribute("id");
      mark.style.width = spot.markW + "px";
      mark.style.height = spot.markH + "px";
      el.appendChild(mark);
    }
    if (spot.bw) el.style.setProperty("--bw", spot.bw + "px");
    if (spot.bgx !== undefined) {
      el.style.setProperty("--bgx", spot.bgx.toFixed(1) + "px");
      el.style.setProperty("--bgy", spot.bgy.toFixed(1) + "px");
    }

    orbit.appendChild(el);
    return orbit;
  }

  /* THE DISC, BLOCK BY BLOCK. Each one is its own object: they arrive one at a
     time in no order, which is what makes it materialise rather than sweep
     round like a hand, and they are taken all at once.
     THE GRID IS WALKED AND THE RING IS CUT OUT OF IT. Every cell whose middle
     falls in the band between the hole and the rim becomes a block, so the edge
     is a circle drawn in squares and the hole is a real hole. */
  function ilDiscSpots(side) {
    var R = side / 2;
    var cell = R * IL_DISC_CELL;
    var bw = Math.max(6, Math.round(cell * 0.84));    // the rest is the gap
    var inner = R * IL_DISC_IN, outer = R * IL_DISC_OUT;
    var half = Math.ceil(outer / cell);
    var spots = [];
    for (var gx = -half; gx <= half; gx++) {
      for (var gy = -half; gy <= half; gy++) {
        var x = gx * cell, y = gy * cell;
        var d = Math.sqrt(x * x + y * y);
        if (d < inner || d > outer) continue;
        /* WHICH PIECE OF THE DISC SHOWS THROUGH THIS BLOCK. The surface is
           painted at the size of the stage with its top left at the block's
           top left, so it is pulled back by however far into the stage that
           corner sits. */
        spots.push({ x: x, y: y, cls: "il-blk", bw: bw,
                     bgx: -(R + x - bw / 2), bgy: -(R + y - bw / 2) });
      }
    }
    return spots;
  }

  /* AN ANIMATION THAT HAS RUN DOES NOT RUN AGAIN ON ITS OWN. The light holds at
     its last frame, so a second show would open on a ball already grown, a
     flare already spent and a colour turn already finished. Taking the property
     off, reading the box, and putting it back is what starts them from the
     beginning. The same move resetDisc() makes for the disc. */
  function ilRestart() {
    var parts = [$("ilStage"), $("ilCore"), $("ilFlare"), $("ilBox")];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      parts[i].style.animation = "none";
      void parts[i].getBoundingClientRect();
      parts[i].style.animation = "";
    }
  }

  /* NOTHING BEHIND THE SHOW CAN BE REACHED WHILE IT IS UP. A phone takes every
     other region out with display:none, so there is nothing there to reach. A
     desktop leaves the whole board standing behind the dim, where a Tab would
     walk straight into it, so every region beside the show is made inert for as
     long as it runs. */
  function ilInert(on) {
    var grid = $("boardGrid");
    if (!grid) return;
    var kids = grid.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].id === "interlude") continue;
      kids[i].inert = on;
    }
  }

  var INTERLUDE = {
    ms: IL_TOTAL_MS,

    /* LAID OUT, AND STANDING STILL. Every animation in the show is born paused
       under hold, so whatever the screen shows while it slides or fades in is
       the show's first frame: the words as text, the light small, the disc not
       begun. hold
       goes on before anything is built or restarted, so nothing gets a frame of
       movement in between. */
    build: function (stage, source, share) {
      stage.classList.add("hold");
      ilRestart();
      var t = ilLengths(share);
      /* THE FOUR LENGTHS THE STYLESHEET NEEDS, written from the constants in
         Section 2 at this show's share. The sheet holds no copy of any of them. */
      stage.style.setProperty("--ms", t.fall + "ms");
      stage.style.setProperty("--grow", t.suckAt + "ms");
      stage.style.setProperty("--sms", t.suck + "ms");
      stage.style.setProperty("--fms", t.flare + "ms");

      var side = stage.getBoundingClientRect().width;
      /* THE DISC'S SURFACE IS SIZED FROM THE SAME NUMBERS IT IS CUT WITH. The
         sheet paints the real disc's layers from the hole to the rim, so both
         are handed over as shares of the radius they were cut against, and the
         stage's own width is the size every block's window onto it is. */
      stage.style.setProperty("--side", side + "px");
      stage.style.setProperty("--hole", (IL_DISC_IN * 100) + "%");
      stage.style.setProperty("--rim", (IL_DISC_OUT * 100) + "%");

      var frame = $("ilBox");
      ilFillFrame(frame, source, side);
      var pieces = source ? source.pieces : [];
      var words = document.createDocumentFragment();

      /* THE PIECES, IN THE ORDER THEY WERE READ. Each is placed from the middle
         of the frame, which is the middle of the box it came from, and they set
         off over the time left once a fall is taken off, so the last one is
         still swallowed before the disc is pulled. */
      var spread = Math.max(0, t.suckAt - t.fall);
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        var spot = { x: p.x + p.w / 2 - source.w / 2, y: p.y + p.h / 2 - source.h / 2,
                     w: p.w, h: p.h, text: p.text, node: p.node, markW: p.markW,
                     markH: p.markH, style: p.style, cls: p.cls };
        var at = pieces.length < 2 ? 0 : (i / (pieces.length - 1)) * spread;
        words.appendChild(ilSprite(spot, at, IL_SPIN_DEG + Math.random() * 180));
      }
      frame.appendChild(words);

      // The disc arrives in no order, which is what makes it materialise rather
      // than sweep round like a hand.
      var disc = ilDiscSpots(side);
      var blocks = document.createDocumentFragment();
      for (var k = 0; k < disc.length; k++) {
        blocks.appendChild(ilSprite(disc[k], t.discAt + Math.random() * t.disc,
                                    IL_SPIN_DEG));
      }
      stage.appendChild(blocks);
    },

    /* SET MOVING. Everything built starts from its first frame at this one
       moment, and the ending is timed from here rather than from the build, so
       a slide or a fade, however long it took, costs the show none of its own
       time. */
    start: function (stage, share) {
      stage.classList.remove("hold");
      // ONE CLASS AT ONE MOMENT carries the whole ending: the disc is pulled in,
      // the flare fires as it lands, and the throb stops instead of fading out
      // while it is still lit.
      ilLater(function () { stage.classList.add("suck"); }, ilLengths(share).suckAt);
    },

    clear: function (stage) {
      stage.classList.remove("suck", "hold");
      // The light and the flare are in the markup and stay. Everything else was
      // built for this show and goes with it, so a show that has run leaves
      // nothing behind for the next one to clean up.
      var gone = stage.querySelectorAll(".il-orbit");
      for (var i = 0; i < gone.length; i++) {
        gone[i].parentNode.removeChild(gone[i]);
      }
      // The copy of the box is in the markup too, emptied and put back to no size.
      ilFillFrame($("ilBox"), null, 0);
    }
  };

  /* THE SEAM. The press calls this and waits on what it hands back.

     LAID OUT AS ITS SCREEN ARRIVES, SET MOVING ONCE IT HAS. build() runs in the
     instant the show's screen is in place, so the screen that slides or fades
     in is already carrying the words, standing still. start() waits for the
     change to be over. A show that began moving while its own screen was still
     sliding is the snap this replaced, and a person could not follow either.
     THE STAGE HAS NO BOX UNTIL ITS SCREEN IS UP. The layout is measured off it,
     and on a phone the board is not showing it until the change has run, which
     is the other reason the build waits for the change. */
  function playInterlude() {
    var panel = $("interlude"), stage = $("ilStage");
    if (!panel || !stage || !interludeOn() || ilRunning) return Promise.resolve();

    /* WHAT WAS IN VIEW IS MEASURED FIRST, while the Make box is still on the page
       and before anything about the board has changed. */
    var source = interludeSource();
    /* HOW MUCH OF ITS TIME THIS SHOW GETS, decided once, so a show that plays
       out while it runs does not change its own length part way through. */
    var share = interludeShare();

    ilRunning = true;
    ilOver = false;
    var run = ++ilRun;
    ilInert(true);
    var skipBtn = $("ilSkip");
    if (skipBtn) skipBtn.disabled = false;
    var over = new Promise(function (resolve) { ilResolve = resolve; });

    /* THE BOX TRAVELS WITH THE CHANGE, ON EITHER SHAPE. vt-carry names the Make
       box in the picture before the change and its copy in the picture after
       it, so the browser moves one into the place of the other: across the
       slide on a phone, and up into the middle of the dim on a desktop. It is
       for this change alone: a Make box named on the way to Made would stand
       still and fade while the screen round it moved. */
    var root = document.documentElement;
    if (canSlide() || canFade()) root.classList.add("vt-carry");

    var change = setView("making", true, function () {
      if (!ilRunning || run !== ilRun) return;
      /* THE PANEL COMES UP IN THE CHANGE, NOT BEFORE IT. A desktop's panel is
         the dim, and one shown before the change would already be in the
         picture the change starts from, so there would be nothing to fade in. */
      panel.hidden = false;
      INTERLUDE.build(stage, source, share);
      /* A DESKTOP MOVES FOCUS HERE TOO. focusView leaves a desktop alone
         because nothing moves there, and this is the one thing that does. The
         board behind is inert, so focus must not be left standing on it. */
      var head = $("headMaking");
      if (head) head.focus();
    });
    change.then(function () {
      // Skipped while its screen was still arriving: there is nothing to start.
      if (!ilRunning || run !== ilRun) return;
      INTERLUDE.start(stage, share);
      ilLater(interludePlayedOut, INTERLUDE.ms * share);
    });
    /* THE NAMES COME OFF WHEN THE CHANGE HAS ENDED, and not when the show is
       told it has arrived. The show can hear that from a timer a moment before
       the change's last frame, and a name taken off while the browser is still
       moving that box can make it drop the picture. */
    change.ended.then(function () { root.classList.remove("vt-carry"); });

    /* WHEN THE PRESS MAY START ITS WORK. A slide or a fade needs a free frame or
       two to take both of its pictures, and an encode that began in the same
       instant could take those frames. Once the pictures are taken it runs on
       its own. */
    over.ready = change.underway || change;
    return over;
  }

  /* THE SHOW'S TIME IS UP, AND IT STAYS WHERE IT IS.
     The press is told it can go on, and nothing is taken down. The press takes
     the show down itself, in the same change that brings Made up, so the screen
     that slides out is the show's own.
     IT USED TO GO BACK TO MAKE HERE, and that was invisible while screens
     changed at once, because Made followed in the same turn. A slide pictures
     the screen as it stands a frame later, and that was Make: the show's screen
     snapped to Make, and then Make slid away.
     A PICTURE STILL BEING PRESSED IS WAITED FOR ON THIS SCREEN. It still says
     it is working, and it is still true. */
  /* THE SHOW PLAYED ITS WHOLE TIME. Only the show's own clock comes here, so this
     is the one place a show is counted as seen. */
  function interludePlayedOut() {
    markInterludeSeen();
    interludeTimeUp();
  }

  function interludeTimeUp() {
    /* THERE IS NOTHING LEFT TO SKIP. The press may already be sliding to Made,
       and a skip that landed in that instant would cancel the slide and leave
       the finished picture behind a Make screen with nothing to bring it back. */
    ilOver = true;
    var skip = $("ilSkip");
    if (skip) skip.disabled = true;
    var done = ilResolve;
    ilResolve = null;
    if (done) done();
  }

  /* TAKE THE SHOW DOWN AND LEAVE THE SCREEN TO THE CALLER. The press hands this
     to the change that brings Made up, so it runs in the instant Made is in
     place: the show's screen is off the board by then and is cleared unseen. With
     no show up it does nothing, which is what lets the press hand it over every
     time. */
  function finishInterlude() {
    if (!ilRunning) return;
    ilRunning = false;
    ilStopTimers();

    var panel = $("interlude"), stage = $("ilStage");
    if (stage) INTERLUDE.clear(stage);
    if (panel) panel.hidden = true;
    ilInert(false);

    /* FOCUS GOES TO THE SCREEN THAT IS UP, AND ONLY NOW CAN IT. Focus cannot be
       left on what has gone, or the next Tab starts again at the top of the
       document. The board was inert while the show stood over it, and an inert
       heading cannot take focus, so the change that brought Made up asked for
       its heading and got nothing. The board is reachable again from here.
       A phone's heading is the heading of whichever screen is up. A desktop's
       is the heading of the card the picture arrived in when the show brought
       Made! up, and the Make heading when the show was skipped. */
    var view = $("boardGrid").getAttribute("data-view");
    if (touchPointer.matches) {
      focusView(view);
    } else {
      var head = $(view === "made" ? "headLoad" : "headMake");
      if (head) head.focus();
    }

    interludeTimeUp();
  }

  /* THE WAY OUT BEFORE THE END: the skip control, Escape, or an encode that
     threw. It runs once, and a second call has nothing left to take down.
     IT GOES BACK TO WHERE THE BOARD RESTED, AND NOT ON TO THE NEW MADE!. Only
     the press knows whether there is a picture yet, and often there is not:
     somebody who skips is still waiting on the encode. Left on the show's own
     screen with the panel taken off, a phone would be looking at nothing at
     all, because that screen has no other region on it. The press moves on to
     Made! from the resting screen when the picture is ready. */
  function endInterlude() {
    if (!ilRunning) return;
    finishInterlude();
    setView(restView());
  }

  /* WHERE THE BOARD RESTS WHEN THE SHOW COMES DOWN EARLY. A phone always pressed
     from Make, where no disc is out and nothing is open, so it goes back there.
     A desktop pressed beside Made! or Loaded!, and that card is still true until
     the new picture arrives, so it comes back as it was. */
  function restView() {
    if (homeDiscOut) return "made";
    return $("zone").classList.contains("has") ? "loaded" : "make";
  }

  function wireInterlude() {
    var skip = $("ilSkip"), always = $("ilAlways");
    if (!skip || !always) return;

    skip.addEventListener("click", function () { endInterlude(); });

    /* A PRESS ON THE DIM IS A DESKTOP'S SKIP. The light and everything in it is
       the show, and the dim round it is the page a person came from, so pressing
       it asks for that page back. A phone has no dim: the show is a screen of
       its own, and a stray thumb on it must not end it. Like the pill, it has
       nothing to skip once the show's time is up. */
    var panel = $("interlude");
    if (panel) {
      panel.addEventListener("click", function (e) {
        if (e.target !== panel || touchPointer.matches || !ilRunning || ilOver) return;
        endInterlude();
      });
    }

    always.addEventListener("change", function () {
      // Ticked means no show, so the stored preference is the box read the other
      // way round. Somebody who has said they never want one does not want the
      // rest of this one either.
      setInterludePref(!always.checked);
      if (!ilOver) endInterlude();
    });

    /* ESCAPE IS THE KEYBOARD'S SKIP. It is on the document rather than the
       panel, because the show is not a native dialog and Escape would otherwise
       only work while focus happened to be inside it. Like the button, it has
       nothing to skip once the show's time is up. */
    document.addEventListener("keydown", function (e) {
      if (!ilRunning || ilOver || e.key !== "Escape") return;
      e.preventDefault();
      endInterlude();
    });
  }


  /* ==========================================================================
     THE HOME BOARD - MAKE, AND THE DISC THAT COMES OUT
     ========================================================================== */

  function resetDisc() {
    var cd = $("cd");
    cd.style.transition = "none";
    cd.classList.remove("out", "gone");
    void cd.getBoundingClientRect();
    cd.style.transition = "";
  }

  /* Throw away whatever is in Made!'s window, then run then() once it has gone.

     THE CLEAR-UP CHECKS IT IS STILL THE CURRENT ONE. Pressing Make within a
     third of a second of a change used to leave an empty window: the change
     started a toss, the press put a fresh disc in before that toss finished,
     and the toss then cleared the disc that had arrived meanwhile. */
  function tossDisc(then) {
    if (!homeDiscOut) { if (then) then(); return; }
    homeDiscOut = false;
    homeMade = null;
    /* A PICTURE THAT FOLLOWS KEEPS THE LAST ONE'S SIZE UNTIL IT HAS LOADED, so the
       window does not jump to whatever the Make box plans for in between. One
       that goes with nothing after it gives the window back to that plan. */
    if (!then) homeDiscSide = 0;
    closeTitleEditor();
    paintDiscEdit();
    var run = homeDiscRun;
    $("cd").classList.add("gone");
    setTimeout(function () {
      if (run === homeDiscRun) resetDisc();
      if (then) then();
    }, DISC_TOSS_MS);
  }

  async function pressHomeDisc(restyle) {
    if (homePressing || homeTitleSaving) return;
    homePressing = true;
    paintDiscEdit();
    var btn = $("homeMakeBtn"), lab = $("makeLabel"), label = lab.innerHTML;
    btn.disabled = true;
    lab.textContent = "Pressing...";
    try {
      var input, opts, made;
      if (restyle) {
        /* THE BACKGROUND SWITCH RESTYLES THE PICTURE THAT IS OUT, AND NOTHING
           ELSE ABOUT IT. A desktop's Make box stands beside Made! and may hold
           the next note already, so the switch presses the finished picture's
           own contents, title and settings again with the background changed,
           the way the title editor presses them with the title changed. */
        input = homeMade.input;
        opts = Object.assign({}, homeMade.opts);
        if (opts.coverStyle === "cd") opts.solidBackground = backgroundIsSolid();
        made = Object.assign({}, homeMade, { opts: opts });
      } else {
        input = homeAttached ? homeAttached.bytes : ($("makeText").value || "(empty)");
        /* EVERY ADVANCED SETTING REACHES THE ENGINE. The drawer is read in full
           and the board only fills in what it was not told: the ladder's top
           rung as a ceiling, unless Advanced named a size of its own. */
        opts = gatherOptions();
        if (!opts.size) opts.maxSize = RUNGS[RUNGS.length - 1].px;
        // The engine takes a name and a type in its options, so a file comes out
        // of the other end still knowing what it was called.
        if (homeAttached) { opts.name = homeAttached.name; opts.mime = homeAttached.mime; }

        applyDiscWriting(input, opts);
        made = { input: input, opts: opts, name: homeAttached ? homeAttached.name : "",
          category: discCategory(homeAttached, !!opts.password), customText: opts.label };
      }

      /* THE SHOW AND THE WORK RUN TOGETHER, AND THE SHOW IS THE FLOOR. The
         encode is usually over in a blink, so the show is not covering a wait:
         it is the wait, and it is there to say what the press did. A big
         attachment and the first press of all, which fetches the two faces,
         finish underneath it and cost nothing on top of it.
         WITH NO SHOW THIS IS AN ALREADY RESOLVED PROMISE, and the two lines
         around the encode are the only trace of it in the press.
         THE SHOW BELONGS TO THE MAKE BUTTON AND TO NOTHING ELSE. A restyle is
         the background switch pressing the same picture again, where a person
         is changing one thing about a picture they already have. Taking them
         through the whole show for that would move the screen out from under
         the switch they are still looking at. */
      var show = restyle ? Promise.resolve() : playInterlude();
      /* THE SLIDE IS UNDER WAY BEFORE THE WORK BEGINS. Pressing a picture is
         heavy for a moment, and a phone's slide needs that moment free to take
         its two pictures. It waits a frame or two for them and no more, because
         once they are taken the slide runs without the main thread. */
      if (show.ready) await show.ready;

      // The faces have to be in before the canvas can letter with them.
      await ensureDiscFonts();
      var png = await PuttyPNG.encode(input, opts);
      homeLastBlob = png.blob;
      await show;
      maybeCelebrate("make");
      tossDisc(function () {
        var cd = $("cd");
        // This disc is the current one now, and it starts from a clean slot
        // whatever an unfinished toss left behind.
        homeDiscRun++;
        homeMade = made;
        resetDisc();
        /* THE WIDTH AND THE HEIGHT ARE READ OFF THE IMAGE, so everything read from
           them waits for it: the window's size, the caption and the notes.
           once:true, or every press adds another. A picture closed or replaced
           before it loaded is not the one to measure. */
        cd.addEventListener("load", function () {
          if (homeMade !== made) return;
          homeDiscSide = cd.naturalWidth;
          setBoardSizes(homeShownRung);
          paintDiscFacts();
        }, { once: true });
        cd.src = png.dataUrl;
        // The PuttyPNG exists and Made! is where it lives: a screen of its own on
        // a phone, and the card in the right-hand cell on a desktop. The flag
        // moves before the disc ejects into it. It slides or fades in, because
        // this is the far side of the handover the show exists to make: the
        // picture arrives from where the words went.
        /* THE DISC COMES OUT ONCE THE SCREEN HAS STOPPED. An eject that ran while
           the screen slid was two movements at once, and the slide hides the
           slot the disc comes out of. A desktop waits for its fade the same way,
           and a desktop already showing Made! has nothing to wait for: the last
           picture goes and the new one comes out in the same window.
           IT CHECKS IT IS STILL THIS DISC, ON THIS SCREEN. The change is long
           enough for Close or the cross to be pressed, and a late eject would
           push a disc out onto Make, where nothing is showing the window. */
        var run = homeDiscRun;
        /* THE SHOW COMES DOWN IN THE CHANGE THAT BRINGS MADE UP, so the screen
           a phone slides out is the show's own and not a Make screen put back
           for one frame. With no show up, finishInterlude does nothing. */
        setView("made", true, function () {
          finishInterlude();
          emptyHomeLoaded();
        }).then(function () {
          // A timer, not requestAnimationFrame. The frame callback does not run
          // in a headless test, and the disc would then never be told to come out.
          setTimeout(function () {
            if (run !== homeDiscRun || $("boardGrid").getAttribute("data-view") !== "made") return;
            cd.classList.add("out"); homeDiscOut = true;
            // The screen can only be right once there is a disc to be right about.
            paintMadeScreen();
          }, DISC_EJECT_MS);
        });
      });
    } catch (err) {
      /* A SHOW WITH NOTHING COMING AFTER IT HAS TO BE TAKEN OFF. The encode
         throws underneath it, and the message belongs on the screen with the
         button that failed, not over a panel saying it is working. */
      endInterlude();
      toast(friendly(err), "bad");
    }
    lab.innerHTML = label;
    btn.disabled = false;
    homePressing = false;
    paintDiscEdit();
  }

  // Put the finished PuttyPNG on disk. The button says so and goes quiet again.
  function saveHomeDisc(el) {
    if (!homeLastBlob) return;
    saveBytes(URL.createObjectURL(homeLastBlob), "puttypng.png", true);
    confirmDone(el, "Saved!");
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

  /* ==========================================================================
     THE HOME BOARD - LOAD
     ========================================================================== */

  /* READING TAKES REAL TIME ON A LARGE DISC. The notice waits a moment before
     it appears, so a small one is read and shown without a flicker of it. */
  function startReading() {
    homeReadDepth++;
    clearTimeout(homeReadTimer);
    homeReadTimer = setTimeout(function () {
      if (homeReadDepth > 0) {
        $("zone").classList.add("reading");
        // The spinner is decoration. This line is the board's one voice.
        paintSay($("loadSay"), "quiet", SAY.reading);
      }
    }, READING_DELAY_MS);
  }

  function stopReading() {
    homeReadDepth = Math.max(0, homeReadDepth - 1);
    if (homeReadDepth === 0) {
      clearTimeout(homeReadTimer);
      $("zone").classList.remove("reading");
    }
  }

  /* PEEK BEFORE YOU DECODE.
     Until v2.9.1 this decoded first and caught the failure, so a picture with
     nothing in it opened the Loaded screen with an empty box. The How it works
     page has always peeked, and R5 peeks, and the board was the odd one out.
     Peeking here covers every way in that a person has: the drop on the Load
     zone, Load one!, and Paste one! all arrive at this function.
     The Loaded screen now means one thing, which is what lets its line be
     green and be true.
     A PUTTYPNG THAT WOULD REPLACE MADE! ASKS FIRST. Made! and Loaded! share one
     card, so opening one closes the other, and the picture in Made! is nowhere
     else until it has been downloaded or copied. */
  async function readHomeFile(file) {
    if (!file) return;
    if (!/png/i.test(file.type) && !/\.png$/i.test(file.name || "")) {
      toast("That is not a PNG. A PuttyPNG has to stay a PNG.", "bad");
      return;
    }
    startReading();
    try {
      var head = await PuttyPNG.peek(file);
      if (!head.isPuttyPNG) { offerPlain(file); return; }
      if (homeDiscOut) { askReplaceMade(file); return; }
      await openHomeFile(file);
    } catch (err) {
      toast(friendly(err), "bad");
    } finally {
      stopReading();
    }
  }

  // Decode a PuttyPNG that has been peeked at already, and show what came out.
  async function openHomeFile(file) {
    var res = await PuttyPNG.decode(file);
    showHomeLoaded(URL.createObjectURL(file), file.name || "pasted.png", res, file);
  }

  /* THE QUESTION BEFORE MADE! IS REPLACED. Nothing is decoded until the answer
     is Yes, and the reading, which the peek may have left saying Decoding, goes
     back to naming the card that is still up. */
  function askReplaceMade(file) {
    paintCardSay();
    askHome({ title: SAY.replaceTitle, body: SAY.replaceAsk, yes: SAY.replaceYes },
      async function () {
        startReading();
        try {
          await openHomeFile(file);
        } catch (err) {
          toast(friendly(err), "bad");
        } finally {
          stopReading();
        }
      });
  }

  /* WHAT TO DO WITH A PICTURE THAT HOLDS NOTHING. It is not a failure: it is a
     perfectly good thing to hide something inside, so it becomes the file to
     hide.
     THE QUESTION IS ASKED ONLY WHEN THERE IS SOMETHING TO COVER. Attaching
     hides the text box, so an empty box has no answer worth asking for.
     The words are never destroyed either way. They come back the moment the
     file is taken off again, and the sentence says so. */
  /* ONE QUESTION PANEL, ASKED BY WHOEVER NEEDS IT.

     Two things stop and ask on this board: a plain picture that hides nothing,
     and an example about to replace what is here. Both ask the same shape of
     question, so the panel is written once and the caller hands over the three
     pieces of text and what to do with a Yes. The answer is held here rather
     than in the caller, so the two buttons have one listener each however many
     things learn to ask. */
  var askPending = null;     // what to run on Yes, or null when nothing is asked

  function askHome(words, onYes) {
    $("plainAskTitle").textContent = words.title;
    $("plainAskBody").textContent = words.body;
    $("plainYes").textContent = words.yes;
    askPending = onYes;
    /* showModal, NOT AN ATTRIBUTE. The browser then holds the focus inside the
       dialog, closes it on Escape and draws the backdrop, and each of those is
       a thing this page would otherwise have to write and keep true. */
    var ask = $("plainAsk");
    if (!ask.open) ask.showModal();
    $("plainYes").focus();
  }

  function closePlainAsk() {
    askPending = null;
    var ask = $("plainAsk");
    if (ask && ask.open) ask.close();
  }

  function offerPlain(file) {
    // The reading is left saying Decoding, and nothing is being decoded now.
    paintCardSay();
    var ta = $("makeText");
    if (!ta || ta.value.trim() === "") {
      takeHomeAttachment(file, SAY.tookPlain);
      return;
    }
    askHome({ title: "That is not a PuttyPNG", body: SAY.askPlain, yes: "Yes, attach it" },
      function () { takeHomeAttachment(file, SAY.tookPlain); });
  }

  /* What came out is shown as the disc and its name, then whatever came out as
     a file, then the text. A file gets its own chip with a download arrow, so
     it can be taken on its own rather than through the picture.
     MADE! GOES IN THE SAME CHANGE, because the two cards share one cell. A disc
     that is out has been asked about by now, and the answer was Yes. */
  function showHomeLoaded(url, name, res, blob) {
    setView("loaded", false, function () {
      if (homeDiscOut) tossDisc();
      homeLoadedBlob = blob || null;
      homeLoadedText = null;
      $("gotImg").src = url;
      $("gotName").textContent = name;
      $("gotFiles").textContent = "";
      var text = null;

      /* WHAT CAME OUT, AGAINST WHAT CARRIED IT. R5's line, and the ratio is the
         interesting part: a small note inside a large picture is the whole
         point of the thing. */
      var payload = res.bytes ? res.bytes.length : 0;
      $("gotSize").textContent = homeFmt(payload) +
        (homeLoadedBlob ? " out of " + homeFmt(homeLoadedBlob.size) : " inside");
      if (res.text != null) { text = res.text; homeLoadedText = res.text; }
      else addHomeFileChip(res.name || "a file", res.bytes, res.mime);

      // All of it. The panel is meant to hold a whole book if one went in.
      $("gotText").textContent = text === null ? "" : text;
      $("gotBody").classList.toggle("filesonly", !text && $("gotFiles").children.length > 0);
      // The label and Copy Contents belong to text. A file has its own chip.
      $("gotLabel").hidden = !text;
      paintCopyContents();
      $("zone").classList.add("has");
      // A second PuttyPNG over the first changes no screen, so the reading is
      // put right here, where the read may have left it saying Decoding.
      paintCardSay();
    });
  }

  /* R5's rule: a PuttyPNG that carries a file has nothing to copy as text, and
     the chip beside this is how that one is taken away instead. */
  function paintCopyContents() {
    var btn = $("copyContents");
    if (btn) btn.hidden = homeLoadedText == null;
  }

  // The whole chip takes the file. Nothing asks for a small target inside it.
  function addHomeFileChip(name, bytes, mime) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filechip";
    chip.title = "Press to save " + name;
    /* "Press", not R5's "tap", because one chip serves both pointers now and
       tap is not true of a mouse. Press is true of both. */
    chip.innerHTML = '<span class="dl">' + homeIcon(D_DOWN, 19) + "</span>" +
      '<span class="nm"><b></b><span></span></span>';
    chip.querySelector("b").textContent = name;
    chip.querySelector(".nm span").textContent =
      homeFmt(bytes.length) + " · press to save it";
    chip.addEventListener("click", function () {
      var href = URL.createObjectURL(new Blob([bytes], { type: mime || "application/octet-stream" }));
      saveBytes(href, name, true);
      var slot = chip.querySelector(".dl");
      slot.innerHTML = homeIcon(D_TICK, 19);
      slot.style.color = "var(--ok)";
      setTimeout(function () {
        slot.innerHTML = homeIcon(D_DOWN, 19);
        slot.style.color = "";
      }, HOME_CONFIRM_MS);
    });
    $("gotFiles").appendChild(chip);
  }

  // Close Loaded! and put Load back: the cross, OK, done! and a phone's Close.
  function clearHomeLoaded() {
    setView("make", false, emptyHomeLoaded);
    focusCardHead();
  }

  /* EMPTY THE LOADED! PANEL AND LEAVE THE SCREEN ALONE. Closing it does this, and
     so does a new Made! arriving: the two cards share one cell, and a panel left
     holding the last PuttyPNG would come back with it when Made! is closed. */
  function emptyHomeLoaded() {
    homeLoadedBlob = null;
    homeLoadedText = null;
    $("zone").classList.remove("has");
    $("gotImg").removeAttribute("src");
    $("gotFiles").textContent = "";
    $("gotText").textContent = "";
    $("gotBody").classList.remove("filesonly");
    $("sink").value = "";
  }

  /* THE FIRST FILE ON A CLIPBOARD, a PNG for choice, or nothing. A PNG is
     preferred because it is the one kind that might be a PuttyPNG, and a copy
     of a picture can carry more than one representation of it. */
  function fileFrom(items) {
    var first = null;
    for (var i = 0; items && i < items.length; i++) {
      if (items[i].kind !== "file") continue;
      if (/^image\/png/.test(items[i].type)) return items[i].getAsFile();
      if (!first) first = items[i].getAsFile();
    }
    return first;
  }

  function hasText(items) {
    for (var i = 0; items && i < items.length; i++) {
      if (items[i].kind === "string" && items[i].type === "text/plain") return true;
    }
    return false;
  }

  /* Whether a paste on this element is typing. The sink is a field too, but
     it exists only to catch a paste, so words in it are never typing. */
  function isTyping(el) {
    if (!el || el.id === "sink") return false;
    var tag = (el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
  }

  // What a paste carried when it carried nothing the page can use.
  function pasteHeld(items) {
    var types = [];
    for (var i = 0; items && i < items.length; i++) types.push(items[i].type || items[i].kind);
    return types.length ? SAY.pasteOdd + types.join(", ") : SAY.pasteEmpty;
  }

  function howToPaste() { return touchPointer.matches ? SAY.pasteTap : SAY.pasteKey; }

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
    /* THREE OF THE FIVE PAGES CANNOT USE THE ENGINE, so they do not load it.
       Everything below this line that needs it is guarded by the element it
       works on, and those elements live only on the two pages that do. */
    var hasEngine = typeof PuttyPNG !== "undefined";

    // A small development surface. The confetti's transform rule is exposed
    // so a test can check it without waiting for a frame to run, and the view
    // flag so a test can change screen the way the board does rather than by
    // writing the attribute and missing what setView does around it.
    window.PuttyPNGDebug = window.PuttyPNGDebug || {};
    window.PuttyPNGDebug.launchTransform = launchTransform;
    window.PuttyPNGDebug.setView = setView;
    // How the console and the probe drive the dropdown without opening it.
    window.PuttyPNGDebug.pickExample = pickExample;
    window.PuttyPNGDebug.offerExample = offerExample;
    /* HOW THE SHOW IS WATCHED WITHOUT PRESSING ANYTHING. A press encodes, and
       what a probe needs is the panel on screen with its sprites in it so it can
       be stopped at a chosen moment and measured. These two are the same pair
       the press uses. */
    window.PuttyPNGDebug.playInterlude = playInterlude;
    window.PuttyPNGDebug.endInterlude = endInterlude;
    /* HOW A PROBE THAT IS NOT ABOUT THE SHOW TURNS IT OFF. Pressing Make now
       takes the best part of four seconds and ends on a different screen, so a
       probe measuring the Made screen has to say it wants none of it. This is
       the switch in Advanced, reached without opening the drawer. */
    window.PuttyPNGDebug.setInterludePref = setInterludePref;
    /* THE MEASUREMENT OF WHAT WAS IN VIEW, as the show takes it, so a probe can
       set the box up, ask, and hold the answer to the box it came from. */
    window.PuttyPNGDebug.interludeSource = interludeSource;
    // The side the engine says the next picture will be, which is what the
    // window is sized from until a picture is out, and what the over-512
    // warning is read from.
    window.PuttyPNGDebug.trueSide = function () { return homeTrueSide; };
    /* WHAT THE LAST DISC SAYS ACROSS ITS TOP, and which press made it, so a probe
       that presses twice reads the second disc and not the first one again. The
       side is the one the window is sized from while the picture is out. */
    window.PuttyPNGDebug.madeDisc = function () {
      return { run: homeDiscRun, out: homeDiscOut, title: homeMade ? homeMade.customText : null,
               side: homeDiscSide };
    };
    window.PuttyPNGDebug.tuning = function () {
      return { rungs: RUNGS.length, wide: METER_TUNING.wide.share,
               touch: METER_TUNING.touch.share,
               // The phone's ramp as its two ends and the white it leaves, and a
               // desktop's shares: a probe works the expected width out from
               // these rather than holding a copy of numbers that go stale.
               disc: { from: RUNGS[0].px, to: BIG_PASTE_PX, gutter: DISC_GUTTER_PX,
                       wide: DISC_TUNING.wide.slice(), rungs: RUNGS.map(function (r) { return r.px; }) },
               // How many letters break apart before words do, and words before
               // lines; the share a show after the first gets; and the whole
               // show's time and its wait for the pull, at full length.
               interlude: { pieces: IL_PIECES_MAX, again: IL_AGAIN_SHARE, total: IL_TOTAL_MS,
                            grow: IL_SUCK_AT_MS },
               // How long a phone's slide is, and the most a slide that never
               // draws may keep the next step waiting.
               slide: { ms: VIEW_SLIDE_MS, slack: VIEW_SLIDE_SLACK_MS,
                        start: VIEW_SLIDE_START_MS, wait: VIEW_SLIDE_WAIT_MS } };
    };

    // A choice made in Advanced wins, in both directions. With no choice
    // stored, the browser's own reduced-motion setting decides the movement,
    // and the celebration stays on.
    var savedAnim = readPref("animations");
    animationsOn = (savedAnim === null) ? !prefersLessMotion() : (savedAnim === "on");
    var savedCeleb = readPref("celebration");
    celebrationOn = (savedCeleb === null) ? CELEBRATION_DEFAULT : (savedCeleb === "on");
    // The show is on with nothing stored. A person who has never pressed the
    // button is the person it is for.
    var savedShow = readPref("interlude");
    if (savedShow !== null) interludeShow = (savedShow === "on");

    markCurrentPage();
    wireHome();
    wireDrawer();
    wireOptionFields();
    wirePageDrop();
    wireDisplayToggles();
    wireSubTabs();
    if (hasEngine) { wireBoundedZone(); wirePaste(); }
    wireSnippets();
    wireTutorial();
    wirePromptDemo();
  }

  init();
})();
