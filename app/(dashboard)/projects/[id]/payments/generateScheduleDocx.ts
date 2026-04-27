import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, BorderStyle, ShadingType,
  HeadingLevel,
} from 'docx'
import type { SchedulePhase } from './ScheduleOfWorksPDF'

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' }
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

// ── Column widths (twips: 9072 = full width of A4 minus margins) ───────────────
const COL_TASK_PCT  = 78
const COL_PRICE_PCT = 22

function cell(
  text: string,
  opts: {
    bold?: boolean
    right?: boolean
    shade?: string
    indent?: boolean
    size?: number
  } = {}
): TableCell {
  return new TableCell({
    width: { size: opts.right ? COL_PRICE_PCT : COL_TASK_PCT, type: WidthType.PERCENTAGE },
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade, color: 'auto' } : undefined,
    borders: ALL_BORDERS,
    children: [
      new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        indent: opts.indent ? { left: 240 } : undefined,
        children: [
          new TextRun({
            text,
            bold: opts.bold ?? false,
            size: (opts.size ?? 22),
            font: 'Calibri',
          }),
        ],
      }),
    ],
  })
}

function phaseHeaderRow(name: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
        borders: ALL_BORDERS,
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: name.toUpperCase(), bold: true, size: 20, font: 'Calibri', color: '374151' }),
            ],
          }),
        ],
      }),
    ],
  })
}

function taskRow(taskName: string, contractValue: number, alt: boolean): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: COL_TASK_PCT, type: WidthType.PERCENTAGE },
        shading: alt ? { type: ShadingType.CLEAR, fill: 'FAFAFA', color: 'auto' } : undefined,
        borders: ALL_BORDERS,
        children: [
          new Paragraph({
            indent: { left: 240 },
            children: [new TextRun({ text: taskName, size: 20, font: 'Calibri' })],
          }),
        ],
      }),
      new TableCell({
        width: { size: COL_PRICE_PCT, type: WidthType.PERCENTAGE },
        shading: alt ? { type: ShadingType.CLEAR, fill: 'FAFAFA', color: 'auto' } : undefined,
        borders: ALL_BORDERS,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: fmt(contractValue), size: 20, font: 'Calibri' })],
          }),
        ],
      }),
    ],
  })
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateScheduleDocx(data: {
  projectName:   string
  projectAddress: string
  contractDate:  string
  builderName:   string
  homeownerName: string | null
  orgName:       string
  phases:        SchedulePhase[]
  grandTotal:    number
  generatedDate: string
}): Promise<Blob> {
  const { projectName, projectAddress, contractDate, builderName, homeownerName, orgName, phases, grandTotal, generatedDate } = data

  // Build table rows
  const rows: TableRow[] = [
    // Header row
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: COL_TASK_PCT, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
          borders: ALL_BORDERS,
          children: [new Paragraph({ children: [new TextRun({ text: 'Task', bold: true, size: 20, font: 'Calibri' })] })],
        }),
        new TableCell({
          width: { size: COL_PRICE_PCT, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
          borders: ALL_BORDERS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Price (AUD)', bold: true, size: 20, font: 'Calibri' })] })],
        }),
      ],
    }),
    // Phase sections
    ...phases.flatMap((phase) => [
      phaseHeaderRow(phase.name),
      ...phase.tasks.map((t, i) => taskRow(t.name, t.contractValue, i % 2 !== 0)),
    ]),
    // Totals row
    new TableRow({
      children: [
        new TableCell({
          width: { size: COL_TASK_PCT, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'EFF6FF', color: 'auto' },
          borders: ALL_BORDERS,
          children: [new Paragraph({ children: [new TextRun({ text: 'Total Contract Value', bold: true, size: 22, font: 'Calibri' })] })],
        }),
        new TableCell({
          width: { size: COL_PRICE_PCT, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'EFF6FF', color: 'auto' },
          borders: ALL_BORDERS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(grandTotal), bold: true, size: 22, font: 'Calibri' })] })],
        }),
      ],
    }),
  ]

  // Signature table (no borders, two columns)
  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 6, color: '374151' }, left: NO_BORDER, right: NO_BORDER },
            children: [new Paragraph({ text: '' })],
          }),
          new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ text: '' })] }),
          new TableCell({
            borders: { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 6, color: '374151' }, left: NO_BORDER, right: NO_BORDER },
            children: [new Paragraph({ text: '' })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ children: [new TextRun({ text: 'Builder', size: 18, font: 'Calibri' })] })] }),
          new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ text: '' })] }),
          new TableCell({ borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ children: [new TextRun({ text: 'Homeowner', size: 18, font: 'Calibri' })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 4, color: '9CA3AF' }, left: NO_BORDER, right: NO_BORDER },
            children: [new Paragraph({ text: '' }), new Paragraph({ text: '' })],
          }),
          new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ text: '' })] }),
          new TableCell({
            borders: { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 4, color: '9CA3AF' }, left: NO_BORDER, right: NO_BORDER },
            children: [new Paragraph({ text: '' }), new Paragraph({ text: '' })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ children: [new TextRun({ text: 'Date', size: 16, font: 'Calibri', color: '9CA3AF' })] })] }),
          new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ text: '' })] }),
          new TableCell({ borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children: [new Paragraph({ children: [new TextRun({ text: 'Date', size: 16, font: 'Calibri', color: '9CA3AF' })] })] }),
        ],
      }),
    ],
  })

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{
      children: [
        // Org / project header
        new Paragraph({ children: [new TextRun({ text: orgName, bold: true, size: 28, font: 'Calibri', color: '1E1B4B' })] }),
        new Paragraph({ children: [new TextRun({ text: `Builder: ${builderName}`, size: 20, font: 'Calibri', color: '4B5563' })] }),
        ...(homeownerName ? [new Paragraph({ children: [new TextRun({ text: `Homeowner: ${homeownerName}`, size: 20, font: 'Calibri', color: '4B5563' })] })] : []),
        new Paragraph({ children: [new TextRun({ text: `Site: ${projectAddress}`, size: 20, font: 'Calibri', color: '4B5563' })] }),
        new Paragraph({ children: [new TextRun({ text: `Contract date: ${fmtDate(contractDate)}`, size: 20, font: 'Calibri', color: '4B5563' })] }),
        new Paragraph({ text: '' }),

        // Title
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Schedule of Works', bold: true, size: 36, font: 'Calibri', color: '111827' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Annexure to Building Contract', size: 22, font: 'Calibri', color: '4F46E5' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: projectName, size: 20, font: 'Calibri', color: '6B7280' })] }),
        new Paragraph({ text: '' }),

        // Table
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),

        new Paragraph({ text: '' }),
        new Paragraph({ text: '' }),

        // Signature block
        new Paragraph({ children: [new TextRun({ text: 'Executed as a deed by the parties', bold: true, size: 22, font: 'Calibri' })] }),
        new Paragraph({ text: '' }),
        sigTable,

        new Paragraph({ text: '' }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${generatedDate} · ${projectName}`, size: 16, font: 'Calibri', color: '9CA3AF' })] }),
      ],
    }],
  })

  return Packer.toBlob(doc)
}
