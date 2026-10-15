import { describe, expect, it } from "vitest"
import { decryptSecret, encryptSecret } from "@/lib/secret-box"

describe("шифрование секретов", () => {
  it("расшифровывается обратно, каждый раз — разный шифротекст", () => {
    const a = encryptSecret("kaspi-token-123")
    const b = encryptSecret("kaspi-token-123")
    expect(a).not.toBe(b)
    expect(a).not.toContain("kaspi-token-123")
    expect(decryptSecret(a)).toBe("kaspi-token-123")
  })

  it("подменённый шифротекст не расшифровывается", () => {
    const [iv, tag, data] = encryptSecret("секрет").split(".")
    const broken = [iv, tag, Buffer.from("подмена").toString("base64")].join(".")
    expect(() => decryptSecret(broken)).toThrow()
    expect(data).toBeTruthy()
  })
})
