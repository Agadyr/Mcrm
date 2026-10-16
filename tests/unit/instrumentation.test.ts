import { afterEach, describe, expect, it, vi } from "vitest"
import { onRequestError } from "@/instrumentation"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("onRequestError", () => {
  it("пишет в лог одну строку JSON с маршрутом, методом и digest", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = Object.assign(new Error("boom"), { digest: "123456" })
    await onRequestError(
      error,
      { path: "/phones/abc", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/(app)/phones/[id]", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined }
    )
    expect(log).toHaveBeenCalledTimes(1)
    const [prefix, line] = log.mock.calls[0]
    expect(prefix).toBe("[request-error]")
    expect(JSON.parse(line as string)).toMatchObject({
      level: "error",
      message: "boom",
      digest: "123456",
      method: "GET",
      path: "/phones/abc",
      route: "/(app)/phones/[id]",
      routeType: "render",
    })
  })

  it("переживает брошенное не-Error значение", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    await onRequestError("строка", { path: "/", method: "POST", headers: {} }, {
      routerKind: "App Router",
      routePath: "/",
      routeType: "action",
      revalidateReason: undefined,
    })
    expect(JSON.parse(log.mock.calls[0][1] as string)).toMatchObject({ message: "строка", method: "POST", routeType: "action" })
  })
})
