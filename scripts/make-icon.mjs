// SPDX-FileCopyrightText: 2026 Stamp contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Generates icon.png — a tiny, dependency-free illustration of what the
 * extension does: a dark "editor" with a colored status bar across the bottom,
 * split into segments to suggest "different projects, different colors".
 *
 * Run with: npm run make:icon  (or: node scripts/make-icon.mjs)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SIZE = 128;

const COLORS = {
  bg: [37, 37, 38], // #252526 editor dark
  panel: [30, 30, 30], // #1e1e1e
  green: [46, 125, 50], // #2e7d32
  blue: [21, 101, 192], // #1565c0
  orange: [239, 108, 0], // #ef6c00
};

function makePixels() {
  const px = Buffer.alloc(SIZE * SIZE * 3);
  const barTop = Math.round(SIZE * 0.74); // status bar occupies bottom ~26%
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let c;
      if (y < barTop) {
        // Editor area, with a slightly darker inset panel for depth.
        const inset = x > 14 && x < SIZE - 14 && y > 14 && y < barTop - 8;
        c = inset ? COLORS.panel : COLORS.bg;
      } else if (x < SIZE / 3) {
        c = COLORS.green;
      } else if (x < (2 * SIZE) / 3) {
        c = COLORS.blue;
      } else {
        c = COLORS.orange;
      }
      const i = (y * SIZE + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type 2 = truecolor RGB
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Raw image: each scanline prefixed with filter byte 0.
  const stride = SIZE * 3;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'icon.png');
writeFileSync(out, encodePng(makePixels()));
console.log(`Wrote ${out} (${SIZE}x${SIZE})`);
