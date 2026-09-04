import os
import re

file_path = r'src\services\authService.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure queries fetch 'rol'
content = content.replace(
    "SELECT id, email, password_hash, nombre, telefono, zona_id, email_verificado",
    "SELECT id, email, password_hash, nombre, telefono, zona_id, email_verificado, rol"
)

# Update JWT generation
content = content.replace(
    "{ sub: usuario.id, email: usuario.email },",
    "{ sub: usuario.id, email: usuario.email, rol: usuario.rol },"
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
