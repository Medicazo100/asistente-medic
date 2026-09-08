/**
 * Servicio de Imágenes Médicas Diagnósticas Reales de Internet
 * Integra fotografías clínicas, radiografías, tomografías, ecografías y
 * electrocardiogramas auténticos de internet acordes al informe radiológico
 * y la modalidad diagnóstica solicitada, conectado a un catálogo clínico de
 * más de 2,000 imágenes de referencia verificadas en CDN de alta velocidad.
 */

import { MASSIVE_CLINICAL_CATALOG, getCatalogVariant } from './medicalCatalogData';

export { MASSIVE_CLINICAL_CATALOG, getCatalogVariant };

// Catálogo base de respaldo directo para compatibilidad retroactiva
export const CLINICAL_IMAGE_CATALOG: Record<string, string> = {
  // Tórax & Pulmonar (Radiografías en orientación vertical estándar PA)
  pneumonia: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/8/85/03-01-Infiltrat_Ausgang.png&w=700',
  effusion: 'https://images.weserv.nl/?url=commons.wikimedia.org/wiki/Special:FilePath/14-02-Erguss_im_Stehen.png&w=700',
  cardiomegaly: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/7/7a/Cardiomegally.PNG&w=700',
  pneumothorax: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/d/d1/Bilateral_pneumothorax_pneumomediastinum.jpg&w=700',
  normal_chest: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/a/a1/Normal_posteroanterior_%28PA%29_chest_radiograph_%28X-ray%29.jpg&w=700',

  // Electrocardiograma
  stemi: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/8/8d/12_Lead_EKG_ST_Elevation_tracing_only.jpg&w=700',
  afib: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/d/de/LBBB_atrial_fibrillation.png&w=700',
  normal_ecg: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/f/f0/12_lead_generated_sinus_rhythm.JPG&w=700',

  // Tomografía Axial Computarizada (TAC)
  ct_hemorrhage: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/3/3a/TAC_craneo_ECV.jpg&w=700',
  ct_stroke: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/8/89/NCCT_Brain_Imaging.jpg&w=700',
  ct_normal: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/d/da/Head_CT_scan.jpg&w=700',
  ct_abdomen: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/2/2b/CT_of_a_normal_abdomen_and_pelvis%2C_thumbnail.png&w=700',

  // Ultrasonido & Ecocardiograma
  us_gallstones: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/4/4b/Ultrasound_Scan_ND_0104105437_1057030.png&w=700',
  us_kidney: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/1/17/Ultrasound_of_left_kidney_lower_pole_with_stone.jpg&w=700',
  echo_cardiac: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/3/39/LVNC3.jpg&w=700',

  // Abdomen y Extremidades Óseas
  xray_obstruction: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/d/dc/Upright_X-ray_demonstrating_small_bowel_obstruction.jpg&w=700',
  xray_fracture: 'https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/f/f5/X-ray_of_hand.jpg&w=700'
};

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Limpia cláusulas de hallazgos negativos en informes radiológicos
 * Ej: "sin signos de sangrado", "sin derrame", "sin neumotorax ni consolidacion"
 */
function cleanNegations(text: string): string {
  return text
    .replace(/\b(?:sin|no\s+se\s+observ\w*|ausencia\s+de|descart\w*)\s+(?:signos\s+de\s+|datos\s+de\s+|evidencia\s+de\s+|presencia\s+de\s+)?([a-z0-9\s]+?)(?=[,;.]|\s+(?:con|y|pero|ademas)\s+|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resuelve una imagen de una categoría con respaldo seguro a una categoría alternativa o fallback estático
 */
function resolveCategory(primaryCat: string, fallbackCat?: string, seed?: string): string {
  const img = getCatalogVariant(primaryCat, seed);
  if (img) return img;
  if (fallbackCat) {
    const fallbackImg = getCatalogVariant(fallbackCat, seed);
    if (fallbackImg) return fallbackImg;
  }
  return CLINICAL_IMAGE_CATALOG.normal_chest;
}

/**
 * Resuelve una imagen médica de internet estrictamente congruente con la modalidad
 * solicitada y los hallazgos radiológicos específicos, seleccionando entre más de 2,000
 * casos reales auténticos organizados por patología, variantes clínicas y grupos de edad.
 */
export function getInternetMedicalImageUrl(study: string, findings?: string): string {
  const s = normalizeText(study);
  const f = normalizeText(findings || '');
  const positiveFindings = cleanNegations(f);
  const combined = `${s} ${positiveFindings}`;
  const seed = `${s}_${positiveFindings}`;

  // 1. Identificación Jerárquica de la Modalidad por el Estudio Solicitado
  const isUltrasound = /\b(ultra|ultrasonido|ultrasonografia|ecografia|ecografico|ecocardiograma|usg|doppler)\b/.test(s) || 
                       s.startsWith('eco') || 
                       /\beco\b/.test(s);

  const isECG = /\b(ecg|ekg|electrocardiograma|electrocardio|holter|trazo)\b/.test(s);

  const isCT = /\b(tac|tc|tomograf\w*|angiotac|angiotc)\b/.test(s);

  const isXRay = /\b(rx|radiograf\w*|tele\s+de\s+torax|rayos\s*x|placa)\b/.test(s);

  // Detector de contexto pediátrico
  const isPediatric = /\b(lactante|pediatric\w*|infantil|nino|nina|bebe|meses|neonato|recien\s+nacido|preescolar|escolar)\b/.test(combined);

  // === MODALIDAD 1: ULTRASONIDO / ECOGRAFÍA ===
  if (isUltrasound) {
    // 1.1 Ecocardiograma
    if (/\b(corazon|card\w*|fevi|valvul\w*|ventricul\w*|auricul\w*|ecocardio\w*|pericard\w*|taponamiento)\b/.test(combined)) {
      return resolveCategory('echo_cardiac', 'us_general_pool', seed);
    }
    // 1.2 Pediatría gastrointestinal (Intususcepción / Píloro)
    if (/\b(intususcep\w*|invaginac\w*|diana|rosquilla|pseudo\s*rinon)\b/.test(combined)) {
      return resolveCategory('peds_intussusception', 'us_general_pool', seed);
    }
    if (/\b(pilor\w*|estenosis\s+hipertrof\w*|donut)\b/.test(combined)) {
      return resolveCategory('peds_pyloric_stenosis', 'us_general_pool', seed);
    }
    // 1.3 Gineco-obstétrico (Ectópico, Quiste ovárico, Embarazo)
    if (/\b(ectopic\w*|anillo\s+tubar\w*|blob|saco\s+gestac\w*|uter\w*|embarazo|obstetric\w*)\b/.test(combined)) {
      return resolveCategory('us_ectopic_pregnancy', 'us_ovarian_cyst', seed);
    }
    if (/\b(ovari\w*|quiste\s+ovari\w*|anexo\w*|trompa)\b/.test(combined)) {
      return resolveCategory('us_ovarian_cyst', 'us_general_pool', seed);
    }
    // 1.4 FAST / Trauma / Hemoperitoneo / Líquido libre
    if (/\b(fast|morison|morrison|esplenorrenal|liquido\s+libre|hemoperitoneo|douglas|subxifoide\w*)\b/.test(combined)) {
      return resolveCategory('us_fast_free_fluid', 'us_general_pool', seed);
    }
    // 1.5 Doppler Vascular / Trombosis Venosa Profunda
    if (/\b(doppler|trombosis|tvp|compresib\w*|femoral|poplite\w*|vena|vascular)\b/.test(combined)) {
      return resolveCategory('us_dvt_vascular', 'us_general_pool', seed);
    }
    // 1.6 Renal / Nefrolitiasis / Hidronefrosis
    if (/\b(renal\w*|rinon\w*|nefro\w*|litiasis\s+renal|calculo\s+renal|urolit\w*|hidronefrosis|calic\w*)\b/.test(combined)) {
      return resolveCategory('us_hydronephrosis', 'us_general_pool', seed);
    }
    // 1.7 Biliar / Vesicular
    if (/\b(colecistitis|engrosamiento\s+de\s+pared|halo\s+perivesicular|murphy\s+ecograf\w*)\b/.test(combined)) {
      return resolveCategory('us_cholecystitis', 'us_gallbladder_stones', seed);
    }
    if (/\b(vesicul\w*|biliar\w*|litiasis\s+vesicular|calculo|barro\s+biliar|coledoc\w*|litiasica)\b/.test(combined)) {
      return resolveCategory('us_gallbladder_stones', 'us_general_pool', seed);
    }
    // Ultrasonido general / fallback
    return resolveCategory('us_gallbladder_stones', 'us_general_pool', seed);
  }

  // === MODALIDAD 2: ELECTROCARDIOGRAMA (ECG / EKG) ===
  if (isECG) {
    // 2.1 Infarto Agudo de Miocardio con Elevación del ST (IAMCEST)
    if (/\b(inferior|dii|diii|avf)\b/.test(combined) && /\b(st|elevacion|scacest|infarto)\b/.test(combined)) {
      return resolveCategory('ecg_stemi_inferior', 'ecg_stemi_anterior', seed);
    }
    if (/\b(lateral|di\b|avl|v5|v6)\b/.test(combined) && /\b(st|elevacion|scacest|infarto)\b/.test(combined)) {
      return resolveCategory('ecg_stemi_lateral', 'ecg_stemi_anterior', seed);
    }
    if (/\b(posterior|v7|v8|v9)\b/.test(combined) && /\b(st|elevacion|scacest|infarto)\b/.test(combined)) {
      return resolveCategory('ecg_stemi_posterior', 'ecg_stemi_anterior', seed);
    }
    if (/\b(st|infarto\w*|elevacion\w*|supra\w*|scacest|isquemia\w*|onda\s*q|necrosis|anterior|septal)\b/.test(combined)) {
      return resolveCategory('ecg_stemi_anterior', 'ecg_general_pool', seed);
    }
    // 2.2 SCASEST / Infradesnivel / Wellens
    if (/\b(infradesnivel|depresion\s+st|scasest|wellens|t\s+invertida|t\s+negativa)\b/.test(combined)) {
      return resolveCategory('ecg_nstemi', 'ecg_general_pool', seed);
    }
    // 2.3 Taquicardia y Fibrilación Ventricular / Torsades
    if (/\b(torsade\w*|puntas\s+torcidas|qt\s+prolong\w*)\b/.test(combined)) {
      return resolveCategory('ecg_torsades', 'ecg_vtach', seed);
    }
    if (/\b(fibrilacion\s+ventricular|fv\b|vfib)\b/.test(combined)) {
      return resolveCategory('ecg_vfib', 'ecg_vtach', seed);
    }
    if (/\b(taquicardia\s+ventricular|tv\b|vtach|complejo\s+ancho)\b/.test(combined)) {
      return resolveCategory('ecg_vtach', 'ecg_general_pool', seed);
    }
    // 2.4 Taquiarritmias Supraventriculares (FA, Flutter, TPSV, WPW)
    if (/\b(flutter|aleteo|sierra)\b/.test(combined)) {
      return resolveCategory('ecg_flutter', 'ecg_afib', seed);
    }
    if (/\b(fibrilacion\s+auricular|fa\b|afib|irregular\w*)\b/.test(combined)) {
      return resolveCategory('ecg_afib', 'ecg_general_pool', seed);
    }
    if (/\b(tpsv|supraventricular|taquicardia\s+sinusal|wpw|wolff|preexcitac\w*)\b/.test(combined)) {
      return resolveCategory('ecg_svt', 'ecg_afib', seed);
    }
    // 2.5 Bloqueos Cardíacos (AV, Rama izquierda, Rama derecha)
    if (/\b(bloqueo\s+av|bloqueo\s+completo|tercer\s+grado|av\s+block|mobitz)\b/.test(combined)) {
      return resolveCategory('ecg_av_block_complete', 'ecg_general_pool', seed);
    }
    if (/\b(bloqueo\s+de\s+rama\s+izquierda|lbbb|bri\b)\b/.test(combined)) {
      return resolveCategory('ecg_lbbb', 'ecg_general_pool', seed);
    }
    if (/\b(bloqueo\s+de\s+rama\s+derecha|rbbb|brd\b)\b/.test(combined)) {
      return resolveCategory('ecg_rbbb', 'ecg_general_pool', seed);
    }
    // 2.6 Alteraciones Electrolíticas e Inflamatorias
    if (/\b(hiperpotasemia|hiperkalemia|t\s+picuda|potasio|hipopotasemia|onda\s*u)\b/.test(combined)) {
      return resolveCategory('ecg_hyperkalemia', 'ecg_general_pool', seed);
    }
    if (/\b(brugada)\b/.test(combined)) {
      return resolveCategory('ecg_brugada', 'ecg_general_pool', seed);
    }
    if (/\b(pericarditis|elevacion\s+concava|pr\s+deprimido)\b/.test(combined)) {
      return resolveCategory('ecg_pericarditis', 'ecg_general_pool', seed);
    }
    // Normal / Ritmo sinusal
    if (/\b(normal|sinusal|conservad\w*)\b/.test(combined)) {
      return resolveCategory('ecg_normal', 'ecg_general_pool', seed);
    }
    return resolveCategory('ecg_normal', 'ecg_general_pool', seed);
  }

  // === MODALIDAD 3: TOMOGRAFÍA COMPUTARIZADA (TAC / TC) ===
  if (isCT) {
    // 3.1 TAC Abdominal y Pélvica
    if (/\b(abdom\w*|pelv\w*|higado|hepat\w*|bazo|pancrea\w*|apendic\w*|mesenter\w*|diverticul\w*|aort\w*|renal|urinari\w*)\b/.test(combined)) {
      if (/\b(apendic\w*|apendicolito|flemon)\b/.test(combined)) {
        return resolveCategory('ct_appendicitis', 'ct_abdomen_normal', seed);
      }
      if (/\b(diverticul\w*|sigmoides|flem\w*)\b/.test(combined)) {
        return resolveCategory('ct_diverticulitis', 'ct_abdomen_normal', seed);
      }
      if (/\b(pancrea\w*|balthazar|necrosis\s+pancreat\w*)\b/.test(combined)) {
        return resolveCategory('ct_pancreatitis', 'ct_abdomen_normal', seed);
      }
      if (/\b(mesenter\w*|neumatosis|gas\s+portal)\b/.test(combined)) {
        return resolveCategory('ct_mesenteric_ischemia', 'ct_abdomen_normal', seed);
      }
      if (/\b(aneurisma|aaa\b|dilatacion\s+aortica)\b/.test(combined)) {
        return resolveCategory('ct_aortic_aneurysm', 'ct_abdomen_normal', seed);
      }
      if (/\b(diseccion|flap|colgajo|falsa\s+luz|stanford)\b/.test(combined)) {
        return resolveCategory('ct_aortic_dissection', 'ct_abdomen_normal', seed);
      }
      if (/\b(litiasis\s+ureteral|calculo\s+ureteral|urolit\w*)\b/.test(combined)) {
        return resolveCategory('ct_renal_stone', 'ct_abdomen_normal', seed);
      }
      return resolveCategory('ct_abdomen_normal', 'ct_abdomen_pool', seed);
    }

    // 3.2 AngioTAC Torácica / TEP
    if (/\b(tep|tromboembol\w*|embolia\s+pulmonar|defecto\s+de\s+replecion|arteria\s+pulmonar)\b/.test(combined)) {
      return resolveCategory('ct_pulmonary_embolism', 'ct_abdomen_normal', seed);
    }

    // 3.3 TAC Espinal / Columna
    if (/\b(columna|vertebra|espinal|cervical|dorsal|lumbar)\b/.test(combined)) {
      return resolveCategory('ct_spine', 'ct_head_normal', seed);
    }

    // 3.4 TAC de Cráneo / Neuro
    if (/\b(epidural|biconvex\w*|lenticular)\b/.test(combined)) {
      return resolveCategory('ct_epidural_hematoma', 'ct_head_normal', seed);
    }
    if (/\b(subdural|creciente|semiluna)\b/.test(combined)) {
      return resolveCategory('ct_subdural_hematoma', 'ct_head_normal', seed);
    }
    if (/\b(subaracnoid\w*|hsa|cistern\w*|silvio)\b/.test(combined)) {
      return resolveCategory('ct_sah', 'ct_head_normal', seed);
    }
    if (/\b(contusion\w*|sal\s+y\s+pimienta)\b/.test(combined)) {
      return resolveCategory('ct_cerebral_contusion', 'ct_head_normal', seed);
    }
    if (/\b(fractura\s+de\s+craneo|boveda|base\s+de\s+craneo|peñasco|mastoid\w*|ventana\s+osea)\b/.test(combined)) {
      return resolveCategory('ct_skull_fracture', 'ct_head_normal', seed);
    }
    if (/\b(hemorrag\w*|sangrado|hematoma|hiperden\w*|ganglios\s+basales|talam\w*|intraventricular)\b/.test(combined)) {
      return resolveCategory('ct_stroke_hemorrhagic', 'ct_head_normal', seed);
    }
    if (/\b(isquem\w*|hipoden\w*|acv|ictus|infarto cerebral|arteria cerebral|acm|cuerda)\b/.test(combined)) {
      return resolveCategory('ct_stroke_ischemic', 'ct_head_normal', seed);
    }
    return resolveCategory('ct_head_normal', 'ct_head_normal', seed);
  }

  // === MODALIDAD 4: RADIOGRAFÍA / RAYOS X ===
  if (isXRay) {
    // 4.1 PEDIATRÍA: Condiciones y signos pediátricos específicos
    if (isPediatric || /\b(nino|infant\w*|pediatr\w*|lactante)\b/.test(combined)) {
      if (/\b(crup|laringotraque\w*|campanario|aguja|torre|estridor)\b/.test(combined)) {
        return resolveCategory('peds_croup', 'peds_chest_general', seed);
      }
      if (/\b(epiglot\w*|pulgar|thumb)\b/.test(combined)) {
        return resolveCategory('peds_epiglottitis', 'peds_chest_general', seed);
      }
      if (/\b(bronquiolitis|peribronquial|manguitos)\b/.test(combined)) {
        return resolveCategory('peds_bronchiolitis', 'peds_chest_general', seed);
      }
      if (/\b(asma|atrapamiento\s+aereo|hiperinsuflacion|hiperclaridad)\b/.test(combined)) {
        return resolveCategory('peds_asthma', 'peds_bronchiolitis', seed);
      }
      if (/\b(neumonia\s+redonda|round\s+pneumonia)\b/.test(combined)) {
        return resolveCategory('peds_round_pneumonia', 'cxr_pneumonia_infiltrate', seed);
      }
      if (/\b(cuerpo\s+extrano|broncoaspirac\w*|pila|moneda|boton|doble\s+halo)\b/.test(combined)) {
        return resolveCategory('peds_foreign_body', 'peds_chest_general', seed);
      }
      if (/\b(enterocolitis|neumatosis)\b/.test(combined)) {
        return resolveCategory('peds_necrotizing_enterocolitis', 'xray_abdomen_pool', seed);
      }
      if (/\b(tallo\s+verde|greenstick)\b/.test(combined)) {
        return resolveCategory('peds_greenstick', 'xray_ortho_pool', seed);
      }
      if (/\b(rodete|torus|buckle|cana\s+hueca)\b/.test(combined)) {
        return resolveCategory('peds_torus_buckle', 'xray_ortho_pool', seed);
      }
      if (/\b(supracondil\w*)\b/.test(combined)) {
        return resolveCategory('peds_supracondylar', 'xray_ortho_pool', seed);
      }
      if (/\b(salter|fisiaria|cartilago\s+de\s+crecimiento)\b/.test(combined)) {
        return resolveCategory('peds_salter_harris', 'xray_ortho_pool', seed);
      }
      if (/\b(torax|tele\s+de\s+torax|pulmon\w*)\b/.test(combined) && /\b(normal|limpio)\b/.test(f)) {
        return resolveCategory('peds_chest_general', 'cxr_normal', seed);
      }
    }

    // 4.2 ABDOMEN: Obstrucción, Vólvulo, Perforación
    if (/\b(abdom\w*|ileo|obstruc\w*|niveles|hidroaere\w*|asa|perforac\w*|neumoperitoneo|volvulo)\b/.test(combined)) {
      if (/\b(neumoperitoneo|subdiafragmatic\w*|rigler|aire\s+libre)\b/.test(combined)) {
        return resolveCategory('xray_pneumoperitoneum', 'xray_abdomen_pool', seed);
      }
      if (/\b(volvulo|grano\s+de\s+cafe|omega)\b/.test(combined)) {
        return resolveCategory('xray_sigmoid_volvulus', 'xray_abdomen_pool', seed);
      }
      if (/\b(obstruc\w*|niveles\s+hidroaereos|escalera|distension\s+de\s+asas)\b/.test(combined)) {
        return resolveCategory('xray_bowel_obstruction', 'xray_abdomen_pool', seed);
      }
      return resolveCategory('xray_abdomen_pool', 'xray_bowel_obstruction', seed);
    }

    // 4.3 TRAUMA & ORTOPEDIA: Fracturas y Luxaciones
    if (/\b(fractur\w*|osea|oseo|hueso|trauma\w*|femur|tibia|humero|radio|cubito|mano|pie|costal\w*|esguince|luxac\w*|cadera|rodilla|tobillo|muneca|clavicula|hombro|escafoides|calcaneo|mandibula)\b/.test(combined)) {
      if (/\b(clavicula)\b/.test(combined)) return resolveCategory('xray_clavicle_fracture', 'xray_ortho_pool', seed);
      if (/\b(luxacion\s+(?:de\s+)?hombro|glenohumeral)\b/.test(combined)) return resolveCategory('xray_shoulder_dislocation', 'xray_ortho_pool', seed);
      if (/\b(humero)\b/.test(combined)) return resolveCategory('xray_humerus_fracture', 'xray_ortho_pool', seed);
      if (/\b(cabeza\s+de\s+radio|cupula)\b/.test(combined)) return resolveCategory('xray_radial_head', 'xray_ortho_pool', seed);
      if (/\b(colles|muneca)\b/.test(combined)) return resolveCategory('xray_colles_wrist', 'xray_ortho_pool', seed);
      if (/\b(smith)\b/.test(combined)) return resolveCategory('xray_smith_fracture', 'xray_ortho_pool', seed);
      if (/\b(escafoides|tabaquera)\b/.test(combined)) return resolveCategory('xray_scaphoid_fracture', 'xray_ortho_pool', seed);
      if (/\b(boxeador|5(?:to|°)?\s+metacarp\w*)\b/.test(combined)) return resolveCategory('xray_boxer_fracture', 'xray_ortho_pool', seed);
      if (/\b(femur|cadera|cuello\s+femoral|intertrocanter\w*)\b/.test(combined)) return resolveCategory('xray_femur_hip_fracture', 'xray_ortho_pool', seed);
      if (/\b(rotula|patela)\b/.test(combined)) return resolveCategory('xray_patella_fracture', 'xray_ortho_pool', seed);
      if (/\b(meseta\s+tibial)\b/.test(combined)) return resolveCategory('xray_tibial_plateau', 'xray_ortho_pool', seed);
      if (/\b(tibia|perone)\b/.test(combined)) return resolveCategory('xray_tibia_fibula', 'xray_ortho_pool', seed);
      if (/\b(tobillo|maleol\w*|bimaleolar)\b/.test(combined)) return resolveCategory('xray_ankle_fracture', 'xray_ortho_pool', seed);
      if (/\b(calcaneo)\b/.test(combined)) return resolveCategory('xray_calcaneus_fracture', 'xray_ortho_pool', seed);
      if (/\b(lisfranc)\b/.test(combined)) return resolveCategory('xray_lisfranc_fracture', 'xray_ortho_pool', seed);
      if (/\b(metatarsiano|jones)\b/.test(combined)) return resolveCategory('xray_metatarsal_fracture', 'xray_ortho_pool', seed);
      if (/\b(columna\s+cervical|cervical|dorsal|lumbar|aplastamiento)\b/.test(combined)) return resolveCategory('xray_c_spine_fracture', 'xray_ortho_pool', seed);
      if (/\b(mandibula|maxilar|nasal|huesos\s+propios)\b/.test(combined)) return resolveCategory('xray_mandible_fracture', 'xray_ortho_pool', seed);
      return resolveCategory('xray_ortho_pool', 'xray_colles_wrist', seed);
    }

    // 4.4 TÓRAX Y NEUMOLOGÍA
    if (/\b(tension|hipertensivo)\b/.test(combined) && /\b(neumotorax|colapso)\b/.test(combined)) {
      return resolveCategory('cxr_tension_pneumothorax', 'cxr_pneumothorax', seed);
    }
    if (/\b(neumotorax|colapso\w*|hiperclaridad|desviacion\s+traqueal)\b/.test(combined)) {
      return resolveCategory('cxr_pneumothorax', 'cxr_general_pool', seed);
    }
    if (/\b(hemotorax)\b/.test(combined)) {
      return resolveCategory('cxr_hemothorax', 'cxr_pleural_effusion', seed);
    }
    if (/\b(derrame\w*|pleural\w*|liquido\s+pleural|velamiento\w*|borramiento\s+del\s+seno|menisco)\b/.test(combined)) {
      return resolveCategory('cxr_pleural_effusion', 'cxr_general_pool', seed);
    }
    if (/\b(edema\s+agudo|edema\s+pulmonar|kerley|alas\s+de\s+mariposa|congest\w*)\b/.test(combined)) {
      return resolveCategory('cxr_pulmonary_edema', 'cxr_general_pool', seed);
    }
    if (/\b(cardiomegal\w*|cardiotorac\w*|silueta\s+cardiaca\s+aumentada)\b/.test(combined)) {
      return resolveCategory('cxr_cardiomegaly', 'cxr_general_pool', seed);
    }
    if (/\b(enfisema|epoc|hiperinsuflacion|tonel|aplanamiento\s+diafragmatico)\b/.test(combined)) {
      return resolveCategory('cxr_copd_emphysema', 'cxr_general_pool', seed);
    }
    if (/\b(tuberculosis|cavitacion\w*|apical|tbc)\b/.test(combined)) {
      return resolveCategory('cxr_tuberculosis', 'cxr_general_pool', seed);
    }
    if (/\b(neumomediastino|enfisema\s+subcutaneo)\b/.test(combined)) {
      return resolveCategory('cxr_pneumomediastinum', 'cxr_general_pool', seed);
    }
    if (/\b(costal\w*|fractura\s+costal|arcos\s+costales)\b/.test(combined)) {
      return resolveCategory('cxr_rib_fractures', 'cxr_general_pool', seed);
    }
    if (/\b(broncoaspirac\w*|aspiracion)\b/.test(combined)) {
      return resolveCategory('cxr_aspiration_pneumonia', 'cxr_pneumonia_infiltrate', seed);
    }
    if (/\b(lobar|consolidacion\s+lobar|broncograma)\b/.test(combined)) {
      return resolveCategory('cxr_pneumonia_lobar', 'cxr_pneumonia_infiltrate', seed);
    }
    if (/\b(neumon\w*|infiltr\w*|consolid\w*|alveol\w*|condens\w*|foco|crepit\w*)\b/.test(combined)) {
      return resolveCategory('cxr_pneumonia_infiltrate', 'cxr_general_pool', seed);
    }
    if (/\b(normal|sin\s+alterac\w*|limpio|conservad\w*|sin\s+compromiso|libres)\b/.test(f)) {
      return resolveCategory('cxr_normal', 'cxr_general_pool', seed);
    }
    return resolveCategory('cxr_general_pool', 'cxr_normal', seed);
  }

  // === MODALIDAD RESIDUAL: Por indicios específicos en los hallazgos ===
  if (/\b(ultra\w*|ecograf\w*|transductor|acustica|ecogen\w*)\b/.test(f)) {
    return resolveCategory('us_gallbladder_stones', 'us_general_pool', seed);
  }
  if (/\b(ecg|ekg|derivaciones|ritmo sinusal|intervalo)\b/.test(f)) {
    return resolveCategory('ecg_normal', 'ecg_general_pool', seed);
  }
  if (/\b(tac|tc|tomograf\w*|hounsfield|axial|isodens\w*)\b/.test(f)) {
    return resolveCategory('ct_head_normal', 'ct_head_normal', seed);
  }

  // Respaldo final: radiografía de tórax normal
  return resolveCategory('cxr_normal', 'cxr_general_pool', seed);
}

/**
 * Imagen médica de respaldo garantizada en caso de error de red en el elemento <img>
 */
export function getInternetFallbackImage(study: string): string {
  const s = normalizeText(study);

  if (/\b(ecg|ekg|electrocardiograma|electrocardio|holter|trazo)\b/.test(s)) {
    return resolveCategory('ecg_normal');
  }
  if (/\b(ultra|ultrasonido|ultrasonografia|ecografia|ecografico|ecocardiograma|usg|doppler)\b/.test(s) || s.startsWith('eco') || /\beco\b/.test(s)) {
    if (/\b(corazon|card\w*|fevi|valvul\w*|ecocardio\w*)\b/.test(s)) return resolveCategory('echo_cardiac');
    if (/\b(renal\w*|rinon\w*|nefro\w*)\b/.test(s)) return resolveCategory('us_hydronephrosis');
    return resolveCategory('us_gallbladder_stones');
  }
  if (/\b(tac|tc|tomograf\w*|angiotac|angiotc)\b/.test(s)) {
    if (/\b(abdom\w*|pelv\w*|higado|pancrea\w*)\b/.test(s)) return resolveCategory('ct_abdomen_normal');
    return resolveCategory('ct_head_normal');
  }
  if (/\b(abdom\w*|ileo|obstruc\w*)\b/.test(s)) {
    return resolveCategory('xray_bowel_obstruction');
  }
  if (/\b(fractur\w*|osea|oseo|hueso|mano|pie|femur|tibia|humero|radio|cubito|muneca|tobillo|codo|hombro|rodilla|articulac\w*|trauma\w*|extremidad\w*)\b/.test(s)) {
    return resolveCategory('xray_colles_wrist');
  }
  return resolveCategory('cxr_normal');
}

// Aliases para máxima compatibilidad con el resto de la base de código
export const generateRealisticMedicalImageUrl = getInternetMedicalImageUrl;
export const getFallbackMedicalSvg = getInternetMedicalImageUrl;
