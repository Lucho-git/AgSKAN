"""Extract fields table data from pg_dump backup file for a specific map_id."""
import re
import sys

BACKUP_FILE = r"c:\Users\lachl\Repos\AgSKAN\supabasebackup"
MAP_ID = "dd38fee0-ea92-4e9b-bbc5-1714514a2430"

print("Scanning backup for fields COPY section...")

# Stream the file looking for COPY section
with open(BACKUP_FILE, "r", encoding="utf-8", errors="replace") as f:
    in_copy = False
    columns = []
    data_lines = []
    
    for line_num, line in enumerate(f, 1):
        if not in_copy:
            if line.startswith("COPY public.fields "):
                # Parse column names
                match = re.search(r"COPY public\.fields \((.*?)\)", line)
                if match:
                    columns = [c.strip() for c in match.group(1).split(",")]
                    print(f"Found COPY at line {line_num}, columns: {columns}")
                    in_copy = True
        else:
            if line == "\\.\n" or line == "\\.":
                print(f"End of COPY at line {line_num}, got {len(data_lines)} rows")
                break
            data_lines.append(line.rstrip("\n").rstrip("\r"))
        
        if line_num % 5000000 == 0:
            print(f"  scanned {line_num:,} lines...")

print(f"Processing {len(data_lines)} field rows...")

# Filter for specific map_id and convert to INSERT
# Column order: field_id, map_id, name, area, boundary(hex_wkb), properties, 
#               created_at, updated_at, polygon_areas, icon, color, field_type, farm_id

map_id_idx = columns.index("map_id") if "map_id" in columns else 1
field_id_idx = columns.index("field_id") if "field_id" in columns else 0

matched = 0
inserts = []

for line in data_lines:
    parts = line.split("\t")
    if len(parts) > map_id_idx and parts[map_id_idx] == MAP_ID:
        matched += 1
        # Escape single quotes in text fields
        safe_parts = []
        for p in parts:
            p = p.replace("'", "''")
            if p == "\\N":
                safe_parts.append("NULL")
            else:
                safe_parts.append(f"'{p}'")
        
        # Convert hex WKB boundary to ST_GeomFromEWKB
        # COLUMNS: 0=field_id, 1=map_id, 2=name, 3=area, 4=boundary, 5=properties,
        #          6=created_at, 7=updated_at, 8=polygon_areas, 9=icon, 10=color, 11=field_type, 12=farm_id
        if len(parts) > 4 and parts[4] != "\\N":
            wkb_hex = parts[4]
            safe_parts[4] = f"ST_GeomFromEWKB(decode('{wkb_hex}', 'hex'))"
        
        col_list = "field_id, map_id, name, area, boundary, properties, created_at, updated_at, polygon_areas, icon, color, field_type, farm_id"
        val = ", ".join(safe_parts[:13])
        inserts.append(f"INSERT INTO public.fields ({col_list}) VALUES ({val}) ON CONFLICT (field_id) DO NOTHING;")

print(f"Found {matched} rows matching map_id {MAP_ID}")

if inserts:
    output = "c:\\Users\\lachl\\Repos\\AgSKAN\\scripts\\kim_fields_insert.sql"
    with open(output, "w", encoding="utf-8") as out:
        out.write("BEGIN;\n")
        for i, ins in enumerate(inserts):
            out.write(ins + "\n")
            if (i + 1) % 50 == 0:
                out.write("\n")
        out.write("COMMIT;\n")
    print(f"Wrote {len(inserts)} INSERT statements to {output}")
else:
    print("No matching rows found!")
