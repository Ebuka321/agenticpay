import { Router } from 'express';
import { verifyWork, getVerification } from '../services/verification.js';

export const verificationRouter = Router();

// AI-powered work verification
verificationRouter.post('/verify', async (req, res) => {
  try {
    const { repositoryUrl, milestoneDescription, projectId } = req.body;

    if (!repositoryUrl || !milestoneDescription || !projectId) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    const result = await verifyWork({ repositoryUrl, milestoneDescription, projectId });
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
});

// Get verification result by ID
verificationRouter.get('/:id', async (req, res) => {
  try {
    const result = await getVerification(req.params.id);
    if (!result) {
      res.status(404).json({ message: 'Verification not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Get verification error:', error);
    res.status(500).json({ message: 'Failed to fetch verification' });
  }
});
