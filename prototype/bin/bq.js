#!/usr/bin/env node
const { program } = require("commander");
const path = require("path");
const fs = require("fs");
const { writeFile, readFile, loadCsv, inferSchema } = require("../src/utils");

program
  .name("bq")
  .description("BodetQry CLI")
  .version("0.3.1");

program
  .command("write <csvFile>")
  .description("Encode a CSV file into .bq format")
  .option("-o, --output <file>", "Output .bq file", "data/out.bq")
  .option("-g, --group <rows>", "Rows per row group", "100")
  .action((csvFile, opts) => {
    const rows = loadCsv(csvFile);
    const schema = inferSchema(rows);
    writeFile(
      csvFile,
      path.resolve(opts.output),
      parseInt(opts.group, 10)
    );
  });

program
  .command("read <bqFile>")
  .description("Read a .bq file")
  .option("-d, --decode", "Decode rows instead of showing raw hex")
  .option("-s, --stats", "Show row group statistics only")
  .option("-w, --where <expr>", "Filter expression (e.g., \"Index > 500\")")
  .option("-c, --select <cols>", "Comma-separated list of columns to return")
  .action((bqFile, opts) => {
    const resolved = path.resolve(bqFile);

    // If --where or --select is provided, force decode mode
    if (opts.where || opts.select) opts.decode = true;

    if (opts.stats) {
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
          const minVal = typeof st.min === "number" ? st.min : String(st.min);
          const maxVal = typeof st.max === "number" ? st.max : String(st.max);
          console.log(
            `  ${col.padEnd(20)} min=${minVal} | max=${maxVal} | nulls=${st.nulls}`
          );

        });
      });
    } else {
      readFile(resolved, opts);
    }
  });

program.parse(process.argv);
