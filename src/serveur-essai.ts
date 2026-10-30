// Sert la page d'essai Web Serial sur http://localhost:8080. « localhost » compte comme contexte
// sécurisé, y compris sur le téléphone via `adb reverse tcp:8080 tcp:8080`.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';

const port = Number(process.env.PORT ?? 8080);
const fichiers: Record<string, [URL, string]> = {
  '/': [new URL('../essai-web/index.html', import.meta.url), 'text/html'],
  '/essai.js': [new URL('../essai-web/essai.js', import.meta.url), 'text/javascript'],
};

createServer(async (requete, reponse) => {
  try {
    const chemin = (requete.url ?? '/').split('?')[0];
    if (chemin === '/protocole.js') {
      // Le même protocole que l'outil en ligne de commande, types effacés à la volée.
      const source = await readFile(new URL('./protocole.ts', import.meta.url), 'utf8');
      reponse.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(stripTypeScriptTypes(source));
      return;
    }
    const fichier = fichiers[chemin];
    if (!fichier) {
      reponse.writeHead(404).end();
      return;
    }
    reponse.writeHead(200, { 'content-type': `${fichier[1]}; charset=utf-8` }).end(await readFile(fichier[0]));
  } catch (erreur) {
    reponse.writeHead(500).end(String(erreur));
  }
}).listen(port, () => console.log(`Page d'essai : http://localhost:${port}`));
