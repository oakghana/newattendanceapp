export type SignatureHologramContext = "transport" | "general" | string | null | undefined

export function getSignatureHologramText(context?: SignatureHologramContext): string {
  const normalized = String(context ?? "").trim().toLowerCase()
  return normalized === "transport" ? "QCCTRANSPORT" : "QCCINTRANET"
}
