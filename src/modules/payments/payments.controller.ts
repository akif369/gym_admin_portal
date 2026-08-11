import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listPaymentsService, recordPaymentService, getPaymentService, refundPaymentService,
  listInvoicesService, generateInvoiceService, getInvoiceService, getMemberPaymentsService,
  sendInvoiceWhatsAppService, getPublicInvoiceService,
} from './payments.service';

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
}

function renderInvoiceHtml(invoice: Awaited<ReturnType<typeof getPublicInvoiceService>>) {
  const org = invoice.organization;
  const taxLabel = invoice.taxIncluded ? 'GST included' : 'GST added';
  const rows = invoice.lineItems.map(item => `<tr><td>${escapeHtml(item.description)}<br><small class="muted">GST ${escapeHtml(item.gstPercent)}% ${taxLabel.toLowerCase()}</small></td><td>${item.quantity}</td><td>Rs. ${escapeHtml(item.unitPrice)}</td><td>Rs. ${escapeHtml(item.totalAmount)}</td></tr>`).join('');
  const totalLabel = invoice.taxIncluded ? 'Total (tax included)' : 'Total';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title><style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#172033;margin:0;padding:32px}.sheet{max-width:760px;margin:auto;background:#fff;padding:48px;border-radius:12px;box-shadow:0 8px 30px #17203318}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #172033;padding-bottom:24px}h1{margin:0;font-size:28px}h2{margin:0;font-size:18px}.muted{color:#667085}.tax-note{background:#eef7f1;color:#17663a;padding:10px 12px;border-radius:6px;font-size:14px}table{width:100%;border-collapse:collapse;margin:32px 0}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e6e8ec}th{text-transform:uppercase;font-size:12px;color:#667085}.totals{margin-left:auto;width:280px}.total{font-size:20px;font-weight:700;border-top:2px solid #172033;padding-top:12px;margin-top:12px}footer{border-top:1px solid #e6e8ec;padding-top:20px;margin-top:40px;white-space:pre-line}</style></head><body><main class="sheet"><header><div><h1>${escapeHtml(org.name)}</h1><p class="muted">${escapeHtml(org.address)} ${escapeHtml(org.city)}</p>${org.gstNumber ? `<p class="muted">GSTIN: ${escapeHtml(org.gstNumber)}</p>` : ''}</div><div><h2>Invoice ${escapeHtml(invoice.invoiceNumber)}</h2><p class="muted">Issued ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}</p><p class="muted">Status: ${escapeHtml(invoice.status)}</p></div></header><section><h2>Bill to</h2><p>${escapeHtml(invoice.memberName || 'Walk-in customer')}</p></section>${invoice.taxIncluded ? '<p class="tax-note">GST is included in the prices shown below.</p>' : ''}<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price${invoice.taxIncluded ? ' (incl. GST)' : ''}</th><th>Total${invoice.taxIncluded ? ' (incl. GST)' : ''}</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><div>Taxable amount <span style="float:right">Rs. ${escapeHtml(invoice.subtotal)}</span></div><div>GST${invoice.taxIncluded ? ' (included)' : ''} <span style="float:right">Rs. ${escapeHtml(invoice.gstAmount)}</span></div><div class="total">${totalLabel} <span style="float:right">Rs. ${escapeHtml(invoice.totalAmount)}</span></div></section>${invoice.footer ? `<footer>${escapeHtml(invoice.footer)}</footer>` : ''}</main></body></html>`;
}

export const paymentsController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const result = await listPaymentsService(request.user.orgId, request.query as any);
    return reply.send(result);
  },
  async create(request: FastifyRequest, reply: FastifyReply) {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const payment = await recordPaymentService(request.user.orgId, { ...(request.body as any), idempotencyKey }, request.user.userId);
    return reply.status(201).send({ payment });
  },
  async getOne(request: FastifyRequest<{ Params: { paymentId: string } }>, reply: FastifyReply) {
    const payment = await getPaymentService(request.user.orgId, request.params.paymentId);
    return reply.send({ payment });
  },
  async refund(request: FastifyRequest<{ Params: { paymentId: string } }>, reply: FastifyReply) {
    const refund = await refundPaymentService(request.user.orgId, request.params.paymentId, request.body as any, request.user.userId);
    return reply.status(201).send({ refund });
  },
  async listInvoices(request: FastifyRequest, reply: FastifyReply) {
    const result = await listInvoicesService(request.user.orgId, request.query as any);
    return reply.send(result);
  },
  async generateInvoice(request: FastifyRequest, reply: FastifyReply) {
    const invoice = await generateInvoiceService(request.user.orgId, request.body as any, request.user.userId);
    return reply.status(201).send({ invoice });
  },
  async getInvoice(request: FastifyRequest<{ Params: { invoiceId: string } }>, reply: FastifyReply) {
    const invoice = await getInvoiceService(request.user.orgId, request.params.invoiceId);
    return reply.send({ invoice });
  },
  async getPublicInvoice(request: FastifyRequest<{ Params: { publicToken: string } }>, reply: FastifyReply) {
    const invoice = await getPublicInvoiceService(request.params.publicToken);
    reply.header('Cache-Control', 'private, no-store');
    reply.type('text/html; charset=utf-8');
    return reply.send(renderInvoiceHtml(invoice));
  },
  async getInvoicePdf(request: FastifyRequest<{ Params: { invoiceId: string } }>, reply: FastifyReply) {
    const invoice = await getInvoiceService(request.user.orgId, request.params.invoiceId);
    // Simple text/HTML invoice — swap for PDF library in production
    const html = `<!DOCTYPE html><html><body>
      <h1>Invoice ${invoice.invoiceNumber}</h1>
      <p>Total: ₹${invoice.totalAmount}</p>
      ${(invoice.lineItems as any[]).map((li) => `<p>${li.description}: ₹${li.totalAmount}</p>`).join('')}
    </body></html>`;
    reply.header('Content-Type', 'text/html');
    return reply.send(html);
  },
  async sendInvoiceWhatsApp(request: FastifyRequest<{ Params: { invoiceId: string } }>, reply: FastifyReply) {
    const delivery = await sendInvoiceWhatsAppService(
      request.user.orgId,
      request.params.invoiceId,
      request.user.userId,
    );
    return reply.status(202).send({ delivery });
  },
  async memberPayments(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const result = await getMemberPaymentsService(request.user.orgId, request.params.memberId, request.query as any);
    return reply.send(result);
  },
  async webhook(_request: FastifyRequest, reply: FastifyReply) {
    // Webhook endpoint — implement per-provider verification in production
    return reply.send({ received: true });
  },
};
