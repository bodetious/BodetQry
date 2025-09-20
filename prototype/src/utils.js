const fs = require("fs");
const zlib = require("zlib");

// ---------------------------------
// Internal helpers
// ---------------------------------
function encodeColumn(values, type) {
  const buffers = [];

  if (type === "int") {
    if (values.every(v => v === values[0])) {
      buffers.push(Buffer.from([1])); // RLE
      const valBuf = Buffer.alloc(4); valBuf.writeInt32LE(values[0], 0);
      const runBuf = Buffer.alloc(4); runBuf.writeUInt32LE(values.length, 0);
      buffers.push(valBuf, runBuf);
    } else {
      buffers.push(Buffer.from([0])); // Raw
      for (let v of values) {
        const b = Buffer.alloc(4);
        b.writeInt32LE(v, 0);
        buffers.push(b);
      }
    }
  } else if (type === "string") {
    buffers.push(Buffer.from([0]));
    for (let v of values) {
      if (v == null) {
        const len = Buffer.alloc(4); len.writeUInt32LE(0, 0);
        buffers.push(len);
      } else {
        const strBuf = Buffer.from(String(v), "utf8");
        const len = Buffer.alloc(4); len.writeUInt32LE(strBuf.length, 0);
        buffers.push(len, strBuf);
      }
    }
  }

  return Buffer.concat(buffers);
}

function decodeRowGroup(buffer, schema, rowCount) {
  const rows = Array.from({ length: rowCount }, () => ({}));
  let offset = 0;

  for (let col of schema) {
    const encodingType = buffer.readUInt8(offset);
    offset += 1;

    if (col.type === "int") {
      if (encodingType === 1) {
        const val = buffer.readInt32LE(offset); offset += 4;
        const run = buffer.readUInt32LE(offset); offset += 4;
        for (let i = 0; i < run; i++) rows[i][col.name] = val;
      } else {
        for (let i = 0; i < rowCount; i++) {
          const v = buffer.readInt32LE(offset); offset += 4;
          rows[i][col.name] = v;
        }
      }
    } else if (col.type === "string") {
      for (let i = 0; i < rowCount; i++) {
        const strlen = buffer.readUInt32LE(offset); offset += 4;
        if (strlen === 0) {
          rows[i][col.name] = null;
        } else {
          const s = buffer.toString("utf8", offset, offset + strlen);
          offset += strlen;
          rows[i][col.name] = s;
        }
      }
    }
  }

  return rows;
}

// ---------------------------------
// Public exports
// ---------------------------------
function writeFile(path, schema, rows, rowsPerGroup = 100) {
  const headerBase = {
    version: 1,
    columns: schema,
    rowGroups: [],
    compression: "deflate",
    totalRowCount: rows.length
  };

  const rowGroupBlobs = [];

  for (let i = 0; i < rows.length; i += rowsPerGroup) {
    const group = rows.slice(i, i + rowsPerGroup);

    // --- Column stats ---
    const stats = {};
    schema.forEach(col => {
      const vals = group.map(r => r[col.name]);
      const nonNullVals = vals.filter(v => v != null);

      if (col.type === "int") {
        stats[col.name] = {
          min: nonNullVals.length ? Math.min(...nonNullVals) : null,
          max: nonNullVals.length ? Math.max(...nonNullVals) : null,
          nullCount: vals.length - nonNullVals.length
        };
      } else {
        const sorted = nonNullVals.slice().sort();
        stats[col.name] = {
          min: sorted.length ? sorted[0] : null,
          max: sorted.length ? sorted[sorted.length - 1] : null,
          nullCount: vals.length - nonNullVals.length
        };
      }
    });

    // --- Encode + compress ---
    const encodedCols = schema.map(col => {
      const vals = group.map(r => r[col.name]);
      return encodeColumn(vals, col.type);
    });
    const uncompressed = Buffer.concat(encodedCols);
    const compressed = zlib.deflateSync(uncompressed);
    rowGroupBlobs.push(compressed);

    headerBase.rowGroups.push({
      offset: 0,
      compressedLength: compressed.length,
      rowCount: group.length,
      stats
    });
  }

  // --- Compute final header with offsets ---
  function buildHeaderWithOffsets(base) {
    const header = JSON.parse(JSON.stringify(base));
    let headerJson = Buffer.from(JSON.stringify(header));
    let curOffset = 4 + headerJson.length;

    header.rowGroups.forEach((rg, idx) => {
      rg.offset = curOffset;
      curOffset += rowGroupBlobs[idx].length;
    });

    return header;
  }

  let header = headerBase;
  let prevLength = 0;
  let headerJson = Buffer.alloc(0);

  for (let attempt = 0; attempt < 5; attempt++) {
    header = buildHeaderWithOffsets(header);
    headerJson = Buffer.from(JSON.stringify(header));
    if (headerJson.length === prevLength) break;
    prevLength = headerJson.length;
  }

  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(headerJson.length, 0);

  const fileBuf = Buffer.concat([headerLen, headerJson, ...rowGroupBlobs]);
  fs.writeFileSync(path, fileBuf);
  console.log(`✅ File written to ${path}`);
}

function readFile(path, decode = false) {
  const data = fs.readFileSync(path);
  const headerLen = data.readUInt32LE(0);
  const header = JSON.parse(data.slice(4, 4 + headerLen).toString());
  console.log("📄 Header:", header);

  let allRows = [];
  header.rowGroups.forEach(rg => {
    const comp = data.slice(rg.offset, rg.offset + rg.compressedLength);
    const decomp = zlib.inflateSync(comp);

    if (!decode) {
      console.log(
        `RowGroup @${rg.offset}, rows=${rg.rowCount}, raw(hex)=${decomp.toString("hex")}`
      );
    } else {
      const rows = decodeRowGroup(decomp, header.columns, rg.rowCount);
      allRows = allRows.concat(rows);
    }
  });

  if (decode) {
    console.log("✅ Decoded Rows:", JSON.stringify(allRows, null, 2));
  }
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map(line => {
    const parts = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      const key = h.trim();
      const val = parts[i] ? parts[i].trim() : null;
      if (val === "" || val == null) {
        row[key] = null;
      } else if (/^-?\d+$/.test(val)) {
        row[key] = parseInt(val, 10);
      } else {
        row[key] = val;
      }
    });
    return row;
  });
  return { headers, rows };
}

function inferSchema(headers, rows) {
  return headers.map(h => {
    const allNums = rows.every(r => typeof r[h] === "number" || r[h] === null);
    return { name: h, type: allNums ? "int" : "string", nullable: true };
  });
}

module.exports = {
  writeFile,
  readFile,
  loadCsv,
  inferSchema
};
