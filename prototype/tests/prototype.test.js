const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TEST_LOG_DIR = path.join(__dirname, "logs");
if (!fs.existsSync(TEST_LOG_DIR)) {
  fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
}

// Create a temp directory for BQ outputs
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bqtest-"));
const TEMP_BQ = path.join(TEMP_DIR, "test.bq");

// Utility to run CLI and save logs
function runCli(cmd, logName) {
  const logPath = path.join(TEST_LOG_DIR, `${logName}.log`);
  let output = "";
  try {
    output = execSync(cmd, { encoding: "utf8" });
    fs.writeFileSync(logPath, output, "utf8");
  } catch (err) {
    const combined = `${err.stdout || ""}${err.stderr || ""}`;
    fs.writeFileSync(logPath, combined, "utf8");
    throw err;
  }
  return output;
}

describe("BodetQry CLI (with customers-1000.csv)", () => {
  test("CLI should write a .bq file without errors", () => {
    runCli(
      `node bin/bq.js write data/customers-1000.csv -o ${TEMP_BQ} -g 100`,
      "write"
    );
    expect(fs.existsSync(TEMP_BQ)).toBe(true);
  });

  test("CLI should read hex output without crashing", () => {
    const output = runCli(`node bin/bq.js read ${TEMP_BQ}`, "read-hex");
    expect(output).toMatch(/RowGroup/);
  });

  test("CLI should decode rows correctly", () => {
    const output = runCli(`node bin/bq.js read ${TEMP_BQ} --decode`, "read-decode");
    expect(output).toMatch(/"Customer Id"/);
  });

  test("CLI should display row group stats", () => {
    const output = runCli(`node bin/bq.js read ${TEMP_BQ} --stats`, "read-stats");
    expect(output).toMatch(/Row Group Statistics/);
  });

  test("CLI should decode fewer rows with numeric filter (Index > 900)", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --where "Index > 900"`,
      "filter-index-gt-900"
    );
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeLessThan(1000);
  });

  test("CLI should return exactly one row when filtering Index = 1000", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --where "Index = 1000"`,
      "filter-index-eq-1000"
    );
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBe(1);
  });

  test("CLI should filter multiple rows with string filter (Country = 'Macao')", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --where "Country = 'Macao'"`,
      "filter-country-macao"
    );
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeGreaterThan(0);
  });

  test("CLI should print warning when no rows match filter", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --where "Country = 'ZZZ'"`,
      "filter-country-zzz"
    );
    expect(output).toMatch(/⚠️ No rows matched filter/);
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBe(0);
  });

  test("CLI should show stats even if filter excludes all rows", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --stats --where "Index = -1"`,
      "stats-filtered"
    );
    expect(output).toMatch(/Row Group Statistics/);
  });

  test("CLI should return only selected columns", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --select "First Name,Last Name" --where "Index = 900"`,
      "select-first-last"
    );
    expect(output).toMatch(/"First Name"/);
    expect(output).toMatch(/"Last Name"/);
    expect(output).not.toMatch(/"Customer Id"/);
  });

  test("CLI should project columns without filter", () => {
    const output = runCli(
      `node bin/bq.js read ${TEMP_BQ} --select "Email"`,
      "select-email"
    );
    expect(output).toMatch(/"Email"/);
    expect(output).not.toMatch(/"Customer Id"/);
  });
});
