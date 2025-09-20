# BodetQry CLI Commands

### Write CSV → .bq

`bq write <csvFile> -o <outputFile> -g <rowsPerGroup>` 

-   **Description**: Encode a CSV file into `.bq` format.
    
-   **Arguments**:
    
    -   `<csvFile>`: Path to source CSV file.
        
-   **Options**:
    
    -   `-o, --output <file>` → Output `.bq` file (default: `data/out.bq`)
        
    -   `-g, --group <rows>` → Rows per row group (default: 100)
        
-   **Example**:
    
    `bq write data/customers-1000.csv -o data/test.bq -g 200` 
    

----------

### Read .bq

`bq read <bqFile> [--decode]` 

-   **Description**: Read a `.bq` file, showing raw row group bytes or fully decoded rows.
    
-   **Arguments**:
    
    -   `<bqFile>`: Path to `.bq` file.
        
-   **Options**:
    
    -   `-d, --decode` → Decode rows into JSON instead of showing raw hex.
    -  `-s, --stats`    → Show row group statistics only
-   **Example (hex mode)**:
    
    `bq read data/test.bq` 
    
-   **Example (decoded)**:
    
    `bq read data/test.bq --decode` 
    
-   **Example (stats only)**:
    
    `bq read data/test.bq --stats` 

----------

### Meta

`bq --help bq --version` 

-   **Description**: Show CLI help or version info.
    
-   **Examples**:
    
    `bq --help bq --version`