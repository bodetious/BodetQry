const path = require("path");
const { writeFile, readFile, loadCsv, inferSchema } = require("./utils");

const mode = process.argv[2];
const extra = process.argv[3];
const outFile = "data/test.bq";

if (mode === "write") {
  const csvPath = path.join(__dirname, "../data/customers-1000.csv");
  const { headers, rows } = loadCsv(csvPath);
  const schema = inferSchema(headers, rows);
  writeFile(outFile, schema, rows, 100);
} else if (mode === "read" && extra === "decode") {
  readFile(outFile, true);
} else if (mode === "read") {
  readFile(outFile, false);
} else {
  console.log("Usage: npm run write | npm run read | npm run read:decoded");
}
