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
  const digits = normaliserTelephone(tel);
  const prefix = digits[1];
  return prefix !== undefined && prefix !== "6" && prefix !== "7";
}

// Forme canonique d'un numéro français, "0X XX XX XX XX" ou "+33" ramené à
// cette même forme (03/10/2026, extrait pour le regroupement des rappels par
// patient — deux écritures du même numéro, saisies à des moments différents,
// doivent produire la même clé de regroupement).
export function normaliserTelephone(tel: string): string {
  const digits = (tel || "").replace(/[\s.-]/g, "");
  return digits.startsWith("+33") ? "0" + digits.slice(3) : digits;
}
