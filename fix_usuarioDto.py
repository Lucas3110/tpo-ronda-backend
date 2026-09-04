import os

file_path = r'src\dtos\usuarioDto.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add rol to toUsuarioDto
content = content.replace(
    "nombre: usuario.nombre,",
    "nombre: usuario.nombre,\n    rol: usuario.rol,"
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
