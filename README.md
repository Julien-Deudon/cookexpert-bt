# cookexpert-bt

Piloter un **Magimix Cook Expert Connect** en Bluetooth, sans l'appli officielle.

[English version below](#english)

## Ce que ça fait

Le Cook Expert Connect se pilote par sa « clé Connect », branchée sous la base. Cette clé parle en **Bluetooth classique, profil série SPP** (pas en BLE). Ce projet fournit :

- une **bibliothèque** TypeScript sans dépendance (`src/protocole.ts`) : fabrication des trames, CRC8, découpage du flux reçu, décodage de l'état du robot, programme Expert ;
- un **outil en ligne de commande** (`src/cli.ts`) : lire l'état, appuyer sur une touche, régler un programme Expert ;
- une **page d'essai Web Serial** (`essai-web/`) : la même chose depuis Chrome, sur téléphone Android ou sur ordinateur ;
- la **description du protocole**, en français : [PROTOCOLE.md](PROTOCOLE.md).

Un programme Expert (temps, température, vitesse) s'envoie en une seule trame. Le robot passe alors en « prêt » avec ces réglages, **sans démarrer**.

## Avant de commencer

- Un Cook Expert **Connect**, avec sa clé Connect.
- Le robot appairé à l'appareil qui le pilote. Code d'appairage : `0000`. Le robot s'annonce sous le nom « cook expert XXXXXX ».
- **L'appli Magimix fermée** : le robot n'accepte qu'une connexion à la fois.
- Node.js 24 ou plus récent. Les fichiers `.ts` sont lancés directement par Node, sans compilation.

```bash
git clone https://github.com/Julien-Deudon/cookexpert-bt.git
cd cookexpert-bt
npm install
```

## Transports

| Transport | Où | État |
|---|---|---|
| Web Serial | Chrome sur Android | testé sur un vrai robot, transport recommandé |
| Web Serial | Chrome sur ordinateur | non testé |
| `serialport` sous Node | macOS | testé, avec la limite ci-dessous |
| `serialport` sous Node | Linux, Windows | non testé (passer le port avec `--port`) |

Web Bluetooth ne convient pas : il ne gère que le BLE.

Web Serial n'est disponible que sur une page servie en **HTTPS** ou sur **localhost**.

### Limite connue de macOS

Sur Mac, **seule la 1re connexion après un appairage fonctionne**. Les suivantes ouvrent bien le port `/dev/cu.cookexpertXXXXXX`, mais le robot ne répond plus. Pour refaire un essai : oublier le robot dans Réglages système > Bluetooth, puis l'appairer de nouveau. Le téléphone, lui, se reconnecte sans réappairage. Détails dans [PROTOCOLE.md](PROTOCOLE.md#essais-sur-le-robot).

## Outil en ligne de commande

```bash
node src/cli.ts
```

Sans argument, l'outil affiche l'aide. Les actions :

| Commande | Effet |
|---|---|
| `node src/cli.ts ports` | liste les ports série |
| `node src/cli.ts statut` | lit l'état du robot |
| `node src/cli.ts ecouter` | affiche chaque changement d'état (Ctrl+C pour arrêter) |
| `node src/cli.ts touche droite` | appuie sur une touche : `ok`, `droite`, `gauche`, `retour`, `stop` |
| `node src/cli.ts envoyer --temps 2:00 --temperature 40 --vitesse 3` | règle un programme Expert, sans le lancer |
| `node src/cli.ts test` | en une connexion : état, flèches, puis Expert 2:00 / 40 °C / vitesse 3 |

Options utiles :

- `--essai` : affiche la trame sans rien envoyer ;
- `--port /dev/cu.xxx` : choisit le port (sinon, l'outil cherche un port dont le nom contient « cook » ou « magimix ») ;
- `--journal` : affiche les octets bruts échangés ;
- `--temperature sans` : pas de chauffe.

## Page d'essai Web Serial

1. Lancer le serveur : `npm run essai-web`, puis ouvrir `http://localhost:8080` dans Chrome.
2. Sur un téléphone Android branché en USB (débogage USB activé), rendre la page accessible : `adb reverse tcp:8080 tcp:8080`, puis ouvrir `http://localhost:8080` dans Chrome sur le téléphone.
3. Toucher « Se connecter au robot ». Chrome demande l'autorisation « Appareils à proximité », puis propose « cook expert XXXXXX ».
4. Lire l'état, utiliser les flèches, ou envoyer un programme (temps, température, vitesse).

Pour se passer de l'ordinateur, la page peut être servie en HTTPS par n'importe quel hébergeur, avec `src/protocole.ts` converti en JavaScript.

## Utiliser la bibliothèque

```ts
import { Commande, decouperTrames, decrireEtat, donneesExpert, lireEtat, trame } from 'cookexpert-bt';

// Expert, 2 min à 40 °C, vitesse 3 : A5 10 0C 03 03 00 00 78 03 28 00 95
const programme = trame(Commande.envoyerEtat, donneesExpert({ tempsS: 120, temperature: 40, vitesse: 3 }));
await ecrivain.write(programme); // Web Serial, serialport…

// Réception : découper le flux, puis décoder l'état.
const { trames, reste } = decouperTrames([...flux, ...morceauRecu]);
flux = reste; // une trame incomplète attend la suite
for (const t of trames) {
  if (t.commande === Commande.lireEtat) console.log(decrireEtat(lireEtat(t.donnees))); // « prêt · Expert · 2:00 · 40 °C · vitesse 3 »
}
```

Le paquet exporte directement le source TypeScript. Les outils qui compilent le TypeScript (Vite, esbuild…) l'acceptent tel quel. Node seul, en revanche, refuse d'effacer les types d'un fichier situé dans `node_modules` : dans ce cas, copiez `src/protocole.ts` dans votre projet. C'est un seul fichier, sans dépendance.

## Sécurité

- **L'outil ne démarre jamais le moteur ni la chauffe.** La ligne de commande et la page d'essai n'envoient jamais les commandes AUTO ni PULSE. Elles règlent le programme, et c'est le cuisinier qui appuie sur AUTO, devant le robot.
- La touche STOP reste disponible.
- `donneesExpert` refuse les réglages que l'appli officielle refuse : plus de 4 h, plus de 140 °C, vitesse au-delà de 18, ou 2 h et plus au-dessus de 120 °C.
- La bibliothèque expose tous les codes du protocole, AUTO et PULSE compris, pour le documenter. Les utiliser dans votre propre code relève de votre responsabilité.

## Limites

- Seul le mode Expert est réglé par l'outil.
- 29 °C est la température minimale ; elle signifie probablement « sans chauffe » (à confirmer).
- Les codes de refus d'un programme (autres que `00`, accepté) restent inconnus.

## Développement

```bash
npm test
npm run verifier
```

Les tests rejouent des trames réelles du robot. Toute nouvelle trame observée y entre, avec sa date. Ne publiez jamais le nom ni l'adresse Bluetooth de votre robot : écrivez « cook expert XXXXXX ». Les choix du projet sont expliqués dans [DECISIONS.md](DECISIONS.md).

## Avertissement

- Projet personnel et indépendant, **sans aucun lien avec Magimix**, ni approuvé ni soutenu par Magimix.
- « Magimix », « Cook Expert » et les autres marques citées appartiennent à leurs propriétaires. Elles ne servent ici qu'à décrire l'appareil compatible.
- Le protocole a été décrit à partir de l'analyse de l'appli Android officielle, à des fins d'interopérabilité. Ce dépôt ne contient aucun code, fichier ou extrait de cette appli.
- Logiciel fourni **tel quel, sans aucune garantie** (voir [LICENSE](LICENSE)). Le robot coupe et chauffe : vous l'utilisez avec cet outil **à vos risques**, y compris pour votre appareil.

## Licence

[MIT](LICENSE) © 2026 Julien Deudon

---

<a id="english"></a>

# cookexpert-bt (English)

Control a **Magimix Cook Expert Connect** over Bluetooth, without the official app.

## What it does

The Cook Expert Connect is controlled through its "Connect key", plugged under the base. The key speaks **Bluetooth Classic, Serial Port Profile (SPP)**, not BLE. This project provides:

- a dependency-free TypeScript **library** (`src/protocole.ts`): frame building, CRC8, splitting the incoming stream, decoding the machine state, Expert programs;
- a **command-line tool** (`src/cli.ts`): read the state, press a key, set an Expert program;
- a **Web Serial test page** (`essai-web/`): the same from Chrome, on an Android phone or a computer;
- the **protocol description**, in French: [PROTOCOLE.md](PROTOCOLE.md).

The code and its user-facing messages are in French.

An Expert program (time, temperature, speed) is sent as a single frame. The machine then switches to "ready" with these settings, **without starting**.

## Before you start

- A Cook Expert **Connect**, with its Connect key.
- The machine paired with the device that controls it. Pairing code: `0000`. The machine advertises itself as "cook expert XXXXXX".
- **The Magimix app closed**: the machine accepts only one connection at a time.
- Node.js 24 or later. `.ts` files run directly in Node, with no build step.

```bash
git clone https://github.com/Julien-Deudon/cookexpert-bt.git
cd cookexpert-bt
npm install
```

## Transports

| Transport | Where | Status |
|---|---|---|
| Web Serial | Chrome on Android | tested on a real machine, recommended |
| Web Serial | Chrome on desktop | not tested |
| `serialport` in Node | macOS | tested, with the limitation below |
| `serialport` in Node | Linux, Windows | not tested (pass the port with `--port`) |

Web Bluetooth does not work here: it only supports BLE.

Web Serial is only available on pages served over **HTTPS** or from **localhost**.

### Known macOS limitation

On a Mac, **only the first connection after pairing works**. Later connections open the `/dev/cu.cookexpertXXXXXX` port, but the machine no longer answers. To try again: forget the machine in System Settings > Bluetooth, then pair it again. Phones reconnect without re-pairing. Details (in French) in [PROTOCOLE.md](PROTOCOLE.md#essais-sur-le-robot).

## Command-line tool

```bash
node src/cli.ts
```

With no argument, the tool prints its help. Actions:

| Command | Effect |
|---|---|
| `node src/cli.ts ports` | list serial ports |
| `node src/cli.ts statut` | read the machine state |
| `node src/cli.ts ecouter` | print every state change (Ctrl+C to stop) |
| `node src/cli.ts touche droite` | press a key: `ok`, `droite` (right), `gauche` (left), `retour` (back), `stop` |
| `node src/cli.ts envoyer --temps 2:00 --temperature 40 --vitesse 3` | set an Expert program (time, temperature, speed) without starting it |
| `node src/cli.ts test` | in one connection: state, arrows, then Expert 2:00 / 40 °C / speed 3 |

Useful options:

- `--essai`: print the frame without sending anything (dry run);
- `--port /dev/cu.xxx`: choose the port (otherwise the tool looks for a port whose name contains "cook" or "magimix");
- `--journal`: print the raw bytes exchanged;
- `--temperature sans`: no heating.

## Web Serial test page

1. Start the server: `npm run essai-web`, then open `http://localhost:8080` in Chrome.
2. On an Android phone connected over USB (USB debugging on), make the page reachable: `adb reverse tcp:8080 tcp:8080`, then open `http://localhost:8080` in Chrome on the phone.
3. Tap "Se connecter au robot" (connect). Chrome asks for the "Nearby devices" permission, then offers "cook expert XXXXXX".
4. Read the state, use the arrows, or send a program (time, temperature, speed).

To do without the computer, the page can be served over HTTPS by any host, with `src/protocole.ts` converted to JavaScript.

## Using the library

```ts
import { Commande, decouperTrames, decrireEtat, donneesExpert, lireEtat, trame } from 'cookexpert-bt';

// Expert, 2 min at 40 °C, speed 3: A5 10 0C 03 03 00 00 78 03 28 00 95
const program = trame(Commande.envoyerEtat, donneesExpert({ tempsS: 120, temperature: 40, vitesse: 3 }));
await writer.write(program); // Web Serial, serialport…

// Receiving: split the stream, then decode the state.
const { trames, reste } = decouperTrames([...buffer, ...chunk]);
buffer = reste; // an incomplete frame waits for the rest
for (const t of trames) {
  if (t.commande === Commande.lireEtat) console.log(decrireEtat(lireEtat(t.donnees))); // "prêt · Expert · 2:00 · 40 °C · vitesse 3"
}
```

The package exports the TypeScript source directly. Tools that compile TypeScript (Vite, esbuild…) accept it as is. Plain Node, however, refuses to strip types from files inside `node_modules`: in that case, copy `src/protocole.ts` into your project. It is a single file with no dependencies.

## Safety

- **The tool never starts the motor or the heating.** The command-line tool and the test page never send the AUTO or PULSE commands. They set the program, and the cook presses AUTO, standing at the machine.
- The STOP key remains available.
- `donneesExpert` rejects the settings the official app rejects: more than 4 h, more than 140 °C, speed above 18, or 2 h or more above 120 °C.
- The library exposes every protocol code, AUTO and PULSE included, to document the protocol. Using them in your own code is your responsibility.

## Limitations

- Only Expert mode can be set by the tool.
- 29 °C is the minimum temperature; it probably means "no heating" (to be confirmed).
- The rejection codes for a program (other than `00`, accepted) are still unknown.

## Development

```bash
npm test
npm run verifier
```

The tests replay real frames from the machine. Any newly observed frame goes there, with its date. Never publish your machine's name or Bluetooth address: write "cook expert XXXXXX". Project decisions are explained (in French) in [DECISIONS.md](DECISIONS.md).

## Disclaimer

- Personal, independent project, **not affiliated with Magimix** in any way, nor endorsed or supported by Magimix.
- "Magimix", "Cook Expert" and other trademarks mentioned belong to their owners. They are used only to describe the compatible appliance.
- The protocol was described from an analysis of the official Android app, for interoperability purposes. This repository contains no code, file or excerpt from that app.
- Software provided **as is, without any warranty** (see [LICENSE](LICENSE)). The machine cuts and heats: you use it with this tool **at your own risk**, including for your appliance.

## License

[MIT](LICENSE) © 2026 Julien Deudon
