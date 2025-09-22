const { Buffer } = require("buffer");

// --- Build null bitmap ---
function buildNullBitmap(values) {
  const n = values.length;
  const bitmap = Buffer.alloc(Math.ceil(n / 8));
  values.forEach((v, i) => {
    if (v != null && v !== "") {
      bitmap[Math.floor(i / 8)] |= (1 << (i % 8));
    }
  });
  return bitmap;
}

// --- Raw encoding (no compression, just values) ---
function encodeRaw(values, type) {
  const bufs = [];
  values.forEach(v => {
    if (v == null || v === "") return; // skip nulls (bitmap handles them)
    if (type === "int") {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(Number(v), 0);
      bufs.push(buf);
    } else {
      const strBuf = Buffer.from(v, "utf8");
      const len = Buffer.alloc(4);
      len.writeUInt32LE(strBuf.length, 0);
      bufs.push(len, strBuf);
    }
  });
  return Buffer.concat(bufs);
}

// --- RLE encoding (stub for now) ---
function encodeRLE(values, type) {
  // TODO: implement real RLE
  return encodeRaw(values, type);
}

// --- Dictionary encoding (stub for now) ---
function encodeDict(values, type) {
  // TODO: implement real dictionary
  return encodeRaw(values, type);
}

// --- Decide encoding type ---
function encodeColumnGroup(values, type) {
  const n = values.length;
  const uniques = [...new Set(values.filter(v => v != null && v !== ""))];
  const runCount = 0; // TODO: implement run counting

  let encodingType = 0;
  let payload;

  if (runCount > n / 2) {
    encodingType = 1;
    payload = encodeRLE(values, type);
  } else if (uniques.length < n / 4) {
    encodingType = 2;
    payload = encodeDict(values, type);
  } else {
    encodingType = 0;
    payload = encodeRaw(values, type);
  }

  const bitmap = buildNullBitmap(values);
  const bitmapLen = Buffer.alloc(4);
  bitmapLen.writeUInt32LE(bitmap.length, 0);

  const header = Buffer.from([encodingType]);
  return Buffer.concat([header, bitmapLen, bitmap, payload]);
}

module.exports = {
  encodeColumnGroup,
  encodeRaw,
  encodeRLE,
  encodeDict,
  buildNullBitmap
};
