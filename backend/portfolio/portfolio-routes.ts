import { Router } from 'express';
import { PortfolioService } from './portfolio-service';

const router = Router();

const portfolioService = new PortfolioService({
  priceOracle: process.env.PRICE_ORACLE_URL || '',
  rpcProviders: {
    ethereum: process.env.ETHEREUM_RPC_URL || '',
    polygon: process.env.POLYGON_RPC_URL || '',
    optimism: process.env.OPTIMISM_RPC_URL || '',
    arbitrum: process.env.ARBITRUM_RPC_URL || '',
  },
});

router.get('/portfolio', async (req, res) => {
  try {
    const { wallets, chains } = req.query;
    
    const walletAddresses = Array.isArray(wallets) 
      ? wallets as string[] 
      : wallets 
        ? [wallets as string] 
        : [];
    const chainList = Array.isArray(chains) 
      ? chains as string[] 
      : chains 
        ? [chains as string] 
        : ['ethereum'];
    
    if (walletAddresses.length === 0) {
      return res.status(400).json({ error: 'No wallet addresses provided' });
    }
    
    const portfolio = await portfolioService.getPortfolio(walletAddresses, chainList);
    res.json(portfolio);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get('/portfolio/export', async (req, res) => {
  try {
    const { wallets, chains } = req.query;
    
    const walletAddresses = Array.isArray(wallets) 
      ? wallets as string[] 
      : [wallets as string];
    const chainList = Array.isArray(chains) 
      ? chains as string[] 
      : [chains as string];
    
    const portfolio = await portfolioService.getPortfolio(walletAddresses, chainList);
    const csv = await portfolioService.exportToCSV(portfolio);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=portfolio.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get('/portfolio/history', async (req, res) => {
  try {
    const { wallets, days } = req.query;
    
    const walletAddresses = Array.isArray(wallets) 
      ? wallets as string[] 
      : [wallets as string];
    const historyDays = days ? parseInt(days as string) : 30;
    
    const history = await portfolioService.getHistoricalPortfolio(walletAddresses, historyDays);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post('/portfolio/alert', async (req, res) => {
  try {
    const { walletAddress, threshold, direction } = req.body;
    console.log(`Alert configured for ${walletAddress}: ${direction} ${threshold}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;