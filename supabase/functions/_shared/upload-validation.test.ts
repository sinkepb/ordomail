// Tests de la validation serveur des ordonnances déposées par QR code
// (submit-ordonnance) — voir @phase1-security dans index.ts.
import { describe, it, expect } from "vitest";
import { isValidPatientCode, validateFile, MAX_FILE_SIZE_BYTES } from "./upload-validation.ts";

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
