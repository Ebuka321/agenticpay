import { Request, Response } from 'express';
import { z } from 'zod';
import { BalanceService } from '../services/balanceService.js';
import { getAssetIssuer } from '../config/assets.js';

const paymentEntrySchema = z.object({
  employeeId: z.string().min(1),
  employeeName: z.string().min(1),
  walletAddress: z.string().length(56),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
    message: 'Amount must be a positive number.',
  }),
});

const preflightSchema = z.object({
  distributionAccount: z.string().length(56),
  /**
   * Asset code to check. Defaults to 'ORGUSD' for backward compatibility.
   * Supported values: 'USDC', 'EURC', 'ORGUSD', 'XLM'.
   */
  assetCode: z.string().max(12).optional().default('ORGUSD'),
  /**
   * Explicit issuer address. When omitted the issuer is resolved automatically
   * from the asset registry via assetCode.
   */
  assetIssuer: z.string().length(56).optional(),
  payments: z.array(paymentEntrySchema).min(1),
});

export class BalanceController {
  /**
   * GET /api/balance/:accountId
   * Query the balance of any supported asset for a Stellar account.
   * Query params:
   *   - assetCode   (optional, default 'ORGUSD')
   *   - assetIssuer (optional, resolved from registry when omitted)
   */
  static async checkBalance(req: Request, res: Response) {
    try {
      const { accountId } = req.params;
      const assetCode = (req.query.assetCode as string | undefined) ?? 'ORGUSD';
      const explicitIssuer = req.query.assetIssuer as string | undefined;

      if (!accountId || accountId.length !== 56) {
        return res.status(400).json({ error: 'Invalid account ID.' });
      }

      // For non-XLM assets an issuer is required; resolve from registry if not provided.
      let assetIssuer: string | null = null;
      if (assetCode !== 'XLM') {
        if (explicitIssuer) {
          if (explicitIssuer.length !== 56) {
            return res.status(400).json({ error: 'Invalid assetIssuer query param.' });
          }
          assetIssuer = explicitIssuer;
        } else {
          assetIssuer = getAssetIssuer(assetCode);
          if (!assetIssuer) {
            return res
              .status(400)
              .json({ error: `No issuer configured for asset "${assetCode}".` });
          }
        }
      }

      const result = await BalanceService.getAssetBalance(accountId, assetCode, assetIssuer);

      res.json({
        account: accountId,
        assetCode,
        assetIssuer: assetIssuer ?? null,
        balance: result.balance,
        trustlineExists: result.exists,
      });
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return res.status(404).json({ error: 'Account not found on Horizon.' });
      }
      console.error('Check Balance Error:', error);
      res.status(500).json({ error: 'Failed to fetch account balance.' });
    }
  }

  /**
   * POST /api/balance/preflight
   * Run a pre-flight balance check before payroll execution.
   * Supports USDC, EURC, ORGUSD, XLM and any other registered asset.
   * Body: { distributionAccount, assetCode?, assetIssuer?, payments[] }
   */
  static async preflightPayroll(req: Request, res: Response) {
    try {
      const {
        distributionAccount,
        assetCode,
        assetIssuer: explicitIssuer,
        payments,
      } = preflightSchema.parse(req.body);

      // Resolve issuer: explicit value > asset registry.
      let resolvedIssuer: string | null = null;
      if (assetCode !== 'XLM') {
        if (explicitIssuer) {
          resolvedIssuer = explicitIssuer;
        } else {
          resolvedIssuer = getAssetIssuer(assetCode);
          if (!resolvedIssuer) {
            return res
              .status(400)
              .json({ error: `No issuer configured for asset "${assetCode}".` });
          }
        }
      }

      const result = await BalanceService.preflightCheck(
        distributionAccount,
        assetCode,
        resolvedIssuer,
        payments
      );

      const status = result.sufficient ? 200 : 422;

      res.status(status).json({
        preflight: result.sufficient ? 'passed' : 'failed',
        ...result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: error.issues });
      }
      if (error?.response?.status === 404) {
        return res.status(404).json({ error: 'Distribution account not found on Horizon.' });
      }
      console.error('Preflight Payroll Error:', error);
      res.status(500).json({ error: 'Failed to run preflight balance check.' });
    }
  }
}
