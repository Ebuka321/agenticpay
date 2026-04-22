import { Resend } from 'resend';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailDeliveryRecord {
  id: string;
  templateId: string;
  recipient: string;
  subject: string;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bounceReason?: string;
}

export interface EmailPreferences {
  userId: string;
  paymentConfirmations: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
  weeklyDigest: boolean;
  fallbackEmail?: string;
}

class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private fromName: string;
  private templates: Map<string, EmailTemplate>;

  constructor(config: { apiKey: string; fromEmail: string; fromName: string }) {
    this.resend = new Resend(config.apiKey);
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName;
    this.templates = new Map();
    
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates(): void {
    const defaultTemplates: EmailTemplate[] = [
      {
        id: 'payment-confirmation',
        name: 'Payment Confirmation',
        subject: 'Payment Confirmed - {{amount}} {{currency}}',
        body: `
          <h1>Payment Confirmed</h1>
          <p>Your payment of <strong>{{amount}} {{currency}}</strong> has been confirmed.</p>
          <h2>Transaction Details</h2>
          <ul>
            <li><strong>Transaction ID:</strong> {{transactionId}}</li>
            <li><strong>From:</strong> {{senderAddress}}</li>
            <li><strong>To:</strong> {{recipientAddress}}</li>
            <li><strong>Date:</strong> {{timestamp}}</li>
            <li><strong>Status:</strong> {{status}}</li>
          </ul>
          <p>Thank you for using AgenticPay!</p>
        `,
        variables: ['amount', 'currency', 'transactionId', 'senderAddress', 'recipientAddress', 'timestamp', 'status'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'payment-received',
        name: 'Payment Received',
        subject: 'You received {{amount}} {{currency}}!',
        body: `
          <h1>Payment Received!</h1>
          <p>You received <strong>{{amount}} {{currency}}</strong> from {{senderAddress}}.</p>
          <h2>Transaction Details</h2>
          <ul>
            <li><strong>Transaction ID:</strong> {{transactionId}}</li>
            <li><strong>From:</strong> {{senderAddress}}</li>
            <li><strong>Date:</strong> {{timestamp}}</li>
          </ul>
          <p>Thank you for using AgenticPay!</p>
        `,
        variables: ['amount', 'currency', 'transactionId', 'senderAddress', 'timestamp'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }
  }

  async createTemplate(template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<EmailTemplate> {
    const newTemplate: EmailTemplate = {
      ...template,
      id: `template-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  async updateTemplate(templateId: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const updated: EmailTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.templates.set(templateId, updated);
    return updated;
  }

  async sendEmail(options: {
    to: string;
    templateId?: string;
    subject?: string;
    body?: string;
    variables?: Record<string, string>;
    tracking?: boolean;
  }): Promise<EmailDeliveryRecord> {
    const record: EmailDeliveryRecord = {
      id: `delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      templateId: options.templateId || '',
      recipient: options.to,
      subject: options.subject || '',
      status: 'pending',
    };

    let emailBody = options.body || '';
    let emailSubject = options.subject || '';

    if (options.templateId) {
      const template = this.templates.get(options.templateId);
      if (template) {
        record.templateId = template.id;
        emailSubject = this.interpolateTemplate(template.subject, options.variables || {});
        emailBody = this.interpolateTemplate(template.body, options.variables || {});
      }
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: emailSubject,
        html: emailBody,
        tracking: options.tracking ? {
          opens: true,
          clicks: true,
        } : undefined,
      });

      if (response.error) {
        record.status = 'failed';
        record.bounceReason = response.error.message;
      } else {
        record.status = 'sent';
        record.sentAt = new Date().toISOString();
      }
    } catch (error) {
      record.status = 'failed';
      record.bounceReason = String(error);
    }

    return record;
  }

  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  async sendPaymentConfirmation(options: {
    to: string;
    transactionId: string;
    amount: string;
    currency: string;
    senderAddress: string;
    recipientAddress: string;
    status: string;
  }): Promise<EmailDeliveryRecord> {
    return this.sendEmail({
      to: options.to,
      templateId: 'payment-confirmation',
      variables: {
        amount: options.amount,
        currency: options.currency,
        transactionId: options.transactionId,
        senderAddress: options.senderAddress,
        recipientAddress: options.recipientAddress,
        timestamp: new Date().toISOString(),
        status: options.status,
      },
      tracking: true,
    });
  }

  async sendPaymentReceived(options: {
    to: string;
    transactionId: string;
    amount: string;
    currency: string;
    senderAddress: string;
  }): Promise<EmailDeliveryRecord> {
    return this.sendEmail({
      to: options.to,
      templateId: 'payment-received',
      variables: {
        amount: options.amount,
        currency: options.currency,
        transactionId: options.transactionId,
        senderAddress: options.senderAddress,
        timestamp: new Date().toISOString(),
      },
      tracking: true,
    });
  }

  async handleWebhook(payload: {
    type: 'open' | 'click' | 'bounce';
    recipient: string;
    deliveryId: string;
    timestamp: string;
  }): Promise<void> {
    console.log(`Email event: ${payload.type} for ${payload.recipient}`);
  }

  async unsubscribe(email: string, userId: string): Promise<void> {
    console.log(`Unsubscribed ${email} (user: ${userId})`);
  }

  async updatePreferences(userId: string, preferences: EmailPreferences): Promise<void> {
    console.log(`Updated preferences for user ${userId}:`, preferences);
  }

  async getPreferences(userId: string): Promise<EmailPreferences | null> {
    return {
      userId,
      paymentConfirmations: true,
      marketingEmails: false,
      securityAlerts: true,
      weeklyDigest: false,
    };
  }

  getTemplate(templateId: string): EmailTemplate | undefined {
    return this.templates.get(templateId);
  }

  async getAllTemplates(): Promise<EmailTemplate[]> {
    return Array.from(this.templates.values());
  }
}

class EmailQueueService {
  private queue: Array<{
    delivery: EmailDeliveryRecord;
    sendOptions: Parameters<EmailService['sendEmail']>[0];
  }>;
  private isProcessing: boolean;
  private maxRetries: number;

  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
  }

  async enqueue(
    emailService: EmailService,
    options: Parameters<EmailService['sendEmail']>[0]
  ): Promise<EmailDeliveryRecord> {
    const delivery = await emailService.sendEmail(options);
    
    this.queue.push({ delivery, sendOptions: options });
    
    if (!this.isProcessing) {
      this.processQueue(emailService);
    }
    
    return delivery;
  }

  private async processQueue(emailService: EmailService): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue[0];
      
      if (item.delivery.status === 'failed' && item.delivery.sentAt) {
        const retryCount = (item.delivery.sentAt ? 0 : 0);
        
        if (retryCount < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
          const retry = await emailService.sendEmail(item.sendOptions);
          item.delivery = retry;
        }
      }
      
      if (item.delivery.status === 'sent') {
        this.queue.shift();
      } else {
        break;
      }
    }
    
    this.isProcessing = false;
  }
}

export { EmailService, EmailQueueService };