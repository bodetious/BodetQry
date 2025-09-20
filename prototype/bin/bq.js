#!/usr/bin/env node
const { program } = require("commander");
const path = require("path");
const { writeFile, readFile, loadCsv, inferSchema } = require("../src/utils");

program
  .name("bq")
  .description("BodetQry CLI")
  .version("0.2.0");

program
  .command("write <csvFile>")
  .description("Encode a CSV file into .bq format")
  .option("-o, --output <file>", "Output .bq file", "data/out.bq")
  .option("-g, --group <rows>", "Rows per row group", "100")
  .action((csvFile, opts) => {
    const { headers, rows } = loadCsv(csvFile);
    const schema = inferSchema(headers, rows);
    writeFile(
      path.resolve(opts.output),
      schema,
      rows,
      parseInt(opts.group, 10)
    );
  });

program
  .command("read <bqFile>")
  .description("Read a .bq file")
  .option("-d, --decode", "Decode rows instead of showing raw hex")
  .option("-s, --stats", "Show row group statistics only")
  .option("-w, --where <expr>", "Filter expression (e.g., \"Index > 500\")")
  .action((bqFile, opts) => {
    const resolved = path.resolve(bqFile);

    if (opts.stats) {
      const fs = require("fs");
      const data = fs.readFileSync(resolved);
      const headerLen = data.readUInt32LE(0);
      const header = JSON.parse(data.slice(4, 4 + headerLen).toString());

      console.log("📊 Row Group Statistics:");
      header.rowGroups.forEach((rg, idx) => {
        if (!rg.stats) {
          console.log(`RowGroup #${idx + 1} has no stats`);
          return;
        }
        console.log(`\nRowGroup #${idx + 1} (rows=${rg.rowCount}):`);
        Object.entries(rg.stats).forEach(([col, st]) => {
          console.log(
            `  ${col.padEnd(20)} min=${st.min} | max=${st.max} | nulls=${st.nullCount}`
          );
        });
      });
    } else {
      readFile(resolved, opts.decode, opts.where);
    }
  });

program.parse(process.argv);
