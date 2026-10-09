/* Generates the small geometric tab icons with Node's built-in modules. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const size = 64;
const scale = 4;
const dim = size * scale;
const out = path.resolve(__dirname, '../assets');
fs.mkdirSync(out, {recursive: true});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
function draw(name, color, painter) {
  const alpha = new Uint8Array(dim * dim);
  const brush = (x, y, r = 1.7) => {
    const cx = x * scale, cy = y * scale, radius = r * scale;
    for (let yy = Math.max(0, Math.floor(cy - radius)); yy <= Math.min(dim - 1, Math.ceil(cy + radius)); yy++) {
      for (let xx = Math.max(0, Math.floor(cx - radius)); xx <= Math.min(dim - 1, Math.ceil(cx + radius)); xx++) {
        if ((xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2) alpha[yy * dim + xx] = 255;
      }
    }
  };
  const line = (x1, y1, x2, y2, width = 1.7) => {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * scale);
    for (let i = 0; i <= steps; i++) brush(x1 + (x2 - x1) * i / Math.max(1, steps), y1 + (y2 - y1) * i / Math.max(1, steps), width);
  };
  const arc = (cx, cy, r, start = 0, end = Math.PI * 2) => {
    const steps = Math.ceil(Math.abs(end - start) * r * scale);
    for (let i = 0; i <= steps; i++) {
      const angle = start + (end - start) * i / steps;
      brush(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
  };
  const polyline = points => points.slice(1).forEach((point, index) => line(...points[index], ...point));
  const rectangle = (x, y, w, h) => polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
  painter({line, arc, brush, polyline, rectangle});
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) sum += alpha[(y * scale + sy) * dim + x * scale + sx];
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2]; raw[offset + 3] = Math.round(sum / (scale * scale));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const icons = {
  overview({rectangle}) { rectangle(13, 13, 15, 15); rectangle(37, 13, 15, 15); rectangle(13, 37, 15, 15); rectangle(37, 37, 15, 15); },
  irrigation({arc, polyline, line}) { polyline([[18, 30], [32, 11], [46, 30]]); arc(32, 35, 15, -Math.PI / 9, Math.PI + Math.PI / 9); line(23, 37, 30, 41); line(30, 41, 41, 32); },
  plans({rectangle, line, brush}) { rectangle(13, 17, 39, 35); line(13, 28, 52, 28); line(23, 11, 23, 23); line(42, 11, 42, 23); brush(24, 37, 2.2); brush(34, 37, 2.2); brush(43, 37, 2.2); brush(24, 45, 2.2); brush(34, 45, 2.2); },
  alerts({arc, line}) { arc(32, 26, 14, Math.PI, Math.PI * 2); line(18, 26, 18, 39); line(46, 26, 46, 39); line(18, 39, 13, 46); line(46, 39, 51, 46); line(13, 46, 51, 46); arc(32, 47, 7, 0, Math.PI); line(32, 8, 32, 11); },
  profile({arc, line}) { arc(32, 22, 10); arc(32, 51, 19, Math.PI, Math.PI * 2); line(13, 51, 51, 51); }
};
for (const [name, painter] of Object.entries(icons)) {
  draw(name, [133, 146, 166], painter);
  draw(name + '-active', [22, 98, 232], painter);
}
process.stdout.write('Generated 10 tab icons.\n');
