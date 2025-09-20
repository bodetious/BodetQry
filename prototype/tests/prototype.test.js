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

  test("CLI should skip groups that do not match numeric filter", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --decode --where "Index > 900"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );

    expect(output).toMatch(/⏭️ Skipping RowGroup/);
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeLessThan(1000);
  });

  test("CLI should skip groups that do not match string filter", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --decode --where "Country = 'Macao'"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );

    expect(output).toMatch(/⏭️ Skipping RowGroup/);
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeLessThan(1000);
  });

  test("CLI should print warning when no rows match filter", () => {
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
