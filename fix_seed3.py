import os

file_path = r'..\tpo-ronda-backend\scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}
  }

  return https://picsum.photos/seed/ronda- + publicacion + - + indice + /800/600;
}
  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}"""

replacement = """  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}"""

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced!")
else:
    print("Target not found!")
