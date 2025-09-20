# Row-Grouped File Format Specification (with Pre-Compression Encoding)

## 1. File Overview

A self-contained binary file for tabular data:

-   Row-grouped, with column-wise pre-compression encoding\
-   Each row group compressed using **deflate/zlib** (Power Query
    compatible)\
-   Atomic writes and optional integrity checks\
-   Extensible via JSON header

------------------------------------------------------------------------

## 2. File Layout

    [Header Length (4 bytes)] 
    [Header JSON (variable)]
    [Row Group 1] 
    [Row Group 2] 
    ... 
    [Row Group N]

------------------------------------------------------------------------

## 3. Header

-   **Stored in JSON** for readability and extensibility\
-   Preceded by a **4-byte little-endian integer** specifying its
    length\
-   Example fields:

``` json
{
  "version": 2,
  "columns": [
    {"name": "ID", "type": "int", "nullable": false},
    {"name": "Name", "type": "string", "nullable": true},
    {"name": "Salary", "type": "float", "nullable": false}
  ],
  "rowGroups": [
    {"offset": 1234, "compressedLength": 456, "rowCount": 100},
    {"offset": 1690, "compressedLength": 460, "rowCount": 100}
  ],
  "compression": "deflate",
  "totalRowCount": 200
}
```

-   Each row group offset points to the **start of its compressed,
    encoded data**

------------------------------------------------------------------------

## 4. Row Group Layout

### 4.1 Column-Wise Pre-Compression Encoding

For each column:

    [Encoding Type: 1 byte] [Optional Dictionary Size: 4 bytes] [Dictionary Data] [Encoded Column Data]

-   **Encoding Type Enum:**
    -   `0` = Raw\
    -   `1` = RLE\
    -   `2` = Dictionary
-   **RLE**: `[value][run length]` repeated\
-   **Dictionary**: `[unique values][indices for each row]`\
-   **Raw**: store values in column order

**Selection rules per column per row group:**

-   Use **RLE** if \>50% consecutive duplicates\
-   Use **Dictionary** if unique values \< 25% of row group size\
-   Otherwise, store **Raw**

### 4.2 Null Handling

-   Precede column data with **nullable bitmap**\
-   Bitmap ensures nulls are preserved during encoding

### 4.3 Compression

-   Once all columns are encoded, compress **entire row group** using
    **deflate/zlib**\
-   Record **compressedLength** in the header

------------------------------------------------------------------------

## 5. Writing a File

1.  Split rows into **row groups** (e.g., 100--1000 rows)\
2.  For each row group:
    -   Serialize columns\
    -   Apply **column-wise encoding (RLE/dictionary/raw)**\
    -   Compress using **deflate/zlib**\
    -   Record offset and compressedLength\
3.  Build JSON header including columns, rowGroups, compression,
    totalRowCount\
4.  Prepend **4-byte header length**\
5.  Write to temp file → rename for atomicity

------------------------------------------------------------------------

## 6. Reading a File

1.  Read first 4 bytes → header length\
2.  Read header JSON\
3.  For selected row groups:
    -   Seek to `offset`\
    -   Read `compressedLength` bytes\
    -   Decompress with `Binary.Decompress` (Power Query) or zlib
        (Node.js)\
    -   Decode each column according to `Encoding Type` and null bitmap

------------------------------------------------------------------------

## 7. Benefits

-   **Partial reads**: decompress only needed row groups\
-   **Efficient storage**: column-wise pre-compression plus deflate\
-   **Power Query compatible**: straightforward decompression\
-   **Robust**: atomic writes, optional CRC/checksums\
-   **Extensible**: JSON header allows future features
