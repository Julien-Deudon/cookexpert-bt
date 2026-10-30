# Décisions

## TypeScript lancé directement par Node 24, sans build

**La règle :** les fichiers `.ts` sont exécutés par `node`, qui efface les types. On n'écrit donc que de la syntaxe effaçable : pas d'`enum`, pas de propriétés déclarées dans les paramètres du constructeur.
**Pourquoi :** aucune étape de compilation, et `src/protocole.ts` peut être repris tel quel dans une page web ou un autre projet.

## L'outil ne démarre jamais le robot

**La règle :** pas de commande AUTO ni PULSE dans l'outil. Il règle le programme, et c'est le cuisinier qui appuie sur AUTO.
**Pourquoi :** le moteur et la chauffe démarrent par un geste fait sur le robot, comme avec l'appli officielle.

## Un programme = une trame « envoyerEtat », pas des touches simulées

**La règle :** chaque étape s'envoie avec la commande 10.
**Pourquoi :** c'est ce que fait l'appli pour ses recettes. Simuler des touches dépend de l'ordre des menus, que l'on peut changer dans les réglages du robot.

## Bluetooth classique : pas de Web Bluetooth

**La règle :** le robot est piloté par Web Serial, depuis Chrome sur le téléphone. Jamais par Web Bluetooth. Le Mac ne sert qu'aux essais, et un pont ESP32 (Bluetooth classique vers Wi-Fi) reste un plan B.
**Pourquoi :** la clé Connect utilise le profil SPP, alors que Web Bluetooth ne gère que le BLE. Web Serial sur Chrome Android a marché du premier coup le 2026-10-30, sans matériel en plus. Le Mac, lui, ne réussit que la 1re connexion après un appairage (voir PROTOCOLE.md).
**Conséquence :** la page qui pilote le robot doit être servie en HTTPS (ou sur localhost), sinon Chrome n'expose pas Web Serial.

## Publication en open source, sous licence MIT

**La règle :** le dépôt ne contient que notre code et la description du protocole, rédigée par nous. Aucun fichier ni extrait de l'appli Magimix (APK, sources décompilées, bundle Hermes). Aucune donnée personnelle : nom ou adresse Bluetooth d'un robot réel, modèle de téléphone, journaux Android. Les exemples de nom s'écrivent « cook expert XXXXXX ».
**Pourquoi :** le nom annoncé par le robot dérive de son adresse Bluetooth, et les journaux Android contiennent bien plus que les trames. Le code de l'appli appartient à Magimix ; seules ses informations d'interface (trames, codes, bornes) sont décrites ici, pour l'interopérabilité.
**Conséquence :** le `.gitignore` refuse les APK, journaux et rapports de bug. Les trames gardées dans les tests ne contiennent ni identifiant ni adresse.
