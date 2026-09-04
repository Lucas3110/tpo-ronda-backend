import os

file_path = r'src\middlewares\auth.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update req.usuario assignment
content = content.replace(
    "req.usuario = { id: usuario.id, email: usuario.email };",
    "req.usuario = { id: usuario.id, email: usuario.email, rol: usuario.rol };"
)

# Add requerirRol middleware
new_middleware = '''
function requerirRol(rolEsperado) {
  return (req, res, next) => {
    if (!req.usuario || req.usuario.rol !== rolEsperado) {
      return next(ApiError.forbidden('No tenés permisos para realizar esta acción', 'ACCESO_DENEGADO'));
    }
    next();
  };
}

module.exports = { autenticar, requerirRol };
'''

content = content.replace("module.exports = { autenticar };", new_middleware)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
