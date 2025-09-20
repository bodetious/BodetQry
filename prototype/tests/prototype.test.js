const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const testFile = path.join(__dirname, "../data/test.bq");
const cli = path.join(__dirname, "../bin/bq.js");

describe("BodetQry CLI (with customers-1000.csv)", () => {
  beforeAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  test("CLI should write a .bq file without errors", () => {
    execSync(`node ${cli} write data/customers-1000.csv -o ${testFile}`, {
      cwd: path.join(__dirname, "..")
    });
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

    // Header fields
    expect(output).toMatch(/Customer Id/);
    expect(output).toMatch(/First Name/);
    expect(output).toMatch(/Last Name/);
    expect(output).toMatch(/Email/);

    // Sample values
    expect(output).toMatch(/Andrew/);
    expect(output).toMatch(/Alvin/);
    expect(output).toMatch(/Jenna/);

    // Row count = 1000
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBe(1000);
  });

  test("CLI should display row group stats", () => {
    const output = execSync(`node ${cli} read ${testFile} --stats`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });

    // Should include stats markers
    expect(output).toMatch(/📊 Row Group Statistics/);
    expect(output).toMatch(/min=/);
    expect(output).toMatch(/max=/);
    expect(output).toMatch(/nulls=/);

    // Should reference some known columns
    expect(output).toMatch(/Customer Id/);
    expect(output).toMatch(/First Name/);
    expect(output).toMatch(/Email/);
  });
});
