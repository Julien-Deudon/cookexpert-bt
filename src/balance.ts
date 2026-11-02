// Protocole de la balance « XL Connect » livrée avec le Cook Expert Connect (module Aicare, Bluetooth basse
// consommation). Contrairement au robot, elle parle en BLE : Web Bluetooth la gère directement, sans appairage.
// Service FFB0 : les mesures arrivent en notifications sur FFB2, les commandes s'écrivent (sans réponse) sur FFB1.
// L'appli Magimix embarque une authentification chiffrée Aicare, mais ne l'appelle jamais : inutile de la reproduire.
//
// Trame de 8 octets, dans les deux sens : AC <type> d2 d3 d4 d5 d6 <somme de d2..d6 sur 8 bits>.
// Le type (4 ou 5) dépend du modèle de balance ; on le lit dans chaque trame reçue et on le reprend pour répondre.

export const SERVICE_BALANCE = 0xffb0;
export const CARACTERISTIQUE_MESURES = 0xffb2;
export const CARACTERISTIQUE_COMMANDES = 0xffb1;

const ENTETE = 0xac;
const REGLAGE = 0xcc;
// Octet 6 d'une trame de poids : CA = poids stable, CE = poids en train de changer.
const POIDS_STABLE = 0xca;

export interface Pesee {
  /** Poids envoyé par la balance, dans l'unité `unite`. Négatif si on retire quelque chose après une tare. */
  valeur: number;
  /** Code d'unité de la balance : 0 = g, 1 = ml, 2 = lb, 3 = oz, 4 = kg… (voir `nomUnite`). */
  unite: number;
  stable: boolean;
  /** Type de trame du modèle (4 ou 5), à reprendre dans les commandes. */
  type: number;
}

function somme(octets: ArrayLike<number>): number {
  let total = 0;
  for (let i = 2; i < 7; i++) total += octets[i];
  return total & 0xff;
}

function commande(type: number, d2: number, d3 = 0, d4 = 0, d5 = 0): Uint8Array {
  const octets = [ENTETE, type, d2, d3, d4, d5, REGLAGE, 0];
  octets[7] = somme(octets);
  return Uint8Array.from(octets);
}

/** Remet la balance à zéro (tare). */
export const commandeTare = (type: number) => commande(type, 0xfe, 0x14, 0x01);
/** Change l'unité affichée sur l'écran de la balance (codes de `Pesee.unite`). */
export const commandeUnite = (type: number, unite: number) => commande(type, 0xfe, 0x06, unite);
/** Passe la balance en grammes. */
export const commandeGrammes = (type: number) => commandeUnite(type, 0);
/** Demande la version : c'est la première commande envoyée par l'appli Magimix. */
export const commandeVersion = (type: number) => commande(type, 0xf7);

/** Décode une trame de poids ; null pour les autres trames (version, réglages) ou une trame abîmée. */
export function lirePesee(octets: ArrayLike<number>): Pesee | null {
  if (octets.length !== 8 || octets[0] !== ENTETE) return null;
  const type = octets[1];
  if ((type !== 4 && type !== 5) || somme(octets) !== octets[7]) return null;
  const etat = octets[6];
  if (etat === REGLAGE || octets[2] === 0xf7 || octets[2] === 0xf1) return null;
  const negatif = (octets[5] & 0x01) === 1;

  let valeur: number;
  let unite = 0;
  if (type === 5) {
    // d2..d4 : valeur sur 24 bits ; d5 : unité (4 bits hauts), décimales (3 bits), signe (bit 0).
    const brut = (octets[2] << 16) | (octets[3] << 8) | octets[4];
    unite = octets[5] >> 4;
    const decimales = (octets[5] >> 1) & 0x07;
    valeur = brut / 10 ** decimales;
  } else {
    // Type 4 : dixièmes de gramme sur 16 bits.
    valeur = ((octets[2] << 8) | octets[3]) / 10;
  }
  return { valeur: negatif ? -valeur : valeur, unite, stable: etat === POIDS_STABLE, type };
}

/** Abréviation d'un code d'unité de la balance. */
export function nomUnite(unite: number): string {
  return ['g', 'ml', 'lb', 'oz', 'kg', 'fg', 'ml', 'ml', 'fl oz', 'fl oz', 'lb'][unite] ?? '';
}

/**
 * Unités proposées par l'appli Magimix pour sa balance, dans l'ordre du bouton UNIT : g, kg, lb, oz.
 * La balance ignore les autres codes (les millilitres ne passent pas).
 */
export const UNITES_BALANCE = [0, 4, 2, 3] as const;

export function uniteSuivante(unite: number | undefined): number {
  const rang = (UNITES_BALANCE as readonly number[]).indexOf(unite ?? -1);
  return UNITES_BALANCE[(rang + 1) % UNITES_BALANCE.length];
}

const GRAMMES_PAR_UNITE: Partial<Record<number, number>> = { 0: 1, 4: 1000, 2: 453.592, 10: 453.592, 3: 28.3495 };

/** Poids converti en grammes, quelle que soit l'unité envoyée par la balance ; null pour une unité de volume. */
export function enGrammes(pesee: Pesee): number | null {
  const facteur = GRAMMES_PAR_UNITE[pesee.unite];
  return facteur === undefined ? null : pesee.valeur * facteur;
}

/**
 * Poids en grammes écrit dans l'unité choisie : « 21 g », « 0,125 kg », « 4,41 oz ».
 * Comme la bibliothèque Aicare de l'appli Magimix, c'est à l'appli de convertir : selon le modèle, la balance
 * continue d'envoyer des grammes après une commande d'unité.
 */
export function formaterPoids(grammes: number, unite: number): string {
  const facteur = GRAMMES_PAR_UNITE[unite] ?? 1;
  const valeur = grammes / facteur;
  const decimales = unite === 0 ? (Math.abs(valeur) >= 10 ? 0 : 1) : unite === 3 ? 2 : 3;
  return `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: decimales })} ${nomUnite(unite)}`;
}
