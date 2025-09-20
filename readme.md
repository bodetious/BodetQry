
# 📦 BodetQry Format (.bq)

_A Node.js Reader/Writer for Row-Grouped, Power Query–Compatible Data Files_

----------

## 🔎 Overview

This project provides a **robust, workplace-ready alternative to CSV files**. It implements a custom **row-grouped, column-wise encoded, deflate-compressed file format (.bq)** designed for:

-   **Efficient storage**: smaller than CSV, with adaptive encodings (RLE or dictionary).
    
-   **Fast reads**: selective row group access without scanning entire files.
    
-   **Power Query compatibility**: row groups compressed with `deflate/zlib`, so `Binary.Decompress` works natively.
    
-   **Ease of distribution**: packaged into a single standalone executable (`.exe`/binary) for use across systems without requiring Node.js installed.
    

----------

## 🗂 File Format Specification

### File Layout

[Header Length (4 bytes)] 
[Header JSON (variable)]
[Row Group 1] 
[Row Group 2] 
... 
[Row Group N]

### Header (JSON)

-   Version, columns, types, nullable flags
    
-   Row group offsets, compressed lengths, row counts
    
-   Compression method: `"deflate"`
    
-   Total row count
    

### Row Groups

-   Encoded **column by column**:
    
    -   `0` = Raw
        
    -   `1` = RLE
        
    -   `2` = Dictionary
        
-   Nullable bitmap per column
    
-   After encoding → compressed with zlib/deflate
    

### Example Header

`{  "version":  2,  "columns":  [  {"name":  "ID",  "type":  "int",  "nullable":  false},  {"name":  "Name",  "type":  "string",  "nullable":  true}  ],  "rowGroups":  [  {"offset":  1234,  "compressedLength":  456,  "rowCount":  100},  {"offset":  1690,  "compressedLength":  460,  "rowCount":  100}  ],  "compression":  "deflate",  "totalRowCount":  200  }` 

----------

## 🛠 Features

-   ✅ Read/write files with row groups
    
-   ✅ Auto-select column encoding (RLE, Dictionary, Raw)
    
-   ✅ Power Query–compatible decompression
    
-   ✅ Command-line interface (CLI)
    
-   ✅ Atomic file writes (temp → rename)
    
-   ✅ Optional CRC checksums
## 🚀 CLI Usage

### Write file from CSV

`mytool write input.csv -o output.ccf --rows-per-group 1000` 

### Read file into JSON

`mytool read output.ccf --rows 100-200` 

### Append new data

`mytool append output.ccf newdata.csv` 

### Inspect file

`mytool inspect output.ccf` 

----------

## 🏗 Development Roadmap

### Milestone 1: File Specification & Prototype

**Tasks**

-   Define file format specification
    
-   Implement mock encoder/decoder for row groups
    
-   Validate Power Query decompression with test files
    

**Deliverables**

-   Formal `.md` spec file
    
-   Working prototype script
    

----------

### Milestone 2: Core Reader/Writer Library

**Tasks**

-   Implement Node.js classes: `FileWriter`, `FileReader`
    
-   Add column encoding (RLE/Dictionary/Raw)
    
-   Add compression & decompression
    
-   Add schema validation
    

**Deliverables**

-   `lib/reader.js` and `lib/writer.js`
    
-   Test files covering each encoding
    

----------

### Milestone 3: CLI Tool

**Tasks**

-   Build `mytool` CLI wrapper
    
-   Add commands: `write`, `read`, `append`, `inspect`
    
-   Ensure useful error handling & logging
    

**Deliverables**

-   CLI binary with usage guide
    

----------

### Milestone 4: Packaging & Distribution

**Tasks**

-   Bundle using `pkg` (or `nexe`)
    
-   Test on Windows, Linux, Mac
    
-   Deliver `.exe` and cross-platform binaries
    

**Deliverables**

-   Installable executables
    

----------

### Milestone 5: Robustness & Enhancements

**Tasks**

-   Add atomic writes (temp file → rename)
    
-   Add optional CRC32 per row group
    
-   Add `--columns` filter for selective reads
    
-   Benchmark vs CSV for large datasets
    

**Deliverables**

-   Robust, production-ready release v1.0
    

----------

## 📅 Timeline (Example)

-   **Week 1–2**: Format spec, prototype encoder/decoder
    
-   **Week 3–4**: Core library implementation
    
-   **Week 5–6**: CLI + packaging into executables
    
-   **Week 7–8**: Testing, validation, benchmarks
    
-   **Week 9**: Documentation & final release
    

----------

## 🔮 Future Enhancements

-   Parallel read/write for very large files
    
-   Column pruning & predicate pushdown
    
-   Additional compression algorithms (lz4, snappy)
    
-   Power Query custom connector
    
-   Streaming APIs for incremental loads

