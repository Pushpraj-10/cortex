/**
 * Turns the logo image into the terminal emblem in src/ui/logo/emblem-art.ts. Run by hand, only when the
 * logo changes; nothing at runtime reads an image:
 *
 *   node apps/cli/tools/make-logo.mjs path/to/logo.png            # writes src/ui/logo/emblem-art.ts
 *   node apps/cli/tools/make-logo.mjs path/to/logo.png --preview  # prints the pixel grids, writes nothing
 *
 * The logo is two flat shapes (a red C and a dark panel), drawn as braille dots: one terminal cell is a 2x4 grid of
 * dots. The shape is fitted into a grid of dots and a dot is lit when at least half of its patch of the image is red or
 * panel. Each cell takes the colour of whichever shape has more dots in it; the UI draws the red in the theme's primary
 * colour and the panel in a whitish grey.
 *
 * The PNG is decoded here with node:zlib (8-bit RGBA, not interlaced), so the tool needs no dependency.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

// ---- tuning -----------------------------------------------------------------------

/** A pixel is red when it is opaque, strongly red and not much of anything else. */
const isRed = (r, g, b, a) => a > 128 && r >= 150 && g <= 100 && b <= 100;
/** It is the panel when it is opaque and very dark (the prompt's strokes are cut out, so they are transparent). */
const isPanel = (r, g, b, a) => a > 128 && Math.max(r, g, b) < 90;
/** A grid pixel takes a class when at least this share of its patch of the image has it. */
const COVERAGE = 0.5;
/** How the shapes are drawn in dots: "solid", "outline" (edge dots only) or "stipple" (every other dot). Set CORTEX_LOGO_STYLE to preview. */
const STYLE = process.env.CORTEX_LOGO_STYLE ?? "outline";
/** Margin kept around the shape, as a share of its larger side. */
const MARGIN = 0.01;

/** Sizes written out: text rows x text columns (a cell is 2 dots wide and 4 tall). */
const SIZES = { EMBLEM_LARGE: { rows: 7, columns: 18 }, EMBLEM_MEDIUM: { rows: 4, columns: 10 } };

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

// ---- finding the shape ------------------------------------------------------------

function classify({ width, height, pixels }) {
  const red = new Uint8Array(width * height);
  const panel = new Uint8Array(width * height);
  const box = { x0: width, y0: height, x1: -1, y1: -1 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      const isR = isRed(r, g, b, a);
      const isP = !isR && isPanel(r, g, b, a);
      if (isR) red[y * width + x] = 1;
      if (isP) panel[y * width + x] = 1;
      if (isR || isP) {
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  if (box.x1 < 0) throw new Error("no red or panel pixels found; check the thresholds at the top of this file");
  return { red, panel, box };
}

// ---- summed-area table: the stroke share of any rectangle in constant time ------------

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

// ---- braille ---------------------------------------------------------------------------

/** Dot (column 0/1, row 0..3) to its bit in the braille character U+2800..U+28FF. */
const BIT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

function renderEmblem(image, shape, { rows, columns }) {
  const { width, height } = image;
  const { red, panel, box } = shape;
  const redShare = integral(width, height, (x, y) => red[y * width + x]);
  const panelShare = integral(width, height, (x, y) => panel[y * width + x]);

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

  // First every dot's class (R, P or empty), then which of them are drawn, then the braille characters.
  const classOf = [];
  for (let dy = 0; dy < dotsH; dy += 1) {
    classOf[dy] = [];
    for (let dx = 0; dx < dotsW; dx += 1) {
      const [x0, y0] = at(dx, dy);
      const [x1, y1] = at(dx + 1, dy + 1);
      const area = Math.max(1, (x1 - x0) * (y1 - y0));
      classOf[dy][dx] = redShare(x0, y0, x1, y1) / area >= COVERAGE ? "R" : panelShare(x0, y0, x1, y1) / area >= COVERAGE ? "P" : ".";
    }
  }
  // The prompt (>_) is cut out of the panel, so its dots are empty ones with panel on every side: mark them "G". They are
  // drawn solid inside the panel's outline, where an outline of something only a few dots across would be noise.
  const panelBeyond = (dx, dy, stepX, stepY) => {
    for (let x = dx + stepX, y = dy + stepY; x >= 0 && y >= 0 && x < dotsW && y < dotsH; x += stepX, y += stepY) {
      if (classOf[y][x] === "P") return true;
    }
    return false;
  };
  const holes = [];
  for (let dy = 0; dy < dotsH; dy += 1) {
    for (let dx = 0; dx < dotsW; dx += 1) {
      if (classOf[dy][dx] === "." && panelBeyond(dx, dy, -1, 0) && panelBeyond(dx, dy, 1, 0) && panelBeyond(dx, dy, 0, -1) && panelBeyond(dx, dy, 0, 1)) holes.push([dx, dy]);
    }
  }
  for (const [dx, dy] of holes) classOf[dy][dx] = "G";

  const kindMatches = (found, kind) => found === kind || (kind === "P" && found === "G");
  const sameAt = (dx, dy, kind) => dx >= 0 && dy >= 0 && dx < dotsW && dy < dotsH && kindMatches(classOf[dy][dx], kind);
  /** Whether a dot of the shape is drawn: all of them, or only the ones on its edge, or every other one. */
  const drawn = (dx, dy) => {
    const kind = classOf[dy][dx];
    if (kind === ".") return false;
    if (kind === "G") return STYLE === "outline"; // the prompt: solid in an outline, a cut-out in the other styles
    if (STYLE === "solid") return true;
    if (STYLE === "stipple") return (dx + dy) % 2 === 0;
    const inside = sameAt(dx - 1, dy, kind) && sameAt(dx + 1, dy, kind) && sameAt(dx, dy - 1, kind) && sameAt(dx, dy + 1, kind);
    return !inside;
  };

  const dots = [];
  const art = { rows: [], tones: [] };

  for (let row = 0; row < rows; row += 1) {
    let glyphs = "";
    let tones = "";
    for (let column = 0; column < columns; column += 1) {
      let cell = 0;
      let redDots = 0;
      let panelDots = 0;
      for (let dx = 0; dx < 2; dx += 1) {
        for (let dy = 0; dy < 4; dy += 1) {
          const [x, y] = [column * 2 + dx, row * 4 + dy];
          const lit = drawn(x, y);
          if (lit) cell |= BIT[dx][dy];
          if (lit && classOf[y][x] === "R") redDots += 1;
          if (lit && (classOf[y][x] === "P" || classOf[y][x] === "G")) panelDots += 1;
          (dots[y] ??= [])[x] = lit ? (classOf[y][x] === "G" ? "P" : classOf[y][x]) : ".";
        }
      }
      glyphs += cell === 0 ? " " : String.fromCharCode(0x2800 + cell);
      // A cell has one colour: whichever of the two shapes has more dots in it (the red on a tie).
      tones += cell === 0 ? " " : panelDots > redDots ? "P" : "R";
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
const shape = classify(image);
console.log(`image ${image.width}x${image.height}, shape ${shape.box.x1 - shape.box.x0 + 1}x${shape.box.y1 - shape.box.y0 + 1} px`);

const generated = Object.entries(SIZES).map(([name, size]) => ({ name, size, ...renderEmblem(image, shape, size) }));

if (flags.includes("--preview")) {
  for (const { name, size, art, dots } of generated) {
    console.log(`\n== ${name}: ${size.rows} rows x ${size.columns} columns (dots)`);
    console.log(dots.map((line) => line.join("")).join("\n"));
    console.log(`== ${name} (braille)`);
    console.log(art.rows.join("\n"));
    console.log(art.tones.join("\n"));
  }
  process.exit(0);
}

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/logo/emblem-art.ts");
const list = (lines) => lines.map((line) => `    ${JSON.stringify(line)},`).join("\n");
const body = generated
  .map(({ name, art }) => `export const ${name}: EmblemArt = {\n  rows: [\n${list(art.rows)}\n  ],\n  tones: [\n${list(art.tones)}\n  ],\n};\n`)
  .join("\n");

writeFileSync(
  target,
  `/**
 * The terminal emblem, as data. GENERATED by apps/cli/tools/make-logo.mjs from the logo image: do not edit by hand,
 * run the tool again instead. Each row is braille characters (a 2x4 dot grid per cell); a space is an empty cell.
 * \`tones\` says what each cell is: R for the logo's red, P for its dark panel (the UI draws it in a whitish grey), a space
 * for nothing. Colours are not stored: the UI picks them from the theme.
 */

export interface EmblemArt {
  rows: string[];
  tones: string[];
}

${body}`,
);
console.log(`\nwrote ${path.relative(process.cwd(), target)}`);
