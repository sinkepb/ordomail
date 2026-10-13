// Tests de la validation serveur des ordonnances déposées par QR code
// (submit-ordonnance) — voir @phase1-security dans index.ts.
import { describe, it, expect } from "vitest";
import { isValidPatientCode, validateFile, magicBytesMatch, MAX_FILE_SIZE_BYTES } from "./upload-validation.ts";

const JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
const PNG_BYTES  = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const PDF_BYTES  = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // %PDF-1.4
const HTML_BYTES = new Uint8Array([0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3E]); // <script>

describe("isValidPatientCode", () => {
  it("accepte un code valide (3 chiffres + 1 lettre, position quelconque)", () => {
    expect(isValidPatientCode("1A23")).toBe(true);
    expect(isValidPatientCode("A123")).toBe(true);
    expect(isValidPatientCode("123A")).toBe(true);
  });

  it("rejette un code purement numérique (ancien format prévisible)", () => {
    expect(isValidPatientCode("1234")).toBe(false);
  });

  it("rejette un code trop court ou trop long", () => {
    expect(isValidPatientCode("1A2")).toBe(false);
    expect(isValidPatientCode("1A234")).toBe(false);
  });

  it("rejette un code avec plusieurs lettres", () => {
    expect(isValidPatientCode("1AB2")).toBe(false);
  });

  it("rejette une chaîne vide", () => {
    expect(isValidPatientCode("")).toBe(false);
  });
});

describe("validateFile", () => {
  it("accepte un JPEG sous la limite de taille", () => {
    const result = validateFile({ name: "ordo.jpg", type: "image/jpeg", size: 1024 * 1024 });
    expect(result.ok).toBe(true);
  });

  it("accepte un PDF sous la limite de taille", () => {
    const result = validateFile({ name: "ordo.pdf", type: "application/pdf", size: 1024 });
    expect(result.ok).toBe(true);
  });

  // @fix 03/10/2026 (retour pharmacien — LGO qui exporte en .tiff) — accepté
  // en entrée uniquement, converti en PNG au dépôt avant stockage (voir
  // _shared/tiffConvert.ts), jamais stocké tel quel.
  it("accepte un TIFF (.tiff) sous la limite de taille", () => {
    const result = validateFile({ name: "ordo.tiff", type: "image/tiff", size: 1024 });
    expect(result.ok).toBe(true);
  });

  it("accepte un TIFF (.tif, MIME x-tiff)", () => {
    const result = validateFile({ name: "ordo.tif", type: "image/x-tiff", size: 1024 });
    expect(result.ok).toBe(true);
  });

  it("rejette un fichier dépassant 15 Mo", () => {
    const result = validateFile({ name: "ordo.jpg", type: "image/jpeg", size: MAX_FILE_SIZE_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/volumineux/i);
  });

  it("rejette un type MIME non autorisé (ex: exécutable)", () => {
    const result = validateFile({ name: "malware.exe", type: "application/x-msdownload", size: 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/non autorisé/i);
  });

  it("rejette une extension usurpée (MIME image mais extension .exe)", () => {
    const result = validateFile({ name: "ordo.exe", type: "image/jpeg", size: 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejette un MIME usurpé (extension .jpg mais MIME non image)", () => {
    const result = validateFile({ name: "ordo.jpg", type: "application/x-msdownload", size: 1024 });
    expect(result.ok).toBe(false);
  });
});

describe("magicBytesMatch", () => {
  it("accepte des octets JPEG/PNG/PDF cohérents avec leur extension", () => {
    expect(magicBytesMatch(JPEG_BYTES, "jpg")).toBe(true);
    expect(magicBytesMatch(JPEG_BYTES, "jpeg")).toBe(true);
    expect(magicBytesMatch(PNG_BYTES, "png")).toBe(true);
    expect(magicBytesMatch(PDF_BYTES, "pdf")).toBe(true);
  });

  it("rejette un contenu HTML déguisé en image ou PDF", () => {
    expect(magicBytesMatch(HTML_BYTES, "jpg")).toBe(false);
    expect(magicBytesMatch(HTML_BYTES, "png")).toBe(false);
    expect(magicBytesMatch(HTML_BYTES, "pdf")).toBe(false);
  });

  it("rejette une extension sans signature connue", () => {
    expect(magicBytesMatch(JPEG_BYTES, "exe")).toBe(false);
  });
});

describe("validateFile avec les octets réels", () => {
  it("accepte un JPEG dont les octets correspondent à sa déclaration", () => {
    const result = validateFile({ name: "ordo.jpg", type: "image/jpeg", size: 1024 }, JPEG_BYTES);
    expect(result.ok).toBe(true);
  });

  it("rejette un fichier HTML renommé en .jpg avec un Content-Type falsifié", () => {
    const result = validateFile({ name: "ordo.jpg", type: "image/jpeg", size: 1024 }, HTML_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/contenu du fichier/i);
  });

  it("ne vérifie pas les octets si l'appelant ne les fournit pas (compatibilité)", () => {
    const result = validateFile({ name: "ordo.jpg", type: "image/jpeg", size: 1024 });
    expect(result.ok).toBe(true);
  });
});
