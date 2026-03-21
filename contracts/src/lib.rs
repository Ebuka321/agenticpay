#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProjectStatus {
    Created,
    Funded,
    InProgress,
    WorkSubmitted,
    Verified,
    Completed,
    Disputed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Project {
    pub id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub amount: i128,
    pub deposited: i128,
    pub status: ProjectStatus,
    pub github_repo: String,
    pub description: String,
    pub created_at: u64,
}

#[contracttype]
pub enum DataKey {
    Project(u64),
    ProjectCount,
    Admin,
}

#[contract]
pub struct AgenticPayContract;

#[contractimpl]
impl AgenticPayContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ProjectCount, &0u64);
    }

    /// Create a new project with escrow
    pub fn create_project(
        env: Env,
        client: Address,
        freelancer: Address,
        amount: i128,
        description: String,
        github_repo: String,
    ) -> u64 {
        client.require_auth();

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProjectCount)
            .unwrap_or(0);
        count += 1;

        let project = Project {
            id: count,
            client,
            freelancer,
            amount,
            deposited: 0,
            status: ProjectStatus::Created,
            github_repo,
            description,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Project(count), &project);
        env.storage().instance().set(&DataKey::ProjectCount, &count);

        count
    }

    /// Fund a project escrow with XLM
    pub fn fund_project(env: Env, project_id: u64, client: Address, amount: i128) {
        client.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .expect("Project not found");

        assert!(project.client == client, "Only client can fund");
        assert!(
            project.status == ProjectStatus::Created,
            "Project must be in Created status"
        );

        project.deposited += amount;
        if project.deposited >= project.amount {
            project.status = ProjectStatus::Funded;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    /// Freelancer submits work with a GitHub repo reference
    pub fn submit_work(env: Env, project_id: u64, freelancer: Address, github_repo: String) {
        freelancer.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .expect("Project not found");

        assert!(
            project.freelancer == freelancer,
            "Only assigned freelancer can submit"
        );
        assert!(
            project.status == ProjectStatus::Funded || project.status == ProjectStatus::InProgress,
            "Project must be funded or in progress"
        );

        project.github_repo = github_repo;
        project.status = ProjectStatus::WorkSubmitted;

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    /// Approve work and release escrow funds to freelancer
    pub fn approve_work(env: Env, project_id: u64, client: Address) {
        client.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .expect("Project not found");

        assert!(project.client == client, "Only client can approve");
        assert!(
            project.status == ProjectStatus::WorkSubmitted
                || project.status == ProjectStatus::Verified,
            "Work must be submitted or verified"
        );

        // TODO: Transfer deposited funds to freelancer via Stellar token transfer

        project.status = ProjectStatus::Completed;
        project.deposited = 0;

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    /// Raise a dispute on a project
    pub fn raise_dispute(env: Env, project_id: u64, caller: Address) {
        caller.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .expect("Project not found");

        assert!(
            caller == project.client || caller == project.freelancer,
            "Only client or freelancer can dispute"
        );

        project.status = ProjectStatus::Disputed;

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    /// Admin resolves a dispute
    pub fn resolve_dispute(env: Env, project_id: u64, admin: Address, release_to_freelancer: bool) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(admin == stored_admin, "Only admin can resolve disputes");

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .expect("Project not found");

        assert!(
            project.status == ProjectStatus::Disputed,
            "Project must be disputed"
        );

        if release_to_freelancer {
            // TODO: Transfer funds to freelancer
            project.status = ProjectStatus::Completed;
        } else {
            // TODO: Refund funds to client
            project.status = ProjectStatus::Cancelled;
        }

        project.deposited = 0;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    /// Get project details
    pub fn get_project(env: Env, project_id: u64) -> Project {
        env.storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .expect("Project not found")
    }

    /// Get total project count
    pub fn get_project_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ProjectCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_project_creation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let project = Project {
            id: 1,
            client,
            freelancer,
            amount: 1000,
            deposited: 0,
            status: ProjectStatus::Created,
            github_repo: String::from_str(&env, "https://github.com/example/repo"),
            description: String::from_str(&env, "Test project"),
            created_at: env.ledger().timestamp(),
        };

        assert_eq!(project.amount, 1000);
        assert_eq!(project.status, ProjectStatus::Created);
    }
}
