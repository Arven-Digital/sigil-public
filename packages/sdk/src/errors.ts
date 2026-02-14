/**
 * Structured error classes for Sigil SDK
 */

export class SigilError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigilError';
  }
}

export class SigilAPIError extends SigilError {
  public statusCode: number;
  public path: string;
  constructor(
    message: string,
    statusCode: number,
    path: string
  ) {
    // R15: Don't include path in error message (info leakage) — store separately
    super(`Sigil API Error (${statusCode}): ${message}`);
    this.name = 'SigilAPIError';
    this.statusCode = statusCode;
    this.path = path;
  }
}

export class AuthError extends SigilError {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export class EvaluationError extends SigilError {
  constructor(
    message: string,
    public riskScore: number,
    public layers?: Record<string, any>
  ) {
    super(`Evaluation failed (risk: ${riskScore}): ${message}`);
    this.name = 'EvaluationError';
  }
}

export class SigilRejectionError extends SigilError {
  constructor(
    message: string,
    public riskScore: number,
    public result: any
  ) {
    super(`Transaction Rejected (risk: ${riskScore}): ${message}`);
    this.name = 'SigilRejectionError';
  }
}

export class NetworkError extends SigilError {
  constructor(message: string, public cause?: Error) {
    super(`Network error: ${message}`);
    this.name = 'NetworkError';
  }
}

export class FrozenAccountError extends SigilError {
  constructor(address: string) {
    super(`Account ${address} is frozen`);
    this.name = 'FrozenAccountError';
  }
}

export class RecoveryError extends SigilError {
  constructor(message: string) {
    super(`Recovery error: ${message}`);
    this.name = 'RecoveryError';
  }
}

export class UpgradeError extends SigilError {
  constructor(message: string) {
    super(`Upgrade error: ${message}`);
    this.name = 'UpgradeError';
  }
}
