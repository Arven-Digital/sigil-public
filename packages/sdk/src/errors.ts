export class SigilError extends Error {
  public readonly statusCode?: number;
  public readonly rejectionReason?: string;
  public readonly riskScore?: number;
  public readonly guidance?: string;
  public readonly code: string;

  constructor(
    message: string,
    opts: {
      code?: string;
      statusCode?: number;
      rejectionReason?: string;
      riskScore?: number;
      guidance?: string;
    } = {},
  ) {
    super(message);
    this.name = 'SigilError';
    this.code = opts.code ?? 'UNKNOWN';
    this.statusCode = opts.statusCode;
    this.rejectionReason = opts.rejectionReason;
    this.riskScore = opts.riskScore;
    this.guidance = opts.guidance;
  }

  static fromApiResponse(status: number, body: Record<string, unknown>): SigilError {
    return new SigilError(
      (body.message as string) ?? (body.error as string) ?? `API error ${status}`,
      {
        code: (body.code as string) ?? 'API_ERROR',
        statusCode: status,
        rejectionReason: body.rejectionReason as string | undefined,
        riskScore: body.riskScore as number | undefined,
        guidance: body.guidance as string | undefined,
      },
    );
  }

  static nonceError(msg: string): SigilError {
    return new SigilError(msg, { code: 'NONCE_ERROR' });
  }

  static authError(msg: string): SigilError {
    return new SigilError(msg, { code: 'AUTH_ERROR' });
  }
}
