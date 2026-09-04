import os

file_path = r'..\tpo-ronda-backend\scripts\seed-demo.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """function urlFoto(publicacion, indice, titulo) {
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
}"""

replacement = """function urlFoto(publicacion, indice, titulo) {
  if (!titulo) return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
  
  // Ahora cada producto tiene un ARREGLO de fotos, separadas por coma.
  // Podés agregar 2, 3 o las que quieras para cada uno.
  const img = {
    'iPhone': [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1605236453806-6ff36851218e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1603798125914-7b5d27789248?auto=format&fit=crop&w=800&q=80'
    ],
    'Notebook': [
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=800&q=80'
    ],
    'Bicicleta': [
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=800&q=80'
    ],
    'PlayStation': [
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?auto=format&fit=crop&w=800&q=80'
    ],
    'Heladera': [
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=800&q=80'
    ],
    'Taladro': [
      'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80'
    ],
    'Guitarra': [
      'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1550291652-6cb90046408b?auto=format&fit=crop&w=800&q=80'
    ],
    'Sill': [
      'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1540574163026-643ea20d25b5?auto=format&fit=crop&w=800&q=80'
    ],
    'Cochecito': [
      'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80'
    ],
    'Harry Potter': [
      'https://images.unsplash.com/photo-1622219809260-ce065361eb19?auto=format&fit=crop&w=800&q=80'
    ],
    'Campera': [
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1520975954732-57dd22299614?auto=format&fit=crop&w=800&q=80'
    ],
    'Monitor': [
      'https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80'
    ]
  };

  for (let key in img) {
    if (titulo.includes(key)) {
      // Si tenemos la foto para ese indice, la devolvemos.
      // Si el backend pide foto 2 y solo le dimos 1 link, repetimos el primero (o devolvemos uno al azar)
      const arr = img[key];
      return arr[indice] ? arr[indice] : arr[0];
    }
  }

  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}"""

content = content.replace(target, replacement)
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
