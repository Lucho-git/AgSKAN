import re
import os

batch_dir = r'c:\Users\lachl\Repos\AgSKAN\scripts\field_batches'
output_dir = r'c:\Users\lachl\Repos\AgSKAN\scripts\field_batches_fixed'

os.makedirs(output_dir, exist_ok=True)

# Pattern: ST_GeomFromEWKB(decode('WKB_HEX', 'hex'))
pattern = re.compile(r"ST_GeomFromEWKB\(decode\('([0-9A-Fa-f]+)',\s*'hex'\)\)")

batch_files = sorted([f for f in os.listdir(batch_dir) if f.startswith('batch_') and f.endswith('.sql')])

total = 0
for filename in batch_files:
    filepath = os.path.join(batch_dir, filename)
    with open(filepath, 'r') as f:
        content = f.read()
    
    matches = pattern.findall(content)
    count = len(matches)
    total += count
    
    # Replace with fix_unclosed_polygon('WKB_HEX')
    fixed = pattern.sub(r"fix_unclosed_polygon('\1')", content)
    
    outpath = os.path.join(output_dir, filename)
    with open(outpath, 'w') as f:
        f.write(fixed)
    
    print(f"{filename}: {count} replacements")

print(f"\nTotal: {total} replacements across {len(batch_files)} files")
print(f"Output: {output_dir}")
