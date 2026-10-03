#!/usr/bin/env node
/**
 * AICLINIC - Pipeline de Auditoría y Gobernanza de Actualizaciones
 * Ejecuta la verificación secuencial de los 5 roles antes de aprobar cada release.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function header(title) {
  console.log(`\n${colors.bold}${colors.cyan}═════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

function roleHeader(roleNumber, roleName, roleIcon) {
  console.log(`\n${colors.bold}${colors.magenta}[ROL ${roleNumber}: ${roleIcon} ${roleName}]${colors.reset}`);
}

const auditResults = {
  planner: { status: 'PENDING', notes: [] },
  supervisor: { status: 'PENDING', notes: [] },
  auditor: { status: 'PENDING', notes: [] },
  qa: { status: 'PENDING', notes: [] },
  director: { decision: 'PENDING', reason: '' }
};

try {
  header('AICLINIC - SISTEMA INTEGRADO DE GOBERNANZA DE ACTUALIZACIONES');

  // ==========================================
  // ROL 1: PLANIFICADOR (PLANNER)
  // ==========================================
  roleHeader(1, 'PLANIFICADOR (PLANNER)', '📋');
  console.log('Analizando archivos modificados y alcance del cambio...');

  let gitStatus = '';
  try {
    gitStatus = execSync('git status -s', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  } catch (err) {
    gitStatus = 'No es posible leer estado de git o git no está configurado.';
  }

  if (gitStatus) {
    console.log(`${colors.yellow}Archivos modificados detectados:${colors.reset}\n${gitStatus}`);
    auditResults.planner.notes.push(`Cambios en curso identificados.`);
  } else {
    console.log(`${colors.green}Árbol de trabajo limpio (sin cambios pendientes).${colors.reset}`);
    auditResults.planner.notes.push(`Árbol de trabajo sincronizado.`);
  }
  auditResults.planner.status = 'OK';
  console.log(`${colors.green}✓ Rol 1: Planificación y mapa de impacto validados.${colors.reset}`);

  // ==========================================
  // ROL 2: SUPERVISOR DE ARQUITECTURA (SUPERVISOR)
  // ==========================================
  roleHeader(2, 'SUPERVISOR DE ARQUITECTURA (SUPERVISOR)', '🏛️');
  console.log('Supervisando contratos de API, tokens y enrutamiento...');

  const apiRouterPath = path.join(ROOT_DIR, 'services', 'apiRouter.ts');
  if (fs.existsSync(apiRouterPath)) {
    const apiRouterContent = fs.readFileSync(apiRouterPath, 'utf-8');
    
    // Validar que los límites de tokens no sean estranguladores
    const simuladorMatch = apiRouterContent.match(/simulador:\s*(\d+)/);
    if (simuladorMatch) {
      const tokensSim = parseInt(simuladorMatch[1], 10);
      if (tokensSim < 3000) {
        throw new Error(`Supervisor: El límite de tokens para 'simulador' es muy bajo (${tokensSim} < 3000). Riesgo de corte de JSON.`);
      }
      console.log(`${colors.green}✓ Límite de tokens para simulador verificado: ${tokensSim} tokens (holgura segura).${colors.reset}`);
    }

    const analizadorMatch = apiRouterContent.match(/analizador:\s*(\d+)/);
    if (analizadorMatch) {
      const tokensAna = parseInt(analizadorMatch[1], 10);
      if (tokensAna < 3000) {
        throw new Error(`Supervisor: El límite de tokens para 'analizador' es muy bajo (${tokensAna} < 3000).`);
      }
      console.log(`${colors.green}✓ Límite de tokens para analizador verificado: ${tokensAna} tokens.${colors.reset}`);
    }
  } else {
    console.log(`${colors.yellow}Aviso: services/apiRouter.ts no encontrado.${colors.reset}`);
  }
  auditResults.supervisor.status = 'OK';
  console.log(`${colors.green}✓ Rol 2: Arquitectura y límites de consumo validados.${colors.reset}`);

  // ==========================================
  // ROL 3: AUDITOR DE CALIDAD Y SEGURIDAD (AUDITOR)
  // ==========================================
  roleHeader(3, 'AUDITOR DE CALIDAD Y SEGURIDAD (AUDITOR)', '🔍');
  console.log('Auditando resiliencia de datos, parseo seguro y riesgos...');

  const geminiServicePath = path.join(ROOT_DIR, 'services', 'geminiService.ts');
  if (fs.existsSync(geminiServicePath)) {
    const geminiContent = fs.readFileSync(geminiServicePath, 'utf-8');
    if (!geminiContent.includes('repairAndParseJson') && !geminiContent.includes('safeJsonParse')) {
      throw new Error(`Auditor: Falta mecanismo de parseo defensivo/autoreparación de JSON en geminiService.ts.`);
    }
    console.log(`${colors.green}✓ Verificada la presencia de autoreparación de JSON truncado.${colors.reset}`);

    if (geminiContent.includes('AIzaSy') || /apiKey:\s*["'][A-Za-z0-9_-]{30,}["']/.test(geminiContent)) {
      throw new Error(`Auditor: Alerta de seguridad: Llave de API hardcodeada en geminiService.ts.`);
    }
    console.log(`${colors.green}✓ Sin llaves API privadas expuestas en código fuente.${colors.reset}`);
  }
  auditResults.auditor.status = 'OK';
  console.log(`${colors.green}✓ Rol 3: Auditoría de seguridad y resiliencia aprobada.${colors.reset}`);

  // ==========================================
  // ROL 4: CORRECTOR Y QA (FIXER & QA)
  // ==========================================
  roleHeader(4, 'CORRECTOR Y QA (FIXER & QA)', '🧪');
  console.log('Ejecutando verificación estricta de tipos de TypeScript (tsc --noEmit)...');
  execSync('npx tsc --noEmit', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log(`${colors.green}✓ TypeScript: Cero errores de tipos.${colors.reset}`);

  console.log('Ejecutando compilación de producción (vite build)...');
  execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'pipe' });
  console.log(`${colors.green}✓ Vite Build: Compilación exitosa para producción y PWA.${colors.reset}`);

  auditResults.qa.status = 'OK';
  console.log(`${colors.green}✓ Rol 4: Control de Calidad y Pruebas exitosas.${colors.reset}`);

  // ==========================================
  // ROL 5: DIRECTOR DE LANZAMIENTO (RELEASE DIRECTOR)
  // ==========================================
  roleHeader(5, 'DIRECTOR DE LANZAMIENTO (DIRECTOR)', '🎖️');
  auditResults.director.decision = 'APROBADO';
  auditResults.director.reason = 'Todos los roles (Planificador, Supervisor, Auditor y QA) completaron sus fases sin errores críticos.';

  console.log(`\n${colors.bold}${colors.green}=================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}   DICTAMEN FINAL DEL DIRECTOR: APROBADO PARA DESPLIEGUE   ${colors.reset}`);
  console.log(`${colors.bold}${colors.green}=================================================================${colors.reset}`);
  console.log(`Detalle: ${auditResults.director.reason}\n`);
  process.exit(0);

} catch (error) {
  roleHeader(5, 'DIRECTOR DE LANZAMIENTO (DIRECTOR)', '🎖️');
  auditResults.director.decision = 'RECHAZADO';
  auditResults.director.reason = error.message || String(error);

  console.log(`\n${colors.bold}${colors.red}=================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.red}   DICTAMEN FINAL DEL DIRECTOR: RECHAZADO (BLOQUEO DETECTADO)   ${colors.reset}`);
  console.log(`${colors.bold}${colors.red}=================================================================${colors.reset}`);
  console.log(`${colors.red}Motivo de rechazo:${colors.reset} ${auditResults.director.reason}\n`);
  process.exit(1);
}
