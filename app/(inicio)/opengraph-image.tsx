import { ImageResponse } from "next/og";
import { PRODUCT } from "@/config/site";

export const alt = `${PRODUCT.name}: ${PRODUCT.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento da página inicial (WhatsApp, LinkedIn, X). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#0B0B0F", color: "#F4F4F6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: "#fff" }}>
            {PRODUCT.name[0]}
          </div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{PRODUCT.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>{PRODUCT.tagline}</div>
          <div style={{ fontSize: 30, color: "#B9B9C6", maxWidth: 900 }}>Quem comenta a palavra-chave recebe o material no direct.</div>
        </div>
      </div>
    ),
    size,
  );
}
