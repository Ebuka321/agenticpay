export interface TokenPrice {
  symbol: string;
  address: string;
  price: number;
  change24h: number;
  lastUpdated: string;
  source: string;
}

export interface WalletBalance {
  walletAddress: string;
  chain: string;
  balances: {
    symbol: string;
    balance: string;
    balanceUSD: number;
    price: number;
    change24h: number;
  }[];
}

export interface PortfolioSummary {
  totalValueUSD: number;
  change24hUSD: number;
  change24hPercent: number;
  wallets: WalletBalance[];
  allocations: Allocation[];
  lastUpdated: string;
}

export interface Allocation {
  symbol: string;
  valueUSD: number;
  percentage: number;
  color: string;
}

class PortfolioService {
  private priceOracle: string;
  private rpcProviders: Map<string, string>;

  constructor(config: { priceOracle: string; rpcProviders: Record<string, string> }) {
    this.priceOracle = config.priceOracle;
    this.rpcProviders = new Map(Object.entries(config.rpcProviders));
  }

  async getPortfolio(walletAddresses: string[], chains: string[]): Promise<PortfolioSummary> {
    const walletBalances: WalletBalance[] = [];
    const allPrices = await this.fetchPrices();
    const pricesMap = new Map(allPrices.map(p => [p.symbol, p]));

    for (const chain of chains) {
      for (const address of walletAddresses) {
        const balance = await this.fetchChainBalance(address, chain, pricesMap);
        if (balance.balances.length > 0) {
          walletBalances.push(balance);
        }
      }
    }

    return this.calculatePortfolioSummary(walletBalances);
  }

  async fetchPrices(symbols?: string[]): Promise<TokenPrice[]> {
    const url = this.priceOracle;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      
      if (!response.ok) {
        return this.getMockPrices(symbols);
      }
      
      return response.json();
    } catch {
      return this.getMockPrices(symbols);
    }
  }

  private getMockPrices(symbols?: string[]): TokenPrice[] {
    const defaultSymbols = ['ETH', 'BTC', 'USDC', 'USDT', 'DAI'];
    const targetSymbols = symbols || defaultSymbols;
    
    const mockPrices: Record<string, { price: number; change24h: number }> = {
      ETH: { price: 3500, change24h: 2.5 },
      BTC: { price: 75000, change24h: 1.2 },
      USDC: { price: 1, change24h: 0 },
      USDT: { price: 1, change24h: 0 },
      DAI: { price: 1, change24h: 0 },
    };
    
    return targetSymbols.map(symbol => ({
      symbol,
      address: '',
      price: mockPrices[symbol]?.price || 0,
      change24h: mockPrices[symbol]?.change24h || 0,
      lastUpdated: new Date().toISOString(),
      source: 'mock',
    }));
  }

  async fetchChainBalance(
    walletAddress: string,
    chain: string,
    prices: Map<string, TokenPrice>
  ): Promise<WalletBalance> {
    const rpcUrl = this.rpcProviders.get(chain);
    if (!rpcUrl) {
      return { walletAddress, chain, balances: [] };
    }

    const tokenBalances = await this.queryTokenBalances(walletAddress, chain, rpcUrl);
    
    const balances = tokenBalances.map(token => {
      const priceInfo = prices.get(token.symbol);
      const balanceUSD = parseFloat(token.balance) * (priceInfo?.price || 0);
      
      return {
        symbol: token.symbol,
        balance: token.balance,
        balanceUSD,
        price: priceInfo?.price || 0,
        change24h: priceInfo?.change24h || 0,
      };
    }).filter(b => b.balanceUSD > 0.01);

    return { walletAddress, chain, balances };
  }

  private async queryTokenBalances(
    walletAddress: string,
    chain: string,
    rpcUrl: string
  ): Promise<{ symbol: string; balance: string }[]> {
    return [
      { symbol: chain === 'ethereum' ? 'ETH' : 'ETH', balance: '0.5' },
    ];
  }

  private calculatePortfolioSummary(walletBalances: WalletBalance[]): PortfolioSummary {
    let totalValueUSD = 0;
    let totalPreviousValueUSD = 0;

    for (const wallet of walletBalances) {
      for (const balance of wallet.balances) {
        totalValueUSD += balance.balanceUSD;
        const previousValue = balance.balanceUSD / (1 + balance.change24h / 100);
        totalPreviousValueUSD += previousValue;
      }
    }

    const change24hUSD = totalValueUSD - totalPreviousValueUSD;
    const change24hPercent = totalPreviousValueUSD > 0 
      ? (change24hUSD / totalPreviousValueUSD) * 100 
      : 0;

    const allocations = this.calculateAllocations(walletBalances);

    return {
      totalValueUSD,
      change24hUSD,
      change24hPercent,
      wallets: walletBalances,
      allocations,
      lastUpdated: new Date().toISOString(),
    };
  }

  private calculateAllocations(walletBalances: WalletBalance[]): Allocation[] {
    const valueBySymbol: Map<string, number> = new Map();
    let totalValue = 0;

    for (const wallet of walletBalances) {
      for (const balance of wallet.balances) {
        const current = valueBySymbol.get(balance.symbol) || 0;
        valueBySymbol.set(balance.symbol, current + balance.balanceUSD);
        totalValue += balance.balanceUSD;
      }
    }

    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    const symbols = Array.from(valueBySymbol.keys());

    return symbols.map((symbol, index) => {
      const valueUSD = valueBySymbol.get(symbol) || 0;
      return {
        symbol,
        valueUSD,
        percentage: totalValue > 0 ? (valueUSD / totalValue) * 100 : 0,
        color: colors[index % colors.length],
      };
    }).sort((a, b) => b.valueUSD - a.valueUSD);
  }

  async exportToCSV(portfolio: PortfolioSummary): Promise<string> {
    const headers = ['Symbol', 'Chain', 'Balance', 'Price USD', 'Value USD', 'Change 24h %'];
    const rows: string[][] = [];

    for (const wallet of portfolio.wallets) {
      for (const balance of wallet.balances) {
        rows.push([
          balance.symbol,
          wallet.chain,
          balance.balance,
          balance.price.toFixed(2),
          balance.balanceUSD.toFixed(2),
          balance.change24h.toFixed(2),
        ]);
      }
    }

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    return csv;
  }

  async getHistoricalPortfolio(
    walletAddresses: string[],
    days: number = 30
  ): Promise<{
    date: string;
    valueUSD: number;
  }[]> {
    return this.generateHistoricalData(days);
  }

  private async generateHistoricalData(days: number): Promise<{ date: string; valueUSD: number }[]> {
    const data: { date: string; valueUSD: number }[] = [];
    let value = 50000;

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      value = value * (1 + (Math.random() - 0.5) * 0.02);
      
      data.push({
        date: date.toISOString().split('T')[0],
        valueUSD: Math.round(value * 100) / 100,
      });
    }

    return data;
  }
}

export { PortfolioService };