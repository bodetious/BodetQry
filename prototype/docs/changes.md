
# Changes: Columnar Encoding and Selective Decompression

## Current State (v0.3.x)

-   **Row Groups:**  
    CSV data is split into row groups (default 100 rows each). Each row group is compressed as a single zlib block.
    
-   **Column-Wise Encoding:**  
    Within each row group, columns are encoded separately before concatenation:
    
    -   **Raw (0):** values stored directly (ints as 4 bytes, strings as [len][bytes]).
        
    -   **RLE (1):** `[runLength][value]` pairs.
        
    -   **Dict (2):** dictionary of unique values + index stream.
        
    -   **Null Bitmap:** per-column bitmask to track null values.
        
-   **Decompression:**  
    To read a row group, the entire block must be decompressed, even if only one column is needed.
    
-   **Skipping:**  
    Stats (min, max, null count) are recorded per column per row group, so row groups can be skipped entirely if a filter condition rules them out.
    
-   **Projection:**  
    After decompression, only selected columns are decoded, but unneeded columns are still decompressed with the rest of the row group.
    

**Implications:**

-   Already faster and smaller than CSV:
    
    -   No string parsing overhead (typed binary storage).
        
    -   Compression reduces redundant data (RLE, Dict).
        
    -   Row groups allow skipping entire chunks.
        
-   Limitation: cannot skip decompression of unneeded columns inside a row group.
    

----------

## New State (with Selective Decompression)

-   **Column-Chunks Compression:**  
    Instead of compressing the whole row group as one zlib block, each column chunk is compressed separately.
    
-   **Row Group Layout:**  
    Row group metadata stores `[colOffset, colCompressedLength]` for each column.
    
-   **Selective Read:**  
    When projecting columns, only the required column chunks are decompressed.
    
-   **Performance Gains:**
    
    -   Smaller I/O footprint when queries select a subset of columns.
        
    -   Decompression time proportional to number of columns requested.
        
    -   Ideal for wide tables (many columns) with narrow projections (few columns requested).
        

----------

## Summary

-   **Now:** row groups give coarse skipping (all-or-nothing decompression).
    
-   **Next:** column-level compression will enable fine-grained skipping (selective decompression).
    
-   **Result:** your format becomes closer to Parquet/ORC in capability — efficient for both large scans and narrow projections.