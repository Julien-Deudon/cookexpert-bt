import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commandeGrammes,
  commandeTare,
  commandeUnite,
  enGrammes,
  formaterPoids,
  lirePesee,
  uniteSuivante,
} from './balance.ts';
import { enHexa } from './protocole.ts';

test('la tare et le changement d’unité suivent la bibliothèque Aicare (tare essayée sur la balance le 2026-10-30)', () => {
  assert.equal(enHexa(commandeTare(5)), 'AC 05 FE 14 01 00 CC DF');
  assert.equal(enHexa(commandeGrammes(5)), 'AC 05 FE 06 00 00 CC D0');
  assert.equal(enHexa(commandeUnite(5, 4)), 'AC 05 FE 06 04 00 CC D4');
});

test('lirePesee lit un poids stable du type 5', () => {
  assert.deepEqual(lirePesee([0xac, 0x05, 0x00, 0x03, 0xe8, 0x00, 0xca, 0xb5]), { valeur: 1000, unite: 0, stable: true, type: 5 });
});

test('lirePesee applique les décimales et le signe, et repère un poids qui bouge', () => {
  // Octet 5 = 0b0000_001_1 : grammes, 1 décimale, négatif.
  assert.deepEqual(lirePesee([0xac, 0x05, 0x00, 0x00, 0xfa, 0x03, 0xce, 0xcb]), { valeur: -25, unite: 0, stable: false, type: 5 });
});

test('lirePesee lit le type 4 (dixièmes de gramme sur 2 octets)', () => {
  assert.equal(lirePesee([0xac, 0x04, 0x03, 0xe8, 0x00, 0x00, 0xca, 0xb5])?.valeur, 100);
});

test('lirePesee ignore les trames abîmées et celles qui ne sont pas des poids', () => {
  assert.equal(lirePesee([0xac, 0x05, 0x00, 0x03, 0xe8, 0x00, 0xca, 0x00]), null);
  assert.equal(lirePesee([0xac, 0x05, 0xf7, 0x01, 0x02, 0x00, 0xcc, 0xc6]), null);
  assert.equal(lirePesee([0xac, 0x05, 0x00]), null);
});

test('UNIT tourne sur g, kg, lb, oz, jamais sur les millilitres', () => {
  assert.deepEqual([0, 4, 2, 3].map(uniteSuivante), [4, 2, 3, 0]);
  assert.equal(uniteSuivante(1), 0);
  assert.equal(uniteSuivante(undefined), 0);
});

test('enGrammes et formaterPoids convertissent entre les unités', () => {
  const kilos = { valeur: 0.125, unite: 4, stable: true, type: 5 };
  assert.equal(enGrammes(kilos), 125);
  assert.equal(enGrammes({ ...kilos, unite: 1 }), null);
  assert.equal(formaterPoids(112, 0), '112 g');
  assert.equal(formaterPoids(2.5, 0), '2,5 g');
  assert.equal(formaterPoids(125, 4), '0,125 kg');
  assert.equal(formaterPoids(125, 3), '4,41 oz');
  assert.equal(formaterPoids(453.592, 2), '1 lb');
});
