import { Router } from 'express';
import { EmailService, EmailDeliveryRecord } from './email-service';

const router = Router();

const emailService = new EmailService({
  apiKey: process.env.RESEND_API_KEY || '',
  fromEmail: process.env.EMAIL_FROM || 'noreply@agenticpay.com',
  fromName: 'AgenticPay',
});

router.post('/templates', async (req, res) => {
  try {
    const template = await emailService.createTemplate(req.body);
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const template = await emailService.updateTemplate(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get('/templates/:id', async (req, res) => {
  const template = emailService.getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

router.post('/send', async (req, res) => {
  try {
    const { to, templateId, subject, body, variables, tracking } = req.body;
    
    const record = await emailService.sendEmail({
      to,
      templateId,
      subject,
      body,
      variables,
      tracking,
    });
    
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const { type, recipient, deliveryId, timestamp } = req.body;
    
    await emailService.handleWebhook({ type, recipient, deliveryId, timestamp });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, userId } = req.body;
    
    await emailService.unsubscribe(email, userId);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;