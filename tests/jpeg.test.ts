import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { jpegSize } from "@/lib/jpeg";

describe("tamanho do JPEG", () => {
  it("lê largura e altura das imagens de teste", () => {
    expect(jpegSize(fs.readFileSync("tests/fixtures/imagem-4x5.jpg"))).toEqual({ width: 1080, height: 1350 });
    expect(jpegSize(fs.readFileSync("tests/fixtures/story-9x16.jpg"))).toEqual({ width: 1080, height: 1920 });
  });
  it("recusa o que não é JPEG", () => {
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(jpegSize(new Uint8Array([]))).toBeNull();
  });
});
