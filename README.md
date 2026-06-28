# 💊 OrdoMail — Guide de déploiement

> Simplifier et sécuriser la réception des ordonnances.

## Déploiement en 5 minutes sur Vercel (recommandé)

### Option A — Glisser-déposer (le plus simple)

1. Aller sur **vercel.com** → créer un compte gratuit
2. Cliquer **"Add New Project"**
3. Choisir **"Import Third-Party Git Repository"** ou glisser le dossier
4. Framework : **Vite**
5. Cliquer **Deploy**
6. ✅ Votre URL : `https://ordomail-xxxx.vercel.app`

---

### Option B — Via GitHub (recommandé pour les mises à jour)

```bash
# 1. Installer Git si nécessaire : git-scm.com
# 2. Créer un dépôt sur github.com (nouveau dépôt privé "ordomail")

# 3. Dans ce dossier :
git init
git add .
git commit -m "OrdoMail v5.1 — déploiement initial"
git branch -M main
git remote add origin https://github.com/VOTRE_NOM/ordomail.git
git push -u origin main

# 4. Sur vercel.com : Import Git Repository → choisir ordomail
# Vercel redéploie automatiquement à chaque git push
```

---

### Option C — Netlify (alternative)

```bash
npm run build
# Glisser le dossier dist/ sur app.netlify.com/drop
```

---

## Démarrage en local (tests)

```bash
# Installer les dépendances (une seule fois)
npm install

# Lancer en développement
npm run dev
# Ouvrir http://localhost:5173

# Construire pour la production
npm run build
npm run preview  # tester le build avant déploiement
```

---

## Comptes de démonstration

| Rôle | Email / Méthode | Mot de passe / PIN |
|------|-----------------|-------------------|
| Titulaire admin | Bouton Pro Santé Connect | (simulation automatique) |
| Pharmacie 1 | contact@pharmaciecentrale.fr | demo123 |
| Pharmacie 2 | pharma@soleil.fr | demo123 |
| Vendeur — Poste Accueil | PIN | 1234 |
| Vendeur — Poste Caisse | PIN | 5678 |
| Super-Admin OrdoMail | admin@ordomail.fr | admin2025 |
| Backoffice Business | admin@ordomail.fr | admin2025 |

---

## Structure du projet

```
ordomail/
├── src/
│   ├── App.jsx          ← Application complète (landing + dashboard + billing)
│   └── main.jsx         ← Point d'entrée React
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.js
├── vercel.json          ← Configuration Vercel (SPA routing)
├── netlify.toml         ← Configuration Netlify (alternative)
├── package.json
└── README.md
```

---

## Configurer votre nom de domaine

### Sur Vercel
1. Dashboard → Project → **Settings → Domains**
2. Taper `ordomail.fr` (ou votre domaine)
3. Chez votre registrar (OVH, Gandi…) → DNS → ajouter :
   - `CNAME www → cname.vercel-dns.com`
   - `A @ → 76.76.21.21`
4. Attendre 5–30 min → badge **Valid** ✅
5. HTTPS automatique via Let's Encrypt

---

## Variables d'environnement (production future)

Créer un fichier `.env.local` (jamais committer) :

```env
VITE_API_URL=https://votre-backend.railway.app
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## Roadmap technique

| Version | Quand | Contenu |
|---------|-------|---------|
| v5.1 (actuelle) | Maintenant | App complète, données en mémoire |
| v1.1 | +3 mois | Supabase persistance, OTP email réel, Stripe actif |
| v1.2 | +6 mois | PSC BAS ANS, OCR PaddleOCR local, LGO Winpharma |
| v2.0 | +12 mois | Certification HDS, WebSockets, app mobile |
