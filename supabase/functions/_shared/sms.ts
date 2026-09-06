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

// Expéditeur unique pour toute la plateforme (06/09/2026) — un nom
// d'expéditeur alphanumérique par pharmacie a été tenté d'abord (le nom de
// la pharmacie elle-même), mais OVH exige un enregistrement ET une
// modération manuelle PAR expéditeur distinct ("Sms sender <nom> does not
// exists. Please create it first", confirmé en direct) : intenable pour un
// SaaS où chaque nouvelle pharmacie doit pouvoir envoyer des rappels dès son
// inscription. Un seul expéditeur, enregistré et validé une fois pour
// toutes, débloque toutes les pharmacies d'un coup — le nom de la pharmacie
// reste identifiable pour le patient via le corps du message lui-même (voir
// buildRappelMessage, _shared/rappelLogic.ts) plutôt que via l'expéditeur.
const PLATFORM_SENDER = "OrdoMail";

// Les numéros patients sont saisis et stockés en format national français
// ("0612345678", voir normalizeTel() côté RappelsSection.jsx — jamais
// converti en international) alors que l'API OVH exige l'E.164 ("+33...").
// Convertit ici, au point d'appel unique, plutôt que de faire porter ce
// détail de format à chaque appelant de sendSms().
function toE164France(raw: string): string {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return "+33" + digits.slice(1);
  return digits; // format déjà inconnu — laissé tel quel, OVH renverra une erreur explicite plutôt qu'un envoi silencieusement raté
}

// pharmacieNom : n'influence plus l'expéditeur SMS (voir PLATFORM_SENDER
// ci-dessus) — gardé pour le log en mode mock, où voir quelle pharmacie est
// à l'origine de l'envoi reste utile pour le débogage.
export async function sendSms(to: string, message: string, pharmacieNom: string): Promise<SendSmsResult> {
  const appKey      = Deno.env.get("OVH_APP_KEY");
  const appSecret   = Deno.env.get("OVH_APP_SECRET");
  const consumerKey = Deno.env.get("OVH_CONSUMER_KEY");
  const serviceName = Deno.env.get("OVH_SMS_SERVICE_NAME");

  if (!appKey || !appSecret || !consumerKey || !serviceName) {
    console.log(`[sms:mock] pharmacie="${pharmacieNom}" à="${to}" message="${message}"`);
    return { success: true, mocked: true };
  }

  const endpoint = OVH_ENDPOINTS[Deno.env.get("OVH_ENDPOINT") || "ovh-eu"] || OVH_ENDPOINTS["ovh-eu"];
  const url = `${endpoint}/sms/${serviceName}/jobs`;
  const body = JSON.stringify({
    message,
    receivers: [toE164France(to)],
    sender: PLATFORM_SENDER,
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
