import { describe, expect, it } from "vitest"
import { BoxCollector, extractImei, extractSerial, orderImeis, type Detected } from "@/lib/barcode"

const IMEI_A = "490154203237518"
const IMEI_B = "356938035643809"
const at = (text: string, cx: number, cy: number, orientation = 0): Detected => ({ text, cx, cy, orientation })

describe("разбор штрихкодов коробки", () => {
  it("IMEI — только 15 цифр с верной контрольной цифрой", () => {
    expect(extractImei(IMEI_A)).toBe(IMEI_A)
    expect(extractImei("490154203237519")).toBeNull()
    expect(extractImei("0".repeat(32))).toBeNull() // EID
    expect(extractImei("194253433385")).toBeNull() // UPC
  })

  it("серийный номер: латиница и цифры, приставка Apple «S» убирается", () => {
    expect(extractSerial("SC9D52RHY00")).toBe("C9D52RHY00")
    expect(extractSerial("r5cw30abcde")).toBe("R5CW30ABCDE")
    expect(extractSerial("12345678")).toBeNull()
    expect(extractSerial("ABC")).toBeNull()
  })

  it("левый IMEI — первый, в одной колонке — верхний", () => {
    expect(orderImeis([at(IMEI_B, 800, 100), at(IMEI_A, 100, 100)], 1000, 1000)).toEqual([IMEI_A, IMEI_B])
    expect(orderImeis([at(IMEI_B, 100, 600), at(IMEI_A, 110, 200)], 1000, 1000)).toEqual([IMEI_A, IMEI_B])
  })

  it("коробку повернули на 90° — порядок тот же", () => {
    // после поворота «левый» оказался сверху
    expect(orderImeis([at(IMEI_B, 500, 900, 90), at(IMEI_A, 500, 100, 90)], 1000, 1000)).toEqual([IMEI_A, IMEI_B])
  })

  it("BoxCollector собирает IMEI с разных кадров, порядок с общего кадра, swap меняет местами", () => {
    const c = new BoxCollector()
    expect(c.add([at(IMEI_B, 800, 100)], 1000, 1000, true)).toBe(true)
    expect(c.add([at("SC9D52RHY00", 0, 0), at("194253433385", 0, 0)], 1000, 1000, true)).toBe(true)
    expect(c.ordered()).toEqual([IMEI_B])
    c.add([at(IMEI_B, 800, 100), at(IMEI_A, 100, 100)], 1000, 1000, true)
    expect(c.ordered()).toEqual([IMEI_A, IMEI_B])
    expect(c.serial).toBe("C9D52RHY00")
    expect(c.add([at(IMEI_A, 100, 100)], 1000, 1000, true)).toBe(false)
    c.swap()
    expect(c.ordered()).toEqual([IMEI_B, IMEI_A])
  })
})
