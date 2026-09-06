// ─── Adaptateur SMS — OVHcloud SMS (06/09/2026) ──────────────────────────────
// Remplace le mock du 04/09/2026 (lancement des rappels de renouvellement,
// voir rappelLogic.ts) — décision utilisateur : un service 100% SMS,
// prépayé, sans abonnement ni fonctionnalités superflues (écarté Brevo pour
// cette raison). Reste un adaptateur : rappelLogic.ts n'a pas changé, seule
// cette fonction sait qui elle appelle.
//
// L'API OVH n'utilise PAS un simple en-tête "api-key" comme la plupart des
// fournisseurs SMS — chaque requête est signée (AK/AS/CK + horodatage, voir
// plus bas). Reste en mode mock (comme avant) si les secrets ne sont pas
// configurés, pour ne jamais casser le pipeline en environnement non
// configuré (ex. preview fraîchement clonée).
//
// Secrets requis (supabase secrets set) :
//   OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY, OVH_SMS_SERVICE_NAME
// Optionnel : OVH_ENDPOINT ("ovh-eu" par défaut — voir OVH_ENDPOINTS).
export interface SendSmsResult {
  success: boolean;
  mocked: boolean;
  error?: string;
}

const OVH_ENDPOINTS: Record<string, string> = {
  "ovh-eu": "https://eu.api.ovh.com/1.0",
  "ovh-ca": "https://ca.api.ovh.com/1.0",
  "ovh-us": "https://api.us.ovhcloud.com/1.0",
};

async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Expéditeur alphanumérique OVH : 3 à 11 caractères, lettres/chiffres/espaces
// uniquement (pas d'accents ni de ponctuation) — sinon l'envoi est rejeté.
// Le nom de la pharmacie ("Pharmacie de la Grâce") ne rentre presque jamais
// tel quel : on le nettoie et tronque automatiquement plutôt que de faire
// échouer l'envoi ou d'exiger une saisie manuelle supplémentaire.
// ̀-ͯ : bloc Unicode des marques diacritiques combinantes — une
// fois le nom passé en forme NFD (ex. "é" -> "e" + accent combinant séparé),
// les retirer isole les lettres de base sans dépendre d'une table par langue.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function sanitizeSender(name: string): string {
  const ascii = (name || "")
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-zA-Z0-9 ]/g, "") // tout le reste (ponctuation, etc.)
    .trim();
  const trimmed = ascii.slice(0, 11);
  return trimmed.length >= 3 ? trimmed : "OrdoMail";
}

export async function sendSms(to: string, message: string, senderName: string): Promise<SendSmsResult> {
  const appKey      = Deno.env.get("OVH_APP_KEY");
  const appSecret   = Deno.env.get("OVH_APP_SECRET");
  const consumerKey = Deno.env.get("OVH_CONSUMER_KEY");
  const serviceName = Deno.env.get("OVH_SMS_SERVICE_NAME");

  if (!appKey || !appSecret || !consumerKey || !serviceName) {
    console.log(`[sms:mock] de="${senderName}" à="${to}" message="${message}"`);
    return { success: true, mocked: true };
  }

  const endpoint = OVH_ENDPOINTS[Deno.env.get("OVH_ENDPOINT") || "ovh-eu"] || OVH_ENDPOINTS["ovh-eu"];
  const url = `${endpoint}/sms/${serviceName}/jobs`;
  const body = JSON.stringify({
    message,
    receivers: [to],
    sender: sanitizeSender(senderName),
    senderForResponse: false,
    // SMS de service (rappel de renouvellement), pas une campagne marketing —
    // la clause STOP obligatoire ne s'applique qu'aux SMS commerciaux, et
    // manger des caractères dessus serait contre-productif (voir déjà
    // buildRappelMessage/shortToken.ts : chaque caractère compte en UCS-2).
    noStopClause: true,
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = "$1$" + await sha1Hex(`${appSecret}+${consumerKey}+POST+${url}+${body}+${timestamp}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "X-Ovh-Application": appKey,
        "X-Ovh-Consumer": consumerKey,
        "X-Ovh-Timestamp": timestamp,
        "X-Ovh-Signature": signature,
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { success: false, mocked: false, error: errText };
    }
    return { success: true, mocked: false };
  } catch (e) {
    return { success: false, mocked: false, error: (e as Error).message };
  }
}
