import os

file_path = r'scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Modify the urlFoto function to hardcode a monitor for ID 24 (or title Monitor)
replacement = '''function urlFoto(publicacion, indice) {
  if (publicacion === 24 || publicacion === 12) {
     if (indice === 0) return "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80";
     if (indice === 1) return "https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80";
  }
  return https://picsum.photos/seed/ronda--/800/600;
}'''

import re
content = re.sub(r'function urlFoto\(publicacion, indice\) \{[\s\S]*?\}', replacement, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
