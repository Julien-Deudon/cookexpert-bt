// Outil de test du Cook Expert depuis un ordinateur (essayé sur macOS). Le robot doit être appairé
// (Réglages système > Bluetooth sur Mac, code 0000) et l'appli Magimix fermée sur le téléphone.
//   node src/cli.ts ports
//   node src/cli.ts statut
//   node src/cli.ts touche droite
//   node src/cli.ts envoyer --temps 2:00 --temperature 40 --vitesse 3 [--essai]
import { parseArgs } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { SerialPort } from 'serialport';
import {
  Commande,
  decouperTrames,
  decrireEtat,
  donneesExpert,
  enHexa,
  EtatMachine,
  lireEtat,
  Mode,
  SANS_CHAUFFE,
  SANS_OBJET,
  trame,
  trameNomTelephone,
  type EtatRobot,
  type TrameRecue,
} from './protocole.ts';

// Pas de « auto » ni de « pulse » : démarrer le moteur ou la chauffe reste un geste fait sur le robot.
const TOUCHES: Record<string, number> = {
  ok: Commande.ok,
  droite: Commande.droite,
  gauche: Commande.gauche,
  retour: Commande.retour,
  stop: Commande.stop,
};

const AIDE = `Usage : node src/cli.ts <action> [options]
  ports                                  liste les ports série de l'ordinateur
  statut                                 lit l'état du robot
  ecouter                                affiche chaque changement d'état (Ctrl+C pour arrêter)
  touche <${Object.keys(TOUCHES).join('|')}>      appuie sur une touche du robot
  envoyer --temps 2:00 --temperature 40 --vitesse 3
                                         règle un programme Expert (sans le lancer)
  test                                   en une seule connexion : état, flèches, puis Expert 2:00 / 40 °C / vitesse 3
Options : --port /dev/cu.xxx   --essai (affiche la trame sans l'envoyer)   --journal (octets bruts)
          --etat pret|garder   --sous-programme N   --nom "Mon ordinateur"
          --temperature sans   (pas de chauffe)`;

interface Attente {
  filtre: (t: TrameRecue) => boolean;
  resoudre: (t: TrameRecue) => void;
}

class Robot {
  readonly port: SerialPort;
  readonly recues: TrameRecue[] = [];
  flux: number[] = [];
  attentes = new Set<Attente>();

  constructor(port: SerialPort) {
    this.port = port;
    port.on('data', (morceau: Buffer) => {
      if (values.journal) console.log(`  ← ${enHexa(morceau)}`);
      const { trames, reste } = decouperTrames([...this.flux, ...morceau]);
      this.flux = reste;
      for (const t of trames) {
        this.recues.push(t);
        for (const attente of this.attentes) {
          if (!attente.filtre(t)) continue;
          this.attentes.delete(attente);
          attente.resoudre(t);
        }
      }
    });
  }

  static async ouvrir(chemin: string): Promise<Robot> {
    const port = new SerialPort({ path: chemin, baudRate: 115200, autoOpen: false });
    await new Promise<void>((ok, ko) => port.open((erreur) => (erreur ? ko(erreur) : ok())));
    await pause(500);
    return new Robot(port);
  }

  async envoyer(octets: Uint8Array): Promise<void> {
    if (values.journal) console.log(`  → ${enHexa(octets)}`);
    await new Promise<void>((ok, ko) => this.port.write(Buffer.from(octets), (erreur) => (erreur ? ko(erreur) : ok())));
    await new Promise<void>((ok) => this.port.drain(() => ok()));
  }

  attendre(commande: number, delaiMs = 1500): Promise<TrameRecue> {
    return new Promise((resoudre, rejeter) => {
      const attente: Attente = {
        filtre: (t) => t.commande === commande,
        resoudre: (t) => {
          clearTimeout(minuteur);
          resoudre(t);
        },
      };
      const minuteur = setTimeout(() => {
        this.attentes.delete(attente);
        rejeter(new Error(`Pas de réponse du robot à la commande 0x${commande.toString(16).padStart(2, '0')}.`));
      }, delaiMs);
      this.attentes.add(attente);
    });
  }

  // Juste après l'ouverture du port, la liaison peut mettre quelques secondes à s'établir :
  // les premières trames se perdent, d'où les essais répétés (sans risque pour une lecture).
  async demander(commande: number, essais = 5): Promise<TrameRecue> {
    for (let essai = 1; ; essai++) {
      const reponse = this.attendre(commande);
      await this.envoyer(trame(commande));
      try {
        return await reponse;
      } catch (erreur) {
        if (essai >= essais) throw erreur;
      }
    }
  }

  async etat(): Promise<EtatRobot> {
    return lireEtat((await this.demander(Commande.lireEtat)).donnees);
  }

  fermer(): Promise<void> {
    return new Promise((ok) => this.port.close(() => ok()));
  }
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string' },
    temps: { type: 'string' },
    temperature: { type: 'string' },
    vitesse: { type: 'string' },
    etat: { type: 'string', default: 'pret' },
    'sous-programme': { type: 'string', default: '0' },
    nom: { type: 'string' },
    essai: { type: 'boolean', default: false },
    journal: { type: 'boolean', default: false },
  },
});

function lireTemps(texte: string): number {
  const parties = texte.split(':').map(Number);
  if (parties.length > 3 || parties.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Temps illisible : « ${texte} » (exemples : 90, 2:00, 1:30:00).`);
  }
  return parties.reduce((total, n) => total * 60 + n, 0);
}

function lireNombre(nom: string, texte: string | undefined): number {
  const valeur = Number(texte);
  if (texte === undefined || !Number.isInteger(valeur)) throw new Error(`--${nom} manquant ou illisible.\n\n${AIDE}`);
  return valeur;
}

// macOS liste les ports en /dev/tty.* ; pour une connexion sortante il faut /dev/cu.* (tty attend la ligne DCD).
async function listerPorts(): Promise<string[]> {
  return (await SerialPort.list()).map((p) => p.path.replace(/^\/dev\/tty\./, '/dev/cu.'));
}

async function trouverPort(): Promise<string> {
  if (values.port) return values.port;
  const ports = await listerPorts();
  const robot = ports.find((chemin) => /cook|magimix/i.test(chemin));
  if (robot) return robot;
  const vus = ports.join(', ') || 'aucun';
  throw new Error(
    `Port du robot introuvable (ports vus : ${vus}).\n` +
      'Appaire le robot dans Réglages système > Bluetooth (code 0000), ou passe --port /dev/cu.xxx.',
  );
}

async function avecRobot(action: (robot: Robot) => Promise<void>): Promise<void> {
  const chemin = await trouverPort();
  console.log(`Connexion à ${chemin}…`);
  const robot = await Robot.ouvrir(chemin);
  try {
    // Une lecture d'état d'abord : on n'envoie touche ou programme qu'une fois la liaison établie.
    await robot.etat();
    if (values.nom) await robot.envoyer(trameNomTelephone(values.nom));
    await action(robot);
  } finally {
    await robot.fermer();
  }
}

const afficher = (e: EtatRobot) => `${decrireEtat(e)}   [${enHexa(e.brut)}]`;

const verdict = (e: EtatRobot) =>
  e.etat === EtatMachine.pret && e.mode === Mode.expert
    ? '✓ Réglage reçu. Lance-le sur le robot (touche AUTO) quand tu veux.'
    : "✗ Le robot n'a pas pris le réglage : copie-moi ces lignes et ce qu'affiche son écran.";

async function appuyer(robot: Robot, commande: number): Promise<void> {
  const accuse = robot.attendre(commande);
  await robot.envoyer(trame(commande));
  await accuse;
  await pause(300);
}

/** Envoie le programme, affiche ce que le robot répond à la commande 10, puis relit son état. */
async function envoyerProgramme(robot: Robot, donnees: number[]): Promise<EtatRobot> {
  const avant = robot.recues.length;
  await robot.envoyer(trame(Commande.envoyerEtat, donnees));
  await pause(1500);
  for (const r of robot.recues.slice(avant)) {
    console.log(`Réponse   : commande 0x${r.commande.toString(16).padStart(2, '0')} [${enHexa(r.donnees)}]`);
  }
  return robot.etat();
}

async function main(): Promise<void> {
  const [action, argument] = positionals;
  switch (action) {
    case 'ports':
      for (const chemin of await listerPorts()) console.log(chemin);
      return;

    case 'statut':
      return avecRobot(async (robot) => console.log(`Robot : ${afficher(await robot.etat())}`));

    case 'ecouter':
      return avecRobot(async (robot) => {
        let precedent = '';
        const arret = new AbortController();
        process.once('SIGINT', () => arret.abort());
        while (!arret.signal.aborted) {
          const ligne = afficher(await robot.etat());
          if (ligne !== precedent) console.log(`${new Date().toLocaleTimeString('fr-FR')}  ${ligne}`);
          precedent = ligne;
          await pause(500, undefined, { signal: arret.signal }).catch(() => {});
        }
      });

    case 'touche': {
      const commande = TOUCHES[argument ?? ''];
      if (commande === undefined) throw new Error(`Touche inconnue : « ${argument ?? ''} ».\n\n${AIDE}`);
      return avecRobot(async (robot) => {
        await appuyer(robot, commande);
        console.log(`Touche « ${argument} » reçue. Robot : ${afficher(await robot.etat())}`);
      });
    }

    case 'test':
      return avecRobot(async (robot) => {
        console.log(`1. État           : ${afficher(await robot.etat())}`);
        await appuyer(robot, Commande.droite);
        console.log(`2. Flèche droite  : ${afficher(await robot.etat())}`);
        await appuyer(robot, Commande.gauche);
        console.log(`3. Flèche gauche  : ${afficher(await robot.etat())}`);
        const e = await envoyerProgramme(robot, donneesExpert({ tempsS: 120, temperature: 40, vitesse: 3 }));
        console.log(`4. Programme      : ${afficher(e)}`);
        console.log(verdict(e));
      });

    case 'envoyer': {
      if (!values.temps) throw new Error(`--temps manquant.\n\n${AIDE}`);
      const donnees = donneesExpert({
        tempsS: lireTemps(values.temps),
        temperature: values.temperature === 'sans' ? SANS_CHAUFFE : lireNombre('temperature', values.temperature),
        vitesse: lireNombre('vitesse', values.vitesse),
        etat: values.etat === 'garder' ? SANS_OBJET : values.etat === 'pret' ? EtatMachine.pret : lireNombre('etat', values.etat),
        sousProgramme: lireNombre('sous-programme', values['sous-programme']),
      });
      const t = trame(Commande.envoyerEtat, donnees);
      console.log(`Programme : ${decrireEtat(lireEtat(donnees))}`);
      console.log(`Trame     : ${enHexa(t)}`);
      if (values.essai) return;
      return avecRobot(async (robot) => {
        const e = await envoyerProgramme(robot, donnees);
        console.log(`Robot     : ${afficher(e)}`);
        console.log(verdict(e));
      });
    }

    default:
      console.log(AIDE);
  }
}

main().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
});
