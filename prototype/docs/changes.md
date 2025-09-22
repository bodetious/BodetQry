# Changes

#### To move closer to the original file spec, we need to restructure row group writing so that each *column* is encoded separately before concatenating and deflating.
 The flow looks like this:

----------

### 1. Per-column encoding choice

For each column in a row group:

-   **RLE** (Run-Length Encoding): if more than 50% of the rows are consecutive duplicates.
    
-   **Dictionary**: if the number of unique values is < 25% of the row group size.
    
-   **Raw**: otherwise (just store the values in order).
    

----------

### 2. Layout per column

Encode as:

- `[EncodingType: 1 byte]`
- `[Optional dictionary size: 4 bytes]`
- `[Dictionary  values (if  dictionary  encoding)]`
- `[Encoded column data]` 

For null handling, prepend a **nullable bitmap** (1 bit per row).

----------

### 3. Compression

Concatenate all encoded columns → compress the whole row group with zlib.deflate.

----------

### 4. Header update

Each row group entry in the header already stores:

-   `offset`
    
-   `compressedLength`
    
-   `rowCount`
    

That part stays, but will also want to include column-level metadata later (e.g. encoding type used), so a Power Query reader or this project's decoder knows how to reconstruct the column.


### Example code skeleton for encoding a column

```js
function  encodeColumnGroup(values) { const n = values.length; // Null bitmap  const bitmap = Buffer.alloc(Math.ceil(n / 8));
  values.forEach((v, i) => { if (v != null && v !== "") bitmap[Math.floor(i/8)] |= (1 << (i % 8));
  }); // Decide encoding  const uniques = [...new  Set(values.filter(v => v != null && v !== ""))]; const runLength = countRuns(values); let encodingType, encoded; if (runLength > n/2) {
    encodingType = 1; // RLE encoded = encodeRLE(values);
  } else  if (uniques.length < n/4) {
    encodingType = 2; // Dictionary encoded = encodeDictionary(values, uniques);
  } else {
    encodingType = 0; // Raw encoded = encodeRaw(values);
  } // Assemble final buffer  const header = Buffer.from([encodingType]); return  Buffer.concat([header, bitmap, encoded]);
}
``` 

----------

Current **`writeFile`** simply does `encodeColumn(r[col.name], col.type)` per row. To switch to this spec:

1.  Collect all values of a column across the row group (`chunk.map(r => r[col.name])`).
    
2.  Call `encodeColumnGroup(values)` instead of writing per-row values.
    
3.  Concatenate all encoded columns into the row group buffer.

----------

This is a **spec-level change** to how the `.bq` file is written, so it ripples across multiple parts of the project. Let’s map out all the files that will be affected:



### 1. **`utils_patch.js` (core library)**

-   **Write path (`writeFile`)**
    
    -   Needs to switch from row-wise value writes → column-wise encodings.
        
    -   Add RLE and dictionary encoding helpers.
        
    -   Build null bitmaps.
        
    -   Record encoding type per column per row group.
        
-   **Read path (`readFile` / `decodeGroup`)**
    
    -   Must decode per-column encodings (Raw, RLE, Dictionary) using the encoding type byte and metadata.
        
    -   Handle null bitmaps when reconstructing rows.
        

----------

### 2. **`file_format_spec.md`**

-   Update documentation to match the new on-disk layout.
    
-   Currently it mentions RLE/Dictionary/Raw at the column level, but implementation will now be _real_.
    
-   Add details about null bitmap, encoding byte, and how dictionary payloads are structured.
    

----------

### 3. **`readme.md`**

-   The “File Format Specification” section will need a simpler, high-level update to mention:
    
    -   “Column-wise encoding (RLE, Dictionary, Raw) inside each row group”
        
    -   “Null bitmaps included for nullable columns.”
        
    -   “Decoding automatically handled by the CLI.”
        

----------

### 4. **`bq.js` (CLI)**

-   CLI itself won’t change much in _interface_ — `bq write`, `bq read` commands stay the same.
    
-   But since CLI calls `utils.js` functions, its **decode outputs** will reflect the new logic.
    
-   Might want to add an optional `--debug-encoding` flag to print which encoding was chosen per column per row group (for testing/inspection).
    

----------

### 5. **Tests (`prototype.test.js`)**

-   Must be expanded to cover:
    
    -   Writing and reading row groups where dictionary encoding should trigger (e.g. column with only a few repeating values).
        
    -   Writing and reading row groups where RLE should trigger (e.g. a column with long repeated runs).
        
    -   Ensuring raw fallback still works.
        
    -   Null handling.
        
-   Existing tests will likely still pass (since final decoded rows don’t change), but will need new tests that assert encodings are being applied.
    

----------

### 6. **Potential new file(s)**

-   To keep `utils.js` clean, move encoding/decoding helpers into existing empty modules,`src/encoder.js` and `src/decoder.js`.
    
    -   Functions like `encodeRLE`, `encodeDict`, `encodeRaw`, `decodeRLE`, `decodeDict`, `decodeRaw`, 
        
-   That way `utils.js` doesn’t balloon into an unreadable 1,000-line monster.
    

----------

### Recap of impacted files

-   ✅ `utils.js` (biggest change: new encoding logic)
    
-   ✅ `file_format_spec.md` (spec doc update)
    
-   ✅ `readme.md` (high-level format/feature description)
    
-   ✅ `bq.js` (optional CLI debug improvements, otherwise same)
    
-   ✅ `prototype.test.js` (test coverage expansion)
    
-   ✅ new `encoder.js/decoder.js` helper modules

----------

Here’s a **dependency diagram** of the moving parts, showing how the update will ripple:

```scss
 ┌──────────────────────┐
 │      bq.js (CLI)     │
 │  - parses args        │
 │  - calls writeFile()  │
 │  - calls readFile()   │
 └──────────┬───────────┘
            │
            ▼
 ┌──────────────────────┐
 │    utils.js (core)   │
 │  - writeFile()       │
 │      * will change to
 │        column-wise encoding
 │        (Raw/RLE/Dict + bitmap)
 │  - readFile()        │
 │      * will decode per column
 │  - inferSchema()     │
 │  - loadCsv()         │
 └──────────┬───────────┘
            │
   ┌────────┴─────────┐
   ▼                  ▼
Encoding helpers   Compression
(encoder.js)  (zlib/deflate)
- encodeRLE        
- encodeDict
- encodeRaw
(decoder.js)
- decodeRLE
- decodeDict
- decodeRaw
                             ---
Documentation + tests orbit around this core:

 file_format_spec.md   readme.md
      ▲                   ▲
      │                   │
      └────── updated spec/description
                   │
            prototype.test.js
            - will test CLI
            - ensure RLE/Dict trigger

``` 

---
### Summary of relationships

-   **`bq.js`** stays slim — it just calls into `utils.js`.
    
-   **`utils.js`** is the big one: it delegates per-column work to new **`encoder.js/decoder.js`** helpers.
    
-   **`encoder.js`** will be the module, holding `encodeRLE`, `encodeDict`, `encodeRaw`
-   **`decoder.js`** will be the module, holding `decodeRLE`, `decodeDict`, `decodeRaw`
    
-   **Docs** (`file_format_spec.md`, `readme.md`) need to be synced with the new spec.
    
-   **Tests** (`prototype.test.js`) need new cases to exercise RLE/dictionary behavior.

---
## **Surgical Checklist** of the changes inside `utils.js`

###  Functions in `utils.js`

#### 1. **`writeFile(csvPath, outPath, rowsPerGroup = 100)`**

**Currently does**:

-   Iterates row-by-row, writing each value via `encodeColumn(r[col.name], col.type)`.
    
-   Concatenates all row data, compresses once with zlib.
    

**Needs to change**:

-   **Row-group build loop**:
    
    -   Instead of iterating rows, collect each column’s values for the entire chunk:
```js
const colValues = schema.map(col => chunk.map(r => r[col.name]));
 ```
        
-   **Per-column encoding**:
    
    -   Pass each `colValues[i]` to a new `encodeColumnGroup(values, colType)`.
        
    -   That function decides between Raw, RLE, or Dictionary, builds the null bitmap, and returns the encoded buffer.
        
-   **Concatenate encoded columns**:
    
    -   Replace row-wise concatenation with column-wise buffer concat.
        
-   **Stats**:
    
    -   Update stats from decoded values, not from raw row loop.
        
-   **Header**:
    
    -   Optionally extend row group metadata to store chosen encodings per column (for debug / inspection).
        

----------

### 2. **`encodeColumn(value, type)`**

**Currently does**:

-   Encodes one cell as int (4 bytes) or string (len+utf8).
    

**Needs to change**:

-   This function is effectively replaced by the new column-group encoders.
    
-   Keep it around as a _Raw encoder helper_ (for when dictionary/RLE aren’t chosen).
    

----------

### 3. **`decodeGroup(buf, schema)`**

**Currently does**:

-   Reads rows in sequence:
    
    -   If int → 4 bytes.
        
    -   Else → length-prefixed string.
        

**Needs to change**:

-   Must decode **per column** in the same order as written by `encodeColumnGroup`.
    
-   Steps per column:
    
    -   Read 1 byte encoding type.
        
    -   Read null bitmap.
        
    -   Depending on encoding type, call `decodeRLE`, `decodeDict`, or `decodeRaw`.
        
-   Reconstruct rows by combining column arrays back into row objects.
    

----------

### 4. **`readFile(path, opts = {})`**

**Currently does**:

-   Inflates row group buffer, passes it to `decodeGroup`.
    
-   Filtering, column selection, printing.
    

**Needs to change**:

-   Nothing in the _control flow_.
    
-   Just benefits from updated `decodeGroup` returning correct rows.
    

----------

### 5. **`inferSchema(rows)`**

-   Can stay as-is.
    

----------

### 6. **`loadCsv(csvPath)`**

-   Can stay as-is.
    

----------

## Modules: **`encoder.js`** and **`decoder.js`**

Add helper functions here:

-   `encodeRLE(values)` / `decodeRLE(buf, type, n)`
    
-   `encodeDict(values)` / `decodeDict(buf, type, n)`
    
-   `encodeRaw(values, type)` / `decodeRaw(buf, type, n)`
    
-   `buildNullBitmap(values)` / `applyNullBitmap(decoded, bitmap)`
    

----------

## Row Group Buffer Layout

Each row group will be compressed as a whole (with zlib/deflate), but **inside the uncompressed buffer** the structure will look like this:

```json
[  Column  1  Section  ]  
[  Column  2  Section  ] 
 ...  
[  Column  N  Section  ]
```
----------

### Column Section Layout

Each column section encodes all values for one column in the row group:
```json
[EncodingType: 1 byte]
[NullBitmapLength: 4 bytes]
[NullBitmap: variable]
[ColumnPayload: variable]
```

----------

#### 1. **EncodingType (1 byte)**

-   `0` = Raw
    
-   `1` = RLE (Run-Length Encoding)
    
-   `2` = Dictionary
    

----------

#### 2. **Null Bitmap**

-   Always present, regardless of encoding.
    
-   1 bit per row (rounded up to nearest byte).
    
-   Bit = `1` means value is present, `0` means null.
    
-   Helps decoder rebuild exact row counts.
    

Layout:
```json
[NullBitmapLength: UInt32LE] // number of bytes in the bitmap 
[NullBitmap bytes] 
```
----------

#### 3. **ColumnPayload (depends on EncodingType)**

**a) Raw (0)**

`[RowCount values  as fixed encoding]` 

-   Int → 4 bytes little-endian.
    
-   String → `[Len: UInt32LE][UTF-8 bytes]`.
    
-   Nulls are skipped (decoder checks bitmap).
    

**b) RLE (1)**

`[RunCount:  UInt32LE]  [Run  1  Value][Run  1  Length:  UInt32LE]  [Run  2  Value][Run  2  Length:  UInt32LE]  ...` 

-   Value encoding same as Raw (int = 4 bytes, string = len+utf8).
    
-   Decoder expands runs into row sequence, guided by bitmap.
    

**c) Dictionary (2)**
```json
[DictSize: UInt32LE]  
[DictValue1]...[DictValueN]  
[IndexCount: UInt32LE]  
[RowIndex0: UInt32LE]...[RowIndexM: UInt32LE]
```
-   `DictValueX` encoded same as Raw (int/string).
    
-   Then each row gets a dictionary index (UInt32LE).
    
-   Bitmap still tells whether value is null.
    

----------

### Example Walkthrough

Say we have 5 rows in a row group, column “Country”:

`["US", "US", "US", "FR", null]` 

Encoding decision → RLE (because “US” repeats).

Column section:

```json
[0x01]  // EncodingType = RLE 
[0x01,0x00,0x00,0x00]  // NullBitmapLength = 1 
[0b11110]  // Bitmap (rows 1-4 non-null, row 5 null)  
[0x02,0x00,0x00,0x00]  // RunCount = 2  [Len=2][UTF8="US"]
[0x03,0x00,0x00,0x00]  // Run 1: "US", length 3  [Len=2]
[UTF8="FR"][0x01,0x00,0x00,0x00]  // Run 2: "FR", length 1
```
Compressed with zlib, stored at `rowGroup.offset`.

----------

## Decoder’s Job

1.  Inflate row group with zlib.
    
2.  For each column:
    
    -   Read `EncodingType`.
        
    -   Read `NullBitmapLength` + bitmap.
        
    -   Dispatch to decoder (`decodeRaw`, `decodeRLE`, `decodeDict`).
        
    -   Rebuild full column array of length = rowGroup.rowCount.
        
3.  Merge columns into row objects.
    

----------

This layout is **backward-compatible** in the sense that older `.bq` files (with only raw serialization) could be treated as “Raw” with no bitmap.



--- 

# RECAP

### ✅ Already implemented in master branch 

1.  **`utils.js`**
    
    -   Fixed `min/max` stats so numeric columns compare as numbers, not strings.
        
    -   Changed output printing so each row is printed cleanly (`console.log(JSON.stringify(r, null, 2))`) instead of one big array.
        
    -   Removed the noisy `⏭️ Skipping RowGroup...` logs — non-matching groups are skipped silently.
        
2.  **`bq.js`**
    
    -   Updated stats printing so ints display as numbers, not stringified weirdly.
        

----------

###  Planned but not yet integrated

1.  **Encoding overhaul**
    
    -   Right now `writeFile` still writes row-by-row, concatenates everything, and compresses with zlib.
        
    -   Drafted a new **row group spec** (column sections with `[EncodingType][NullBitmap][Payload]`).
        
    -   Design helper functions in `encoder.js` and `decoder.js` (Raw, RLE, Dictionary, null bitmap, etc).
       
        
2.  **`decodeGroup` rework in `utils.js`**
    
    -   Need to switch from row-wise decoding to column-wise decoding using `decodeColumnGroup`.
        
    -   Requires `decodeColumnGroup` to return `{ values, bytesRead }` so we can advance offsets.
        
    -   `readFile` will need a small patch to pass `rg.rowCount` into `decodeGroup`.
        
3.  **Docs + tests**
    
    -   `file_format_spec.md` needs updating to match the new column encoding layout.
        
    -   `readme.md` should mention column-level encodings.
        
    -   `prototype.test.js` will need new test cases for RLE/dictionary triggers and null handling.
        

----------

###  Where BodetQry stands...

-   **Core project as of now**: working row-group writer/reader with zlib compression only.
    
-   **Planned upgrade**: add column-wise Raw/RLE/Dictionary encodings + null bitmaps.
    