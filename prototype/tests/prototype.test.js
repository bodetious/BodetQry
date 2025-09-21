const { execSync } = require("child_process");
const path = require("path");

const cli = path.join(__dirname, "..", "bin", "bq.js");
const testFile = "data/test.bq";

describe("BodetQry CLI (with customers-1000.csv)", () => {
  test("CLI should write a .bq file without errors", () => {
    const output = execSync(
      `node ${cli} write data/customers-1000.csv -o ${testFile} -g 100`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );
    expect(output).toMatch(/✅ File written/);
  });

  test("CLI should read hex output without crashing", () => {
    const output = execSync(`node ${cli} read ${testFile}`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    expect(output).toMatch(/📄 Header/);
    expect(output).toMatch(/RowGroup/);
  });

  test("CLI should decode rows correctly", () => {
    const output = execSync(`node ${cli} read ${testFile} --decode`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    expect(output).toMatch(/✅ Decoded Rows/);
    expect(output).toMatch(/"Customer Id"/);
  });

  test("CLI should display row group stats", () => {
    const output = execSync(`node ${cli} read ${testFile} --stats`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    expect(output).toMatch(/📊 Row Group Statistics/);
    expect(output).toMatch(/min=/);
    expect(output).toMatch(/max=/);
  });

  test("CLI should decode fewer rows with numeric filter (Index > 900)", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --where "Index > 900"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );
    expect(output).not.toMatch(/📄 Header/); // no header
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount).toBeLessThan(1000);
  });

  test("CLI should return exactly one row when filtering Index = 1000", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --where "Index = 1000"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );
    expect(output).not.toMatch(/📄 Header/); // no header
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBe(1);
    expect(output).toMatch(/"Index": 1000/);
  });

  test("CLI should filter multiple rows with string filter (Country = 'Macao')", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --where "Country = 'Macao'"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );
    expect(output).not.toMatch(/📄 Header/); // no header
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeGreaterThan(1); // should return multiple
    expect(output).toMatch(/"Country": "Macao"/);
  });

  test("CLI should print warning when no rows match filter", () => {
    const output = execSync(
      `node ${cli} read ${testFile} --where "Country = 'ZZZ'"`,
      { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );
    expect(output).toMatch(/⚠️ No rows matched filter/);
  });

  test("CLI should show stats even if filter excludes all rows", () => {
    const output = execSync(`node ${cli} read ${testFile} --stats`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    expect(output).toMatch(/RowGroup/);
    expect(output).toMatch(/nulls=/);
  });
});
