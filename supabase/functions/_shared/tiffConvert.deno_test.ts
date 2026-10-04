// Test de non-régression exécuté dans le runtime Deno (non couvert par Vitest) :
//   DENO_NO_PACKAGE_JSON=1 npx deno@2.1.4 test --no-lock supabase/functions/_shared/tiffConvert.deno_test.ts
import UTIF from "https://esm.sh/utif2@4.1.0?no-dts";
import { convertTiffToPng } from "./tiffConvert.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

Deno.test("convertTiffToPng : un TIFF valide ressort en PNG", () => {
  const w = 64, h = 48;
  const rgba = new Uint8Array(w * h * 4).fill(255);
  const tiff = new Uint8Array(UTIF.encodeImage(rgba, w, h));
  const png = convertTiffToPng(tiff);
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) throw new Error("signature PNG absente");
  }
});

Deno.test("convertTiffToPng : des octets quelconques sont refusés avec erreur explicite", () => {
  let erreur = "";
  try {
    convertTiffToPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  } catch (e) {
    erreur = (e as Error).message;
  }
  if (!erreur.includes("TIFF")) throw new Error("erreur attendue absente : " + erreur);
});
