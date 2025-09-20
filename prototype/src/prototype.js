// src/prototype.js
// Prototype reader/writer for BodetQry (.bq) files

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function encodeColumn(values, type) {
  const buffers = [];

  if (type === "int") {
    // RLE if all values are identical
    if (values.every(v => v === values[0])) {
      buffers.push(Buffer.from([1])); // Encoding type = RLE
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
    buffers.push(Buffer.from([0])); // Raw for now
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

function writeFile(path, schema, rows, rowsPerGroup = 100) {
  const headerBase = {
    version: 1,
    columns: schema,
    rowGroups: [],
    compression: "deflate",
    totalRowCount: rows.length
  };

  const rowGroupBlobs = [];

  // Build row groups
  for (let i = 0; i < rows.length; i += rowsPerGroup) {
    const group = rows.slice(i, i + rowsPerGroup);
    const encodedCols = schema.map(col => {
      const vals = group.map(r => r[col.name]);
      return encodeColumn(vals, col.type);
    });
    const uncompressed = Buffer.concat(encodedCols);
    const compressed = zlib.deflateSync(uncompressed);
    rowGroupBlobs.push(compressed);

    headerBase.rowGroups.push({
      offset: 0, // placeholder
      compressedLength: compressed.length,
      rowCount: group.length
    });
  }

  // Function to compute final header and offsets
  function buildHeaderWithOffsets(rowGroupBlobs, base) {
    let header = JSON.parse(JSON.stringify(base)); // deep copy
    let headerJson = Buffer.from(JSON.stringify(header));
    let curOffset = 4 + headerJson.length;

    header.rowGroups.forEach((rg, idx) => {
      rg.offset = curOffset;
      curOffset += rowGroupBlobs[idx].length;
    });

    return header;
  }

  // Recompute header until stable
  let header = headerBase;
  let prevLength = 0;
  let headerJson = Buffer.alloc(0);

  for (let attempt = 0; attempt < 5; attempt++) {
    header = buildHeaderWithOffsets(rowGroupBlobs, header);
    headerJson = Buffer.from(JSON.stringify(header));
    if (headerJson.length === prevLength) break; // stable
    prevLength = headerJson.length;
  }

  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(headerJson.length, 0);

  const fileBuf = Buffer.concat([headerLen, headerJson, ...rowGroupBlobs]);
  fs.writeFileSync(path, fileBuf);

  console.log(`✅ File written to ${path}`);
}

function decodeRowGroup(buffer, schema, rowCount) {
  const rows = Array.from({ length: rowCount }, () => ({}));
  let offset = 0;

  for (let col of schema) {
    const encodingType = buffer.readUInt8(offset);
    offset += 1;

    if (col.type === "int") {
      if (encodingType === 1) {
        // RLE
        const val = buffer.readInt32LE(offset); offset += 4;
        const run = buffer.readUInt32LE(offset); offset += 4;
        for (let i = 0; i < run; i++) rows[i][col.name] = val;
      } else {
        // Raw
        for (let i = 0; i < rowCount; i++) {
          const v = buffer.readInt32LE(offset); offset += 4;
          rows[i][col.name] = v;
        }
      }
    } else if (col.type === "string") {
      // Raw only for now
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

// -----------------------------
// CSV Loader
// -----------------------------
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
        // strictly decimal integer
        row[key] = parseInt(val, 10);
      } else {
        // everything else as string
        row[key] = val;
      }
    });
    return row;
  });
  return { headers, rows };
}

// -----------------------------
// CLI Entrypoint
// -----------------------------
const mode = process.argv[2];
const extra = process.argv[3];
const outFile = "data/test.bq";

if (mode === "write") {
  const csvPath = path.join(__dirname, "../data/customers-1000.csv");
  const { headers, rows } = loadCsv(csvPath);

  const schema = headers.map(h => {
    const allNums = rows.every(r => typeof r[h] === "number" || r[h] === null);
    return { name: h, type: allNums ? "int" : "string", nullable: true };
  });

  writeFile(outFile, schema, rows, 100);
} else if (mode === "read" && extra === "decode") {
  readFile(outFile, true);
} else if (mode === "read") {
  readFile(outFile, false);
} else {
  console.log("Usage: npm run write | npm run read | npm run read:decoded");
}
