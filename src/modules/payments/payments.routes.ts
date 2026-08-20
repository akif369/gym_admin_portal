import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { paymentsController } from './payments.controller';

export async function paymentsRoutes(fastify: FastifyInstance): Promise<void> {
  const authView = [requireAuth, requirePermission('payment.view')];
  const authCreate = [requireAuth, requirePermission('payment.create')];
  const authRefund = [requireAuth, requirePermission('payment.refund')];

  fastify.get('/payments', { preHandler: authView, schema: { tags: ['Payments'], summary: 'List payments (paginated)' } }, paymentsController.list);
  fastify.post('/payments', { preHandler: authCreate, schema: { tags: ['Payments'], summary: 'Record payment' } }, paymentsController.create);
  fastify.get('/payments/:paymentId', { preHandler: authView, schema: { tags: ['Payments'], summary: 'Payment detail' } }, paymentsController.getOne);
  fastify.post('/payments/:paymentId/refund', { preHandler: authRefund, schema: { tags: ['Payments'], summary: 'Refund payment' } }, paymentsController.refund);
  fastify.get('/invoices', { preHandler: authView, schema: { tags: ['Payments'], summary: 'List invoices' } }, paymentsController.listInvoices);
  fastify.post('/invoices/generate', { preHandler: authCreate, schema: { tags: ['Payments'], summary: 'Generate invoice' } }, paymentsController.generateInvoice);
  fastify.get('/invoices/public/:publicToken', { schema: { tags: ['Payments'], summary: 'Public invoice view', security: [] } }, paymentsController.getPublicInvoice);
  fastify.get('/invoices/public/:publicToken/json', { schema: { tags: ['Payments'], summary: 'Public invoice data (JSON)', security: [] } }, paymentsController.getPublicInvoiceData);
  fastify.get('/invoices/:invoiceId', { preHandler: authView, schema: { tags: ['Payments'], summary: 'Invoice detail' } }, paymentsController.getInvoice);
  fastify.get('/invoices/:invoiceId/pdf', { preHandler: authView, schema: { tags: ['Payments'], summary: 'Invoice PDF' } }, paymentsController.getInvoicePdf);
  fastify.post('/invoices/:invoiceId/whatsapp', { preHandler: authCreate, schema: { tags: ['Payments'], summary: 'Queue invoice WhatsApp message' } }, paymentsController.sendInvoiceWhatsApp);
  fastify.get('/members/:memberId/payments', { preHandler: authView, schema: { tags: ['Payments'], summary: 'Member payment history' } }, paymentsController.memberPayments);
  fastify.post('/payments/webhooks/provider', { schema: { tags: ['Payments'], summary: 'Payment gateway webhook', security: [] } }, paymentsController.webhook);
}
