
# BodetQry CLI Commands

### Write CSV → .bq

`bq write <csvFile> -o <outputFile> -g <rowsPerGroup>`

-   **Description**: Encode a CSV file into `.bq` format.
    
-   **Arguments**:
    
    -   `<csvFile>` → Path to source CSV file.
        
-   **Options**:
    
    -   `-o, --output <file>` → Output `.bq` file (default: `data/out.bq`)
        
    -   `-g, --group <rows>` → Rows per row group (default: 100)
        
-   **Example**:
    
    `bq write data/customers-1000.csv -o data/test.bq -g 200` 
    

----------

### Read .bq

`bq read <bqFile> [--decode] [--stats] [--where <expr>]`

-   **Description**: Read a `.bq` file, showing raw row group bytes, decoded rows, or row group statistics. Supports coarse filtering using row group metadata (min/max values).
    
-   **Arguments**:
    
    -   `<bqFile>` → Path to `.bq` file.
        
-   **Options**:
    
    -   `-d, --decode` → Decode rows into JSON instead of showing raw hex.
        
    -   `-s, --stats` → Show row group statistics only.
        
    -   `-w, --where <expr>` → Filter by simple expressions on column values.
        
        -   Supports `=`, `>`, `<`.
            
        -   Examples:
            
            -   `"Index > 500"`
                
            -   `"Country = 'Macao'"`
                
-   **Behavior**:
    
    -   Filters apply at the **row group level** (using min/max).
        
    -   Groups outside the filter range are skipped (`⏭️ Skipping RowGroup`).
        
    -   If all groups are skipped, a warning is shown: `⚠️ No rows matched filter`.
        
    -   Stats mode (`--stats`) always shows statistics, regardless of filters.
        
-   **Examples**:
    
    - `bq read data/test.bq`
    - `bq read data/test.bq --decode`
    - `bq read data/test.bq --stats`
    - `bq read data/test.bq --decode --where  "Index > 900"`
    - `bq read data/test.bq --decode --where  "Country = 'Macao'"` 
    

----------

### Meta

`bq --help`  
`bq --version`

-   **Description**: Show CLI help or version info.
    
-   **Examples**:
    
    `bq --help bq --version`