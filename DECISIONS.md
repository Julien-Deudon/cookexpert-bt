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

## La balance se lit en Web Bluetooth

**La règle :** `src/balance.ts` décode les trames de la balance XL Connect et fabrique la tare et le changement d'unité. Le bouton UNIT ne propose que g, kg, lb et oz, et l'affichage est converti par l'appli.
**Pourquoi :** contrairement au robot, la balance parle en BLE, que Chrome gère sans appairage. L'appli Magimix ne propose que ces quatre unités, la balance ignore les millilitres, et celle essayée le 2026-10-30 continue d'envoyer des grammes après une commande d'unité.

## Les recettes Thermomix passent par la table de Cookomix

**La règle :** `src/conversion.ts` traduit « Cuire 25 min/120°C/vitesse 2. » avec la table de vitesses publiée par Cookomix, demi-vitesses au milieu de leurs voisines, vitesse plafonnée à 15 au-dessus de 60 °C. Le Varoma devient 120 °C. Le pétrin reste au programme Boulangerie, lancé à la main.
**Pourquoi :** c'est la table d'un site qui publie des milliers de recettes Thermomix, et elle colle aux tours/minute : sous ~250 tr/min, le Cook Expert ne tourne pas en continu, alors que les vitesses Thermomix 1 et 2 font 100 et 200 tr/min. La limite à chaud vient de la notice du robot. L'envoi du programme Boulangerie par Bluetooth n'a pas encore été essayé.
