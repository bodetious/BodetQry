const fs = require("fs");
const zlib = require("zlib");
const Papa = require("papaparse");

// --- CSV loader ---
function loadCsv(csvPath) {
  const csv = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse(csv, { header: true });
  return parsed.data.filter(r => Object.keys(r).length > 1); // remove trailing empty row
}

// --- Schema inference ---
function inferSchema(rows) {
  return Object.keys(rows[0]).map(col => {
    const sample = rows.find(r => r[col] !== undefined && r[col] !== "");
    const type = sample && !isNaN(Number(sample[col])) ? "int" : "string";
    return { name: col, type, nullable: true };
  });
}

// --- Encode helper ---
function encodeColumn(value, type) {
  if (type === "int" && value !== "" && !isNaN(Number(value))) {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(Number(value), 0);
    return buf;
  }
  const strBuf = Buffer.from(value || "", "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(strBuf.length, 0);
  return Buffer.concat([len, strBuf]);
}

// --- Write BQ file ---
function writeFile(csvPath, outPath, rowsPerGroup = 100) {
  const rows = loadCsv(csvPath);
  const schema = inferSchema(rows);

  const header = {
    version: 1,
    columns: schema,
    rowGroups: [],
    compression: "deflate",
    totalRowCount: rows.length
  };

  const buffers = [];
  const headerPlaceholder = Buffer.alloc(4);
  buffers.push(headerPlaceholder);

  rows.forEach((row, idx) => {
    if (idx % rowsPerGroup === 0) {
      header.rowGroups.push({
        offset: 0,
        compressedLength: 0,
        rowCount: 0,
        stats: {}
      });
    }
    const rg = header.rowGroups[header.rowGroups.length - 1];
    rg.rowCount++;
    schema.forEach(col => {
      const val = row[col.name];
      if (!rg.stats[col.name]) {
        const initVal = (col.type === "int") ? Number(val) : val;
        rg.stats[col.name] = { min: initVal, max: initVal, nulls: 0 };

      }
      if (val == null || val === "") rg.stats[col.name].nulls++;
      else {
        const cmpVal = (col.type === "int") ? Number(val) : val;
        if (rg.stats[col.name].min > cmpVal) rg.stats[col.name].min = cmpVal;
        if (rg.stats[col.name].max < cmpVal) rg.stats[col.name].max = cmpVal;
      }
    });
  });

  let offset = 0;
  for (let i = 0; i < rows.length; i += rowsPerGroup) {
    const chunk = rows.slice(i, i + rowsPerGroup);
    const rg = header.rowGroups[Math.floor(i / rowsPerGroup)];

    const rowBufs = [];
    chunk.forEach(r => {
      schema.forEach(col => {
        rowBufs.push(encodeColumn(r[col.name], col.type));
      });
    });
    const uncompressed = Buffer.concat(rowBufs);
    const compressed = zlib.deflateSync(uncompressed);

    rg.offset = offset;
    rg.compressedLength = compressed.length;
    offset += compressed.length;

    buffers.push(compressed);
  }

  const headerStr = JSON.stringify(header);
  const headerBuf = Buffer.from(headerStr, "utf8");
  headerPlaceholder.writeUInt32LE(headerBuf.length, 0);
  buffers.splice(1, 0, headerBuf);

  fs.writeFileSync(outPath, Buffer.concat(buffers));
  console.log(`✅ File written to ${outPath}`);
}

// --- Decode helpers ---
function decodeGroup(buf, schema) {
  const rows = [];
  let offset = 0;
  while (offset < buf.length) {
    const row = {};
    schema.forEach(col => {
      if (col.type === "int") {
        row[col.name] = buf.readInt32LE(offset);
        offset += 4;
      } else {
        const len = buf.readUInt32LE(offset);
        offset += 4;
        const str = buf.slice(offset, offset + len).toString("utf8");
        row[col.name] = str;
        offset += len;
      }
    });
    rows.push(row);
  }
  return rows;
}

// --- Filter parsing ---
function parseFilter(expr) {
  if (!expr) return null;
  const match = expr.match(/(.+?)\s*(=|>|<)\s*['"]?([^'"]+)['"]?/);
  if (!match) return null;
  return { col: match[1].trim(), op: match[2], value: match[3] };
}

function rowMatchesFilter(row, filter) {
  const val = row[filter.col];
  if (val == null) return false;
  if (filter.op === "=") return String(val) === filter.value;
  if (filter.op === ">") return Number(val) > Number(filter.value);
  if (filter.op === "<") return Number(val) < Number(filter.value);
  return false;
}

// --- Read BQ file ---
function readFile(path, opts = {}) {
  const data = fs.readFileSync(path);
  const headerLen = data.readUInt32LE(0);
  const header = JSON.parse(data.slice(4, 4 + headerLen).toString());
  const filter = parseFilter(opts.where);

  if (!opts.where && !opts.select && !opts.stats) {
    console.log("📄 Header:", header);
  }

  if (opts.stats) {
    console.log("📊 Row Group Statistics:\n");
    header.rowGroups.forEach((rg, i) => {
      console.log(`RowGroup #${i + 1} (rows=${rg.rowCount}):`);
      Object.entries(rg.stats).forEach(([col, st]) => {
        console.log(
          `  ${col.padEnd(20)} min=${st.min} | max=${st.max} | nulls=${st.nulls}`
        );
      });
    });
    return;
  }

  const results = [];
  let anyDecoded = false;

  header.rowGroups.forEach((rg, i) => {
    const start = 4 + headerLen + rg.offset;
    const compressed = data.slice(start, start + rg.compressedLength);

    if (filter) {
      const colStats = rg.stats[filter.col];
      if (!colStats) return;
      if (filter.op === "=") {
        if (filter.value < colStats.min || filter.value > colStats.max) {
          console.log(`⏭️ Skipping RowGroup #${i + 1} (rows=${rg.rowCount}), filter=${opts.where}`);
          return;
        }
      }
      if (filter.op === ">" && filter.value >= colStats.max) {
        console.log(`⏭️ Skipping RowGroup #${i + 1} (rows=${rg.rowCount}), filter=${opts.where}`);
        return;
      }
      if (filter.op === "<" && filter.value <= colStats.min) {
        console.log(`⏭️ Skipping RowGroup #${i + 1} (rows=${rg.rowCount}), filter=${opts.where}`);
        return;
      }
    }

    const buf = zlib.inflateSync(compressed);
    let rows = decodeGroup(buf, header.columns);

    if (filter) {
      rows = rows.filter(r => rowMatchesFilter(r, filter));
    }

    if (opts.select) {
      const cols = opts.select.split(",").map(c => c.trim());
      rows = rows.map(r => {
        const obj = {};
        cols.forEach(c => {
          if (r.hasOwnProperty(c)) obj[c] = r[c];
        });
        return obj;
      });
    }

    if (opts.decode || filter || opts.select) {
      if (rows.length > 0) anyDecoded = true;
      results.push(...rows);
    } else {
      console.log(
        `RowGroup @${rg.offset}, rows=${rg.rowCount}, raw(hex)=${compressed.toString("hex")}`
      );
    }
  });

  if (opts.decode || filter || opts.select) {
    if (!anyDecoded) {
      console.log(`⚠️ No rows matched filter`);
    } else {
      console.log("✅ Decoded Rows:", JSON.stringify(results, null, 2));
    }
  }
}

module.exports = { writeFile, readFile, loadCsv, inferSchema };
