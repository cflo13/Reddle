// ------------------------------------------------------------
// Picture cards drawn in the browser (canvas), to share or download.
// ------------------------------------------------------------
//   makeReviewCard(log)   a square card for one of your reviews
//   makeYearCard(stats)   a square card for your Year in review
//   shareCanvas(canvas, fileName, title)
//       opens the phone's share sheet with the picture when it can,
//       otherwise downloads it.
// 1080 x 1080 pixels: fits Instagram (feed and stories) and WhatsApp.
// Colours come from the site's colour tokens, so the card matches day or
// night mode. Covers from other websites are only drawn if that website
// allows it; otherwise the card shows a plain box with the title.
// ------------------------------------------------------------

const CARD_SIZE = 1080;
const CARD_FONT = themeFont("--font-sans");
const CARD_SERIF = themeFont("--font-serif");

// A font list from style.css (the same fonts as the site).
function themeFont(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "serif";
}

// A colour token from style.css, like "--bg" (themeColour is in auth.js).
function cardColour(name) {
  return themeColour(name);
}

// Loads a picture so it can be drawn on a canvas, or gives null.
function loadCardImage(url) {
  return new Promise(function (resolve) {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous"; // without this the canvas couldn't be saved
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth >= 10 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Splits text into lines that fit `maxWidth`, at most `maxLines`
// (the last one ends with "..." when the text is cut).
function wrapCardText(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const cut = lines.length === maxLines && lines.join(" ").length < words.join(" ").length;
  if (cut) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + "…";
  }
  return lines.slice(0, maxLines);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A cover at (x, y), w x h, or a plain box with the title.
function drawCardCover(ctx, img, title, x, y, w, h) {
  ctx.save();
  roundedRect(ctx, x, y, w, h, 12);
  ctx.clip();
  if (img) {
    // Fill the box, cutting off the edges if the shape differs.
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = cardColour("--surface");
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = cardColour("--text");
    ctx.font = "600 " + Math.round(w / 9) + "px " + CARD_FONT;
    ctx.textAlign = "center";
    wrapCardText(ctx, title, w - 30, 5).forEach((line, i) => ctx.fillText(line, x + w / 2, y + h / 3 + i * (w / 7.5)));
    ctx.textAlign = "left";
  }
  ctx.restore();
}

// "★★★★½" in the green star colour.
function drawCardStars(ctx, rating, x, y, size) {
  if (!rating) return;
  ctx.fillStyle = cardColour("--accent");
  ctx.font = size + "px " + CARD_FONT;
  ctx.fillText(starsText(rating), x, y);
}

// The site name in the bottom corner, on every card.
function drawCardFooter(ctx) {
  ctx.fillStyle = cardColour("--muted");
  ctx.font = "600 34px " + CARD_FONT;
  ctx.textAlign = "right";
  ctx.fillText("reddle.org", CARD_SIZE - 70, CARD_SIZE - 60);
  ctx.textAlign = "left";
}

function newCardCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = cardColour("--bg");
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  ctx.textBaseline = "alphabetic";
  return { canvas: canvas, ctx: ctx };
}

// A square card for one review: cover, title, author, stars, the first
// lines of the review, @username and reddle.org.
async function makeReviewCard(log) {
  const { canvas, ctx } = newCardCanvas();
  const book = log.books || {};
  const cover = await loadCardImage(book.cover_url);

  drawCardCover(ctx, cover, book.title, 70, 70, 300, 450);

  const textX = 420;
  const textWidth = CARD_SIZE - textX - 70;
  ctx.fillStyle = cardColour("--text");
  ctx.font = "600 58px " + CARD_SERIF;
  const titleLines = wrapCardText(ctx, book.title, textWidth, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, textX, 140 + i * 68));
  let y = 140 + titleLines.length * 68;
  if (book.author) {
    ctx.fillStyle = cardColour("--muted");
    ctx.font = "40px " + CARD_FONT;
    wrapCardText(ctx, "by " + book.author, textWidth, 2).forEach((line) => {
      ctx.fillText(line, textX, y + 10);
      y += 50;
    });
  }
  drawCardStars(ctx, log.rating, textX, y + 70, 64);

  // The review, under the cover, across the whole card.
  ctx.fillStyle = cardColour("--text");
  ctx.font = "42px " + CARD_FONT;
  const review = log.spoiler ? "Contains spoilers — read my review on Reddle." : log.review;
  wrapCardText(ctx, "“" + review + "”", CARD_SIZE - 140, 6).forEach((line, i) => ctx.fillText(line, 70, 610 + i * 58));

  if (log.profiles) {
    ctx.fillStyle = cardColour("--accent");
    ctx.font = "600 36px " + CARD_FONT;
    ctx.fillText("@" + log.profiles.username, 70, CARD_SIZE - 60);
  }
  drawCardFooter(ctx);
  return canvas;
}

// A square card for a Year in review. `stats` comes from js/year.js.
async function makeYearCard(stats) {
  const { canvas, ctx } = newCardCanvas();
  const best = stats.highest;
  const cover = best ? await loadCardImage(best.book.cover_url) : null;

  ctx.fillStyle = cardColour("--muted");
  ctx.font = "600 40px " + CARD_FONT;
  ctx.fillText("@" + stats.username + "’s", 70, 120);
  ctx.fillStyle = cardColour("--text");
  ctx.font = "600 84px " + CARD_SERIF;
  ctx.fillText(stats.year + " in books", 70, 215);

  // Big numbers on the left
  const rows = [
    [String(stats.count), stats.count === 1 ? "book read" : "books read"],
    [stats.pages ? stats.pages.toLocaleString() : "–", "pages"],
    [stats.average ? stats.average.toFixed(1) + " ★" : "–", "average rating"],
  ];
  rows.forEach(function (row, i) {
    const top = 340 + i * 150;
    ctx.fillStyle = cardColour("--accent");
    ctx.font = "600 88px " + CARD_SERIF;
    ctx.fillText(row[0], 70, top);
    ctx.fillStyle = cardColour("--muted");
    ctx.font = "36px " + CARD_FONT;
    ctx.fillText(row[1], 70, top + 46);
  });

  ctx.fillStyle = cardColour("--text");
  ctx.font = "36px " + CARD_FONT;
  let y = 810;
  if (stats.topGenres.length) {
    wrapCardText(ctx, "Top genres: " + stats.topGenres.join(", "), 560, 2).forEach((line) => {
      ctx.fillText(line, 70, y);
      y += 46;
    });
  }
  if (stats.busiestMonth) ctx.fillText("Busiest month: " + stats.busiestMonth, 70, y + 10);

  // Favourite book on the right
  if (best) {
    ctx.fillStyle = cardColour("--muted");
    ctx.font = "600 32px " + CARD_FONT;
    ctx.fillText("Highest rated", 680, 300);
    drawCardCover(ctx, cover, best.book.title, 680, 330, 330, 495);
    ctx.fillStyle = cardColour("--text");
    ctx.font = "600 34px " + CARD_FONT;
    wrapCardText(ctx, best.book.title, 330, 2).forEach((line, i) => ctx.fillText(line, 680, 875 + i * 42));
  }
  drawCardFooter(ctx);
  return canvas;
}

// Share sheet (phones) or download (computers).
async function shareCanvas(canvas, fileName, title) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The picture couldn't be made.");
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title });
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  return "downloaded";
}

// "my-review-dune.png"
function cardFileName(start, title) {
  const slug = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return start + (slug ? "-" + slug : "") + ".png";
}
