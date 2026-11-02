import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertirEtape, decrireReglage, TEMPERATURE_VAROMA } from './conversion.ts';
import { Commande, donneesExpert, enHexa, SANS_CHAUFFE, trame } from './protocole.ts';

const reglage = (instruction: string) => {
  const c = convertirEtape(instruction);
  assert.equal(c?.statut, 'ok', instruction);
  return c.statut === 'ok' ? c.reglage : assert.fail();
};

test('une cuisson avec température devient un programme Expert prêt à envoyer', () => {
  const r = reglage('Cuire 25 min/120°C/vitesse 2.');
  assert.deepEqual(r, { tempsS: 1500, temperature: 120, vitesse: 3, remarques: [] });
  assert.equal(decrireReglage(r), 'Expert · 25:00 · 120 °C · vitesse 3');
  assert.equal(enHexa(trame(Commande.envoyerEtat, donneesExpert(r))).slice(0, 8), 'A5 10 0C');
});

test('un mélange sans température part sans chauffe, minutes et secondes s’additionnent', () => {
  assert.deepEqual(reglage('Pulvériser 20 sec/vitesse 10.'), { tempsS: 20, temperature: SANS_CHAUFFE, vitesse: 18, remarques: [] });
  assert.equal(reglage('Chauffer 2 min 30 sec/37°C/vitesse 1.').tempsS, 150);
});

test('la vitesse cuillère et le Varoma ont leur équivalent', () => {
  assert.deepEqual(reglage('Cuire 30 min/Varoma/Vitesse Cuillère.'), {
    tempsS: 1800,
    temperature: TEMPERATURE_VAROMA,
    vitesse: 1,
    remarques: [`Varoma : vapeur à ${TEMPERATURE_VAROMA} °C, avec le panier vapeur du Cook Expert.`],
  });
});

test('les demi-vitesses sont lues en entier, sans laisser de remarque « 5. »', () => {
  assert.deepEqual(reglage('Mélanger 10 sec/vitesse 3.5.'), { tempsS: 10, temperature: SANS_CHAUFFE, vitesse: 10, remarques: [] });
  assert.equal(reglage('Cuire 5 min/90°C/vitesse 0.5.').vitesse, 2);
});

test('au-dessus de 60 °C, la vitesse est plafonnée à 15', () => {
  const chaud = reglage('Cuire 3 min/100°C/vitesse 8.');
  assert.equal(chaud.vitesse, 15);
  assert.match(chaud.remarques[0], /au-dessus de 60 °C/);
  assert.equal(reglage('Mélanger 30 sec/50°C/vitesse 8.').vitesse, 17);
});

test('les consignes collées après la vitesse deviennent des remarques', () => {
  assert.deepEqual(reglage("Mélanger 1 min/vitesse 3Augmentez progressivement la vitesse jusqu'à 8.").remarques, [
    "Augmentez la vitesse à la main jusqu'à 17.",
  ]);
  assert.deepEqual(reglage('Mélanger 20 sec/vitesse 4Mélanger en vous aidant de la spatule.').remarques, [
    'Mélanger en vous aidant de la spatule.',
  ]);
});

test('le pétrin reste au programme Boulangerie du robot, et le reste n’est pas une programmation', () => {
  assert.deepEqual(convertirEtape('Mélanger 2 min/vitesse pétrin.'), {
    statut: 'manuel',
    raison: 'Pétrissage de 2:00 : sur le robot, lancez le programme Boulangerie › Pain et brioche.',
  });
  assert.equal(convertirEtape('Mettre 20 grammes de levure dans le bol.'), null);
});
