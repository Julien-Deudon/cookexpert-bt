# Protocole Bluetooth du Magimix Cook Expert Connect

Rétro-ingénierie du 2026-10-30 à partir de l'appli Magimix 2.12.5 pour Android (`magimix.connect`) :

- la bibliothèque native Topband `com.topband.bl1175lib` pour les trames et le CRC ;
- le module JavaScript des états du robot, extrait du bundle Hermes v98.

Le tout a été vérifié sur les trames échangées entre l'appli et un robot réel (journal Android du 2026-10-30).

Cette description a été rédigée à partir de cette analyse, à des fins d'interopérabilité. Le projet ne contient aucun fichier ni extrait de code de l'appli Magimix.

## Liaison

- Bluetooth **classique** (pas BLE) : profil série SPP, UUID `00001101-0000-1000-8000-00805F9B34FB`.
- Côté robot : la « clé Connect » branchée sous la base.
- Nom annoncé : contient « cook expert » (filtre de l'appli, sans tenir compte de la casse). Il a la forme « cook expert XXXXXX », où XXXXXX est un nombre propre à chaque robot. Sur le robot étudié, c'étaient les 3 derniers octets de l'adresse Bluetooth, écrits en décimal.
- Code d'appairage : `0000`.
- Une seule connexion à la fois : fermer l'appli Magimix avant de se connecter autrement.
- Conséquence : Web Bluetooth, limité au BLE, ne peut pas parler au robot.

## Trames

| Sens | Format |
|---|---|
| vers le robot, sans données | `A5 <commande> <CRC>` |
| vers le robot, avec données | `A5 <commande> <longueur totale> <données…> <CRC>` |
| du robot, accusé de réception | `5A <commande> <CRC>` |
| du robot, avec données | `5A <commande> <longueur totale> <données…> <CRC>` |

- Longueur totale : nombre d'octets de la trame entière, soit données + 4.
- CRC8 : calculé sur tous les octets qui précèdent. Table maison : `table[i] = i/2` si `i` est pair, `0xFF − (i−1)/2` sinon. On part de `crc = 0` et on applique `crc = table[crc ^ octet]` à chaque octet. Exemple : `A5 01` donne `56`.
- Aucun chiffrement, aucune authentification au-delà de l'appairage.

## Commandes

| Code | Nom dans l'appli | Rôle | Réponse |
|---|---|---|---|
| 01 | KEY_OK | touche OK | `5A 01 16` |
| 02 | KEY_RIGHT | flèche droite | `5A 02 E8` |
| 03 | KEY_R_DOWN | touche « droite bas », rôle exact inconnu | accusé |
| 04 | KEY_L_DOWN | touche « gauche bas », rôle exact inconnu | accusé |
| 05 | KEY_LEFT | flèche gauche | `5A 05 14` |
| 06 | KEY_BACK | retour | `5A 06 EA` |
| 07 | KEY_STOP | STOP | accusé |
| 08 | KEY_AUTO | AUTO (démarre le programme) | accusé |
| 09 / 0A | KEY_PULSE / KEY_PULSE_UP | PULSE appuyé / relâché | accusé |
| 0D | Program_Update | mise à jour du programme du robot (XMODEM) | — |
| 0E | Get_backUp | « sauvegardes », 14 octets de sens inconnu | données |
| 0F | Get_Status | état du robot, 12 octets | données |
| 10 | SET_STATUS | envoi d'un programme, 8 octets | `5A 10 <code> <CRC>`, code `00` = accepté |
| 11 | Get_LIFE | compteurs : 3 × 32 bits, le 3e compte les secondes sous tension | données |
| 12 | SET_PHONE_NAME | nom du téléphone (texte) | à observer |
| 13 | Get_VERSION | version | données |

Quand elle est connectée, l'appli lit l'état toutes les 500 ms, les compteurs toutes les 4 s et les sauvegardes toutes les 5 s.

## État du robot (réponse à 0F, 12 octets)

| Octet | Contenu |
|---|---|
| 0 | état : 0 sécurité enfants, 1 menu principal, 2 sous-menu, 3 prêt, 4 en marche, 5 pause, 6 arrêt, 7 défaut |
| 1 | mode : 0 Réglages, 1 Recettes, 2 Nettoyage, 3 Expert, 4 Cuisson, 5 Blender, 6 Boulangerie, 7 Robot, 8 Cocotte |
| 2 | sous-programme, selon le mode (voir plus bas) |
| 3-4 | temps en secondes, octet de poids fort d'abord (`FFFF` = sans objet) |
| 5 | vitesse de 0 à 18 ; 1 et 2 s'affichent « 1A » et « 2A » |
| 6 | température en °C ; 29 est le minimum, probablement « sans chauffe » |
| 7 | à l'envoi : « premier cycle » |
| 8-9 | thermomètre (niveau, passage au rouge) |
| 10 | défauts (bits) : 1 couvercle, 2 eau, 4 moteur, 8 bol, 16 chauffe, 32 sonde en court-circuit, 64 sonde coupée |
| 11 | drapeaux : bit 0 à 0 = premier cycle, bit 1 HotMix, bit 2 HotMix verrouillé |

`FF` signifie « sans objet ».

Sous-programmes (octet 2) :

- Cuisson : 0 Vapeur, 1 Soupe veloutée, 2 Soupe moulinée, 3 Mijotage, 4 Rissolage, 5 Vapeur XXL
- Blender : 0 Smoothie, 1 Glace pilée, 2 Dessert glacé
- Boulangerie : 0 Blancs en neige, 1 Pâtisserie, 2 Pain et brioche, 3 Pain et brioche XXL, 4 Crêpes, 5 Pizza, 6 Chocolat
- Cocotte : 0 Rissoler, 1 Mijoter, 2 Maintien au chaud
- Nettoyage : 0 Éco, 1 Normal, 2 Intensif

Exemples observés : `01 04 FF…` = menu principal, curseur sur Cuisson. Dans le sous-menu, chaque flèche droite fait passer l'octet 2 de 0 à 5, puis il revient à 0.

## Envoyer un programme (commande 10, 8 octets)

`[état, mode, sous-programme, temps haut, temps bas, vitesse, température, premier cycle]`

C'est ce que fait l'appli pour chaque étape d'une recette (champ `btOrder`). Elle met à zéro les champs inutiles et envoie une seule trame. Ensuite elle fait vibrer le téléphone, et c'est le cuisinier qui lance le programme sur le robot.

Bornes vérifiées par l'appli :

- Expert : temps de 0 à 14 400 s (4 h), vitesse de 0 à 18, température de 29 à 140 °C. Au-dessus de 120 °C, la durée doit rester sous 2 h. La télécommande de l'appli envoie `FF` pour « ne pas changer ».
- Robot : vitesse de 4 à 13 ; temps et température à 0.
- Cocotte : vitesse à 0.
- Chocolat : 5 min, vitesse 3, 60 °C imposés.

Exemple, Expert 2 min à 40 °C en vitesse 3 : `A5 10 0C 03 03 00 00 78 03 28 00 95`.

## Confirmé sur le robot le 2026-10-30

- Octet 0 à l'envoi : 3 (prêt). Le robot passe en « prêt · Expert » avec les réglages reçus, sans démarrer.
- Sous-programme du mode Expert : 0.
- Réponse à la commande 10 : `5A 10 00 8F`. Ce n'est ni un accusé sur 3 octets ni une trame à longueur, mais un code sur 1 octet.
- État relu après l'envoi : `03 03 00 00 78 03 28 02 0D 00 00 00`. Les octets 7 et 8 (`02`, `0D`) restent à interpréter.

## Encore à confirmer

1. 29 °C = sans chauffe.
2. Les codes de refus de la commande 10 (autres que `00`).

## Essais sur le robot

**2026-10-30, depuis un Mac.** Le robot s'appelle « cook expert XXXXXX » et macOS crée le port `/dev/cu.cookexpertXXXXXX` à l'appairage.

- 1re connexion, juste après l'appairage : `A5 0F 51` renvoie l'état `02 00 00 FF…` (sous-menu Réglages, sur Bluetooth). La liaison fonctionne.
- Connexions suivantes : les trames partent, mais aucun octet ne revient. C'est pareil avec l'appli Magimix arrêtée et après un redémarrage du robot.
- Cause : macOS n'ouvre pas la liaison Bluetooth quand on ouvre `/dev/cu.cookexpertXXXXXX` (le robot reste « Not Connected » pendant l'essai). La 1re fois, la liaison était encore ouverte après l'appairage.
- « Se connecter » dans Réglages système > Bluetooth ouvre bien la liaison (robot « Connected » au bout de 59 s). Pourtant, le port n'obtient toujours aucune réponse, et macOS recoupe la liaison peu après.
- Un outil en ligne de commande sans les droits Bluetooth de macOS ne peut pas ouvrir la liaison lui-même : macOS l'arrête net.
- Depuis un serveur Linux (adaptateur `hci0`) : une socket RFCOMM vers les canaux 1 à 3 répond `EHOSTDOWN` en 5 s. Le robot était hors de portée de ce serveur.
- Essai avec le Bluetooth du téléphone coupé, robot oublié puis réappairé sur le Mac : la 1re connexion fait tout le test (état, flèches, programme accepté). La 2e connexion ne reçoit de nouveau rien.
- Conclusion : sur ce Mac, seule la 1re connexion après un appairage fonctionne, même quand le téléphone ne se connecte plus au robot. Comme le téléphone, lui, se reconnecte chaque jour sans réappairage, le blocage vient très probablement de macOS. Le Mac convient pour les essais (oublier puis réappairer à chaque fois), pas pour la version finale.

**2026-10-30, depuis Chrome sur un téléphone Android (Web Serial, page `essai-web/`).** C'est le transport retenu.

- La page est servie par le Mac (`npm run essai-web`) et ouverte sur le téléphone en `http://localhost:8080`, via `adb reverse tcp:8080 tcp:8080`. « localhost » compte comme contexte sécurisé.
- Chrome demande d'abord l'autorisation Android « Appareils à proximité ». Ensuite, le choix « cook expert XXXXXX » ouvre le port, sans réappairage.
- Programme 4 s / 80 °C / vitesse 6 : `A5 10 0C 03 03 00 00 04 06 50 00 4C`. Le robot répond `5A 10 00 8F` et son état passe à `03 03 00 00 04 06 50 04 0D 00 00 00`.
- L'octet 7 de l'état vaut `02` à 40 °C et `04` à 80 °C : il suit la température demandée, son sens exact reste à trouver.

## Où regarder dans l'appli

- `com.reactlibrary.magimix.cookexpert.RNMgxCookExpertModule` : le pont React Native.
- `com.topband.bl1175lib` : `BTControlManager`, `constants/Cmd`, `utils/CRC8`.
- `com.topband.lib.spp` : la connexion SPP et le code 0000.
- Bundle Hermes : le module qui exporte `isValidForSetStatus`, `maskForSetStatus` et `getSystemIndex`.
