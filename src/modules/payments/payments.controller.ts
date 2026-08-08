import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listPaymentsService, recordPaymentService, getPaymentService, refundPaymentService,
  listInvoicesService, generateInvoiceService, getInvoiceService, getMemberPaymentsService,
} from './payments.service';

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
  async memberPayments(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const result = await getMemberPaymentsService(request.params.memberId, request.query as any);
    return reply.send(result);
  },
  async webhook(_request: FastifyRequest, reply: FastifyReply) {
    // Webhook endpoint — implement per-provider verification in production
    return reply.send({ received: true });
  },
};
