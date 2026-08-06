/**
 * สร้างไอคอน PNG สำหรับ PWA โดยไม่ต้องพึ่ง library ภายนอก
 *   node scripts/make-icons.mjs
 * เขียนทับ public/icon-192.png และ public/icon-512.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const NAVY = [0x1c, 0x2b, 0x39];
const GOLD = [0xa6, 0x78, 0x4c];
const CREAM = [0xd9, 0xc9, 0xa8];

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// สมุดบัญชีแบบเรียบ: พื้นกรมท่า มีเส้นบรรทัดสีทองและสันปกด้านซ้าย
function pixel(x, y, size) {
  const u = x / size, v = y / size;
  if (u > 0.16 && u < 0.19) return CREAM;            // สันปก
  if (u > 0.28 && u < 0.84) {
    for (const line of [0.30, 0.44, 0.58]) {
      if (v > line && v < line + 0.055) return GOLD;  // เส้นบรรทัด
    }
    if (v > 0.72 && v < 0.775 && u < 0.60) return CREAM; // บรรทัดสั้นล่างสุด
  }
  return NAVY;
}

for (const size of [192, 512]) {
  const out = resolve(`public/icon-${size}.png`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(size, pixel));
  console.log('เขียน', out);
}
