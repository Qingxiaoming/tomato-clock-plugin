import re
from pathlib import Path

css_path = Path('styles.css')
css = css_path.read_text(encoding='utf-8')

# Extract all used classes from TS files
ts_files = list(Path('src').rglob('*.ts'))
used_classes = set()
for f in ts_files:
    content = f.read_text(encoding='utf-8')
    for match in re.findall(r'[\'"]\.?(Tomato-[a-zA-Z0-9_-]+)[\'"]', content):
        used_classes.add(match)

# Also check for addClass / removeClass / toggleClass calls with class names without quotes
for f in ts_files:
    content = f.read_text(encoding='utf-8')
    for match in re.findall(r'\b(Tomato-[a-zA-Z0-9_-]+)\b', content):
        used_classes.add(match)

lines = css.split('\n')
result_lines = []
i = 0

while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    
    if not stripped or stripped.startswith('/*') or stripped.startswith('*') or stripped.startswith('*/'):
        result_lines.append(line)
        i += 1
        continue
    
    if stripped.endswith('{') and not stripped.startswith('@'):
        selector_part = stripped[:-1].strip()
        selectors = [s.strip() for s in selector_part.split(',')]
        
        all_unused = True
        has_tomato = False
        for sel in selectors:
            classes_in_sel = re.findall(r'\.(Tomato-[a-zA-Z0-9_-]+)', sel)
            if not classes_in_sel:
                all_unused = False
                break
            has_tomato = True
            for cls in classes_in_sel:
                if cls in used_classes:
                    all_unused = False
                    break
            if not all_unused:
                break
        
        if all_unused and has_tomato:
            skip_depth = 1
            i += 1
            while i < len(lines) and skip_depth > 0:
                if '{' in lines[i]:
                    skip_depth += lines[i].count('{')
                if '}' in lines[i]:
                    skip_depth -= lines[i].count('}')
                i += 1
            continue
    
    result_lines.append(line)
    i += 1

new_css = '\n'.join(result_lines)
css_path.write_text(new_css, encoding='utf-8')

removed = len(css) - len(new_css)
print(f"Removed {removed} bytes ({len(css)} -> {len(new_css)})")
