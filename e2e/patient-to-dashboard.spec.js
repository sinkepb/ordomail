// E2E — Dépôt patient (QR code, démo) et dashboard vendeur.
//
// Deux tests séparés plutôt qu'un seul parcours chaîné : après l'envoi, le
// patient reste sur un écran "salle d'attente" (stories/quiz santé, voir
// PatientPage.jsx PatientStories) sans bouton de retour — un vrai patient
// attend physiquement en pharmacie, il n'a aucune raison de "revenir" vers le
// site vitrine. Un vrai vendeur est sur un appareil séparé, connecté au
// préalable, et verrait la mise à jour en direct (Realtime) — pas modélisable
// dans une seule page/onglet en mode démo, où la base mock
// (window._ordomailDB) vit en mémoire par instance de page, pas partagée
// entre onglets. Le dashboard est donc vérifié séparément contre les
// ordonnances de démonstration déjà présentes (voir makeOrdos() dans App.jsx).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILE = path.join(__dirname, 'fixtures', 'test-ordonnance.jpg');

test('un patient dépose une ordonnance par QR code et reçoit son code', async ({ page }) => {
  const nomPatient = `E2E TEST ${Date.now()}`;

  await page.goto('/?patient=ph1'); // pharmacie "ph1" = Pharmacie Centrale, voir App.jsx
  await expect(page.getByPlaceholder('Ex : MARTIN Pierre')).toBeVisible();

  await page.getByPlaceholder('Ex : MARTIN Pierre').fill(nomPatient);
  await page.locator('input[type="file"]').setInputFiles(TEST_FILE);

  const submitBtn = page.getByRole('button', { name: /Envoyer l'ordonnance/ });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  // OCR (Tesseract, même en démo) peut prendre plusieurs secondes au premier envoi.
  await expect(page.getByText('Votre code')).toBeVisible({ timeout: 20_000 });
  // Code patient : 3 chiffres + 1 lettre insérée à une position aléatoire
  // (voir generateCode() dans PatientPage.jsx) — 4 caractères au total.
  await expect(page.locator('text=/^[0-9A-Z]{4}$/')).toBeVisible();

  // La soumission a bien écrit dans la base démo partagée que lit le dashboard
  // vendeur (fetchOrdonnances → ph.ordonnances, voir src/lib/supabase/ordonnances.js).
  const found = await page.evaluate((nom) => {
    const ph = window._ordomailDB?.pharmacies?.find(p => p.id === 'ph1');
    return ph?.ordonnances?.some(o => o.fromName === nom) ?? false;
  }, nomPatient);
  expect(found).toBe(true);
});

test('un vendeur se connecte par code pharmacie + PIN et voit les ordonnances de sa pharmacie', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connexion' }).click();
  await page.getByRole('button', { name: 'Connexion vendeur' }).click();

  // Code pharmacie 6 chiffres (Pharmacie Centrale, voir App.jsx codeVendeur).
  await page.getByPlaceholder('123456').fill('123456');
  await expect(page.getByText('Pharmacie Centrale')).toBeVisible();

  // Clavier PIN à l'écran (pas un <input> texte classique) — Poste Accueil, PIN 1234.
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }

  // Ordonnances de démonstration seedées par makeOrdos() dans App.jsx.
  await expect(page.getByText('MARTIN Pierre')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/À traiter/i)).toBeVisible();
});
