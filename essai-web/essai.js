// Essai : Chrome (Android ou ordinateur) parle au robot appairé (Web Serial) et à la balance (Web Bluetooth),
// sans appli Magimix.
import {
  CARACTERISTIQUE_COMMANDES,
  CARACTERISTIQUE_MESURES,
  commandeTare,
  commandeUnite,
  commandeVersion,
  enGrammes,
  formaterPoids,
  lirePesee,
  nomUnite,
  SERVICE_BALANCE,
  uniteSuivante,
} from './balance.js';
import {
  Commande,
  decouperTrames,
  decrireEtat,
  donneesExpert,
  enHexa,
  lireEtat,
  SANS_CHAUFFE,
  trame,
} from './protocole.js';

const SPP = '00001101-0000-1000-8000-00805f9b34fb';
const $ = (id) => document.getElementById(id);

let port;
let ecrivain;
let flux = [];
const attentes = new Set();

function journal(texte) {
  const ligne = document.createElement('li');
  ligne.textContent = `${new Date().toLocaleTimeString('fr-FR')}  ${texte}`;
  $('journal').prepend(ligne);
}

function attendre(commande, delaiMs = 1500) {
  return new Promise((resoudre, rejeter) => {
    const attente = {
      commande,
      resoudre: (t) => {
        clearTimeout(minuteur);
        resoudre(t);
      },
    };
    const minuteur = setTimeout(() => {
      attentes.delete(attente);
      rejeter(new Error(`pas de réponse du robot à la commande 0x${commande.toString(16).padStart(2, '0')}`));
    }, delaiMs);
    attentes.add(attente);
  });
}

async function envoyer(octets) {
  journal(`→ ${enHexa(octets)}`);
  await ecrivain.write(octets);
}

// Les lectures sont répétées (la liaison peut mettre un moment à s'établir) ; jamais les touches ni les programmes.
async function demander(commande, donnees = [], essais = 1) {
  for (let essai = 1; ; essai++) {
    const reponse = attendre(commande);
    await envoyer(trame(commande, donnees));
    try {
      return await reponse;
    } catch (erreur) {
      if (essai >= essais) throw erreur;
    }
  }
}

async function lireEtatRobot() {
  const etat = lireEtat((await demander(Commande.lireEtat, [], 5)).donnees);
  $('etat').textContent = decrireEtat(etat);
  return etat;
}

async function ecouter() {
  const lecteur = port.readable.getReader();
  try {
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      journal(`← ${enHexa(value)}`);
      const { trames, reste } = decouperTrames([...flux, ...value]);
      flux = reste;
      for (const t of trames) {
        for (const attente of attentes) {
          if (attente.commande !== t.commande) continue;
          attentes.delete(attente);
          attente.resoudre(t);
        }
      }
    }
  } catch (erreur) {
    journal(`✗ lecture interrompue : ${erreur.message}`);
  } finally {
    lecteur.releaseLock();
    $('etat').textContent = 'déconnecté';
  }
}

async function connecter() {
  if (!('serial' in navigator)) throw new Error('ce navigateur ne connaît pas Web Serial (il faut Chrome)');
  port = await navigator.serial.requestPort({
    allowedBluetoothServiceClassIds: [SPP],
    filters: [{ bluetoothServiceClassId: SPP }],
  });
  await port.open({ baudRate: 115200 });
  ecrivain = port.writable.getWriter();
  ecouter();
  journal('port ouvert');
  for (const id of ['gauche', 'lire', 'droite', 'envoyer']) $(id).disabled = false;
  await lireEtatRobot();
}

async function appuyer(commande) {
  await demander(commande);
  await new Promise((fin) => setTimeout(fin, 300));
  await lireEtatRobot();
}

function lireTemps(texte) {
  const parties = texte.split(':').map(Number);
  if (parties.length > 3 || parties.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`temps illisible : « ${texte} » (exemples : 90, 2:00)`);
  }
  return parties.reduce((total, n) => total * 60 + n, 0);
}

async function envoyerProgramme() {
  const texteTemperature = $('temperature').value.trim();
  const donnees = donneesExpert({
    tempsS: lireTemps($('temps').value.trim()),
    temperature: /^sans$/i.test(texteTemperature) ? SANS_CHAUFFE : Number(texteTemperature),
    vitesse: Number($('vitesse').value),
  });
  const reponse = await demander(Commande.envoyerEtat, donnees);
  journal(reponse.donnees[0] === 0 ? '✓ programme accepté' : `✗ programme refusé, code ${reponse.donnees[0]}`);
  await new Promise((fin) => setTimeout(fin, 500));
  await lireEtatRobot();
}

function bouton(id, action) {
  $(id).addEventListener('click', async () => {
    try {
      await action();
    } catch (erreur) {
      journal(`✗ ${erreur.message}`);
    }
  });
}

// Balance : BLE, donc Web Bluetooth, sans appairage. Le poids s'affiche dans l'unité choisie avec UNIT ;
// la conversion se fait ici, car certaines balances continuent d'envoyer des grammes.
let commandesBalance;
let typeBalance = 5;
let uniteAffichee = 0;

async function ecrireBalance(octets) {
  journal(`balance → ${enHexa(octets)}`);
  await commandesBalance.writeValueWithoutResponse(octets);
}

function activerBalance(actif) {
  for (const id of ['tare', 'unite']) $(id).disabled = !actif;
}

async function connecterBalance() {
  if (!('bluetooth' in navigator)) throw new Error('ce navigateur ne connaît pas Web Bluetooth (il faut Chrome)');
  const appareil = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_BALANCE] }] });
  appareil.addEventListener('gattserverdisconnected', () => {
    $('poids').textContent = 'déconnectée';
    activerBalance(false);
  });
  const service = await (await appareil.gatt.connect()).getPrimaryService(SERVICE_BALANCE);
  commandesBalance = await service.getCharacteristic(CARACTERISTIQUE_COMMANDES);
  const mesures = await service.getCharacteristic(CARACTERISTIQUE_MESURES);
  mesures.addEventListener('characteristicvaluechanged', () => {
    const vue = mesures.value;
    const octets = new Uint8Array(vue.buffer, vue.byteOffset, vue.byteLength);
    const pesee = lirePesee(octets);
    if (!pesee) {
      journal(`balance ← ${enHexa(octets)}`);
      return;
    }
    typeBalance = pesee.type;
    const grammes = enGrammes(pesee);
    const texte = grammes === null ? `${pesee.valeur} ${nomUnite(pesee.unite)}` : formaterPoids(grammes, uniteAffichee);
    $('poids').textContent = pesee.stable ? texte : `${texte} …`;
  });
  await mesures.startNotifications();
  await ecrireBalance(commandeVersion(typeBalance));
  activerBalance(true);
  journal('balance connectée');
}

bouton('balance', connecterBalance);
bouton('tare', () => ecrireBalance(commandeTare(typeBalance)));
bouton('unite', () => {
  uniteAffichee = uniteSuivante(uniteAffichee);
  return ecrireBalance(commandeUnite(typeBalance, uniteAffichee));
});
bouton('connecter', connecter);
bouton('lire', lireEtatRobot);
bouton('droite', () => appuyer(Commande.droite));
bouton('gauche', () => appuyer(Commande.gauche));
bouton('envoyer', envoyerProgramme);
journal('serial' in navigator ? 'Web Serial disponible' : '✗ Web Serial absent de ce navigateur');
