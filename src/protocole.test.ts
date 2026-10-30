import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Commande,
  crc8,
  decouperTrames,
  decrireEtat,
  donneesExpert,
  enHexa,
  lireEtat,
  SANS_CHAUFFE,
  trame,
} from './protocole.ts';

const hexa = (texte: string) => (texte.match(/../g) ?? []).map((o) => parseInt(o, 16));
const compact = (octets: Iterable<number>) => enHexa(octets).replaceAll(' ', '');

test("les commandes simples correspondent aux constantes de l'appli Magimix", () => {
  const attendues: [number, string][] = [
    [Commande.ok, 'A50156'],
    [Commande.droite, 'A502A8'],
    [Commande.droiteBas, 'A50357'],
    [Commande.gaucheBas, 'A504AB'],
    [Commande.gauche, 'A50554'],
    [Commande.retour, 'A506AA'],
    [Commande.stop, 'A50755'],
    [Commande.auto, 'A508AD'],
    [Commande.pulse, 'A50952'],
    [Commande.pulseRelache, 'A50AAC'],
    [Commande.sauvegardes, 'A50EAE'],
    [Commande.lireEtat, 'A50F51'],
    [Commande.compteurs, 'A5115E'],
    [Commande.version, 'A5135F'],
  ];
  for (const [commande, attendue] of attendues) assert.equal(compact(trame(commande)), attendue);
});

test('le CRC8 valide les trames capturées sur le robot le 2026-10-30', () => {
  const captures = [
    '5A02E8',
    '5A06EA',
    '5A0116',
    '5A0F100104FFFFFFFFFFFFFFFFFFFFE1',
    '5A0F10020402FFFFFFFFFFFFFFFFFFA0',
    '5A0F10020500FFFFFFFFFFFFFFFFFF21',
    '5A11100003D4920009817A0014EF923A',
    '5A0E120201067000110100FF040000FF0068',
    // Depuis le Mac, après réappairage :
    '5A0514',
    '5A0F100105FFFFFFFFFFFFFFFFFFFF61',
    '5A10008F',
    '5A0F1003030000780328020D000000A3',
    // Depuis Chrome sur Android (Web Serial), même jour :
    '5A0F1003030000040650040D00000011',
  ];
  for (const capture of captures) {
    const octets = hexa(capture);
    assert.equal(crc8(octets.slice(0, -1)), octets.at(-1), capture);
  }
});

test('decouperTrames sépare des réponses collées et garde la fin incomplète', () => {
  const flux = hexa('5A0E120201067000110100FF040000FF0068' + '5A0F100104FFFFFFFFFFFFFFFFFFFFE1' + '5A02E8' + '5A0F10');
  const { trames, reste } = decouperTrames(flux);
  assert.deepEqual(
    trames.map((t) => t.commande),
    [Commande.sauvegardes, Commande.lireEtat, Commande.droite],
  );
  assert.deepEqual(trames[1].donnees, hexa('0104FFFFFFFFFFFFFFFFFFFF'));
  assert.deepEqual(reste, hexa('5A0F10'));
});

test('decouperTrames lit la réponse à code de « envoyerEtat » (2026-10-30, programme accepté)', () => {
  const { trames, reste } = decouperTrames(hexa('5A10008F' + '5A0F1003030000780328020D000000A3'));
  assert.deepEqual(trames[0], { commande: Commande.envoyerEtat, donnees: [0] });
  assert.equal(decrireEtat(lireEtat(trames[1].donnees)), 'prêt · Expert · 2:00 · 40 °C · vitesse 3');
  assert.deepEqual(reste, []);
});

test('decouperTrames ignore les octets parasites et les CRC faux', () => {
  const { trames, reste } = decouperTrames(hexa('00FF5A02E9' + '5A06EA'));
  assert.deepEqual(trames, [{ commande: Commande.retour, donnees: [] }]);
  assert.deepEqual(reste, []);
});

test('lireEtat décode les états vus pendant la capture', () => {
  assert.equal(decrireEtat(lireEtat(hexa('0104FFFFFFFFFFFFFFFFFFFF'))), 'menu principal · Cuisson');
  assert.equal(decrireEtat(lireEtat(hexa('020401FFFFFFFFFFFFFFFFFF'))), 'sous-menu · Cuisson · Soupe veloutée');
  assert.equal(decrireEtat(lireEtat(hexa('020500FFFFFFFFFFFFFFFFFF'))), 'sous-menu · Blender · Smoothie');
  // Lu depuis le Mac le 2026-10-30, juste après l'appairage (Réglages > Bluetooth).
  assert.equal(decrireEtat(lireEtat(hexa('020000FFFFFFFFFFFFFFFFFF'))), 'sous-menu · Réglages');
});

test('lireEtat signale les défauts du robot', () => {
  const etat = lireEtat(hexa('0303000078032800FFFF01FF'));
  assert.deepEqual(etat.defauts, ['couvercle à fermer']);
});

test('donneesExpert fabrique la trame « 2 min, 40 °C, vitesse 3 »', () => {
  const donnees = donneesExpert({ tempsS: 120, temperature: 40, vitesse: 3 });
  assert.deepEqual(donnees, [3, 3, 0, 0, 120, 3, 40, 0]);
  const t = trame(Commande.envoyerEtat, donnees);
  assert.equal(t.length, 12);
  assert.equal(t[2], 12);
  assert.equal(crc8(t.subarray(0, -1)), t.at(-1));
  assert.equal(decrireEtat(lireEtat(donnees)), 'prêt · Expert · 2:00 · 40 °C · vitesse 3');
});

test('donneesExpert reproduit la trame acceptée depuis Chrome Android le 2026-10-30', () => {
  const t = trame(Commande.envoyerEtat, donneesExpert({ tempsS: 4, temperature: 80, vitesse: 6 }));
  assert.equal(compact(t), 'A5100C03030000040650004C');
});

test("donneesExpert refuse ce que l'appli Magimix refuse", () => {
  assert.throws(() => donneesExpert({ tempsS: 14401, temperature: 40, vitesse: 3 }), RangeError);
  assert.throws(() => donneesExpert({ tempsS: 60, temperature: 141, vitesse: 3 }), RangeError);
  assert.throws(() => donneesExpert({ tempsS: 60, temperature: 40, vitesse: 19 }), RangeError);
  assert.throws(() => donneesExpert({ tempsS: 7200, temperature: 130, vitesse: 3 }), RangeError);
  assert.doesNotThrow(() => donneesExpert({ tempsS: 30, temperature: SANS_CHAUFFE, vitesse: 18 }));
});
