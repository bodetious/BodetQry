const fs = require("fs");
const zlib = require("zlib");
const Papa = require("papaparse");
const { encodeColumnGroup } = require("./encoder");
const { decodeColumnGroup } = require("./decoder");

// --- CSV loader ---
function loadCsv(csvPath) {
  const csv = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse(csv, { header: true });
  return parsed.data.filter(r => Object.keys(r).length > 1);
}

// --- Schema inference ---
function inferSchema(rows) {
  return Object.keys(rows[0]).map(col => {
    const sample = rows.find(r => r[col] !== undefined && r[col] !== "");
    const type = sample && !isNaN(Number(sample[col])) ? "int" : "string";
    return { name: col, type, nullable: true };
  });
}

// --- Write BQ file ---
function writeFile(csvPath, outPath, rowsPerGroup = 100) {
  const rows = loadCsv(csvPath);
  const schema = inferSchema(rows);

  const header = {
    version: 2,
    columns: schema,
    rowGroups: [],
    compression: "deflate",
    totalRowCount: rows.length
  };

  const buffers = [];
  const headerPlaceholder = Buffer.alloc(4);
  buffers.push(headerPlaceholder);

  // stats
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

    const colBufs = schema.map(col => {
      const values = chunk.map(r => r[col.name]);
      return encodeColumnGroup(values, col.type);
    });

    const uncompressed = Buffer.concat(colBufs);
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

// --- Decode group (column-wise) ---
function decodeGroup(buf, schema, rowCount) {
  const rows = Array.from({ length: rowCount }, () => ({}));
  let offset = 0;

  schema.forEach(col => {
    const { values, consumed } = decodeColumnGroup(buf.slice(offset), col.type, rowCount);
    offset += consumed;
    values.forEach((v, i) => { rows[i][col.name] = v; });
  });

  return rows;
}

// --- Read BQ file ---
function readFile(path, opts = {}) {
  const data = fs.readFileSync(path);
  const headerLen = data.readUInt32LE(0);
  const header = JSON.parse(data.slice(4, 4 + headerLen).toString());
  const filter = parseFilter(opts.where);

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
    const buf = zlib.inflateSync(compressed);

    let rows = decodeGroup(buf, header.columns, rg.rowCount);

    // apply filter
    if (filter) {
      rows = rows.filter(r => rowMatchesFilter(r, filter));
    }

    // apply projection
    if (opts.select) {
      const cols = opts.select.split(",").map(c => c.trim());
      rows = rows.map(r => {
        const obj = {};
        cols.forEach(c => { if (r.hasOwnProperty(c)) obj[c] = r[c]; });
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
      console.log(JSON.stringify(results, null, 2));
    }
  } else if (!opts.stats) {
    // When no flags at all: show header too
    console.log("📄 Header:", header);
  }
}

module.exports = { writeFile, readFile, loadCsv, inferSchema };
