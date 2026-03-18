import { jsPDF } from "jspdf";
import type { Locale } from "@/lib/i18n";

interface InvoiceData {
  id: number;
  userId: string;
  amount: number; // in cents
  pages: number | null;
  type: string;
  status: string;
  paymentMethod?: string | null;
  description?: string | null;
  timestamp: string;
}

// --- Environment-based company config ---
function getInvoiceConfig() {
  return {
    companyName: process.env.NEXT_PUBLIC_INVOICE_COMPANY_NAME ?? "",
    companyAddress: process.env.NEXT_PUBLIC_INVOICE_COMPANY_ADDRESS ?? "",
    companyPhone: process.env.NEXT_PUBLIC_INVOICE_COMPANY_PHONE ?? "",
    companyEmail: process.env.NEXT_PUBLIC_INVOICE_COMPANY_EMAIL ?? "",
    taxId: process.env.NEXT_PUBLIC_INVOICE_TAX_ID ?? "",
    taxRate: Number(process.env.NEXT_PUBLIC_INVOICE_TAX_RATE ?? "0"),
    currency: process.env.NEXT_PUBLIC_INVOICE_CURRENCY ?? "EUR",
  };
}

const labels: Record<
  Locale,
  {
    title: string;
    invoiceNr: string;
    date: string;
    user: string;
    type: string;
    status: string;
    pages: string;
    netAmount: string;
    tax: string;
    grossAmount: string;
    amount: string;
    deposit: string;
    printBw: string;
    printColor: string;
    completed: string;
    pending: string;
    refunded: string;
    failed: string;
    footer: string;
    generatedAt: string;
    taxIdLabel: string;
    phone: string;
    email: string;
    descriptionLabel: string;
    descriptionDeposit: string;
    descriptionDepositCard: string;
    descriptionPrintBw: string;
    descriptionPrintColor: string;
    descriptionManual: string;
    itemLabel: string;
    unitPrice: string;
    quantity: string;
    total: string;
    paid: string;
    credited: string;
    reimbursed: string;
  }
> = {
  de: {
    title: "Pool Printer Beleg",
    invoiceNr: "Nr.",
    date: "Datum",
    user: "Benutzer",
    type: "Typ",
    status: "Status",
    pages: "Seiten",
    netAmount: "Nettobetrag",
    tax: "MwSt.",
    grossAmount: "Bruttobetrag",
    amount: "Betrag",
    deposit: "Einzahlung",
    printBw: "Druck (S/W)",
    printColor: "Druck (Farbe)",
    completed: "Abgeschlossen",
    pending: "Ausstehend",
    refunded: "Erstattet",
    failed: "Fehlgeschlagen",
    footer: "Automatisch generierter Beleg",
    generatedAt: "Erstellt am",
    taxIdLabel: "Steuer-Nr.",
    phone: "Tel.",
    email: "E-Mail",
    descriptionLabel: "Beschreibung",
    descriptionDeposit: "Guthabenaufladung – Barzahlung",
    descriptionDepositCard: "Guthabenaufladung – Kartenzahlung",
    descriptionPrintBw: "Druckauftrag – Schwarz/Weiß",
    descriptionPrintColor: "Druckauftrag – Farbe",
    descriptionManual: "Manuelle Abbuchung",
    itemLabel: "Beschreibung",
    unitPrice: "Einzelpreis",
    quantity: "Menge",
    total: "Gesamt",
    paid: "bezahlt",
    credited: "gutgeschrieben",
    reimbursed: "erstattet",
  },
  en: {
    title: "Pool Printer Receipt",
    invoiceNr: "Nr.",
    date: "Date",
    user: "User",
    type: "Type",
    status: "Status",
    pages: "Pages",
    netAmount: "Net amount",
    tax: "VAT",
    grossAmount: "Gross amount",
    amount: "Amount",
    deposit: "Deposit",
    printBw: "Print (B&W)",
    printColor: "Print (Color)",
    completed: "Completed",
    pending: "Pending",
    refunded: "Refunded",
    failed: "Failed",
    footer: "Automatically generated receipt",
    generatedAt: "Generated on",
    taxIdLabel: "Tax ID",
    phone: "Phone",
    email: "Email",
    descriptionLabel: "Description",
    descriptionDeposit: "Account top-up – Cash payment",
    descriptionDepositCard: "Account top-up – Card payment",
    descriptionPrintBw: "Print job – Black & White",
    descriptionPrintColor: "Print job – Color",
    descriptionManual: "Manual charge",
    itemLabel: "Description",
    unitPrice: "Unit price",
    quantity: "Qty",
    total: "Total",
    paid: "paid",
    credited: "credited",
    reimbursed: "refunded",
  },
};

function formatCurrency(
  cents: number,
  locale: Locale,
  currency: string,
): string {
  const formatted = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
  if (currency.toUpperCase() !== "EUR") {
    return formatted;
  }
  return formatted.replace(/[\u00A0\u202F]€/g, "€").replace(/\s+€/g, "€");
}



function formatDateTime(dateStr: string, locale: Locale): string {
  const d = new Date(dateStr);
  return d.toLocaleString(locale === "de" ? "de-DE" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getTypeLabel(type: string, l: (typeof labels)[Locale]): string {
  switch (type) {
    case "deposit":
      return l.deposit;
    case "print_bw":
      return l.printBw;
    case "print_color":
      return l.printColor;
    case "manual":
      return l.descriptionManual;
    default:
      return type;
  }
}

function getStatusLabel(status: string, l: (typeof labels)[Locale]): string {
  switch (status) {
    case "completed":
      return l.completed;
    case "pending":
      return l.pending;
    case "refunded":
      return l.refunded;
    case "failed":
      return l.failed;
    default:
      return status;
  }
}

export async function generateInvoicePDF(
  tx: InvoiceData,
  locale: Locale,
): Promise<void> {
  const l = labels[locale];
  const cfg = getInvoiceConfig();
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // --- Try to load logo ---
  let logoLoaded = false;
  try {
    const res = await fetch("/logo.svg");
    if (!res.ok) throw new Error("no logo");
    const svgText = await res.text();

    // Render SVG to canvas, then to image
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    const scale = 4; // high-res
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    // Draw logo top-left (max 18mm height, proportional width)
    const maxH = 18;
    const ratio = img.naturalWidth / img.naturalHeight;
    const logoH = maxH;
    const logoW = logoH * ratio;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, 14, logoW, logoH);
    logoLoaded = true;
  } catch {
    // No logo available – continue without
  }

  // --- Company Header (top-right) ---
  let headerY = 18;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);

  if (cfg.companyName) {
    doc.text(cfg.companyName, pageWidth - margin, headerY, { align: "right" });
    headerY += 6;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);

  if (cfg.companyAddress) {
    const addressLines = cfg.companyAddress.split("|").map((s) => s.trim());
    for (const line of addressLines) {
      doc.text(line, pageWidth - margin, headerY, { align: "right" });
      headerY += 4;
    }
  }

  if (cfg.companyPhone) {
    doc.text(`${l.phone} ${cfg.companyPhone}`, pageWidth - margin, headerY, {
      align: "right",
    });
    headerY += 4;
  }

  if (cfg.companyEmail) {
    doc.text(`${l.email} ${cfg.companyEmail}`, pageWidth - margin, headerY, {
      align: "right",
    });
    headerY += 4;
  }

  if (cfg.taxId) {
    doc.text(`${l.taxIdLabel} ${cfg.taxId}`, pageWidth - margin, headerY, {
      align: "right",
    });
    headerY += 4;
  }

  // --- Title + Invoice Nr (below logo or top-left) ---
  const titleX = logoLoaded ? margin + 50 : margin;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(l.title, titleX, 28);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`${l.invoiceNr} ${tx.id}`, titleX, 35);

  // --- Separator ---
  const separatorY = Math.max(headerY + 2, 42);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, separatorY, pageWidth - margin, separatorY);

  // --- Receipt metadata (left side) ---
  let y = separatorY + 10;
  const lineHeight = 7;

  const drawRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(10);
    doc.text(label, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(value, margin + 45, y);

    y += lineHeight;
  };

  drawRow(l.date, formatDateTime(tx.timestamp, locale));
  drawRow(l.user, tx.userId);
  drawRow(l.status, getStatusLabel(tx.status, l));

  // --- Description section ---
  y += 10;

  // Description text
  let descriptionText: string;
  switch (tx.type) {
    case "deposit":
      descriptionText = tx.paymentMethod === "card" ? l.descriptionDepositCard : l.descriptionDeposit;
      break;
    case "print_bw":
      descriptionText = l.descriptionPrintBw;
      break;
    case "print_color":
      descriptionText = l.descriptionPrintColor;
      break;
    case "manual":
      descriptionText = tx.description || l.descriptionManual;
      break;
    default:
      descriptionText = tx.type;
  }

  // --- Items table ---
  y += 4;
  const colItem = margin;
  const colQty = margin + 100;
  const colUnitPrice = margin + 120;
  const colTotal = pageWidth - margin;
  const showPrintColumns = tx.type === "print_bw" || tx.type === "print_color";

  // Table header
  doc.setFillColor(240, 240, 245);
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(margin, y - 4, contentWidth, 8, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(l.itemLabel, colItem + 3, y);
  if (showPrintColumns) {
    doc.text(l.quantity, colQty, y);
    doc.text(l.unitPrice, colUnitPrice, y);
  }
  doc.text(l.total, colTotal - 3, y, { align: "right" });

  y += 10;

  // Table row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(descriptionText, colItem + 3, y);

  const absCents = Math.abs(tx.amount);
  const amountValue = formatCurrency(absCents, locale, cfg.currency);
  const amountSuffix = tx.status === "refunded"
    ? l.reimbursed
    : tx.type === "deposit"
      ? l.credited
      : l.paid;

  if (showPrintColumns && tx.pages && tx.pages > 0) {
    doc.text(String(tx.pages), colQty, y);
    const pricePerPage = absCents / tx.pages;
    doc.text(
      formatCurrency(Math.round(pricePerPage), locale, cfg.currency),
      colUnitPrice,
      y,
    );
  }
  doc.text(amountValue, colTotal - 3, y, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(amountSuffix, colTotal - 3, y + 4.5, {
    align: "right",
  });

  y += 8;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  // --- Footer ---
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);

  const footerText = cfg.companyName
    ? `${l.footer} – ${cfg.companyName}`
    : `${l.footer} – Pool Printer`;
  doc.text(footerText, margin, footerY);
  doc.text(
    `${l.generatedAt}: ${formatDateTime(new Date().toISOString(), locale)}`,
    pageWidth - margin,
    footerY,
    { align: "right" },
  );

  if (cfg.taxId) {
    doc.text(`${l.taxIdLabel} ${cfg.taxId}`, margin, footerY + 4);
  }

  // --- Download ---
  const fileName = `${l.title.toLowerCase()}_${tx.id}_${tx.userId}.pdf`;
  doc.save(fileName);
}
