/**
 * Catálogo Maestro de Fármacos Hospitalarios y de Urgencias para Autocompletado Clínico.
 * Incluye posología estandarizada según Guías de Práctica Clínica (GPC) y farmacopea hospitalaria.
 */

export interface CatalogDrug {
    nombre: string;
    familia: string;
    dosisDefault: string;
    unidadDefault: string;
    viaDefault: string;
    frecuenciaDefault: string;
    justificacionGPC?: string;
}

export const HOSPITAL_DRUG_CATALOG: CatalogDrug[] = [
    // --- ANALGÉSICOS, ANTIPIRÉTICOS, AINES Y OPIOIDES ---
    {
        nombre: 'Paracetamol',
        familia: 'Analgésico / Antipirético',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Analgesia y control térmico hospitalario de primera línea. Infusión en 15 minutos.'
    },
    {
        nombre: 'Parametasona',
        familia: 'Corticoesteroide sistémico',
        dosisDefault: '4',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Antiinflamatorio esteroideo de potencia intermedia.'
    },
    {
        nombre: 'Metamizol sódico',
        familia: 'Analgésico / Antipirético (Pirazolona)',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Analgesia moderada a severa y antipirético eficaz. Infundir lento para evitar hipotensión.'
    },
    {
        nombre: 'Ketorolaco',
        familia: 'AINE (Derivado de ácido acético)',
        dosisDefault: '30',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Analgesia aguda de rescate moderada a intensa. Máximo 48-72 h hospitalarias.'
    },
    {
        nombre: 'Clonixinato de lisina',
        familia: 'AINE / Analgésico somático y visceral',
        dosisDefault: '100',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Manejo de dolor agudo somático o cólico abdominal.'
    },
    {
        nombre: 'Tramadol',
        familia: 'Opioide menor agonista sintético',
        dosisDefault: '50',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Dolor moderado a intenso postquirúrgico o traumático en infusión lenta.'
    },
    {
        nombre: 'Morfina',
        familia: 'Opioide mayor agonista puro',
        dosisDefault: '2',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 4 h',
        justificacionGPC: 'GPC: Manejo del dolor severo / IAM con edema agudo pulmonar.'
    },
    {
        nombre: 'Buprenorfina',
        familia: 'Opioide agonista parcial',
        dosisDefault: '0.3',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Dolor crónico o postoperatorio moderado a severo.'
    },
    {
        nombre: 'Fentanilo',
        familia: 'Opioide sintético de acción rápida',
        dosisDefault: '100',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'PRN si dolor EVA > 4',
        justificacionGPC: 'GPC: Analgosedación en procedimiento invasivo o paciente intubado.'
    },
    {
        nombre: 'Nalbufina',
        familia: 'Opioide agonista-antagonista',
        dosisDefault: '10',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Analgesia quirúrgica y obstétrica con menor depresión respiratoria.'
    },
    {
        nombre: 'Diclofenaco',
        familia: 'AINE (Fenilacético)',
        dosisDefault: '75',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Cólico renal y dolor inflamatorio osteomuscular agudo.'
    },
    {
        nombre: 'Ibuprofeno',
        familia: 'AINE (Propiónico)',
        dosisDefault: '400',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Analgesia y antipiresis oral en paciente estable o pediátrico.'
    },
    {
        nombre: 'Naproxeno',
        familia: 'AINE (Propiónico)',
        dosisDefault: '250',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Dolores articulares y osteomusculares con perfil cardiovascular favorable.'
    },
    {
        nombre: 'Celecoxib',
        familia: 'AINE inhibidor selectivo COX-2',
        dosisDefault: '200',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Analgesia con menor toxicidad sobre mucosa gástrica.'
    },
    {
        nombre: 'Indometacina',
        familia: 'AINE potente (Indolacético)',
        dosisDefault: '100',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Crisis de gota aguda o cierre ductal / tocolítico.'
    },
    {
        nombre: 'Ácido Acetilsalicílico',
        familia: 'Antiagregante plaquetario / AINE',
        dosisDefault: '300',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Dosis de carga masticada en Síndrome Coronario Agudo con o sin elevación del ST.'
    },

    // --- ANTIBIÓTICOS Y ANTIMICROBIANOS ---
    {
        nombre: 'Ceftriaxona',
        familia: 'Cefalosporina 3ª Generación',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Cobertura de amplio espectro en neumonía adquirida en comunidad, sepsis e ITU complicada.'
    },
    {
        nombre: 'Cefotaxima',
        familia: 'Cefalosporina 3ª Generación',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Primera elección en meningitis bacteriana y peritonitis bacteriana espontánea.'
    },
    {
        nombre: 'Cefepima',
        familia: 'Cefalosporina 4ª Generación (Antipseudomona)',
        dosisDefault: '2',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infecciones nosocomiales graves y neutropenia febril.'
    },
    {
        nombre: 'Cefazolina',
        familia: 'Cefalosporina 1ª Generación',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Profilaxis quirúrgica perioperatoria de primera línea y bacteriemia por MSSA.'
    },
    {
        nombre: 'Cefalexina',
        familia: 'Cefalosporina 1ª Generación',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Infecciones de piel, tejidos blandos y vías urinarias no complicadas.'
    },
    {
        nombre: 'Ceftazidima',
        familia: 'Cefalosporina 3ª Generación (Antipseudomona)',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infecciones complicadas por bacilos gramnegativos incluyendo Pseudomonas aeruginosa.'
    },
    {
        nombre: 'Cefuroxima',
        familia: 'Cefalosporina 2ª Generación',
        dosisDefault: '750',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infecciones respiratorias y de partes blandas adquiridas en la comunidad.'
    },
    {
        nombre: 'Amoxicilina con Ácido Clavulánico',
        familia: 'Aminopenicilina + Inhibidor betalactamasa',
        dosisDefault: '1.2',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infección respiratoria alta/baja complicada y mordeduras.'
    },
    {
        nombre: 'Ampicilina',
        familia: 'Aminopenicilina',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Cobertura contra Listeria monocytogenes y Enterococcus faecalis.'
    },
    {
        nombre: 'Ampicilina con Sulbactam',
        familia: 'Aminopenicilina + Inhibidor betalactamasa',
        dosisDefault: '1.5',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Infecciones intrabdominales leves y ginecoobstétricas.'
    },
    {
        nombre: 'Piperacilina con Tazobactam',
        familia: 'Penicilina antipseudomónica + Inhibidor',
        dosisDefault: '4.5',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Sepsis grave nosocomial, neumonía asociada a ventilador e infección intrabdominal.'
    },
    {
        nombre: 'Meropenem',
        familia: 'Carbapenémico',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infecciones multirresistentes BLEE productoras y sepsis grave en UCI.'
    },
    {
        nombre: 'Imipenem con Cilastatina',
        familia: 'Carbapenémico',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Terapia empírica amplia en infecciones severas polimicrobianas.'
    },
    {
        nombre: 'Ertapenem',
        familia: 'Carbapenémico de dosis diaria',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Infecciones por BLEE comunitarias sin sospecha de Pseudomonas.'
    },
    {
        nombre: 'Vancomicina',
        familia: 'Glucopéptido',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Cobertura empírica para S. aureus resistente a meticilina (MRSA).'
    },
    {
        nombre: 'Linezolid',
        familia: 'Oxazolidinona',
        dosisDefault: '600',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Neumonía nosocomial e infección de partes blandas por MRSA o VRE.'
    },
    {
        nombre: 'Ciprofloxacino',
        familia: 'Fluoroquinolona (Gramnegativos)',
        dosisDefault: '400',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Pielonefritis aguda e infecciones gastrointestinales bacterianas severas.'
    },
    {
        nombre: 'Levofloxacino',
        familia: 'Fluoroquinolona respiratoria',
        dosisDefault: '750',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: NAC severa con alergia a betalactámicos o legionelosis.'
    },
    {
        nombre: 'Moxifloxacino',
        familia: 'Fluoroquinolona de amplio espectro',
        dosisDefault: '400',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Neumonía adquirida en comunidad e infecciones intrabdominales sin ajuste renal.'
    },
    {
        nombre: 'Claritromicina',
        familia: 'Macrólido',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Cobertura contra atípicos respiratorios y erradicación de H. pylori.'
    },
    {
        nombre: 'Azitromicina',
        familia: 'Macrólido',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Neumonía atípica, exacerbación de EPOC y profilaxis de infección por MAC.'
    },
    {
        nombre: 'Metronidazol',
        familia: 'Nitroimidazol antiparasitario / antibacteriano',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infecciones anaeróbicas intrabdominales, absceso hepático amebiano y colitis por C. difficile.'
    },
    {
        nombre: 'Clindamicina',
        familia: 'Lincosamida',
        dosisDefault: '600',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Infecciones por anaerobios orofaríngeos, fasciitis necrosante y profilaxis en alérgicos a penicilina.'
    },
    {
        nombre: 'Amikacina',
        familia: 'Aminoglucósido',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Cobertura sinérgica contra gramnegativos en sepsis grave y shock séptico.'
    },
    {
        nombre: 'Gentamicina',
        familia: 'Aminoglucósido',
        dosisDefault: '160',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Endocarditis bacteriana en combinación y sepsis neonatal.'
    },
    {
        nombre: 'Trimetoprim con Sulfametoxazol',
        familia: 'Sulfonamida + Diaminopirimidina',
        dosisDefault: '160',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Tratamiento de elección para neumonía por Pneumocystis jirovecii e ITU.'
    },
    {
        nombre: 'Doxiciclina',
        familia: 'Tetraciclina',
        dosisDefault: '100',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Neumonía atípica, rickettsiosis y fiebre maculosa de las Montañas Rocosas.'
    },
    {
        nombre: 'Nitrofurantoína',
        familia: 'Nitrofuranos urinarios',
        dosisDefault: '100',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Cistitis aguda no complicada en mujeres y profilaxis recurrente.'
    },
    {
        nombre: 'Fluconazol',
        familia: 'Antifúngico triazólico',
        dosisDefault: '200',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Candidiasis sistémica, candidemia y meningitis criptocócica.'
    },
    {
        nombre: 'Aciclovir',
        familia: 'Antiviral análogo nucleósido',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Encefalitis herpética e infecciones severas por herpes zóster / simplex.'
    },
    {
        nombre: 'Oseltamivir',
        familia: 'Antiviral inhibidor de la neuraminidasa',
        dosisDefault: '75',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Influenza estacional sospechada o confirmada en pacientes hospitalizados.'
    },

    // --- GASTROINTESTINALES Y PROTECCIÓN GÁSTRICA ---
    {
        nombre: 'Omeprazol',
        familia: 'Inhibidor de Bomba de Protones (IBP)',
        dosisDefault: '40',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Profilaxis de úlcera por estrés en paciente grave y sangrado digestivo alto.'
    },
    {
        nombre: 'Pantoprazol',
        familia: 'Inhibidor de Bomba de Protones (IBP)',
        dosisDefault: '40',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Hemorragia digestiva activa y menor interferencia con clopidogrel.'
    },
    {
        nombre: 'Metoclopramida',
        familia: 'Procinético / Antiemético dopaminérgico',
        dosisDefault: '10',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Náusea, vómito y gastroparesia. Administrar lento para evitar extrapiramidalismo.'
    },
    {
        nombre: 'Ondansetrón',
        familia: 'Antiemético antagonista 5-HT3',
        dosisDefault: '8',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Control de emesis severa, postoperatoria o inducida por fármacos.'
    },
    {
        nombre: 'Dimenhidrinato',
        familia: 'Antihistamínico H1 / Antiemético',
        dosisDefault: '50',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Vértigo agudo, laberintitis y cinetosis.'
    },
    {
        nombre: 'Butilhioscina',
        familia: 'Antiespasmódico anticolinérgico',
        dosisDefault: '20',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Espasmo agudo del tracto gastrointestinal, biliar o urogenital.'
    },
    {
        nombre: 'Lactulosa',
        familia: 'Disacárido osmótico laxante',
        dosisDefault: '20',
        unidadDefault: 'mL',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Encefalopatía hepática aguda (meta 2-3 evacuaciones pastosas al día).'
    },
    {
        nombre: 'Octreótido',
        familia: 'Análogo sintético de somatostatina',
        dosisDefault: '50',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Hemorragia variceal esofagogástrica activa y fístulas digestivas.'
    },
    {
        nombre: 'Sucralfato',
        familia: 'Citoprotector de la mucosa gástrica',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Tratamiento coadyuvante de úlcera péptica y esofagitis.'
    },

    // --- CARDIOVASCULARES, ANTIHIPERTENSIVOS Y HEMODINÁMICA ---
    {
        nombre: 'Furosemida',
        familia: 'Diurético de Asa',
        dosisDefault: '20',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Sobrecarga de volumen, insuficiencia cardíaca descompensada y edema agudo pulmonar.'
    },
    {
        nombre: 'Espironolactona',
        familia: 'Antagonista de receptores de mineralocorticoides',
        dosisDefault: '25',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Insuficiencia cardíaca con FEVI reducida y ascitis por hipertensión portal.'
    },
    {
        nombre: 'Enalapril',
        familia: 'Inhibidor ECA (IECA)',
        dosisDefault: '10',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Hipertensión arterial sistémica e insuficiencia cardíaca con función renal vigilada.'
    },
    {
        nombre: 'Captopril',
        familia: 'Inhibidor ECA de acción rápida',
        dosisDefault: '25',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'PRN si dolor EVA > 4',
        justificacionGPC: 'GPC: Manejo de urgencia hipertensiva sintomática sin daño a órgano blanco.'
    },
    {
        nombre: 'Losartán',
        familia: 'Antagonista del receptor de angiotensina II (ARA-II)',
        dosisDefault: '50',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Tratamiento de elección en HTA con intolerancia a IECAs por tos.'
    },
    {
        nombre: 'Telmisartán',
        familia: 'Antagonista del receptor ARA-II de larga vida media',
        dosisDefault: '40',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Control tensional de 24 horas y protección metabólica/cardiovascular.'
    },
    {
        nombre: 'Amlodipino',
        familia: 'Bloqueador de Canales de Calcio dihidropiridínico',
        dosisDefault: '5',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Hipertensión arterial en adultos mayores y cardiopatía isquémica crónica.'
    },
    {
        nombre: 'Nifedipino',
        familia: 'Bloqueador de Canales de Calcio dihidropiridínico',
        dosisDefault: '30',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: HTA y tocolítico de elección en amenaza de parto pretérmino.'
    },
    {
        nombre: 'Hidralazina',
        familia: 'Vasodilatador arterial directo',
        dosisDefault: '10',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Crisis hipertensiva en el embarazo / preeclampsia severa.'
    },
    {
        nombre: 'Metoprolol',
        familia: 'Betabloqueador cardioselectivo beta-1',
        dosisDefault: '50',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Control de frecuencia cardíaca en taquiarritmias y cardiopatía isquémica.'
    },
    {
        nombre: 'Labetalol',
        familia: 'Bloqueador alfa y beta combinado',
        dosisDefault: '20',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Emergencia hipertensiva, disección aórtica y crisis en el embarazo.'
    },
    {
        nombre: 'Carvedilol',
        familia: 'Betabloqueador no selectivo con acción alfa-1',
        dosisDefault: '6.25',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Disfunción ventricular izquierda y falla cardíaca crónica.'
    },
    {
        nombre: 'Amiodarona',
        familia: 'Antiarrítmico Clase III',
        dosisDefault: '150',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Fibrilación auricular rápida, taquicardia ventricular y paro cardíaco FV/TVSP.'
    },
    {
        nombre: 'Adenosina',
        familia: 'Antiarrítmico nucleósido purinérgico',
        dosisDefault: '6',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Reversión rápida de Taquicardia Supraventricular Paroxística (bolo rápido + flush 20 mL).'
    },
    {
        nombre: 'Digoxina',
        familia: 'Glucósido cardíaco inotrópico',
        dosisDefault: '0.25',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Control de frecuencia en fibrilación auricular con disfunción sistólica.'
    },
    {
        nombre: 'Nitroglicerina',
        familia: 'Vasodilatador venoso y coronario nitrato',
        dosisDefault: '10',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Angina inestable, edema agudo de pulmón cardiogénico y crisis hipertensiva.'
    },
    {
        nombre: 'Nitroprusiato de Sodio',
        familia: 'Vasodilatador arteriovenoso potente',
        dosisDefault: '0.5',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Emergencia hipertensiva refractaria y edema agudo pulmonar severo.'
    },
    {
        nombre: 'Norepinefrina',
        familia: 'Vasopresor catecolaminérgico alfa-1 potente',
        dosisDefault: '4',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Vasopresor de primera elección en choque séptico, distributivo y cardiogénico.'
    },
    {
        nombre: 'Epinefrina',
        familia: 'Catecolamina agonista adrenérgico alfa/beta',
        dosisDefault: '1',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: RCP avanzada en paro cardiorrespiratorio y choque anafiláctico (0.5 mg IM).'
    },
    {
        nombre: 'Dopamina',
        familia: 'Inotrópico / Vasopresor adrenérgico',
        dosisDefault: '5',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Bradicardia sintomática refractaria a atropina y soporte inotrópico.'
    },
    {
        nombre: 'Dobutamina',
        familia: 'Inotrópico agonista beta-1 selectivo',
        dosisDefault: '5',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Choque cardiogénico con bajo gasto cardíaco e insuficiencia cardíaca aguda.'
    },
    {
        nombre: 'Atropina',
        familia: 'Anticolinérgico vagolítico',
        dosisDefault: '1',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Bradicardia sinusal sintomática e intoxicación por organofosforados.'
    },
    {
        nombre: 'Enoxaparina',
        familia: 'Heparina de Bajo Peso Molecular (HBPM)',
        dosisDefault: '40',
        unidadDefault: 'mg',
        viaDefault: 'SC',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Tromboprofilaxis en paciente hospitalizado (40 mg/día) o anticoagulación terapéutica (1 mg/kg cada 12 h).'
    },
    {
        nombre: 'Heparina sódica',
        familia: 'Heparina no fraccionada',
        dosisDefault: '5000',
        unidadDefault: 'UI',
        viaDefault: 'SC',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Tromboprofilaxis en falla renal grave o anticoagulación con TTPa monitorizado.'
    },
    {
        nombre: 'Clopidogrel',
        familia: 'Antiagregante plaquetario antagonista P2Y12',
        dosisDefault: '75',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Antiagregación dual en IAM (carga 300-600 mg) y profilaxis post-stent coronario.'
    },
    {
        nombre: 'Atorvastatina',
        familia: 'Inhibidor de la HMG-CoA reductasa (Estatina)',
        dosisDefault: '80',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Estabilización de placa y terapia hipolipemiante intensiva en síndrome coronario agudo.'
    },

    // --- RESPIRATORIOS Y BRONCODILATADORES ---
    {
        nombre: 'Salbutamol',
        familia: 'Broncodilatador agonista beta-2 de acción corta',
        dosisDefault: '2.5',
        unidadDefault: 'mg',
        viaDefault: 'Inhalada',
        frecuenciaDefault: 'Cada 4 h',
        justificacionGPC: 'GPC: Manejo de broncoespasmo agudo en crisis asmática y EPOC agudizado.'
    },
    {
        nombre: 'Bromuro de Ipratropio',
        familia: 'Broncodilatador anticolinérgico de acción corta',
        dosisDefault: '500',
        unidadDefault: 'mcg',
        viaDefault: 'Inhalada',
        frecuenciaDefault: 'Cada 6 h',
        justificacionGPC: 'GPC: Sinergia broncodilatadora con beta-agonista en asma severa y EPOC.'
    },
    {
        nombre: 'Budesonida',
        familia: 'Corticoesteroide inhalado',
        dosisDefault: '1',
        unidadDefault: 'mg',
        viaDefault: 'Inhalada',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Desinflamación de vía aérea en asma persistente y crup laríngeo pediátrico.'
    },
    {
        nombre: 'Acetilcisteína',
        familia: 'Mucolítico / Antídoto de paracetamol',
        dosisDefault: '600',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Fluidificación de secreciones bronquiales espesas y antídoto en hepatotoxicidad.'
    },

    // --- CORTICOESTEROIDES SISTÉMICOS ---
    {
        nombre: 'Hidrocortisona',
        familia: 'Glucocorticoide de acción corta',
        dosisDefault: '100',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Crisis de insuficiencia suprarrenal aguda, choque séptico refractario y anafilaxia.'
    },
    {
        nombre: 'Dexametasona',
        familia: 'Glucocorticoide de acción prolongada',
        dosisDefault: '8',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Edema cerebral peritumoral/traumático, meningitis bacteriana y neumonía viral severa.'
    },
    {
        nombre: 'Metilprednisolona',
        familia: 'Glucocorticoide de acción intermedia',
        dosisDefault: '125',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Crisis asmática severa con taquipnea, brotes autoinmunes y trauma medular.'
    },
    {
        nombre: 'Prednisona',
        familia: 'Glucocorticoide oral',
        dosisDefault: '50',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Desescalamiento oral post-crisis asmática y enfermedades reumatológicas.'
    },
    {
        nombre: 'Betametasona',
        familia: 'Glucocorticoide para maduración fetal',
        dosisDefault: '12',
        unidadDefault: 'mg',
        viaDefault: 'IM',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Inducción de maduración pulmonar fetal en amenaza de parto pretérmino (2 dosis).'
    },

    // --- ENDOCRINOS, METABÓLICOS Y ELECTROLITOS ---
    {
        nombre: 'Insulina Rápida',
        familia: 'Insulina humana de acción rápida / Regular',
        dosisDefault: '4',
        unidadDefault: 'UI',
        viaDefault: 'SC',
        frecuenciaDefault: 'PRN si temp > 38.0 °C',
        justificacionGPC: 'GPC: Esquema de escala móvil hospitalario para control glucémico meta 140-180 mg/dL.'
    },
    {
        nombre: 'Insulina Glargina',
        familia: 'Análogo de insulina basal ultralenta',
        dosisDefault: '10',
        unidadDefault: 'UI',
        viaDefault: 'SC',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Régimen basal hospitalario nocturno de mantenimiento sin picos.'
    },
    {
        nombre: 'Insulina NPH',
        familia: 'Insulina humana de acción intermedia',
        dosisDefault: '14',
        unidadDefault: 'UI',
        viaDefault: 'SC',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Control basal fraccionado de diabetes mellitus tipo 2 hospitalizada.'
    },
    {
        nombre: 'Metformina',
        familia: 'Biguanida normoglucemiante',
        dosisDefault: '850',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Manejo ambulatorio de DM2; suspender si TFG < 30 mL/min o sepsis.'
    },
    {
        nombre: 'Dextrosa al 50%',
        familia: 'Carbohidrato concentrado hiperosmolar',
        dosisDefault: '50',
        unidadDefault: 'mL',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Corrección de emergencia de hipoglucemia severa sintomática (< 54 mg/dL).'
    },
    {
        nombre: 'Gluconato de Calcio al 10%',
        familia: 'Sales minerales de calcio',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Estabilización de membrana miocárdica en hiperpotasemia severa e hipocalcemia aguda.'
    },
    {
        nombre: 'Cloruro de Potasio',
        familia: 'Solución concentrada de electrolito',
        dosisDefault: '20',
        unidadDefault: 'UI',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Reposición de hipopotasemia severa diluido en soluciones cristaloides.'
    },
    {
        nombre: 'Sulfato de Magnesio',
        familia: 'Electrolito / Neuroprotector / Anticonvulsivo',
        dosisDefault: '4',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Prevención y tratamiento de eclampsia (esquema Zuspan) y torsades de pointes.'
    },
    {
        nombre: 'Bicarbonato de Sodio 7.5%',
        familia: 'Alcalinizante sistémico',
        dosisDefault: '50',
        unidadDefault: 'mL',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Acidosis metabólica severa refractaria con pH < 7.10 e hiperpotasemia.'
    },

    // --- NEUROLOGÍA Y PSIQUIATRÍA ---
    {
        nombre: 'Diazepam',
        familia: 'Benzodiacepina de acción prolongada',
        dosisDefault: '10',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Control inicial de estatus epiléptico y síndrome de abstinencia alcohólica.'
    },
    {
        nombre: 'Midazolam',
        familia: 'Benzodiacepina de acción corta',
        dosisDefault: '5',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Sedación rápida para intubación y crisis convulsiva refractaria.'
    },
    {
        nombre: 'Haloperidol',
        familia: 'Antipsicótico típico de alta potencia',
        dosisDefault: '5',
        unidadDefault: 'mg',
        viaDefault: 'IM',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Manejo de agitación psicomotriz aguda, delirium hiperactivo y psicosis hospitalaria.'
    },
    {
        nombre: 'Olanzapina',
        familia: 'Antipsicótico atípico',
        dosisDefault: '10',
        unidadDefault: 'mg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Cada 24 h',
        justificacionGPC: 'GPC: Agitación psicomotriz con menor riesgo de síntomas extrapiramidales.'
    },
    {
        nombre: 'Fenitoína',
        familia: 'Anticonvulsivo hidantoína',
        dosisDefault: '100',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Mantenimiento post-impregnación en crisis convulsivas tónico-clónicas generalizadas.'
    },
    {
        nombre: 'Levetiracetam',
        familia: 'Anticonvulsivo de segunda generación',
        dosisDefault: '1000',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 12 h',
        justificacionGPC: 'GPC: Crisis epilépticas focales y generalizadas con excelente perfil de interacciones.'
    },
    {
        nombre: 'Ácido Valproico',
        familia: 'Anticonvulsivo de amplio espectro',
        dosisDefault: '500',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Estatus epiléptico refractario y profilaxis de crisis convulsivas post-trauma.'
    },
    {
        nombre: 'Manitol al 20%',
        familia: 'Diurético osmótico neuroprotector',
        dosisDefault: '250',
        unidadDefault: 'mL',
        viaDefault: 'IV',
        frecuenciaDefault: 'Cada 8 h',
        justificacionGPC: 'GPC: Tratamiento de hipertensión intracraneal aguda y hernia cerebral inminente.'
    },
    {
        nombre: 'Biperideno',
        familia: 'Anticolinérgico de acción central',
        dosisDefault: '5',
        unidadDefault: 'mg',
        viaDefault: 'IM',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Tratamiento de rescate para distonía aguda inducida por antipsicóticos o metoclopramida.'
    },
    {
        nombre: 'Naloxona',
        familia: 'Antagonista opioide puro',
        dosisDefault: '0.4',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Reversión inmediata de intoxicación por opioides con depresión respiratoria.'
    },
    {
        nombre: 'Flumazenil',
        familia: 'Antagonista específico de benzodiacepinas',
        dosisDefault: '0.2',
        unidadDefault: 'mg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Reversión selectiva del coma por sobredosis de benzodiacepinas.'
    },

    // --- GINECO-OBSTETRICIA Y HEMORRAGIA ---
    {
        nombre: 'Oxitocina',
        familia: 'Uterotónico / Hormona nonapéptida',
        dosisDefault: '20',
        unidadDefault: 'UI',
        viaDefault: 'IV',
        frecuenciaDefault: 'En infusión continua',
        justificacionGPC: 'GPC: Prevención y tratamiento de atonía uterina en tercer periodo del parto / hemorragia obstétrica.'
    },
    {
        nombre: 'Carbetocina',
        familia: 'Análogo sintético de oxitocina de larga duración',
        dosisDefault: '100',
        unidadDefault: 'mcg',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Prevención de atonía uterina tras parto o cesárea en pacientes con factores de riesgo.'
    },
    {
        nombre: 'Ergonovina',
        familia: 'Uterotónico alcaloide del cornezuelo',
        dosisDefault: '0.2',
        unidadDefault: 'mg',
        viaDefault: 'IM',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Hemorragia postparto por atonía uterina (contraindicada en preeclampsia / hipertensión).'
    },
    {
        nombre: 'Misoprostol',
        familia: 'Análogo de prostaglandina E1',
        dosisDefault: '800',
        unidadDefault: 'mcg',
        viaDefault: 'VO',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Tratamiento de hemorragia postparto refractaria y maduración cervical.'
    },
    {
        nombre: 'Ácido Tranexámico',
        familia: 'Antifibrinolítico sintético',
        dosisDefault: '1',
        unidadDefault: 'g',
        viaDefault: 'IV',
        frecuenciaDefault: 'Dosis única',
        justificacionGPC: 'GPC: Control de hemorragia obstétrica grave y trauma con sangrado activo en las primeras 3 horas.'
    }
];

/**
 * Busca y ordena fármacos candidatos para el autocompletado interactivo.
 * Prioriza coincidencias exactas por prefijo ('startsWith'), seguidas de coincidencias intermedias.
 */
export function searchHospitalDrugs(query: string, limit: number = 8): CatalogDrug[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Normalizar tildes y diacríticos para búsqueda flexible
    const normalize = (str: string) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const normalizedQ = normalize(q);

    const prefixMatches: CatalogDrug[] = [];
    const containsMatches: CatalogDrug[] = [];
    const familyMatches: CatalogDrug[] = [];

    for (const drug of HOSPITAL_DRUG_CATALOG) {
        const normName = normalize(drug.nombre);
        const normFamily = normalize(drug.familia);

        if (normName.startsWith(normalizedQ)) {
            prefixMatches.push(drug);
        } else if (normName.includes(normalizedQ)) {
            containsMatches.push(drug);
        } else if (normalizedQ.length >= 3 && normFamily.startsWith(normalizedQ)) {
            familyMatches.push(drug);
        }
    }

    return [...prefixMatches, ...containsMatches, ...familyMatches].slice(0, limit);
}
