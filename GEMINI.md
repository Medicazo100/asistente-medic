# Reglas del Proyecto AICLINIC / Antigravity

## Protocolo Obligatorio de Validación de Experiencia de Usuario Pre-Commit

> **Objetivo**: Garantizar que cuando el asistente entregue un resultado diciendo que "ya está listo", el usuario no tenga que ir al navegador a probar la aplicación para detectar qué le gustó o qué no le gustó. Un subagente de UX debe realizar esa evaluación crítica y solucionar las asperezas de antemano antes de realizar cualquier commit.

### 1. Rol de Evaluador de Experiencia de Usuario (UX Tester)
Antes de declarar cualquier tarea terminada o ejecutar `git commit`:
- **Simulación de Usuario Final**: Ponete en la posición de un usuario común (no técnico) que utiliza la aplicación en el navegador.
- **Detección Proactiva de Fricciones**:
  - **Interacción**: Verifica que todos los botones que desencadenen acciones asíncronas muestren estado de carga (`loading`, spinner, `disabled`) para evitar clics múltiples o incertidumbre.
  - **Copywriting y Claridad**: Asegura que los textos sean comprensibles, amables y en español claro, evitando jerga de programación o errores técnicos expuestos (ej. *'Network error 500'* vs *'No se pudo conectar con el servicio. Intenta nuevamente'*).
  - **Diseño y Estética**: Revisa alineaciones, espaciados, contrastes y visualización en dispositivos móviles/responsive.
  - **Manejo de Errores**: Comprueba que los campos de formulario alerten con claridad qué falta o qué es incorrecto.

### 2. Autocorrección Inmediata (Quick Fixes)
- Si detectas cualquier detalle menor, desalineación o falta de feedback visual, **corrígelo de inmediato en el código** antes de presentarlo al usuario.
- No esperes a que el usuario humano tenga que descubrir el error en el navegador.

### 3. Pipeline de Gobernanza (6 Roles)
- Ejecuta `npm run audit` para certificar los 6 roles:
  1. 📋 Planificador
  2. 🏛️ Supervisor de Arquitectura
  3. 🔍 Auditor de Calidad y Seguridad
  4. 🧪 Corrector y QA Técnico
  5. 👤🎨 Evaluador de Experiencia de Usuario (UX Tester)
  6. 🎖️ Director de Lanzamiento (Aprobación final previa al commit)
