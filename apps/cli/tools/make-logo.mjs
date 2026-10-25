/**
 * Turns the logo image into the terminal emblem in src/ui/logo/emblem-art.ts. Run by hand, only when the
 * logo changes; nothing at runtime reads an image:
 *
 *   node apps/cli/tools/make-logo.mjs path/to/logo.png            # writes src/ui/logo/emblem-art.ts
 *   node apps/cli/tools/make-logo.mjs path/to/logo.png --preview  # prints the dot grids, writes nothing
 *
 * How it gets a fine shape out of text: a braille character is a 2x4 grid of dots, so one terminal cell
 * carries 8 pixels (a half-block carries 2). The image's bright strokes are found, the shape is fitted into
 * a grid of dots, and each dot is lit when enough of its patch of the image is stroke. Each cell also keeps
 * where its colour sits between the logo's two ends (green 0 .. cyan 9), so a theme can recolour it.
 *
 * The PNG is decoded here with node:zlib (8-bit RGBA, not interlaced), so the tool needs no dependency.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

// ---- tuning -----------------------------------------------------------------------

/** A pixel is stroke when it is bright (the glow around the strokes is dimmer) and green or cyan (the corner sparkle is grey). */
const MIN_BRIGHTNESS = 170;
const MIN_GREEN_OVER_RED = 60;
/** A dot lights when at least this share of its patch of the image is stroke. */
const DOT_COVERAGE = 0.5;
/** Margin kept around the shape, as a share of its larger side. */
const MARGIN = 0.02;

/** Sizes written out: text rows x text columns (a cell is 2 dots wide and 4 tall). */
const SIZES = { EMBLEM_LARGE: { rows: 14, columns: 28 }, EMBLEM_MEDIUM: { rows: 7, columns: 14 } };

// ---- PNG --------------------------------------------------------------------------

function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG file");
  let width = 0;
  let height = 0;
  const data = [];
  for (let position = 8; position < buffer.length; ) {
    const length = buffer.readUInt32BE(position);
    const type = buffer.subarray(position + 4, position + 8).toString();
    const body = buffer.subarray(position + 8, position + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("expected an 8-bit RGBA PNG that is not interlaced");
    } else if (type === "IDAT") {
      data.push(body);
    }
    position += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? out[x - 4] : 0;
      const up = above[x];
      const upLeft = x >= 4 ? above[x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dLeft = Math.abs(estimate - left);
        const dUp = Math.abs(estimate - up);
        const dUpLeft = Math.abs(estimate - upLeft);
        predicted = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      }
      out[x] = (line[x] + predicted) & 255;
    }
  }
  return { width, height, pixels };
}

// ---- finding the strokes ----------------------------------------------------------

function findStrokes({ width, height, pixels }) {
  const mask = new Uint8Array(width * height);
  const box = { x0: width, y0: height, x1: -1, y1: -1 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      if (a > 128 && Math.max(r, g, b) >= MIN_BRIGHTNESS && g - r >= MIN_GREEN_OVER_RED) {
        mask[y * width + x] = 1;
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  if (box.x1 < 0) throw new Error("no bright green/cyan strokes found; check the thresholds at the top of this file");
  return { mask, box };
}

/** Where a stroke pixel's colour sits between the logo's green end (0) and cyan end (1): the blue channel rises from one to the other. */
function toneEnds(image, mask, box) {
  const { width, pixels } = image;
  const band = Math.max(1, Math.round((box.y1 - box.y0) * 0.1));
  const mean = (yFrom, yTo) => {
    let sum = [0, 0, 0];
    let count = 0;
    for (let y = yFrom; y < yTo; y += 1) {
      for (let x = box.x0; x <= box.x1; x += 1) {
        if (!mask[y * width + x]) continue;
        const i = (y * width + x) * 4;
        sum = [sum[0] + pixels[i], sum[1] + pixels[i + 1], sum[2] + pixels[i + 2]];
        count += 1;
      }
    }
    return sum.map((channel) => Math.round(channel / Math.max(1, count)));
  };
  return { top: mean(box.y0, box.y0 + band), bottom: mean(box.y1 - band, box.y1) };
}

// ---- summed-area tables: the stroke share of any rectangle in constant time ----------

function integral(width, height, value) {
  const table = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += value(x, y);
      table[(y + 1) * (width + 1) + x + 1] = table[y * (width + 1) + x + 1] + row;
    }
  }
  return (x0, y0, x1, y1) => {
    const clamp = (v, max) => Math.min(max, Math.max(0, Math.round(v)));
    const [a, b, c, d] = [clamp(x0, width), clamp(y0, height), clamp(x1, width), clamp(y1, height)];
    return table[d * (width + 1) + c] - table[b * (width + 1) + c] - table[d * (width + 1) + a] + table[b * (width + 1) + a];
  };
}

// ---- braille -------------------------------------------------------------------------

/** Dot (column 0/1, row 0..3) to its bit in the braille character U+2800..U+28FF. */
const BIT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

function renderEmblem(image, strokes, ends, { rows, columns }) {
  const { width, height, pixels } = image;
  const { mask, box } = strokes;
  const covered = integral(width, height, (x, y) => mask[y * width + x]);
  const blue = integral(width, height, (x, y) => (mask[y * width + x] ? pixels[(y * width + x) * 4 + 2] : 0));

  // Fit the shape (plus margin) into the dot grid without distorting it, centred.
  const boxW = box.x1 - box.x0 + 1;
  const boxH = box.y1 - box.y0 + 1;
  const pad = Math.max(boxW, boxH) * MARGIN;
  const dotsW = columns * 2;
  const dotsH = rows * 4;
  const scale = Math.min(dotsW / (boxW + 2 * pad), dotsH / (boxH + 2 * pad)); // dots per source pixel
  const originX = box.x0 - pad - (dotsW / scale - (boxW + 2 * pad)) / 2;
  const originY = box.y0 - pad - (dotsH / scale - (boxH + 2 * pad)) / 2;
  const at = (dotX, dotY) => [originX + dotX / scale, originY + dotY / scale];

  const blueLow = ends.top[2];
  const blueHigh = ends.bottom[2];
  const dots = [];
  const art = { rows: [], tones: [] };

  for (let row = 0; row < rows; row += 1) {
    let glyphs = "";
    let tones = "";
    for (let column = 0; column < columns; column += 1) {
      let mask8 = 0;
      for (let dx = 0; dx < 2; dx += 1) {
        for (let dy = 0; dy < 4; dy += 1) {
          const [x0, y0] = at(column * 2 + dx, row * 4 + dy);
          const [x1, y1] = at(column * 2 + dx + 1, row * 4 + dy + 1);
          const share = covered(x0, y0, x1, y1) / Math.max(1, (x1 - x0) * (y1 - y0));
          const lit = share >= DOT_COVERAGE;
          if (lit) mask8 |= BIT[dx][dy];
          (dots[row * 4 + dy] ??= [])[column * 2 + dx] = lit ? "#" : ".";
        }
      }
      if (mask8 === 0) {
        glyphs += " ";
        tones += " ";
        continue;
      }
      const [cx0, cy0] = at(column * 2, row * 4);
      const [cx1, cy1] = at(column * 2 + 2, row * 4 + 4);
      const pixelsInCell = Math.max(1, covered(cx0, cy0, cx1, cy1));
      const meanBlue = blue(cx0, cy0, cx1, cy1) / pixelsInCell;
      const tone = Math.min(1, Math.max(0, (meanBlue - blueLow) / Math.max(1, blueHigh - blueLow)));
      glyphs += String.fromCharCode(0x2800 + mask8);
      tones += String(Math.round(tone * 9));
    }
    art.rows.push(glyphs);
    art.tones.push(tones);
  }
  return { art, dots };
}

// ---- main ------------------------------------------------------------------------------

const [source, ...flags] = process.argv.slice(2);
if (!source) {
  console.error("usage: node apps/cli/tools/make-logo.mjs <logo.png> [--preview]");
  process.exit(2);
}

const image = decodePng(readFileSync(source));
const strokes = findStrokes(image);
const ends = toneEnds(image, strokes.mask, strokes.box);
const rgb = ([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
console.log(`image ${image.width}x${image.height}, shape ${strokes.box.x1 - strokes.box.x0 + 1}x${strokes.box.y1 - strokes.box.y0 + 1} px`);
console.log(`stroke colour at the top ${rgb(ends.top)}, at the bottom ${rgb(ends.bottom)}`);

const generated = Object.entries(SIZES).map(([name, size]) => ({ name, size, ...renderEmblem(image, strokes, ends, size) }));

if (flags.includes("--preview")) {
  for (const { name, size, art, dots } of generated) {
    console.log(`\n== ${name}: ${size.rows} rows x ${size.columns} columns (dots)`);
    console.log(dots.map((line) => line.join("")).join("\n"));
    console.log(`== ${name} (braille)`);
    console.log(art.rows.join("\n"));
  }
  process.exit(0);
}

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/logo/emblem-art.ts");
const literal = (lines) => `[\n${lines.map((line) => `    ${JSON.stringify(line)},`).join("\n")}\n  ]`;
const body = generated
  .map(({ name, art }) => `export const ${name}: EmblemArt = {\n  rows: ${literal(art.rows)},\n  tones: ${literal(art.tones)},\n};\n`)
  .join("\n");

writeFileSync(
  target,
  `/**
 * The terminal emblem, as data. GENERATED by apps/cli/tools/make-logo.mjs from the logo image: do not edit by hand,
 * run the tool again instead. Each row is braille characters (a 2x4 dot grid per cell); \`tones\` has one digit per
 * cell, 0 for the logo's green end to 9 for its cyan end, so a theme's gradient can colour it. A space is an empty cell.
 */

export interface EmblemArt {
  rows: string[];
  tones: string[];
}

${body}`,
);
console.log(`\nwrote ${path.relative(process.cwd(), target)}`);
