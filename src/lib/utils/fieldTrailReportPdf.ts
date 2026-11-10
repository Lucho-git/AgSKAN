// src/lib/utils/fieldTrailReportPdf.ts
// Lays out the field input report on a jsPDF document. Takes the document as
// a parameter (only the methods below are used) so the layout can be tested
// without a real PDF; saving / opening the file stays in the component.

import type { ReportData } from "./fieldTrailReport"

/** The subset of jsPDF this layout uses. */
export interface PdfDocLike {
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
  setFontSize(size: number): unknown
  setFont(name: string, style: string): unknown
  setTextColor(gray: number): unknown
  text(text: string, x: number, y: number, opts?: { align?: string }): unknown
  addImage(
    data: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): unknown
  addPage(): unknown
}

export interface ReportPdfOptions {
  fieldName: string
  recordCount: number
  includeWeather: boolean
  includeOperators: boolean
  includeProducts: boolean
}

const MARGIN = 40

export function writeReportPdf(
  doc: PdfDocLike,
  data: ReportData,
  opts: ReportPdfOptions,
): void {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - MARGIN * 2
  let y = MARGIN

  /** Start a new page if fewer than `room` points are left. */
  const ensureRoom = (room: number) => {
    if (y > pageH - room) {
      doc.addPage()
      y = MARGIN
    }
  }

  /** Grey right-aligned "Source: …" next to a section heading. */
  const sourceNote = (source: string) => {
    if (!source) return
    doc.setFontSize(8)
    doc.setTextColor(130)
    doc.text(`Source: ${source}`, pageW - MARGIN, y, { align: "right" })
    doc.setTextColor(0)
  }

  /** Bold header row then one line per row, breaking pages as needed. */
  const table = (
    headers: string[],
    widths: number[],
    rows: unknown[][],
  ) => {
    let cx = MARGIN
    headers.forEach((h, i) => {
      doc.setFont("helvetica", "bold")
      doc.text(h, cx, y)
      cx += widths[i] * contentW
    })
    y += 12
    doc.setFont("helvetica", "normal")
    for (const vals of rows) {
      ensureRoom(30)
      cx = MARGIN
      vals.forEach((v, i) => {
        doc.text(String(v), cx, y)
        cx += widths[i] * contentW
      })
      y += 11
    }
  }

  // Title
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text(`Input Report — ${opts.fieldName}`, MARGIN, y)
  y += 24

  // Summary
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Summary", MARGIN, y)
  y += 14
  doc.setFont("helvetica", "normal")
  const summary = [
    `Field: ${opts.fieldName}`,
    `Crop: ${data.crop}`,
    `Started: ${data.started}`,
    `Completed: ${data.completed}`,
    `Treated Area: ${data.treatedArea} ha`,
    `Total Distance: ${data.totalDistance} km`,
    `Records: ${opts.recordCount}`,
    ...(opts.includeOperators
      ? [
          `Operators: ${data.operators}`,
          `Total Operating Hours: ${data.totalOperatingTime}`,
        ]
      : []),
  ]
  for (const line of summary) {
    doc.text(line, MARGIN, y)
    y += 14
  }
  y += 10

  // Map snapshot
  if (data.snapshot) {
    doc.setFont("helvetica", "bold")
    doc.text("Coverage Map", MARGIN, y)
    y += 10
    const imgW = contentW
    const imgH = imgW * 0.6
    try {
      doc.addImage(data.snapshot, "PNG", MARGIN, y, imgW, imgH)
      y += imgH + 16
    } catch {
      doc.text("[Map snapshot unavailable]", MARGIN, y)
      y += 14
    }
  }

  // Products
  if (opts.includeProducts && data.products?.length) {
    ensureRoom(80)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("Inputs Applied", MARGIN, y)
    sourceNote(data.productsSource)
    y += 14
    doc.setFontSize(9)
    table(
      ["Product", "Active Ingredient", "Rate", "Usage"],
      [0.26, 0.28, 0.2, 0.24],
      data.products.map((p) =>
        [p.name, p.activeIngredient, p.rate, p.usage].map((v) =>
          String(v).split("\n").join(" / "),
        ),
      ),
    )
    y += 10
  }

  // Operating hours
  if (opts.includeOperators && data.operatingHours?.length) {
    ensureRoom(80)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text(
      `Operating Hours (Total: ${data.totalOperatingTime})`,
      MARGIN,
      y,
    )
    y += 14
    doc.setFontSize(9)
    table(
      ["Date", "Entry", "Exit", "Duration", "Operator"],
      [0.24, 0.16, 0.16, 0.16, 0.28],
      data.operatingHours.map((oh) => [
        oh.date,
        oh.entry,
        oh.exit,
        oh.duration,
        oh.operator,
      ]),
    )
    y += 10
  }

  // Weather
  if (opts.includeWeather && data.weather?.length) {
    ensureRoom(80)
    doc.setFont("helvetica", "bold")
    doc.text("Weather Records", MARGIN, y)
    sourceNote(data.weatherSource)
    y += 14
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    table(
      ["Time", "Conditions", "Temp", "Wind", "Gust", "Humidity", "Delta T"],
      [0.22, 0.16, 0.08, 0.16, 0.1, 0.1, 0.1],
      data.weather.map((w) => [
        w.time,
        w.conditions,
        `${w.temp ?? "-"}°C`,
        `${w.windSpeed ?? "-"} km/h ${w.windDir ?? ""}`,
        `${w.gust ?? "-"} km/h`,
        `${w.humidity ?? "-"}%`,
        w.deltaT ?? "-",
      ]),
    )
    y += 10
  } else if (opts.includeWeather) {
    ensureRoom(40)
    doc.setFont("helvetica", "bold")
    doc.text("Weather Records", MARGIN, y)
    sourceNote(data.weatherSource)
    y += 14
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text(
      data.weatherError
        ? `Weather lookup failed: ${data.weatherError}`
        : "No weather data available for the working hours.",
      MARGIN,
      y,
    )
    doc.setTextColor(0)
    y += 10
  }

  // Operations (cost column only alongside inputs)
  if (data.operations?.length) {
    ensureRoom(60)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("Operations", MARGIN, y)
    y += 14
    doc.setFontSize(9)
    const withCost = opts.includeProducts
    table(
      withCost
        ? ["Operation", "Rate", "Area", "Cost"]
        : ["Operation", "Rate", "Area"],
      withCost ? [0.35, 0.2, 0.2, 0.2] : [0.4, 0.3, 0.3],
      data.operations.map((op) =>
        withCost
          ? [op.name, op.rate, op.area, op.cost]
          : [op.name, op.rate, op.area],
      ),
    )
  }
}

/** Download file name for the report. */
export function reportFileName(fieldName: string, now: Date = new Date()): string {
  return `input-report-${fieldName}-${now.toISOString().split("T")[0]}.pdf`
}
