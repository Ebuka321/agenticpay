#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec, token};

#[cfg(test)]
mod test;

#[contracttype]
pub enum DataKey {
    Admin,
    Recipients,
    /// Tracks the last ledger sequence in which a distribution was processed.
    LastDistributeLedger,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct RecipientShare {
    pub destination: Address,
    pub basis_points: u32,
}

pub const TOTAL_BASIS_POINTS: u32 = 10000; // 100%

const PERSISTENT_TTL_THRESHOLD: u32 = 20_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 120_000;

#[contract]
pub struct RevenueSplitContract;

#[contractimpl]
impl RevenueSplitContract {
    // ── SEP-0034 Contract Metadata (Issue #263) ───────────────────────────

    /// Returns the human-readable contract name (SEP-0034).
    pub fn name(env: Env) -> String {
        String::from_str(&env, env!("CARGO_PKG_NAME"))
    }

    /// Returns the contract version string (SEP-0034).
    pub fn version(env: Env) -> String {
        String::from_str(&env, env!("CARGO_PKG_VERSION"))
    }

    /// Returns the contract author / organization (SEP-0034).
    pub fn author(env: Env) -> String {
        String::from_str(&env, env!("CARGO_PKG_AUTHORS"))
    }

    /// Initialize the contract with an admin and an initial set of recipients/shares.
    pub fn init(env: Env, admin: Address, shares: Vec<RecipientShare>) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        
        let mut total_bp = 0;
        for share in shares.iter() {
            total_bp += share.basis_points;
        }
        
        if total_bp != TOTAL_BASIS_POINTS {
            panic!("Shares must sum to 10000 basis points");
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        
        let recipient_key = DataKey::Recipients;
        env.storage().persistent().set(&recipient_key, &shares);
        // Extend TTL for recipients (1 month initially)
        env.storage().persistent().extend_ttl(&recipient_key, 100_000, 500_000);
    }

    /// Allows the current admin to set a new admin.
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).expect("Admin entry unavailable; restore and retry");
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &new_admin);
        Self::bump_core_ttl(&env);
    }

    /// Updates the recipient splits dynamically (admin only).
    pub fn update_recipients(env: Env, new_shares: Vec<RecipientShare>) {
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).expect("Admin entry unavailable; restore and retry");
        admin.require_auth();

        let mut total_bp = 0;
        for share in new_shares.iter() {
            total_bp += share.basis_points;
        }
        
        if total_bp != TOTAL_BASIS_POINTS {
            panic!("Shares must sum to 10000 basis points");
        }

        let key = DataKey::Recipients;
        env.storage().persistent().set(&key, &new_shares);
        env.storage().persistent().extend_ttl(&key, 100_000, 500_000);
    }

    /// Distributes a specific token amount from a sender to the listed recipients based on their shares.
    pub fn distribute(env: Env, token: Address, from: Address, amount: i128) {
        if amount <= 0 {
             return;
        }
        from.require_auth();

        // Ledger sequence verification: prevent duplicate distributions in the same ledger
        Self::require_unique_ledger(&env);
        
        let shares: Vec<RecipientShare> = env.storage().persistent().get(&DataKey::Recipients).expect("Not initialized");
        env.storage().persistent().extend_ttl(&DataKey::Recipients, 100_000, 500_000);
        
        let client = token::Client::new(&env, &token);

        let mut amount_distributed = 0;
        let total_bp = TOTAL_BASIS_POINTS as i128;
        let shares_len = shares.len();

        for (i, share) in shares.iter().enumerate() {
            // Formula: amount * basis_points / 10000
            // We optimize by checking if we are at the last share to dump the precision remainder
            if i as u32 == shares_len - 1 {
                let final_amount = amount - amount_distributed;
                if final_amount > 0 {
                    client.transfer(&from, &share.destination, &final_amount);
                }
            } else {
                let recipient_amount = (amount * share.basis_points as i128) / total_bp;
                if recipient_amount > 0 {
                    client.transfer(&from, &share.destination, &recipient_amount);
                    amount_distributed += recipient_amount;
                }
            }
        }
    }

    /// Returns the ledger sequence of the last successful distribution.
    pub fn get_last_distribute_ledger(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::LastDistributeLedger).unwrap_or(0)
    }

    /// Ensures a distribution has not already been executed in the current ledger
    /// sequence, preventing replay attacks.
    fn require_unique_ledger(env: &Env) {
        let current_ledger = env.ledger().sequence();
        let last_ledger: u32 = env.storage().persistent()
            .get(&DataKey::LastDistributeLedger)
            .unwrap_or(0);
        if last_ledger == current_ledger && current_ledger != 0 {
            panic!("Distribution already processed in this ledger sequence");
        }
        env.storage().persistent().set(&DataKey::LastDistributeLedger, &current_ledger);
        env.storage().persistent().extend_ttl(
            &DataKey::LastDistributeLedger,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
    }

    fn bump_core_ttl(env: &Env) {
        for key in [DataKey::Admin, DataKey::Recipients] {
            if env.storage().persistent().has(&key) {
                env.storage().persistent().extend_ttl(
                    &key,
                    PERSISTENT_TTL_THRESHOLD,
                    PERSISTENT_TTL_EXTEND_TO,
                );
            }
        }
    }
}
