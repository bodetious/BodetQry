// --- Apply null bitmap to decoded values ---
function applyNullBitmap(decoded, bitmap, rowCount) {
  const results = [];
  let di = 0;
  for (let i = 0; i < rowCount; i++) {
    const byte = bitmap[Math.floor(i / 8)];
    const bit = 1 << (i % 8);
    if (byte & bit) {
      results.push(decoded[di++]);
    } else {
      results.push(null);
    }
  }
  return results;
}

function countNulls(bitmap, rowCount) {
  let count = 0;
  for (let i = 0; i < rowCount; i++) {
    const byte = bitmap[Math.floor(i / 8)];
    const bit = 1 << (i % 8);
    if (!(byte & bit)) count++;
  }
  return count;
}

// --- Raw decode ---
function decodeRaw(buf, type, nonNullCount) {
  const values = [];
  let offset = 0;
  for (let i = 0; i < nonNullCount; i++) {
    if (type === "int") {
      values.push(buf.readInt32LE(offset));
      offset += 4;
    } else {
      const len = buf.readUInt32LE(offset);
      offset += 4;
      const str = buf.slice(offset, offset + len).toString("utf8");
      values.push(str);
      offset += len;
    }
  }
  return { values, consumed: offset };
}

// --- RLE decode (stub) ---
function decodeRLE(buf, type, nonNullCount) {
  // TODO implement real RLE decode
  return decodeRaw(buf, type, nonNullCount);
}

// --- Dictionary decode (stub) ---
function decodeDict(buf, type, nonNullCount) {
  // TODO implement real Dict decode
  return decodeRaw(buf, type, nonNullCount);
}

// --- Decode one column group ---
function decodeColumnGroup(buf, type, rowCount) {
  let offset = 0;

  const encodingType = buf.readUInt8(offset);
  offset += 1;

  const bitmapLen = buf.readUInt32LE(offset);
  offset += 4;

  const bitmap = buf.slice(offset, offset + bitmapLen);
  offset += bitmapLen;

  const nonNullCount = rowCount - countNulls(bitmap, rowCount);
  let decoded;
  if (encodingType === 0) decoded = decodeRaw(buf.slice(offset), type, nonNullCount);
  else if (encodingType === 1) decoded = decodeRLE(buf.slice(offset), type, nonNullCount);
  else if (encodingType === 2) decoded = decodeDict(buf.slice(offset), type, nonNullCount);
  else throw new Error(`Unknown encoding type ${encodingType}`);

  const values = applyNullBitmap(decoded.values, bitmap, rowCount);
  const consumed = offset + decoded.consumed;

  return { values, consumed };
}

module.exports = {
  decodeColumnGroup,
  decodeRaw,
  decodeRLE,
  decodeDict,
  applyNullBitmap
};
