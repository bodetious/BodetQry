const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const testFile = path.join(__dirname, "../data/test.bq");

describe("BodetQry Prototype", () => {
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
    expect(output).toMatch(/Alice/);
    expect(output).toMatch(/Bob/);
    expect(output).toMatch(/Carol/);
  });
});
