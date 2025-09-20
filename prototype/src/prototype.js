// src/prototype.js
// Prototype reader/writer for BodetQry (.bq) files

const fs = require("fs");
const zlib = require("zlib");

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
        const strBuf = Buffer.from(v, "utf8");
        const len = Buffer.alloc(4); len.writeUInt32LE(strBuf.length, 0);
        buffers.push(len, strBuf);
      }
    }
  }

  return Buffer.concat(buffers);
}

function writeFile(path, schema, rows, rowsPerGroup = 2) {
  const header = {
    version: 1,
    columns: schema,
    rowGroups: [],
    compression: "deflate",
    totalRowCount: rows.length
  };

  const rowGroupBlobs = [];

  for (let i = 0; i < rows.length; i += rowsPerGroup) {
    const group = rows.slice(i, i + rowsPerGroup);
    const encodedCols = schema.map(col => {
      const vals = group.map(r => r[col.name]);
      return encodeColumn(vals, col.type);
    });
    const uncompressed = Buffer.concat(encodedCols);
    const compressed = zlib.deflateSync(uncompressed);
    rowGroupBlobs.push(compressed);
    header.rowGroups.push({
      offset: 0, // will be filled later
      compressedLength: compressed.length,
      rowCount: group.length
    });
  }

  let headerJson = Buffer.from(JSON.stringify(header));
  let headerLen = Buffer.alloc(4); headerLen.writeUInt32LE(headerJson.length, 0);

  let curOffset = 4 + headerJson.length;
  header.rowGroups.forEach((rg, idx) => {
    rg.offset = curOffset;
    curOffset += rowGroupBlobs[idx].length;
  });

  // rewrite header with offsets
  headerJson = Buffer.from(JSON.stringify(header));
  headerLen = Buffer.alloc(4); headerLen.writeUInt32LE(headerJson.length, 0);

  const fileBuf = Buffer.concat([headerLen, headerJson, ...rowGroupBlobs]);
  fs.writeFileSync(path, fileBuf);

  console.log(`✅ File written to ${path}`);
}

function readFile(path) {
  const data = fs.readFileSync(path);
  const headerLen = data.readUInt32LE(0);
  const header = JSON.parse(data.slice(4, 4 + headerLen).toString());

  console.log("📄 Header:", header);

  header.rowGroups.forEach(rg => {
    const comp = data.slice(rg.offset, rg.offset + rg.compressedLength);
    const decomp = zlib.inflateSync(comp);
    console.log(`RowGroup @${rg.offset}, rows=${rg.rowCount}, raw(hex)=${decomp.toString("hex")}`);
  });
}

// Hardcoded schema + rows for now (Milestone 1 demo)
const schema = [
  { name: "ID", type: "int", nullable: false },
  { name: "Name", type: "string", nullable: true }
];

const rows = [
  { ID: 1, Name: "Alice" },
  { ID: 1, Name: "Alice" },
  { ID: 2, Name: "Bob" },
  { ID: 3, Name: "Carol" }
];

// Mode selection from package.json scripts
const mode = process.argv[2];
const outFile = "data/test.bq";

if (mode === "write") {
  writeFile(outFile, schema, rows, 2);
} else if (mode === "read") {
  readFile(outFile);
} else {
  console.log("Usage: npm run write | npm run read");
}
