// Protocole Bluetooth du Magimix Cook Expert Connect (clé Connect branchée sous la base).
// Bluetooth classique SPP (UUID 00001101-0000-1000-8000-00805F9B34FB), code d'appairage « 0000 ».
// Rétro-ingénierie de l'appli Magimix 2.12.5 (bibliothèque Topband bl1175lib et module JS des
// états du robot), vérifiée sur les trames capturées le 2026-10-30. Détail : PROTOCOLE.md.

export const ENTETE_ENVOI = 0xa5;
export const ENTETE_RECEPTION = 0x5a;

export const Commande = {
  ok: 0x01,
  droite: 0x02,
  droiteBas: 0x03,
  gaucheBas: 0x04,
  gauche: 0x05,
  retour: 0x06,
  stop: 0x07,
  auto: 0x08,
  pulse: 0x09,
  pulseRelache: 0x0a,
  majProgramme: 0x0d,
  sauvegardes: 0x0e,
  lireEtat: 0x0f,
  envoyerEtat: 0x10,
  compteurs: 0x11,
  nomTelephone: 0x12,
  version: 0x13,
} as const;

// Réponses qui portent des données : leur 3e octet donne la longueur totale de la trame.
const REPONSES_AVEC_DONNEES: ReadonlySet<number> = new Set([
  Commande.sauvegardes,
  Commande.lireEtat,
  Commande.compteurs,
  Commande.version,
]);

// Réponses à code : 5A <commande> <code> <CRC>. Observé le 2026-10-30 : `5A 10 00 8F`, programme accepté.
const REPONSES_A_CODE: ReadonlySet<number> = new Set([Commande.envoyerEtat]);

// Table de la bibliothèque Topband : i/2 pour i pair, 0xFF - (i-1)/2 pour i impair.
const TABLE_CRC8 = Uint8Array.from({ length: 256 }, (_, i) => (i & 1 ? 0xff - (i >> 1) : i >> 1));

export function crc8(octets: Iterable<number>): number {
  let crc = 0;
  for (const octet of octets) crc = TABLE_CRC8[(crc ^ octet) & 0xff];
  return crc;
}

/** Trame à envoyer : A5, commande, [longueur totale, données…], puis CRC8 de tout ce qui précède. */
export function trame(commande: number, donnees: readonly number[] = []): Uint8Array {
  const debut =
    donnees.length === 0
      ? [ENTETE_ENVOI, commande]
      : [ENTETE_ENVOI, commande, donnees.length + 4, ...donnees];
  return Uint8Array.from([...debut, crc8(debut)]);
}

export function trameNomTelephone(nom: string): Uint8Array {
  return trame(Commande.nomTelephone, [...new TextEncoder().encode(nom)]);
}

export interface TrameRecue {
  commande: number;
  donnees: number[];
}

/** Découpe le flux reçu en trames valides ; `reste` garde une trame incomplète pour la suite. */
export function decouperTrames(flux: readonly number[]): { trames: TrameRecue[]; reste: number[] } {
  const trames: TrameRecue[] = [];
  let i = 0;
  lecture: while (i < flux.length) {
    if (flux[i] !== ENTETE_RECEPTION) {
      i++;
      continue;
    }
    if (i + 3 > flux.length) break;
    const commande = flux[i + 1];
    const annoncee = flux[i + 2];
    // Accusé de réception sur 3 octets, réponse à code sur 4 octets,
    // ou trame de données dont le 3e octet est la longueur.
    const aCode = REPONSES_A_CODE.has(commande);
    const longueurs = REPONSES_AVEC_DONNEES.has(commande) ? [annoncee] : aCode ? [4] : [3, annoncee];
    for (const longueur of longueurs) {
      if (longueur < 3 || longueur > 64) continue;
      if (i + longueur > flux.length) break lecture;
      const brut = flux.slice(i, i + longueur);
      if (crc8(brut.slice(0, -1)) === brut[longueur - 1]) {
        trames.push({ commande, donnees: brut.slice(aCode ? 2 : 3, -1) });
        i += longueur;
        continue lecture;
      }
    }
    i++;
  }
  return { trames, reste: flux.slice(i) };
}

export const EtatMachine = {
  securiteEnfants: 0,
  menu: 1,
  sousMenu: 2,
  pret: 3,
  enMarche: 4,
  pause: 5,
  arret: 6,
  defaut: 7,
} as const;

export const Mode = {
  reglages: 0,
  recettes: 1,
  nettoyage: 2,
  expert: 3,
  cuisson: 4,
  blender: 5,
  boulangerie: 6,
  robot: 7,
  cocotte: 8,
} as const;

/** Valeur des octets d'état « sans objet » (paramètre absent, ou « ne pas changer » à l'envoi). */
export const SANS_OBJET = 0xff;
/** Plus petite température acceptée en mode Expert ; probablement « sans chauffe » (à confirmer). */
export const SANS_CHAUFFE = 29;

const NOMS_ETATS = ['sécurité enfants', 'menu principal', 'sous-menu', 'prêt', 'en marche', 'pause', 'arrêt', 'défaut'];
const NOMS_MODES = ['Réglages', 'Recettes', 'Nettoyage', 'Expert', 'Cuisson', 'Blender', 'Boulangerie', 'Robot', 'Cocotte'];
const NOMS_SOUS_PROGRAMMES: Partial<Record<number, readonly string[]>> = {
  [Mode.nettoyage]: ['Éco', 'Normal', 'Intensif'],
  [Mode.cuisson]: ['Vapeur', 'Soupe veloutée', 'Soupe moulinée', 'Mijotage', 'Rissolage', 'Vapeur XXL'],
  [Mode.blender]: ['Smoothie', 'Glace pilée', 'Dessert glacé'],
  [Mode.boulangerie]: ['Blancs en neige', 'Pâtisserie', 'Pain et brioche', 'Pain et brioche XXL', 'Crêpes', 'Pizza', 'Chocolat'],
  [Mode.cocotte]: ['Rissoler', 'Mijoter', 'Maintien au chaud'],
};

// Octet 10 de l'état : défauts signalés par le robot (bits cumulables).
const DEFAUTS: readonly (readonly [number, string])[] = [
  [1, 'couvercle à fermer'],
  [2, "manque d'eau"],
  [4, 'moteur en surcharge'],
  [8, 'bol à changer'],
  [16, 'chauffe en défaut'],
  [32, 'sonde de température en court-circuit'],
  [64, 'sonde de température coupée'],
];

export interface EtatRobot {
  etat: number;
  mode: number;
  sousProgramme: number;
  tempsS: number | null;
  vitesse: number | null;
  temperature: number | null;
  defauts: string[];
  brut: number[];
}

/** Lit les données d'une réponse « lireEtat » (12 octets) ou d'un état à envoyer (8 octets). */
export function lireEtat(donnees: readonly number[]): EtatRobot {
  const [
    etat = SANS_OBJET,
    mode = SANS_OBJET,
    sousProgramme = SANS_OBJET,
    tempsHaut = SANS_OBJET,
    tempsBas = SANS_OBJET,
    vitesse = SANS_OBJET,
    temperature = SANS_OBJET,
  ] = donnees;
  const temps = (tempsHaut << 8) | tempsBas;
  const bitsDefauts = donnees[10] ?? SANS_OBJET;
  return {
    etat,
    mode,
    sousProgramme,
    tempsS: temps === 0xffff ? null : temps,
    vitesse: vitesse === SANS_OBJET ? null : vitesse,
    temperature: temperature === SANS_OBJET ? null : temperature,
    defauts: bitsDefauts === SANS_OBJET ? [] : DEFAUTS.filter(([bit]) => bitsDefauts & bit).map(([, nom]) => nom),
    brut: [...donnees],
  };
}

export function formaterTemps(secondes: number): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(secondes / 3600);
  const min = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  return h > 0 ? `${h}:${deux(min)}:${deux(s)}` : `${min}:${deux(s)}`;
}

/** Les vitesses 1 et 2 s'affichent « 1A » et « 2A » sur le robot. */
export function formaterVitesse(vitesse: number): string {
  return vitesse === 1 || vitesse === 2 ? `${vitesse}A` : String(vitesse);
}

export function formaterTemperature(temperature: number): string {
  return temperature === SANS_CHAUFFE ? 'sans chauffe' : `${temperature} °C`;
}

export function decrireEtat(e: EtatRobot): string {
  const morceaux = [NOMS_ETATS[e.etat] ?? `état ${e.etat}`];
  if (e.mode !== SANS_OBJET) morceaux.push(NOMS_MODES[e.mode] ?? `mode ${e.mode}`);
  const sousProgramme = NOMS_SOUS_PROGRAMMES[e.mode]?.[e.sousProgramme];
  if (sousProgramme) morceaux.push(sousProgramme);
  if (e.tempsS !== null) morceaux.push(formaterTemps(e.tempsS));
  if (e.temperature !== null) morceaux.push(formaterTemperature(e.temperature));
  if (e.vitesse !== null) morceaux.push(`vitesse ${formaterVitesse(e.vitesse)}`);
  if (e.defauts.length > 0) morceaux.push(`⚠ ${e.defauts.join(', ')}`);
  return morceaux.join(' · ');
}

export interface ProgrammeExpert {
  tempsS: number;
  /** En °C, ou SANS_CHAUFFE. */
  temperature: number;
  /** De 0 à 18 ; 1 et 2 correspondent à « 1A » et « 2A ». */
  vitesse: number;
  /** État demandé au robot : « prêt » par défaut, SANS_OBJET pour ne pas le changer. */
  etat?: number;
  sousProgramme?: number;
}

/** Les 8 octets de « envoyerEtat » pour un programme Expert, avec les bornes de l'appli Magimix. */
export function donneesExpert(p: ProgrammeExpert): number[] {
  const { tempsS, temperature, vitesse, etat = EtatMachine.pret, sousProgramme = 0 } = p;
  verifierEntier('temps (s)', tempsS, 0, 14400);
  verifierEntier('vitesse', vitesse, 0, 18);
  verifierEntier('température', temperature, SANS_CHAUFFE, 140);
  if (temperature > 120 && tempsS >= 7200) {
    throw new RangeError("Au-dessus de 120 °C, l'appli Magimix limite la durée à moins de 2 h.");
  }
  // Octet 7 : « premier cycle », à 0 pour un programme complet (comme l'appli).
  return [etat, Mode.expert, sousProgramme, tempsS >> 8, tempsS & 0xff, vitesse, temperature, 0];
}

function verifierEntier(nom: string, valeur: number, min: number, max: number): void {
  if (!Number.isInteger(valeur) || valeur < min || valeur > max) {
    throw new RangeError(`${nom} hors limites : ${valeur} (attendu de ${min} à ${max})`);
  }
}

export function enHexa(octets: Iterable<number>): string {
  return [...octets].map((o) => o.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
