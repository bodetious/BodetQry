const { encodeColumnGroup } = require("../src/encoder");
const { decodeColumnGroup } = require("../src/decoder");

describe("Column group encoding", () => {
  test("Raw encoding round-trips integers", () => {
    const values = [1, 2, 3, 4, 5];
    const buf = encodeColumnGroup(values, "int");
    expect(buf.readUInt8(0)).toBe(0); // encoding type = Raw

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
    const { values: decoded } = decodeColumnGroup(buf, "int", values.length);
    expect(decoded).toEqual(values);
  });

  test("All-null column still decodes", () => {
    const values = [null, null, null];
    const buf = encodeColumnGroup(values, "string");
    const { values: decoded } = decodeColumnGroup(buf, "string", values.length);
    expect(decoded).toEqual(values);
  });

  // --- RLE tests ---
  test("RLE encoding chosen for long runs of integers", () => {
    const values = Array(10).fill(42); // all same
    const buf = encodeColumnGroup(values, "int");
    expect(buf.readUInt8(0)).toBe(1); // encoding type = RLE

    const { values: decoded } = decodeColumnGroup(buf, "int", values.length);
    expect(decoded).toEqual(values);
  });

  test("RLE encoding chosen for long runs of strings", () => {
    const values = ["foo", "foo", "foo", "foo", "foo"];
    const buf = encodeColumnGroup(values, "string");
    expect(buf.readUInt8(0)).toBe(1);

    const { values: decoded } = decodeColumnGroup(buf, "string", values.length);
    expect(decoded).toEqual(values);
  });

  // --- Dictionary tests ---
  test("Dictionary encoding chosen for few unique integers", () => {
    const values = [1, 2, 1, 2, 1, 2, 1, 2];
    const buf = encodeColumnGroup(values, "int");
    expect(buf.readUInt8(0)).toBe(2); // encoding type = Dict

    const { values: decoded } = decodeColumnGroup(buf, "int", values.length);
    expect(decoded).toEqual(values);
  });

  test("Dictionary encoding chosen for few unique strings", () => {
    const values = ["a", "b", "a", "b", "a", "b", "a", "b"];
    const buf = encodeColumnGroup(values, "string");
    expect(buf.readUInt8(0)).toBe(2);

    const { values: decoded } = decodeColumnGroup(buf, "string", values.length);
    expect(decoded).toEqual(values);
  });
});
