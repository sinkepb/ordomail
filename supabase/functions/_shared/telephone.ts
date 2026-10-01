// OrdoMail — détection fixe/mobile par préfixe (30/09/2026)
// @fix (retour titulaire) — les patients âgés n'ont pas tous un mobile
// capable de recevoir un SMS ; leur rappel doit passer en mode "à appeler"
// plutôt que d'attendre indéfiniment une réponse à un SMS jamais reçu.
//
// Plan de numérotation français : 06/07 = mobile, 01-05/08/09 = fixe (y
// compris les fixes "non géographiques" de box internet en 09). Le préfixe
// ne change jamais dans le temps, même en cas de portabilité — fiable sans
// dépendre d'un service externe. Un numéro vide/invalide n'a pas de préfixe
// exploitable : replié sur "non-fixe" (mode SMS, le comportement par défaut
// historique) plutôt que de bloquer la création du rappel.
export function estNumeroFixe(tel: string): boolean {
  const digits = (tel || "").replace(/[\s.-]/g, "");
  const local = digits.startsWith("+33") ? "0" + digits.slice(3) : digits;
  const prefix = local[1];
  return prefix !== undefined && prefix !== "6" && prefix !== "7";
}
