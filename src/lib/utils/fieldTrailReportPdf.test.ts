import { describe, expect, it } from "vitest"
import type { ReportData } from "./fieldTrailReport"
import { reportFileName, writeReportPdf, type PdfDocLike } from "./fieldTrailReportPdf"

// Records every text call and page break, so the layout can be checked
// without generating a real PDF.
function fakeDoc(height = 842) {
  const texts: Array<{ text: string; page: number; y: number }> = []
  let page = 1
  const doc: PdfDocLike & { texts: typeof texts; pages: () => number; images: number } = {
    texts,
    images: 0,
    pages: () => page,
    internal: { pageSize: { getWidth: () => 595, getHeight: () => height } },
    setFontSize: () => {},
    setFont: () => {},
    setTextColor: () => {},
    text: (text, _x, y) => void texts.push({ text, page, y }),
    addImage: () => {
      doc.images++
    },
    addPage: () => void page++,
  }
  return doc
}

const data: ReportData = {
  crop: "Wheat",
  started: "3 Mar 2026, 8:00 am",
  completed: "3 Mar 2026, 11:00 am",
  treatedArea: "10.50",
  totalDistance: "5.25",
  operators: "Kim",
  totalOperatingTime: "2h 15m",
  operatingHours: [
    { date: "3 Mar 2026", entry: "8:00", exit: "9:30", duration: "1h 30m", operator: "Kim" },
  ],
  snapshot: "data:image/png;base64,xx",
  weather: [],
  weatherSource: "",
  weatherError: "no weather data returned",
  products: [{ name: "Gly\nphosate", activeIngredient: "—", rate: "2", usage: "—" }],
  productsSource: "Agworld",
  operations: [{ name: "Spray", rate: "1 ha/ha", area: "10.50 ha", cost: "$210.00" }],
}

const opts = {
  fieldName: "North Paddock",
  recordCount: 2,
  includeWeather: true,
  includeOperators: true,
  includeProducts: true,
}

const textOf = (doc: ReturnType<typeof fakeDoc>) => doc.texts.map((t) => t.text)

describe("writeReportPdf", () => {
  it("writes every section", () => {
    const doc = fakeDoc()
    writeReportPdf(doc, data, opts)
    const text = textOf(doc)
    expect(text[0]).toBe("Input Report — North Paddock")
    expect(text).toContain("Records: 2")
    expect(text).toContain("Operators: Kim")
    expect(text).toContain("Inputs Applied")
    expect(text).toContain("Source: Agworld")
    expect(text).toContain("Gly / phosate")
    expect(text).toContain("Operating Hours (Total: 2h 15m)")
    expect(text).toContain("Weather lookup failed: no weather data returned")
    expect(text).toContain("Cost")
    expect(text).toContain("$210.00")
    expect(doc.images).toBe(1)
  })

  it("leaves out optional sections", () => {
    const doc = fakeDoc()
    writeReportPdf(doc, { ...data, snapshot: "" }, {
      ...opts,
      includeWeather: false,
      includeOperators: false,
      includeProducts: false,
    })
    const text = textOf(doc)
    expect(text).not.toContain("Operators: Kim")
    expect(text).not.toContain("Inputs Applied")
    expect(text).not.toContain("Weather Records")
    expect(text).not.toContain("Cost")
    expect(text).not.toContain("Coverage Map")
    expect(text).toContain("Operations")
  })

  it("writes weather rows", () => {
    const doc = fakeDoc()
    writeReportPdf(
      doc,
      {
        ...data,
        weatherSource: "Open-Meteo · ERA5",
        weather: [
          {
            time: "3 Mar, 9:00",
            conditions: "Clear",
            temp: 20,
            windSpeed: null,
            windDir: "",
            gust: 30,
            humidity: 40,
            deltaT: null,
            rain: 0,
          },
        ],
      },
      opts,
    )
    const text = textOf(doc)
    expect(text).toContain("Source: Open-Meteo · ERA5")
    expect(text).toContain("20°C")
    expect(text).toContain("- km/h ")
    expect(text).toContain("30 km/h")
  })

  it("breaks pages for long tables", () => {
    const doc = fakeDoc()
    const many = Array.from({ length: 120 }, (_, i) => ({
      ...data.operatingHours[0],
      date: `row ${i}`,
    }))
    writeReportPdf(doc, { ...data, operatingHours: many }, opts)
    expect(doc.pages()).toBeGreaterThan(1)
    for (const t of doc.texts) expect(t.y).toBeLessThanOrEqual(842)
  })
})

describe("reportFileName", () => {
  it("includes the field and date", () => {
    expect(reportFileName("North", new Date("2026-03-03T05:00:00Z"))).toBe(
      "input-report-North-2026-03-03.pdf",
    )
  })
})
