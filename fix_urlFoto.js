const fs = require('fs');
let text = fs.readFileSync('scripts/seed-demo.js', 'utf8');

const oldUrlFoto = `function urlFoto(publicacion, indice) {
  if (publicacion === 24 || publicacion === 12) {
     if (indice === 0) return "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80";
     if (indice === 1) return "https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80";
  }
  return \`https://picsum.photos/seed/ronda-\${publicacion}-\${indice}/800/600\`;
}`;

const newUrlFoto = `function urlFoto(publicacion, indice, titulo) {
  if (titulo && titulo.includes("Monitor")) {
     if (indice === 0) return "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80";
     if (indice === 1) return "https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80";
  }
  return \`https://picsum.photos/seed/ronda-\${publicacion}-\${indice}/800/600\`;
}`;

text = text.replace(oldUrlFoto, newUrlFoto);
text = text.replace('urlFoto(res.insertId, k)', 'urlFoto(res.insertId, k, p.titulo)');

fs.writeFileSync('scripts/seed-demo.js', text, 'utf8');
