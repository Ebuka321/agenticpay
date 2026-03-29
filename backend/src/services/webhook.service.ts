import axios from 'axios';
import CryptoJS from 'crypto-js';
import { pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookSubscription {
  id: string;
  organization_id: number;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookDeliveryLog {
  id: number;
  subscription_id: string;
  event_type: string;
  payload: any;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  attempt_number: number;
  delivered_at: Date;
}

export const WEBHOOK_EVENTS = {
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  EMPLOYEE_ADDED: 'employee.added',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_DELETED: 'employee.deleted',
  PAYROLL_RUN_CREATED: 'payroll_run.created',
  PAYROLL_RUN_COMPLETED: 'payroll_run.completed',
  CLAIMABLE_BALANCE_CREATED: 'claimable_balance.created',
  CLAIMABLE_BALANCE_CLAIMED: 'claimable_balance.claimed',
  CONTRACT_UPGRADED: 'contract.upgraded',
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

interface DeliveryAttemptResult {
  attemptNumber: number;
  responseStatus: number | null;
  responseBody: any | null;
  errorMessage: string | null;
}

export class WebhookService {
  private static readonly MAX_DELIVERY_ATTEMPTS = 4;
  private static readonly INITIAL_RETRY_DELAY_MS = 1000;
  private static readonly REQUEST_TIMEOUT_MS = 5000;

  static async subscribe(
    organization_id: number,
    url: string,
    secret: string,
    events: string[]
  ): Promise<WebhookSubscription> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO webhook_subscriptions (id, organization_id, url, secret, events, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, organization_id, url, secret, events]
    );
    return result.rows[0];
  }

  static async updateSubscription(
    id: string,
    organization_id: number,
    updates: { url?: string; secret?: string; events?: string[]; is_active?: boolean }
  ): Promise<WebhookSubscription | null> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [organization_id];
    let paramIndex = 2;

    if (updates.url !== undefined) {
      setClauses.push(`url = $${paramIndex++}`);
      values.push(updates.url);
    }
    if (updates.secret !== undefined) {
      setClauses.push(`secret = $${paramIndex++}`);
      values.push(updates.secret);
    }
    if (updates.events !== undefined) {
      setClauses.push(`events = $${paramIndex++}`);
      values.push(updates.events);
    }
    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      values.push(updates.is_active);
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE webhook_subscriptions 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $1
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async listSubscriptions(organization_id: number): Promise<WebhookSubscription[]> {
    const result = await pool.query(
      'SELECT * FROM webhook_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC',
      [organization_id]
    );
    return result.rows;
  }

  static async deleteSubscription(id: string, organization_id: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM webhook_subscriptions WHERE id = $1 AND organization_id = $2',
      [id, organization_id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async getSubscriptionById(
    id: string,
    organization_id: number
  ): Promise<WebhookSubscription | null> {
    const result = await pool.query(
      'SELECT * FROM webhook_subscriptions WHERE id = $1 AND organization_id = $2',
      [id, organization_id]
    );
    return result.rows[0] || null;
  }

  static async dispatch(eventType: string, organization_id: number, payload: any): Promise<void> {
    const result = await pool.query(
      `SELECT * FROM webhook_subscriptions 
       WHERE organization_id = $1 AND is_active = true 
       AND (events @> $2 OR events @> '["*"]')`,
      [organization_id, [eventType]]
    );
    const subscriptions = result.rows;

    const dispatchPromises = subscriptions.map(async (sub) => {
      const timestamp = Date.now().toString();
      const payloadString = JSON.stringify(payload);
      const signature = this.generateSignature(payloadString, sub.secret, timestamp);

      try {
        const { attempts } = await this.sendWithRetry(
          sub.url,
          payload,
          {
            'X-PayD-Event': eventType,
            'X-PayD-Signature': signature,
            'X-PayD-Timestamp': timestamp,
            'Content-Type': 'application/json',
          },
          async (attempt) => {
            await this.logDelivery(
              sub.id,
              eventType,
              payload,
              attempt.responseStatus,
              attempt.responseBody,
              attempt.errorMessage,
              attempt.attemptNumber
            );
          }
        );
        console.log(`Webhook dispatched successfully to ${sub.url} after ${attempts} attempt(s)`);
      } catch (error: any) {
        const errorMessage = this.getErrorMessage(error);
        console.error(`Failed to dispatch webhook to ${sub.url}:`, errorMessage);
      }
    });

    await Promise.allSettled(dispatchPromises);
  }

  private static generateSignature(payload: string, secret: string, timestamp: string): string {
    const message = `${timestamp}.${payload}`;
    return CryptoJS.HmacSHA256(message, secret).toString(CryptoJS.enc.Hex);
  }

  private static async logDelivery(
    subscriptionId: string,
    eventType: string,
    payload: any,
    responseStatus: number | null,
    responseBody: any | null,
    errorMessage: string | null,
    attemptNumber: number
  ): Promise<void> {
    await pool.query(
      `INSERT INTO webhook_delivery_logs (subscription_id, event_type, payload, response_status, response_body, error_message, attempt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        subscriptionId,
        eventType,
        JSON.stringify(payload),
        responseStatus,
        responseBody ? JSON.stringify(responseBody) : null,
        errorMessage,
        attemptNumber,
      ]
    );
  }

  private static async sendWithRetry(
    url: string,
    data: any,
    headers: any,
    onAttempt?: (attempt: DeliveryAttemptResult) => Promise<void>
  ): Promise<{ status: number; data: any; attempts: number }> {
    let delay = this.INITIAL_RETRY_DELAY_MS;

    for (let attemptNumber = 1; attemptNumber <= this.MAX_DELIVERY_ATTEMPTS; attemptNumber += 1) {
      try {
        const response = await axios.post(url, data, {
          headers,
          timeout: this.REQUEST_TIMEOUT_MS,
        });

        await onAttempt?.({
          attemptNumber,
          responseStatus: response.status,
          responseBody: response.data,
          errorMessage: null,
        });

        return { status: response.status, data: response.data, attempts: attemptNumber };
      } catch (error: any) {
        await onAttempt?.({
          attemptNumber,
          responseStatus: error.response?.status ?? null,
          responseBody: error.response?.data ?? null,
          errorMessage: this.getErrorMessage(error),
        });

        if (attemptNumber === this.MAX_DELIVERY_ATTEMPTS) {
          throw error;
        }

        console.log(
          `Retrying webhook to ${url} with exponential backoff (${attemptNumber + 1}/${this.MAX_DELIVERY_ATTEMPTS}) in ${delay}ms...`
        );
        await this.sleep(delay);
        delay *= 2;
      }
    }

    throw new Error(`Unable to deliver webhook to ${url}`);
  }

  private static getErrorMessage(error: any): string {
    return error.response?.data?.message || error.message || 'Unknown webhook delivery error';
  }

  private static sleep(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  static async getDeliveryLogs(subscriptionId: string, limit = 20): Promise<WebhookDeliveryLog[]> {
    const result = await pool.query(
      `SELECT * FROM webhook_delivery_logs 
       WHERE subscription_id = $1 
       ORDER BY delivered_at DESC 
       LIMIT $2`,
      [subscriptionId, limit]
    );
    return result.rows;
  }
}
