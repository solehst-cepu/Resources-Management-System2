import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportRowsToExcel(
  fileName: string,
  sheetName: string,
  rows: Array<Record<string, unknown>>
) {
  if (!rows.length) return;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportRowsToCsv(fileName: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportTableToPdf(
  fileName: string,
  title: string,
  subtitle: string,
  columns: string[],
  bodyRows: Array<Array<string | number>>
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFillColor(23, 85, 206); // Biru Lazuardi #1755CE
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('LAZUARDI RESOURCES MANAGEMENT SYSTEM (LRMS)', 14, 10);
  doc.setFontSize(9);
  doc.text(title, 14, 17);

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(subtitle, 14, 29);

  autoTable(doc, {
    startY: 34,
    head: [columns],
    body: bodyRows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [23, 85, 206], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${fileName}.pdf`);
}
