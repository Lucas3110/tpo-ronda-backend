import os
file_path = r'scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("u.rol or 'USER'", "u.rol || 'USER'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
