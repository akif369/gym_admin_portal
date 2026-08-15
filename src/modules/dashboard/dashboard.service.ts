import { and, count, desc, eq, gte, inArray, isNull, lte, sql, sum } from 'drizzle-orm';
import { db } from '../../db/index';
import { attendanceLogs } from '../../db/schema/attendance.schema';
import { leads } from '../../db/schema/leads.schema';
import { members } from '../../db/schema/members.schema';
import { memberMemberships } from '../../db/schema/memberships.schema';
import { paymentTransactions } from '../../db/schema/payments.schema';
import { ptSessions } from '../../db/schema/pt.schema';
import { trainers } from '../../db/schema/trainers.schema';

const asNumber = (value: string | number | null | undefined) => Number(value ?? 0);

function dayStart(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function getDashboardService(orgId: string) {
  const now = new Date();
  const today = dayStart(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thisMonth = monthStart(now);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const todayDate = today.toISOString().slice(0, 10);
  const thisMonthDate = `${todayDate.slice(0, 8)}01`;
  const expiryDate = sevenDaysFromNow.toISOString().slice(0, 10);
  const attendanceSince = new Date(today);
  attendanceSince.setDate(attendanceSince.getDate() - 6);
  const revenueSince = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    currentlyInsideRes,
    todaysCheckinsRes,
    todaysRevenueRes,
    monthRevenueRes,
    pendingAmountRes,
    activeMembersRes,
    inactiveMembersRes,
    expiredMembershipsRes,
    newMembersMonthRes,
    trainersWorkingRes,
    totalTrainersRes,
    todaysPtSessionsRes,
    newLeadsRes,
    attendanceRows,
    revenueRows,
    peakRows,
    recentLogs,
    recentPayments,
  ] = await Promise.all([
    db.select({ currentlyInside: count() }).from(attendanceLogs).where(and(eq(attendanceLogs.organizationId, orgId), isNull(attendanceLogs.checkOutAt))),
    db.select({ todaysCheckins: count() }).from(attendanceLogs).where(and(eq(attendanceLogs.organizationId, orgId), gte(attendanceLogs.checkInAt, today), lte(attendanceLogs.checkInAt, tomorrow))),
    db.select({ todaysRevenue: sum(paymentTransactions.totalAmount) }).from(paymentTransactions).where(and(eq(paymentTransactions.organizationId, orgId), eq(paymentTransactions.status, 'PAID'), gte(paymentTransactions.createdAt, today), lte(paymentTransactions.createdAt, tomorrow))),
    db.select({ monthRevenue: sum(paymentTransactions.totalAmount) }).from(paymentTransactions).where(and(eq(paymentTransactions.organizationId, orgId), eq(paymentTransactions.status, 'PAID'), gte(paymentTransactions.createdAt, thisMonth))),
    db.select({ pendingAmount: sum(paymentTransactions.totalAmount) }).from(paymentTransactions).where(and(eq(paymentTransactions.organizationId, orgId), inArray(paymentTransactions.status, ['PENDING', 'PARTIALLY_PAID']))),
    db.select({ activeMembers: count() }).from(members).where(and(
      eq(members.organizationId, orgId),
      isNull(members.deletedAt),
      sql`(SELECT status FROM member_memberships WHERE member_id = ${members.id} ORDER BY created_at DESC LIMIT 1) = 'ACTIVE'`,
    )),
    db.select({ inactiveMembers: count() }).from(members).where(and(eq(members.organizationId, orgId), isNull(members.deletedAt), eq(members.status, 'ARCHIVED'))),
    db.select({ expiredMemberships: count() }).from(members).where(and(
      eq(members.organizationId, orgId),
      isNull(members.deletedAt),
      sql`(SELECT status FROM member_memberships WHERE member_id = ${members.id} ORDER BY created_at DESC LIMIT 1) = 'EXPIRED'`,
    )),
    db.select({ newMembersMonth: count() }).from(members).where(and(eq(members.organizationId, orgId), isNull(members.deletedAt), gte(members.joinDate, thisMonthDate))),
    db.select({ trainersWorking: count() }).from(trainers).where(and(eq(trainers.organizationId, orgId), isNull(trainers.deletedAt), eq(trainers.status, 'ACTIVE'))),
    db.select({ totalTrainers: count() }).from(trainers).where(and(eq(trainers.organizationId, orgId), isNull(trainers.deletedAt))),
    db.select({ todaysPtSessions: count() }).from(ptSessions).where(and(eq(ptSessions.organizationId, orgId), gte(ptSessions.scheduledAt, today), lte(ptSessions.scheduledAt, tomorrow), eq(ptSessions.status, 'UPCOMING'))),
    db.select({ newLeads: count() }).from(leads).where(and(eq(leads.organizationId, orgId), isNull(leads.deletedAt), gte(leads.createdAt, thisMonth))),
    db.select({ checkInAt: attendanceLogs.checkInAt }).from(attendanceLogs).where(and(eq(attendanceLogs.organizationId, orgId), gte(attendanceLogs.checkInAt, attendanceSince))),
    db.select({ createdAt: paymentTransactions.createdAt, totalAmount: paymentTransactions.totalAmount }).from(paymentTransactions).where(and(eq(paymentTransactions.organizationId, orgId), eq(paymentTransactions.status, 'PAID'), gte(paymentTransactions.createdAt, revenueSince))),
    db.select({ checkInAt: attendanceLogs.checkInAt }).from(attendanceLogs).where(and(eq(attendanceLogs.organizationId, orgId), gte(attendanceLogs.checkInAt, today), lte(attendanceLogs.checkInAt, tomorrow))),
    db.select({ id: attendanceLogs.id, memberId: attendanceLogs.memberId, memberName: attendanceLogs.memberName, checkInAt: attendanceLogs.checkInAt, checkOutAt: attendanceLogs.checkOutAt, checkInMethod: attendanceLogs.checkInMethod }).from(attendanceLogs).where(eq(attendanceLogs.organizationId, orgId)).orderBy(desc(attendanceLogs.checkInAt)).limit(6),
    db.select({ id: paymentTransactions.id, memberId: paymentTransactions.memberId, memberName: paymentTransactions.memberName, amount: paymentTransactions.totalAmount, paymentMethod: paymentTransactions.paymentMethod, status: paymentTransactions.status, createdAt: paymentTransactions.createdAt, referenceId: paymentTransactions.referenceId, description: paymentTransactions.description }).from(paymentTransactions).where(eq(paymentTransactions.organizationId, orgId)).orderBy(desc(paymentTransactions.createdAt)).limit(5),
  ]);

  const currentlyInside = currentlyInsideRes[0]?.currentlyInside ?? 0;
  const todaysCheckins = todaysCheckinsRes[0]?.todaysCheckins ?? 0;
  const todaysRevenue = todaysRevenueRes[0]?.todaysRevenue ?? 0;
  const monthRevenue = monthRevenueRes[0]?.monthRevenue ?? 0;
  const pendingAmount = pendingAmountRes[0]?.pendingAmount ?? 0;
  const activeMembers = activeMembersRes[0]?.activeMembers ?? 0;
  const inactiveMembers = inactiveMembersRes[0]?.inactiveMembers ?? 0;
  const expiredMemberships = expiredMembershipsRes[0]?.expiredMemberships ?? 0;
  const newMembersMonth = newMembersMonthRes[0]?.newMembersMonth ?? 0;
  const trainersWorking = trainersWorkingRes[0]?.trainersWorking ?? 0;
  const totalTrainers = totalTrainersRes[0]?.totalTrainers ?? 0;
  const todaysPtSessions = todaysPtSessionsRes[0]?.todaysPtSessions ?? 0;
  const newLeads = newLeadsRes[0]?.newLeads ?? 0;

  const attendanceMap = new Map<string, number>();
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(attendanceSince);
    date.setDate(date.getDate() + day);
    attendanceMap.set(date.toISOString().slice(0, 10), 0);
  }
  attendanceRows.forEach(row => {
    const key = row.checkInAt.toISOString().slice(0, 10);
    if (attendanceMap.has(key)) attendanceMap.set(key, (attendanceMap.get(key) ?? 0) + 1);
  });
  const attendanceChart = [...attendanceMap.entries()].map(([date, count]) => ({ day: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }), count }));

  const revenueMap = new Map<string, number>();
  for (let month = 0; month < 6; month += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + month, 1);
    revenueMap.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, 0);
  }
  revenueRows.forEach(row => {
    const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + asNumber(row.totalAmount));
  });
  const revenueChart = [...revenueMap.entries()].map(([month, revenue]) => ({ month: new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' }), revenue }));

  const peakMap = new Map<number, number>();
  peakRows.forEach(row => peakMap.set(row.checkInAt.getHours(), (peakMap.get(row.checkInAt.getHours()) ?? 0) + 1));
  const peakHours = [...peakMap.entries()].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour: `${String(hour).padStart(2, '0')}:00`, count }));

  const expiringIn7DaysRes = await db
    .select({ expiringIn7Days: count() })
    .from(memberMemberships)
    .innerJoin(members, eq(memberMemberships.memberId, members.id))
    .where(and(
      eq(members.organizationId, orgId),
      isNull(members.deletedAt),
      eq(memberMemberships.status, 'ACTIVE'),
      gte(memberMemberships.endDate, todayDate),
      lte(memberMemberships.endDate, expiryDate),
    ));

  return {
    stats: {
      todaysCheckins: Number(todaysCheckins), currentlyInside: Number(currentlyInside), todaysRevenue: asNumber(todaysRevenue), monthRevenue: asNumber(monthRevenue), pendingAmount: asNumber(pendingAmount),
      expiringIn7Days: Number(expiringIn7DaysRes[0]?.expiringIn7Days ?? 0), expiredMemberships: Number(expiredMemberships), newMembersMonth: Number(newMembersMonth), activeMembers: Number(activeMembers), inactiveMembers: Number(inactiveMembers), trainersWorking: Number(trainersWorking), totalTrainers: Number(totalTrainers), todaysPtSessions: Number(todaysPtSessions), newLeads: Number(newLeads),
    },
    revenueChart, attendanceChart, peakHours,
    recentLogs: recentLogs.map(log => ({ ...log, date: log.checkInAt.toISOString().slice(0, 10), checkIn: log.checkInAt.toISOString().slice(11, 16), checkOut: log.checkOutAt?.toISOString().slice(11, 16) ?? null, method: log.checkInMethod })),
    recentPayments: recentPayments.map(payment => ({ ...payment, amount: asNumber(payment.amount), date: payment.createdAt.toISOString().slice(0, 10), method: payment.paymentMethod, refId: payment.referenceId ?? '', plan: payment.description ?? '' })),
  };
}
