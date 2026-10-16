import { describe, expect, it } from "vitest"
import { normModel, phoneMatchesOffer, similarModel } from "@/lib/kaspi-match"
import { entryQuantity, phoneEntries, unitPrices } from "@/lib/kaspi-order"

describe("модели для прайса Kaspi", () => {
  it("normModel: регистр, пробелы и марка в начале не важны", () => {
    expect(normModel("  Apple   iPhone 15 Pro ")).toBe("iphone 15 pro")
    expect(normModel("Samsung Galaxy S24")).toBe("galaxy s24")
    expect(normModel("Xiaomi Redmi Note 13")).toBe("redmi note 13")
    expect(normModel("iPhone 15")).toBe("iphone 15")
    expect(normModel("Apple")).toBe("apple") // одна марка — не стираем
    expect(normModel("Galaxy S24")).toBe("galaxy s24") // серия — не марка
  })

  it("phoneMatchesOffer: модель после нормализации, память и цвет — если указаны у товара", () => {
    const offer = { model: "iPhone 15 Pro", memoryGb: 256, color: null }
    expect(phoneMatchesOffer({ model: "Apple iPhone 15 Pro", memoryGb: 256, color: "Black" }, offer)).toBe(true)
    expect(phoneMatchesOffer({ model: "iPhone 15 Pro", memoryGb: 128, color: null }, offer)).toBe(false)
    expect(phoneMatchesOffer({ model: "iPhone 15 Pro Max", memoryGb: 256, color: null }, offer)).toBe(false)
    expect(phoneMatchesOffer({ model: "iPhone 15 Pro", memoryGb: 256, color: " black " }, { ...offer, color: "Black" })).toBe(true)
  })

  it("similarModel: одна модель содержит другую", () => {
    expect(similarModel("iPhone 15", "Apple iPhone 15 Pro")).toBe(true)
    expect(similarModel("iPhone 15 Pro Max", "iphone 15 pro")).toBe(true)
    expect(similarModel("Galaxy S24", "Samsung Galaxy S24 Ultra")).toBe(true)
    expect(similarModel("iPhone 15", "Galaxy S24")).toBe(false)
    expect(similarModel("", "iPhone 15")).toBe(false)
  })
})

describe("позиции заказа Kaspi", () => {
  it("unitPrices: делим сумму по штукам без потери тенге", () => {
    expect(unitPrices(1_000_001, 2)).toEqual([500_001, 500_000])
    expect(unitPrices(10, 3)).toEqual([4, 3, 3])
    expect(unitPrices(500, 1)).toEqual([500])
  })

  it("phoneEntries: позиции с IMEI; без отметок — единственная позиция, если заказ требует IMEI", () => {
    const e = (id: string | undefined, imeiRequired?: boolean) => ({ id, name: id ?? "", code: null, quantity: 1, price: 1, total: 1, imeiRequired })
    expect(phoneEntries([e("a", true), e("b", false)], true).map((x) => x.id)).toEqual(["a"])
    expect(phoneEntries([e("a")], true).map((x) => x.id)).toEqual(["a"])
    expect(phoneEntries([e("a")], false)).toEqual([])
    expect(phoneEntries([e("a"), e("b")], true)).toEqual([])
    expect(entryQuantity({ ...e("a"), quantity: 0 })).toBe(1)
  })
})
