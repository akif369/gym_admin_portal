import type { getPublicInvoiceService } from '../modules/payments/payments.service';

type PublicInvoice = Awaited<ReturnType<typeof getPublicInvoiceService>>;

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
}

function formatINR(value: string | number): string {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num)
    ? num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : escapeHtml(String(value));
}

function statusBadge(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: 'Paid', className: 'badge-paid' },
    sent: { label: 'Sent', className: 'badge-pending' },
    pending: { label: 'Pending', className: 'badge-pending' },
    overdue: { label: 'Overdue', className: 'badge-overdue' },
    draft: { label: 'Draft', className: 'badge-draft' },
    cancelled: { label: 'Cancelled', className: 'badge-cancelled' },
    canceled: { label: 'Cancelled', className: 'badge-cancelled' },
  };
  return map[(status || '').toLowerCase()] || { label: status || 'Unknown', className: 'badge-draft' };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? `${ONES[hundred]} Hundred${rest ? ' ' : ''}` : ''}${rest ? twoDigits(rest) : ''}`;
}

function numberToWordsINR(value: number): string {
  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  let remaining = rupees;
  const crore = Math.floor(remaining / 10000000); remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000); remaining %= 100000;
  const thousand = Math.floor(remaining / 1000); remaining %= 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (remaining) parts.push(threeDigits(remaining));
  let words = `${parts.join(' ') || 'Zero'} Rupees`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

export function renderInvoiceHtml(invoice: PublicInvoice): string {
  const org = invoice.organization;
  const taxIncluded = invoice.taxIncluded;
  const taxLabel = taxIncluded ? 'GST included' : 'GST added';
  const totalLabel = taxIncluded ? 'Total (tax included)' : 'Total';
  const badge = statusBadge(invoice.status);
  const totalNumeric = parseFloat(invoice.totalAmount as string);
  const amountInWords = Number.isFinite(totalNumeric) ? numberToWordsINR(totalNumeric) : null;
  const rows = invoice.lineItems.map(item => `
      <tr><td><div class="item-desc">${escapeHtml(item.description)}</div><div class="muted small">GST ${escapeHtml(item.gstPercent)}% ${taxLabel.toLowerCase()}</div></td><td data-label="Qty">${item.quantity}</td><td data-label="Unit price">Rs. ${formatINR(item.unitPrice)}</td><td data-label="Total">Rs. ${formatINR(item.totalAmount)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title><style>
:root{--brand:#2f5fda;--ink:#172033;--muted:#667085;--border:#e6e8ec;--bg:#f5f6f8;--paid:#17663a;--paid-bg:#e8f6ee;--pending:#92620a;--pending-bg:#fdf3dc;--overdue:#a12626;--overdue-bg:#fbe8e8;--draft:#475069;--draft-bg:#eef0f4}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--ink);margin:0;padding:24px}.sheet{max-width:800px;margin:auto;background:#fff;padding:40px;border-radius:14px;box-shadow:0 8px 30px rgba(23,32,51,.09)}header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:24px;border-bottom:2px solid var(--ink);padding-bottom:24px}header .org h1{margin:0 0 6px;font-size:24px}header .meta{text-align:right}h2{margin:0 0 4px;font-size:16px}.muted{color:var(--muted)}.small{font-size:13px}p{margin:2px 0}.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;text-transform:capitalize;margin-top:6px}.badge-paid{color:var(--paid);background:var(--paid-bg)}.badge-pending{color:var(--pending);background:var(--pending-bg)}.badge-overdue{color:var(--overdue);background:var(--overdue-bg)}.badge-draft{color:var(--draft);background:var(--draft-bg)}.badge-cancelled{color:var(--draft);background:var(--draft-bg);text-decoration:line-through}.bill-to{margin-top:28px}.tax-note{background:#eef7f1;color:#17663a;padding:10px 14px;border-radius:8px;font-size:14px;margin-top:20px}table{width:100%;border-collapse:collapse;margin:28px 0}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--border);vertical-align:top}th{text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:var(--muted)}td:nth-child(2),td:nth-child(3),td:nth-child(4),th:nth-child(2),th:nth-child(3),th:nth-child(4){text-align:right;white-space:nowrap}.item-desc{font-weight:500}.totals{margin-left:auto;width:300px}.totals div{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}.totals .total{font-size:19px;font-weight:700;border-top:2px solid var(--ink);padding-top:12px;margin-top:8px}.words{margin-top:14px;font-size:13px;color:var(--muted);font-style:italic}.actions{text-align:right;margin-top:24px}.actions button{background:var(--brand);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:14px;cursor:pointer}footer{border-top:1px solid var(--border);padding-top:18px;margin-top:36px;white-space:pre-line;font-size:13px;color:var(--muted)}
@media (max-width:640px){body{padding:12px}.sheet{padding:24px 18px;border-radius:10px}header{flex-direction:column}header .meta{text-align:left}table,thead,tbody,tr,td{display:block}thead{display:none}tbody tr{border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px}tbody td{border:none;padding:4px 0}tbody td:first-child{padding-bottom:8px}tbody td:not(:first-child){display:flex;justify-content:space-between;font-size:14px;white-space:normal}tbody td:not(:first-child)::before{content:attr(data-label);color:var(--muted);font-weight:500}.totals{width:100%}}@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:100%;padding:16mm}.no-print{display:none}@page{size:A4;margin:14mm}}
</style></head><body><main class="sheet"><header><div class="org"><h1>${escapeHtml(org.name)}</h1><p class="muted">${escapeHtml(org.address)} ${escapeHtml(org.city)}</p>${org.gstNumber ? `<p class="muted">GSTIN: ${escapeHtml(org.gstNumber)}</p>` : ''}</div><div class="meta"><h2>Invoice ${escapeHtml(invoice.invoiceNumber)}</h2><p class="muted">Issued ${new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p><span class="badge ${badge.className}">${escapeHtml(badge.label)}</span></div></header><section class="bill-to"><h2>Bill to</h2><p>${escapeHtml(invoice.memberName || 'Walk-in customer')}</p></section>${taxIncluded ? '<p class="tax-note">GST is included in the prices shown below.</p>' : ''}<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price${taxIncluded ? ' (incl. GST)' : ''}</th><th>Total${taxIncluded ? ' (incl. GST)' : ''}</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><div><span>Taxable amount</span><span>Rs. ${formatINR(invoice.subtotal)}</span></div><div><span>GST${taxIncluded ? ' (included)' : ''}</span><span>Rs. ${formatINR(invoice.gstAmount)}</span></div><div class="total"><span>${totalLabel}</span><span>Rs. ${formatINR(invoice.totalAmount)}</span></div></section>${amountInWords ? `<p class="words">Amount in words: ${escapeHtml(amountInWords)}</p>` : ''}<div class="actions no-print"><button onclick="window.print()">Print / Save as PDF</button></div>${invoice.footer ? `<footer>${escapeHtml(invoice.footer)}</footer>` : ''}</main></body></html>`;
}
