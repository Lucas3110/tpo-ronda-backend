import os
import re

file_path = r'..\tpo-ronda-backend\scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# The broken part:
target = '''}
  }

  return https://picsum.photos/seed/ronda- + publicacion + - + indice + /800/600;
}
  return https://picsum.photos/seed/ronda--/800/600;
}'''

# Replace it with nothing
content = content.replace(target, '}')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
