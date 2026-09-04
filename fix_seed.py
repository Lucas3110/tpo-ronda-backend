import os
import re

file_path = r'..\tpo-ronda-backend\scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_function = '''function urlFoto(publicacion, indice, titulo) {
  if (!titulo) return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
  
  const img = {
    'iPhone': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
    'Notebook': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',
    'Bicicleta': 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
    'PlayStation': 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
    'Heladera': 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=800&q=80',
    'Taladro': 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80',
    'Guitarra': 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
    'Sill': 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800&q=80',
    'Cochecito': 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80',
    'Harry Potter': 'https://images.unsplash.com/photo-1622219809260-ce065361eb19?auto=format&fit=crop&w=800&q=80',
    'Campera': 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80',
    'Monitor': 'https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80'
  };

  for (let key in img) {
    if (titulo.includes(key)) {
      return img[key];
    }
  }

  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}'''

# Replace the whole old function
content = re.sub(r'function urlFoto\(.*?\}\n', new_function + '\n', content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
