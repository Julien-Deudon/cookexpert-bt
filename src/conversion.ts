// Traduit une étape de recette écrite pour Thermomix, en notation « Cuire 25 min/120°C/vitesse 2. »,
// en réglage Expert du Cook Expert, prêt pour `donneesExpert`.
import { donneesExpert, formaterTemperature, formaterTemps, formaterVitesse, SANS_CHAUFFE } from './protocole.ts';

export interface ReglageCookExpert {
  tempsS: number;
  temperature: number;
  vitesse: number;
  /** Consignes à afficher au cuisinier : Varoma, vitesse à augmenter à la main, texte qui suit la vitesse. */
  remarques: string[];
}

export type Conversion = { statut: 'ok'; reglage: ReglageCookExpert } | { statut: 'manuel'; raison: string };

/**
 * Vitesse Thermomix → vitesse Cook Expert (0 à 18 ; 1 et 2 s'affichent « 1A » et « 2A », brassage intermittent).
 * Table publiée par le site de recettes Cookomix (FAQ « conversion Thermomix Magimix Cook Expert ») ; les
 * demi-vitesses sont prises au milieu de leurs voisines, arrondi au-dessus. Le Cook Expert ne descend pas sous
 * ~250 tr/min en continu : les vitesses Thermomix 1 et 2 (100 et 200 tr/min) tombent toutes deux en 3.
 */
export const VITESSES_COOK_EXPERT: Readonly<Record<string, number>> = {
  cuillère: 1,
  '0': 0,
  '0.5': 2,
  '1': 3,
  '1.5': 3,
  '2': 3,
  '2.5': 5,
  '3': 7,
  '3.5': 10,
  '4': 12,
  '4.5': 13,
  '5': 14,
  '5.5': 15,
  '6': 15,
  '6.5': 16,
  '7': 16,
  '7.5': 17,
  '8': 17,
  '8.5': 18,
  '9': 18,
  '9.5': 18,
  '10': 18,
};

/** Le Varoma (cuisson vapeur du Thermomix) devient une chauffe à 120 °C avec le panier vapeur. */
export const TEMPERATURE_VAROMA = 120;

/** La notice du Cook Expert limite la vitesse à 15 au-dessus de 60 °C. */
export const VITESSE_MAX_A_CHAUD = 15;

const ETAPE =
  /^(Mélanger|Cuire|Pulvériser|Chauffer|Rissoler|Remuer)\s+(?:(\d+)\s*min)?\s*(?:(\d+)\s*sec)?\s*(?:\/\s*(?:(\d+)\s*°C|(Varoma)))?\s*\/\s*vitesse\s+(\d+(?:[.,]5)?|cuillère|pétrin)\s*\.?\s*(.*)$/i;
const PROGRESSIF = /augmentez progressivement la vitesse jusqu'à (\d+(?:[.,]5)?)\.?/i;

/** Renvoie null si l'instruction n'est pas une étape de programmation reconnue. */
export function convertirEtape(instruction: string): Conversion | null {
  const morceaux = ETAPE.exec(instruction.trim());
  if (!morceaux) return null;
  const [, , minutes, secondes, celsius, varoma, vitesseTexte, suite] = morceaux;
  const tempsS = Number(minutes ?? 0) * 60 + Number(secondes ?? 0);
  const vitesseThermomix = vitesseTexte.toLowerCase().replace(',', '.');

  if (vitesseThermomix === 'pétrin') {
    return {
      statut: 'manuel',
      raison: `Pétrissage de ${formaterTemps(tempsS)} : sur le robot, lancez le programme Boulangerie › Pain et brioche.`,
    };
  }

  const remarques: string[] = [];
  let temperature = SANS_CHAUFFE;
  if (varoma) {
    temperature = TEMPERATURE_VAROMA;
    remarques.push(`Varoma : vapeur à ${TEMPERATURE_VAROMA} °C, avec le panier vapeur du Cook Expert.`);
  } else if (celsius) {
    temperature = Number(celsius);
  }

  let vitesse = VITESSES_COOK_EXPERT[vitesseThermomix];
  if (vitesse === undefined) return { statut: 'manuel', raison: `Vitesse Thermomix inconnue : ${vitesseTexte}.` };
  if (temperature > 60 && vitesse > VITESSE_MAX_A_CHAUD) {
    vitesse = VITESSE_MAX_A_CHAUD;
    remarques.push(`Vitesse ramenée à ${VITESSE_MAX_A_CHAUD} : le Cook Expert ne va pas plus vite au-dessus de 60 °C.`);
  }

  const progressif = PROGRESSIF.exec(suite);
  if (progressif) {
    const cible = VITESSES_COOK_EXPERT[progressif[1].replace(',', '.')];
    if (cible !== undefined) remarques.push(`Augmentez la vitesse à la main jusqu'à ${formaterVitesse(cible)}.`);
  }
  const reste = suite.replace(PROGRESSIF, '').trim();
  if (reste) remarques.push(reste);

  const reglage = { tempsS, temperature, vitesse, remarques };
  try {
    donneesExpert(reglage);
  } catch (erreur) {
    return { statut: 'manuel', raison: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  return { statut: 'ok', reglage };
}

export function decrireReglage(r: ReglageCookExpert): string {
  return `Expert · ${formaterTemps(r.tempsS)} · ${formaterTemperature(r.temperature)} · vitesse ${formaterVitesse(r.vitesse)}`;
}
