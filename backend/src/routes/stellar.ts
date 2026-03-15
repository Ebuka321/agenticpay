import { Router } from 'express';
import { getAccountInfo, getTransactionStatus } from '../services/stellar.js';

export const stellarRouter = Router();

// Get Stellar account info
stellarRouter.get('/account/:address', async (req, res) => {
  try {
    const account = await getAccountInfo(req.params.address);
    res.json(account);
  } catch (error) {
    console.error('Stellar account error:', error);
    res.status(500).json({ message: 'Failed to fetch account info' });
  }
});

// Get transaction status
stellarRouter.get('/tx/:hash', async (req, res) => {
  try {
    const tx = await getTransactionStatus(req.params.hash);
    res.json(tx);
  } catch (error) {
    console.error('Stellar tx error:', error);
    res.status(500).json({ message: 'Failed to fetch transaction' });
  }
});
