const { encodeColumnGroup } = require("../src/encoder");
const { decodeColumnGroup } = require("../src/decoder");

describe("Column group encoding", () => {
  test("Raw encoding round-trips integers", () => {
    const values = [1, 2, 3, 4, 5];
    const buf = encodeColumnGroup(values, "int");

    // Encoding type should be 0 (Raw)
    expect(buf.readUInt8(0)).toBe(0);

    const { values: decoded } = decodeColumnGroup(buf, "int", values.length);
    expect(decoded).toEqual(values);
  });

  test("Raw encoding round-trips strings", () => {
    const values = ["foo", "bar", "baz"];
    const buf = encodeColumnGroup(values, "string");
    expect(buf.readUInt8(0)).toBe(0);

    const { values: decoded } = decodeColumnGroup(buf, "string", values.length);
    expect(decoded).toEqual(values);
  });

  test("Null bitmap correctly preserves nulls", () => {
    const values = [1, null, 3, null, 5];
    const buf = encodeColumnGroup(values, "int");

    // bitmap length should be >= 1
    const bitmapLen = buf.readUInt32LE(1);
    expect(bitmapLen).toBeGreaterThanOrEqual(1);

    const { values: decoded } = decodeColumnGroup(buf, "int", values.length);
    expect(decoded).toEqual(values);
  });

  test("All-null column still decodes", () => {
    const values = [null, null, null];
    const buf = encodeColumnGroup(values, "string");

    const { values: decoded } = decodeColumnGroup(buf, "string", values.length);
    expect(decoded).toEqual(values);
  });
});
