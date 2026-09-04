const fs = require('fs');
let content = fs.readFileSync('scripts/seed-demo.js', 'utf8');

const oldStr = unction urlFoto(publicacion, indice) {
    if (publicacion === 24 || publicacion === 12) {
       if (indice === 0) return 
"https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80";
       if (indice === 1) return 
"https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80";
    }
    return https://picsum.photos/seed/ronda--/800/600;
  }- + '/800/600;\n  }';

const newStr = unction urlFoto(publicacion, indice) {
  if (publicacion === 24 || publicacion === 12) {
     if (indice === 0) return "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80";
     if (indice === 1) return "https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80";
  }
  return \https://picsum.photos/seed/ronda-\-\/800/600\;
};

content = content.replace(oldStr, newStr);

fs.writeFileSync('scripts/seed-demo.js', content, 'utf8');
