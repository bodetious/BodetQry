const { Buffer } = require("buffer");

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

// --- Raw ---
function encodeRaw(values, type) {
  const bufs = [];
  values.forEach(v => {
    if (v == null || v === "") return;
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

// --- RLE ---
function encodeRLE(values, type) {
  const bufs = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    if (v == null || v === "") { i++; continue; } // nulls handled by bitmap
    let run = 1;
    while (i + run < values.length && values[i + run] === v) run++;
    const runBuf = Buffer.alloc(4);
    runBuf.writeUInt32LE(run, 0);
    bufs.push(runBuf);
    if (type === "int") {
      const valBuf = Buffer.alloc(4);
      valBuf.writeInt32LE(Number(v), 0);
      bufs.push(valBuf);
    } else {
      const strBuf = Buffer.from(v, "utf8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(strBuf.length, 0);
      bufs.push(lenBuf, strBuf);
    }
    i += run;
  }
  return Buffer.concat(bufs);
}

// --- Dictionary ---
function encodeDict(values, type) {
  const dict = [];
  const dictMap = new Map();
  const indices = [];

  values.forEach(v => {
    if (v == null || v === "") { indices.push(-1); return; }
    if (!dictMap.has(v)) {
      dictMap.set(v, dict.length);
      dict.push(v);
    }
    indices.push(dictMap.get(v));
  });

  const bufs = [];

  // dictionary length
  const dictLenBuf = Buffer.alloc(4);
  dictLenBuf.writeUInt32LE(dict.length, 0);
  bufs.push(dictLenBuf);

  // dictionary entries
  dict.forEach(dv => {
    if (type === "int") {
      const valBuf = Buffer.alloc(4);
      valBuf.writeInt32LE(Number(dv), 0);
      bufs.push(valBuf);
    } else {
      const strBuf = Buffer.from(dv, "utf8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(strBuf.length, 0);
      bufs.push(lenBuf, strBuf);
    }
  });

  // indices (skip nulls, they’re handled by bitmap)
  indices.forEach(ix => {
    if (ix >= 0) {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(ix, 0);
      bufs.push(buf);
    }
  });

  return Buffer.concat(bufs);
}

// --- Decide encoding type ---
function encodeColumnGroup(values, type) {
  const n = values.length;
  const uniques = [...new Set(values.filter(v => v != null && v !== ""))];

  // crude heuristic: long runs => RLE, few uniques => Dict
  let encodingType = 0;
  let payload;

  // check run length
  let maxRun = 1, run = 1;
  for (let i = 1; i < n; i++) {
    if (values[i] !== null && values[i] === values[i - 1]) {
      run++;
      if (run > maxRun) maxRun = run;
    } else run = 1;
  }

  if (maxRun > n / 2) {
    encodingType = 1;
    payload = encodeRLE(values, type);
  } else if (uniques.length > 0 && uniques.length <= n / 4) {
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
