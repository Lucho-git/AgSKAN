# Extract fields table from pg_dump and convert to INSERT statements
param(
    [string]$BackupFile = "c:\Users\lachl\Repos\AgSKAN\supabasebackup",
    [string]$OutputFile = "c:\Users\lachl\Repos\AgSKAN\scripts\fields_restore.sql"
)

Write-Host "Reading backup file to find fields COPY section..."

# Read file in streaming mode to find COPY start/end
$reader = [System.IO.StreamReader]::new($BackupFile)
$lineNum = 0
$inCopy = $false
$copyData = @()
$columns = @()

try {
    while (($line = $reader.ReadLine()) -ne $null) {
        $lineNum++
        
        if (-not $inCopy) {
            if ($line -match "^COPY public\.fields \((.+)\)") {
                $cols = $matches[1] -split ",\s*"
                $columns = $cols | ForEach-Object { $_.Trim() }
                $inCopy = $true
                Write-Host "Found COPY at line $lineNum with columns: $($columns -join ', ')"
            }
        }
        else {
            if ($line -eq "\.") {
                Write-Host "Found end of COPY at line $lineNum. Total data lines: $($copyData.Count)"
                break
            }
            $copyData += $line
        }
        
        # Progress
        if ($lineNum % 1000000 -eq 0) {
            Write-Host "Scanned $lineNum lines..."
        }
    }
}
finally {
    $reader.Close()
}

if ($copyData.Count -eq 0) {
    Write-Host "No COPY data found for fields table"
    exit 1
}

# Convert tab-separated COPY data to INSERT statements
# COLUMNS: field_id, map_id, name, area, boundary, properties, created_at, updated_at, polygon_areas, icon, color, field_type, farm_id
Write-Host "Generating INSERT statements for $($copyData.Count) rows..."

$sw = [System.IO.StreamWriter]::new($OutputFile)
try {
    $sw.WriteLine("-- Restored from pg_dump backup")
    $sw.WriteLine("BEGIN;")
    
    $batchSize = 100
    $batchCount = 0
    $values = @()
    
    foreach ($line in $copyData) {
        # Tab-separated fields - careful with embedded tabs in geometry data
        $parts = $line.Split("`t")
        if ($parts.Length -lt 7) { continue }
        
        $field_id = $parts[0]
        $map_id = $parts[1]
        $name = $parts[2] -replace "'", "''"
        $area = if ($parts[3] -eq "\N" -or [string]::IsNullOrEmpty($parts[3])) { "NULL" } else { $parts[3] }
        $boundary = if ($parts[4] -eq "\N" -or [string]::IsNullOrEmpty($parts[4])) { "NULL" } else { "'$($parts[4] -replace "'", "''")'" }
        $properties = if ($parts[5] -eq "\N" -or [string]::IsNullOrEmpty($parts[5])) { "NULL" } else { "'$($parts[5] -replace "'", "''")'" }
        $created_at = if ($parts[6] -eq "\N") { "NOW()" } else { "'$($parts[6])'" }
        $updated_at = if ($parts[7] -eq "\N") { "NOW()" } else { "'$($parts[7])'" }
        $polygon_areas = if ($parts[8] -eq "\N" -or [string]::IsNullOrEmpty($parts[8])) { "NULL" } else { "'$($parts[8] -replace "'", "''")'" }
        $icon = if ($parts.Length -gt 9 -and $parts[9] -ne "\N") { "'$($parts[9] -replace "'", "''")'" } else { "NULL" }
        $color = if ($parts.Length -gt 10 -and $parts[10] -ne "\N") { "'$($parts[10] -replace "'", "''")'" } else { "NULL" }
        $field_type = if ($parts.Length -gt 11 -and $parts[11] -ne "\N") { "'$($parts[11] -replace "'", "''")'" } else { "NULL" }
        $farm_id = if ($parts.Length -gt 12 -and $parts[12] -ne "\N") { "'$($parts[12])'" } else { "NULL" }
        
        $values += "('$field_id', '$map_id', '$name', $area, ST_GeomFromText('$($boundary -replace "'", "''")', 4326), $properties, $created_at, $updated_at, $polygon_areas, $icon, $color, $field_type, $farm_id)"
        $batchCount++
        
        if ($batchCount -ge $batchSize) {
            $sw.WriteLine("INSERT INTO public.fields (field_id, map_id, name, area, boundary, properties, created_at, updated_at, polygon_areas, icon, color, field_type, farm_id) VALUES")
            $sw.WriteLine(($values -join ",`n") + " ON CONFLICT (field_id) DO NOTHING;")
            $sw.WriteLine("")
            $values = @()
            $batchCount = 0
        }
    }
    
    # Remaining rows
    if ($values.Count -gt 0) {
        $sw.WriteLine("INSERT INTO public.fields (field_id, map_id, name, area, boundary, properties, created_at, updated_at, polygon_areas, icon, color, field_type, farm_id) VALUES")
        $sw.WriteLine(($values -join ",`n") + " ON CONFLICT (field_id) DO NOTHING;")
    }
    
    $sw.WriteLine("COMMIT;")
    Write-Host "Generated $($copyData.Count) rows to $OutputFile"
}
finally {
    $sw.Close()
}
