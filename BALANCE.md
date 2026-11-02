# Balance XL Connect : protocole

La balance livrée avec le Cook Expert Connect (« XL Connect ») contient un module Aicare. Contrairement au robot, elle parle en **Bluetooth basse consommation (BLE)** : pas d'appairage, et Web Bluetooth la gère directement (Chrome sur Android ou sur ordinateur). Le code est dans `src/balance.ts`.

Le protocole a été décrit à partir de l'appli Android Magimix 2.12.5, qui embarque la bibliothèque Aicare, à des fins d'interopérabilité. Il a été vérifié sur une vraie balance le 2026-10-30 : pesée, tare et bouton UNIT.

## Service et caractéristiques

| UUID | Rôle |
|---|---|
| `FFB0` | service de la balance (pour le filtre de `requestDevice`) |
| `FFB2` | mesures, en notifications |
| `FFB1` | commandes, en écriture sans réponse |

La bibliothèque Aicare contient une authentification chiffrée, mais l'appli Magimix ne l'appelle jamais : la balance répond sans elle.

## Format des trames

Chaque trame fait 8 octets, dans les deux sens :

| Octet | Contenu |
|---|---|
| 0 | `AC` |
| 1 | type : 4 ou 5 selon le modèle de balance (lu dans chaque trame reçue, repris dans les commandes) |
| 2 à 6 | données |
| 7 | somme des octets 2 à 6, sur 8 bits |

### Poids, type 5

| Octet | Contenu |
|---|---|
| 2 à 4 | valeur sur 24 bits, octet de poids fort d'abord |
| 5 | bits 7 à 4 : unité ; bits 3 à 1 : nombre de décimales ; bit 0 : 1 si négatif |
| 6 | `CA` poids stable, `CE` poids en train de changer |

Exemple : `AC 05 00 03 E8 00 CA B5` = 1 000 g, stable.

### Poids, type 4

Octets 2 et 3 : dixièmes de gramme, sur 16 bits. Bit 0 de l'octet 5 : signe. Ce type n'a pas été essayé sur une vraie balance.

### Autres trames reçues

Un octet 6 à `CC` signale une trame de réglage, et un octet 2 à `F7` ou `F1` une réponse (version…). Ce ne sont pas des poids.

## Commandes

| Commande | Trame (type 5) |
|---|---|
| Tare (remise à zéro) | `AC 05 FE 14 01 00 CC DF` |
| Unité | `AC 05 FE 06 <code> 00 CC <somme>` |
| Version (1re commande envoyée par l'appli) | `AC 05 F7 00 00 00 CC C3` |

## Unités

Codes : 0 g, 1 ml, 2 lb, 3 oz, 4 kg (d'autres codes existent pour les volumes). L'appli Magimix ne propose que g, kg, lb et oz, et la balance ignore les millilitres.

Sur la balance essayée, l'écran change d'unité, mais les trames continuent d'arriver en grammes. Comme la bibliothèque Aicare, l'appli doit donc convertir elle-même l'affichage : voir `enGrammes` et `formaterPoids`.
