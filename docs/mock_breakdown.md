# Mock File Breakdown

### File Info

-   **Total file size**: 263 bytes
    
-   **Header length**: 319 bytes (JSON-encoded schema & metadata)
    

----------

### Header JSON

```json
{
  "version": 2,
  "columns": [
    {"name": "ID", "type": "int", "nullable": false},
    {"name": "Name", "type": "string", "nullable": true}
  ],
  "rowGroups": [
    {"offset": 323, "compressedLength": 15, "rowCount": 2},
    {"offset": 338, "compressedLength": 21, "rowCount": 2}
  ],
  "compression": "deflate",
  "totalRowCount": 4
}

```

### Row Group 1

-   **Offset**: 323
    
-   **Compressed Length**: 15 bytes
    
-   **Uncompressed Length**: 20 bytes
    

**Raw (hex of uncompressed data):**
01010000000200000000416c6963650105000000416c696365

**Decoded columns:**

-   **ID Column (RLE)**: value = `1`, run = `2`
    
-   **Name Column (Raw)**: `["Alice", "Alice"]`

### Row Group 2

-   **Offset**: 338
    
-   **Compressed Length**: 21 bytes
    
-   **Uncompressed Length**: 26 bytes
    

**Raw (hex of uncompressed data):**
00020000000300000000426f6201040000004361726f6c

**Decoded columns:**

-   **ID Column (Raw)**: `[2, 3]`
    
-   **Name Column (Raw)**: `["Bob", "Carol"]`

✅ This breakdown shows exactly how the header points to offsets, and how row groups are compressed/decompressed and then decoded.