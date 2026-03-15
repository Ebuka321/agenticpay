import * as StellarSdk from '@stellar/stellar-sdk';

const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const HORIZON_URL =
  NETWORK === 'public'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

export async function getAccountInfo(address: string) {
  const account = await server.loadAccount(address);
  return {
    address: account.accountId(),
    balances: account.balances.map((b) => ({
      type: b.asset_type,
      balance: b.balance,
    })),
    sequence: account.sequence,
  };
}

export async function getTransactionStatus(hash: string) {
  const tx = await server.transactions().transaction(hash).call();
  return {
    hash: tx.hash,
    successful: tx.successful,
    ledger: tx.ledger_attr,
    createdAt: tx.created_at,
    memo: tx.memo,
    operationCount: tx.operation_count,
  };
}
