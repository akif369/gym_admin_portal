import { db } from '../../db/index';
import {
  paymentTransactions, invoices, invoiceLineItems, refunds, reportExports,
} from '../../db/schema/payments.schema';
import { members } from '../../db/schema/members.schema';
import { eq, and, isNull, desc, count, sum, sql, gte, lte } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { createLogger } from '../../common/logger/index';

const log = createLogger('payments-service');

// ── Invoice number generator ──────────────────────────────────────────────────

async function generateInvoiceNumber(orgId: string): Promise<string> {
  const [{ total }] = await db.select({ total: count() }).from(invoices).where(eq(invoices.organizationId, orgId));
  const year = new Date().getFullYear();
  return `GYM-${year}-${String((total ?? 0) + 1).padStart(4, '0')}`;
}

// ── List Payments ─────────────────────────────────────────────────────────────

export async function listPaymentsService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const conditions: any[] = [eq(paymentTransactions.organizationId, orgId)];

  if (query['memberId']) conditions.push(eq(paymentTransactions.memberId, query['memberId'] as string));
  if (query['status']) conditions.push(eq(paymentTransactions.status, query['status'] as any));
  if (query['dateFrom']) conditions.push(gte(paymentTransactions.createdAt, new Date(query['dateFrom'] as string)));
  if (query['dateTo']) conditions.push(lte(paymentTransactions.createdAt, new Date(query['dateTo'] as string)));

  const whereClause = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(paymentTransactions).where(whereClause);
  const items = await db.select().from(paymentTransactions).where(whereClause)
    .orderBy(desc(paymentTransactions.createdAt)).limit(limit).offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Record Payment ────────────────────────────────────────────────────────────

export async function recordPaymentService(
  orgId: string,
  data: {
    memberId?: string;
    amount: number;
    gstAmount?: number;
    paymentMethod: string;
    referenceId?: string;
    description?: string;
    notes?: string;
    idempotencyKey?: string;
  },
  actorId: string,
) {
  // Idempotency check
  if (data.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, data.idempotencyKey))
      .limit(1);
    if (existing) {
      throw AppError.conflict(ErrorCode.IDEMPOTENCY_CONFLICT, 'Duplicate payment with same idempotency key');
    }
  }

  let memberName: string | undefined;
  if (data.memberId) {
    const [m] = await db
      .select({ firstName: members.firstName, lastName: members.lastName })
      .from(members)
      .where(and(
        eq(members.id, data.memberId),
        eq(members.organizationId, orgId),
        isNull(members.deletedAt),
      ))
      .limit(1);
    if (!m) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');
    memberName = `${m.firstName} ${m.lastName}`;
  }

  const gstAmount = data.gstAmount ?? 0;
  const totalAmount = data.amount + gstAmount;

  const [payment] = await db
    .insert(paymentTransactions)
    .values({
      organizationId: orgId,
      memberId: data.memberId,
      memberName,
      amount: String(data.amount),
      gstAmount: String(gstAmount),
      totalAmount: String(totalAmount),
      paymentMethod: data.paymentMethod as any,
      status: 'PAID',
      referenceId: data.referenceId,
      description: data.description,
      notes: data.notes,
      idempotencyKey: data.idempotencyKey,
      recordedBy: actorId,
      paidAt: new Date(),
    })
    .returning();

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.PAYMENT_RECORDED,
    entityType: 'payment',
    entityId: payment!.id,
    description: `Payment ₹${totalAmount} recorded (${data.paymentMethod})`,
    afterState: payment,
  });

  log.info({ paymentId: payment!.id, amount: totalAmount }, 'Payment recorded');
  return payment;
}

// ── Get Payment ────────────────────────────────────────────────────────────────

export async function getPaymentService(orgId: string, paymentId: string) {
  const [payment] = await db
    .select()
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.id, paymentId), eq(paymentTransactions.organizationId, orgId)))
    .limit(1);
  if (!payment) throw AppError.notFound(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');
  return payment;
}

// ── Refund ────────────────────────────────────────────────────────────────────

export async function refundPaymentService(
  orgId: string,
  paymentId: string,
  data: { amount: number; reason: string },
  actorId: string,
) {
  const payment = await getPaymentService(orgId, paymentId);

  if (['REFUNDED', 'CANCELLED'].includes(payment.status)) {
    throw AppError.conflict(ErrorCode.PAYMENT_ALREADY_REFUNDED, 'Payment has already been refunded');
  }

  if (data.amount > parseFloat(payment.totalAmount as string)) {
    throw AppError.badRequest(ErrorCode.REFUND_EXCEEDS_PAYMENT, 'Refund amount exceeds payment total');
  }

  const [refund_] = await db
    .insert(refunds)
    .values({
      paymentId,
      amount: String(data.amount),
      reason: data.reason,
      status: 'PROCESSED',
      processedBy: actorId,
      processedAt: new Date(),
    })
    .returning();

  // Update payment status
  const newStatus = data.amount >= parseFloat(payment.totalAmount as string) ? 'REFUNDED' : 'PARTIALLY_PAID';
  await db.update(paymentTransactions).set({ status: newStatus as any, updatedAt: new Date() }).where(eq(paymentTransactions.id, paymentId));

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.PAYMENT_REFUNDED,
    entityType: 'payment',
    entityId: paymentId,
    description: `Refund ₹${data.amount}: ${data.reason}`,
    afterState: refund_,
  });

  return refund_;
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function listInvoicesService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const [{ total }] = await db.select({ total: count() }).from(invoices).where(eq(invoices.organizationId, orgId));
  const items = await db.select().from(invoices).where(eq(invoices.organizationId, orgId))
    .orderBy(desc(invoices.createdAt)).limit(limit).offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

export async function generateInvoiceService(
  orgId: string,
  data: {
    memberId?: string;
    lineItems: { description: string; quantity: number; unitPrice: number; gstPercent: number }[];
    notes?: string;
    footer?: string;
    dueDate?: string;
  },
  actorId: string,
) {
  let memberName: string | undefined;
  if (data.memberId) {
    const [m] = await db.select({ firstName: members.firstName, lastName: members.lastName }).from(members).where(eq(members.id, data.memberId)).limit(1);
    if (m) memberName = `${m.firstName} ${m.lastName}`;
  }

  const invoiceNumber = await generateInvoiceNumber(orgId);

  let subtotal = 0;
  let gstTotal = 0;
  const lineItemData = data.lineItems.map((li) => {
    const lineTotal = li.quantity * li.unitPrice;
    const gstAmount = (lineTotal * li.gstPercent) / 100;
    subtotal += lineTotal;
    gstTotal += gstAmount;
    return { ...li, totalAmount: String(lineTotal + gstAmount) };
  });

  const totalAmount = subtotal + gstTotal;

  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: orgId,
      memberId: data.memberId,
      memberName,
      invoiceNumber,
      subtotal: String(subtotal),
      gstAmount: String(gstTotal),
      totalAmount: String(totalAmount),
      status: 'SENT',
      notes: data.notes,
      footer: data.footer,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      createdBy: actorId,
    })
    .returning();

  // Line items
  for (const li of lineItemData) {
    await db.insert(invoiceLineItems).values({
      invoiceId: invoice!.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: String(li.unitPrice),
      gstPercent: String(li.gstPercent),
      totalAmount: li.totalAmount,
    });
  }

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.INVOICE_GENERATED,
    entityType: 'invoice',
    entityId: invoice!.id,
    description: `Invoice ${invoiceNumber} generated: ₹${totalAmount}`,
  });

  return { ...invoice, lineItems: lineItemData };
}

export async function getInvoiceService(orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, orgId)))
    .limit(1);
  if (!invoice) throw AppError.notFound(ErrorCode.INVOICE_NOT_FOUND, 'Invoice not found');

  const lineItems = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
  return { ...invoice, lineItems };
}

export async function getMemberPaymentsService(orgId: string, memberId: string, query: Record<string, unknown>) {
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .limit(1);
  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const [{ total }] = await db.select({ total: count() }).from(paymentTransactions).where(eq(paymentTransactions.memberId, memberId));
  const items = await db.select().from(paymentTransactions).where(eq(paymentTransactions.memberId, memberId))
    .orderBy(desc(paymentTransactions.createdAt)).limit(limit).offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}
