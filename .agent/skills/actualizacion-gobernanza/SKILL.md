---
name: actualizacion-gobernanza
description: Protocolo multi-rol de 5 etapas integradas (Planificador, Supervisor de Arquitectura, Auditor de Seguridad/Riesgos, Corrector & QA, y Director de Lanzamiento) para auditar, blindar y aprobar actualizaciones en AICLINIC sin romper módulos existentes.
---

# Gobernanza de Actualizaciones AICLINIC (5 Roles Integrados)

Este protocolo estandariza el flujo de trabajo para cualquier cambio, refactorización o adición de funciones en la plataforma médica **AICLINIC**. Evita errores críticos en producción (como cortes de tokens en Gemini, caídas de JSON, incompatibilidad entre módulos y errores de tipado).

---

## Estructura de los 5 Roles

```
[1. Planificador] ───► [2. Supervisor] ───► [3. Auditor] ───► [4. Corrector / QA] ───► [5. Director]
  (Alcance/Impacto)     (Arquitectura/Tokens)   (Seguridad/JSON)     (Linter / Build)      (Aprobación Final)
```

### 1. Rol Planificador (Planner) 📋
* **Misión**: Analizar el requerimiento antes de modificar cualquier línea de código.
* **Acciones obligatorias**:
  1. Identificar módulos impactados (ej. `simulador`, `analizador`, `biblioteca`, `doctoria`).
  2. Determinar si requiere cambios en `types.ts`, variables de entorno o contratos de API.
  3. Prevenir efectos secundarios colaterales en módulos adyacentes.

### 2. Rol Supervisor de Arquitectura (Supervisor / Architect) 🏛️
* **Misión**: Velar por la integridad estructural del sistema y el consumo de IA.
* **Acciones obligatorias**:
  1. Revisar `services/apiRouter.ts` y verificar que los presupuestos de tokens (`LIMITES_TOKENS`) sean de al menos **4096 tokens** para simulaciones clínicas complejas y **6144 tokens** para análisis de artículos.
  2. Comprobar que `aplicarLimiteTokens` no estrangule solicitudes legítimas hacia abajo.
  3. Asegurar que las llamadas a modelos de razonamiento (ej. Gemini 2.5 / 3.7) contemplen el balance entre "thinking tokens" y "output tokens".

### 3. Rol Auditor de Calidad y Seguridad (Auditor / Code Reviewer) 🔍
* **Misión**: Auditar el código línea por línea en busca de vulnerabilidades y puntos de falla.
* **Acciones obligatorias**:
  1. **Parseo Resiliente**: Prohibido usar `JSON.parse` directo sobre respuestas de LLM sin envolver en `safeJsonParse` o mecanismos de autoreparación (`repairAndParseJson`).
  2. **Protección de Credenciales**: Ninguna API Key (`AIzaSy...`) debe quedar expuesta o hardcodeada. Todas deben pasar por variables de entorno seguras (`VITE_GEMINI_API_KEY`, `localStorage`, `process.env`).
  3. **Manejo de Errores Clínicos**: Todo modal o componente debe presentar un mensaje comprensible y amigable al médico/interno, nunca trazas de error sin procesar.

### 4. Rol Corrector y QA (Fixer & QA Engineer) 🧪
* **Misión**: Validar mediante código ejecutable que la aplicación compila y opera con cero errores.
* **Acciones obligatorias**:
  1. Ejecutar verificación estricta de TypeScript:
     ```bash
     npm run lint  # (tsc --noEmit)
     ```
  2. Ejecutar compilación de empaquetado para producción:
     ```bash
     npm run build # (vite build)
     ```
  3. Corregir inmediatamente cualquier advertencia o incompatibilidad detectada.

### 5. Rol Director de Lanzamiento (Release Director) 🎖️
* **Misión**: Emitir la autorización definitiva de despliegue.
* **Criterios de Aprobación**:
  - [x] Planificación y alcance claros sin dependencias huérfanas.
  - [x] Límites de tokens y arquitectura verificados en `apiRouter.ts`.
  - [x] Cero `JSON.parse` desprotegidos; autoreparación activa.
  - [x] `tsc --noEmit` completado con 0 errores de tipos.
  - [x] `vite build` completado con bundle de producción generado.
* **Veredicto**:
  - Si los 5 puntos cumplen: **APROBADO PARA DESPLIEGUE**.
  - Si alguno falla: **RECHAZADO CON ORDEN DE CORRECCIÓN INMEDIATA**.

---

## Ejecución Automatizada

El proyecto incluye un runner automatizado que ejecuta las verificaciones de los 5 roles en una sola orden:

```bash
npm run audit
```

Este comando ejecuta las validaciones programáticas de cada rol y emite el dictamen final del Director de Lanzamiento.
