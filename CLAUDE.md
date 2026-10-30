# cookexpert-bt : consignes

Ce projet pilote le Magimix Cook Expert Connect en Bluetooth, sans l'appli Magimix. Il est publié en open source (licence MIT). Le protocole est décrit dans PROTOCOLE.md, les choix dans DECISIONS.md, l'usage dans README.md.

- Tests : `npm test` (rejoue des trames réelles du robot). Vérification des types : `npm run verifier`.
- Outil : `node src/cli.ts` sans argument affiche l'aide. Avec `--essai`, rien n'est envoyé.
- Ne jamais ajouter d'envoi automatique de AUTO ou PULSE (voir DECISIONS.md).
- Toute nouvelle trame observée sur le robot va dans `src/protocole.test.ts`, avec sa date.
- Les fichiers de rétro-ingénierie (APK, sources décompilées, rapport de bug Android) restent hors du projet : ils contiennent du code Magimix ou des données personnelles.
- Jamais de nom ni d'adresse Bluetooth d'un robot réel, ni de modèle de téléphone : écrire « cook expert XXXXXX ».
- Les noms exportés par `src/protocole.ts` sont une interface publique : ne pas les renommer.
