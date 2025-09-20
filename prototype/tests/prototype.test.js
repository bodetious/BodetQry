const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const testFile = path.join(__dirname, "../data/test.bq");

describe("BodetQry Prototype (with customers-1000.csv)", () => {
  beforeAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  test("should write a .bq file without errors", () => {
    execSync("npm run write", { cwd: path.join(__dirname, "..") });
    expect(fs.existsSync(testFile)).toBe(true);
  });

  test("should read hex output without crashing", () => {
    const output = execSync("npm run read", {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    expect(output).toMatch(/RowGroup/);
    expect(output).toMatch(/raw\(hex\)/);
  });

  test("should decode rows correctly", () => {
    const output = execSync("npm run read:decoded", {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });

    // Check that known column headers appear
    expect(output).toMatch(/Customer Id/);
    expect(output).toMatch(/First Name/);
    expect(output).toMatch(/Last Name/);
    expect(output).toMatch(/Email/);

    // Check that at least a few known sample names are present
    expect(output).toMatch(/Andrew/);
    expect(output).toMatch(/Alvin/);
    expect(output).toMatch(/Jenna/);

    // Check that many rows exist (1000 customers expected)
    const rowCount = (output.match(/"Customer Id"/g) || []).length;
    expect(rowCount).toBeGreaterThan(900);
  });
});
