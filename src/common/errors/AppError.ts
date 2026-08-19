// ── Application Error Codes ───────────────────────────────────────────────────

export const ErrorCode = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_TOKEN: 'INVALID_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_REVOKED: 'SESSION_REVOKED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_EXPIRED',
  RESET_TOKEN_USED: 'RESET_TOKEN_USED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Members
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBER_NUMBER_EXISTS: 'MEMBER_NUMBER_EXISTS',

  // Memberships
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  MEMBERSHIP_ALREADY_ACTIVE: 'MEMBERSHIP_ALREADY_ACTIVE',
  MEMBERSHIP_NOT_ACTIVE: 'MEMBERSHIP_NOT_ACTIVE',
  MEMBERSHIP_ALREADY_FROZEN: 'MEMBERSHIP_ALREADY_FROZEN',
  MEMBERSHIP_NOT_FROZEN: 'MEMBERSHIP_NOT_FROZEN',
  MEMBERSHIP_PLAN_NOT_FOUND: 'MEMBERSHIP_PLAN_NOT_FOUND',
  MEMBERSHIP_PLAN_INACTIVE: 'MEMBERSHIP_PLAN_INACTIVE',

  // Attendance
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
  NOT_CHECKED_IN: 'NOT_CHECKED_IN',
  ATTENDANCE_NOT_FOUND: 'ATTENDANCE_NOT_FOUND',
  MEMBERSHIP_EXPIRED_OR_INACTIVE: 'MEMBERSHIP_EXPIRED_OR_INACTIVE',

  // Payments
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_ALREADY_REFUNDED: 'PAYMENT_ALREADY_REFUNDED',
  REFUND_EXCEEDS_PAYMENT: 'REFUND_EXCEEDS_PAYMENT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND',

  // Trainers
  TRAINER_NOT_FOUND: 'TRAINER_NOT_FOUND',
  TRAINER_ALREADY_ASSIGNED: 'TRAINER_ALREADY_ASSIGNED',

  // PT
  PT_SESSION_NOT_FOUND: 'PT_SESSION_NOT_FOUND',
  PT_SESSION_NOT_UPCOMING: 'PT_SESSION_NOT_UPCOMING',
  PT_PACKAGE_NOT_FOUND: 'PT_PACKAGE_NOT_FOUND',

  // Leads
  LEAD_NOT_FOUND: 'LEAD_NOT_FOUND',
  LEAD_ALREADY_CONVERTED: 'LEAD_ALREADY_CONVERTED',

  // Workouts
  EXERCISE_NOT_FOUND: 'EXERCISE_NOT_FOUND',
  WORKOUT_TEMPLATE_NOT_FOUND: 'WORKOUT_TEMPLATE_NOT_FOUND',

  // Staff
  STAFF_NOT_FOUND: 'STAFF_NOT_FOUND',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',

  // Org
  ORG_NOT_FOUND: 'ORG_NOT_FOUND',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',

  // Reports
  EXPORT_NOT_FOUND: 'EXPORT_NOT_FOUND',
  EXPORT_NOT_READY: 'EXPORT_NOT_READY',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── AppError Class ─────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCodeType,
    message: string,
    statusCode: number = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  // ── Factory Methods ────────────────────────────────────────────────────────

  static badRequest(code: ErrorCodeType, message: string, details?: unknown): AppError {
    return new AppError(code, message, 400, details);
  }

  static unauthorized(code: ErrorCodeType, message: string): AppError {
    return new AppError(code, message, 401);
  }

  static forbidden(code: ErrorCodeType, message: string): AppError {
    return new AppError(code, message, 403);
  }

  static notFound(code: ErrorCodeType, message: string): AppError {
    return new AppError(code, message, 404);
  }

  static conflict(code: ErrorCodeType, message: string, details?: unknown): AppError {
    return new AppError(code, message, 409, details);
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500);
  }

  static serviceUnavailable(message: string): AppError {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, 503);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
