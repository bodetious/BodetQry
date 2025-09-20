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
  .description("Read a .bq file (raw hex by default, decoded with --decode)")
  .option("-d, --decode", "Decode rows instead of showing raw hex")
  .action((bqFile, opts) => {
    readFile(path.resolve(bqFile), opts.decode);
  });

program.parse(process.argv);
