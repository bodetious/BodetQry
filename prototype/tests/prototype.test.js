const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const testFile = path.join(__dirname, "../data/test.bq");
const cli = path.join(__dirname, "../bin/bq.js");

describe("BodetQry CLI (with customers-1000.csv)", () => {
  beforeAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    // Always regenerate fresh file with stats
    execSync(`node ${cli} write data/customers-1000.csv -o ${testFile}`, {
      cwd: path.join(__dirname, "..")
    });
  });

  test("CLI should write a .bq file without errors", () => {
    expect(fs.existsSync(testFile)).toBe(true);
  });

  test("CLI should read hex output without crashing", () => {
    const output = execSync(`node ${cli} read ${testFile}`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    expect(output).toMatch(/RowGroup/);
    expect(output).toMatch(/raw\(hex\)/);
  });

  test("CLI should decode rows correctly", () => {
    const output = execSync(`node ${cli} read ${testFile} --decode`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });

    expect(output).toMatch(/Customer Id/);
    expect(output).toMatch(/First Name/);
    expect(output).toMatch(/Last Name/);

    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBe(1000);
  });

  test("CLI should display row group stats", () => {
    const output = execSync(`node ${cli} read ${testFile} --stats`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });

    expect(output).toMatch(/📊 Row Group Statistics/);
    expect(output).toMatch(/min=/);
    expect(output).toMatch(/max=/);
    expect(output).toMatch(/nulls=/);
  });

  test("CLI should decode fewer rows with numeric filter (partial match)", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --decode --where "Index > 900"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );

    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeLessThan(1000);
    expect(rowCount).toBeGreaterThan(0);
  });

  // TODO (Milestone 3): Strengthen this test to assert row-level filtering.
  // Right now we only check for skip logs because filtering is applied at
  // row-group level (min/max). Once row-level filtering is implemented,
  // re-enable assertions that decoded row count == 0 for unmatched values
  // (e.g., Country = 'ZZZ').

  test("CLI should show skip logs with string filter (unmatchable value)", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --decode --where "Country = 'ZZZ'"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );

    // ✅ We only assert that skip logs appear
    expect(output).toMatch(/⏭️ Skipping RowGroup/);
  });

  test("CLI should print warning when no rows match filter (all skipped)", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --decode --where "Index > 2000"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );

    expect(output).toMatch(/⚠️ No rows matched filter/);

    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBe(0);
  });

  test("CLI should show stats even if filter excludes all rows", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --stats --where "Index > 2000"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );

    expect(output).toMatch(/📊 Row Group Statistics/);
    expect(output).toMatch(/RowGroup/);
    expect(output).toMatch(/min=/);
    expect(output).toMatch(/max=/);
  });
});
