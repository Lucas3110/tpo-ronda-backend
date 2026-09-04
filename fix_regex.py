import os
file_path = r'scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Restore the broken line
content = content.replace(
    'return https://picsum.photos/seed/ronda--/800/600;',
    'return https://picsum.photos/seed/ronda--/800/600;'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
