use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

declare_id!("8HwWCiVQPYG4L5SRFfWqJP1VK1xQ4EWwebVLcumWJ2gE");

// ============================================================
//  OGGCOIN ($OGG) — Solana Anchor Program v1.0
//  
//  Architecture:
//  - SPL Token with PDA as Mint Authority (proxy pattern)
//  - Freeze Authority: REVOKED at initialization
//  - Transfer Restrictions: NONE
//  - Initial mint: 19% (1,900,000,000 OGG) to Treasury
//  - Future 4% mint: authorized via program upgrade (NOT hardcoded)
//  - 77% reserved for EVM PoW mining (Phase 2)
// ============================================================

/// Total maximum supply: 10,000,000,000 OGG
pub const MAX_SUPPLY: u64 = 10_000_000_000 * 1_000_000_000; // with 9 decimals

/// Initial mint at launch: 19% = 1,900,000,000 OGG
pub const INITIAL_MINT_AMOUNT: u64 = 1_900_000_000 * 1_000_000_000;

/// OGG token decimals (matching SOL standard)
pub const TOKEN_DECIMALS: u8 = 9;

/// PDA seed used to derive the Mint Authority PDA
pub const MINT_AUTHORITY_SEED: &[u8] = b"ogg_mint_authority";

/// PDA seed for program state
pub const STATE_SEED: &[u8] = b"ogg_state";

// ============================================================
//  PROGRAM STATE
// ============================================================

#[account]
#[derive(Default)]
pub struct OggState {
    /// The admin wallet that controls upgrades
    pub admin: Pubkey,
    /// The OGG token mint address
    pub mint: Pubkey,
    /// The treasury wallet that holds the initial 19%
    pub treasury: Pubkey,
    /// Total tokens minted so far
    pub total_minted: u64,
    /// Whether the program has been initialized
    pub is_initialized: bool,
    /// Bump for state PDA
    pub state_bump: u8,
    /// Bump for mint authority PDA
    pub mint_authority_bump: u8,
}

impl OggState {
    pub const LEN: usize = 8  // discriminator
        + 32  // admin
        + 32  // mint
        + 32  // treasury
        + 8   // total_minted
        + 1   // is_initialized
        + 1   // state_bump
        + 1;  // mint_authority_bump
}

// ============================================================
//  PROGRAM ENTRYPOINTS
// ============================================================

#[program]
pub mod oggcoin {
    use super::*;

    /// Initialize the Oggcoin program.
    /// 
    /// This instruction:
    /// 1. Creates the program state account
    /// 2. Records admin, mint, and treasury addresses
    /// 3. Derives PDA bumps for later use
    /// 
    /// NOTE: The SPL token itself is created separately via the
    /// Solana CLI / Metaplex tooling before calling this instruction.
    /// This instruction registers the already-created mint into
    /// the program's state.
    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;

        require!(!state.is_initialized, OggError::AlreadyInitialized);

        state.admin = ctx.accounts.admin.key();
        state.mint = ctx.accounts.mint.key();
        state.treasury = treasury;
        state.total_minted = 0;
        state.is_initialized = true;
        state.state_bump = ctx.bumps.state;
        state.mint_authority_bump = ctx.bumps.mint_authority;

        emit!(ProgramInitialized {
            admin: state.admin,
            mint: state.mint,
            treasury,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Oggcoin program initialized.");
        msg!("Admin: {}", state.admin);
        msg!("Mint: {}", state.mint);
        msg!("Treasury: {}", treasury);

        Ok(())
    }

    /// Perform the initial mint of 1,900,000,000 OGG (19% of total supply)
    /// to the Treasury wallet.
    /// 
    /// This can only be called ONCE. After the initial mint, total_minted
    /// is recorded and this instruction will fail if called again.
    pub fn mint_initial_supply(ctx: Context<MintInitialSupply>) -> Result<()> {
        let state = &mut ctx.accounts.state;

        require!(state.is_initialized, OggError::NotInitialized);
        require!(state.total_minted == 0, OggError::AlreadyMinted);

        // Verify the treasury token account belongs to the correct treasury
        require!(
            ctx.accounts.treasury_token_account.owner == state.treasury,
            OggError::InvalidTreasury
        );

        let mint_authority_bump = state.mint_authority_bump;
        let seeds = &[MINT_AUTHORITY_SEED, &[mint_authority_bump]];
        let signer = &[&seeds[..]];

        // Mint INITIAL_MINT_AMOUNT to the treasury token account
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer,
            ),
            INITIAL_MINT_AMOUNT,
        )?;

        state.total_minted = INITIAL_MINT_AMOUNT;

        emit!(TokensMinted {
            amount: INITIAL_MINT_AMOUNT,
            recipient: state.treasury,
            total_minted: state.total_minted,
            mint_type: MintType::InitialSupply,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Initial supply minted: {} OGG (raw units) to treasury",
            INITIAL_MINT_AMOUNT
        );

        Ok(())
    }

    /// Future allocation mint (4% = 400,000,000 OGG).
    /// 
    /// This instruction is a SHELL in v1. The actual 4% mint logic
    /// will be added via a program upgrade in a future version.
    /// 
    /// Currently: only admin can call this, and it does NOT mint anything.
    /// The instruction exists so the program interface is stable for
    /// future upgrades without breaking IDL compatibility.
    pub fn mint_future_allocation(
        ctx: Context<MintFutureAllocation>,
        _amount: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.state.admin,
            OggError::Unauthorized
        );

        // v1 SHELL: future mint logic to be added via program upgrade
        // DO NOT implement minting logic here in v1
        msg!("mint_future_allocation: v1 shell — no tokens minted.");
        msg!("Future 4% allocation logic will be added in a program upgrade.");

        Ok(())
    }

    /// Admin-only: update the treasury address.
    /// Useful if the treasury wallet needs to be rotated.
    pub fn update_treasury(
        ctx: Context<AdminOnly>,
        new_treasury: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.state.admin,
            OggError::Unauthorized
        );

        let old_treasury = ctx.accounts.state.treasury;
        ctx.accounts.state.treasury = new_treasury;

        emit!(TreasuryUpdated {
            old_treasury,
            new_treasury,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Treasury updated: {} → {}", old_treasury, new_treasury);
        Ok(())
    }

    /// Read-only: get current program state info.
    /// This is a no-op instruction used for fetching state in tests.
    pub fn get_state(_ctx: Context<GetState>) -> Result<()> {
        Ok(())
    }
}

// ============================================================
//  ACCOUNT CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The OGG SPL token mint. Must already exist.
    /// The program will use the PDA as its mint authority.
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// Program state PDA
    #[account(
        init,
        payer = admin,
        space = OggState::LEN,
        seeds = [STATE_SEED],
        bump
    )]
    pub state: Account<'info, OggState>,

    /// PDA that will become the Mint Authority.
    /// Derived from MINT_AUTHORITY_SEED.
    /// CHECK: This is a PDA used only as a signing authority.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintInitialSupply<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [STATE_SEED],
        bump = state.state_bump,
        has_one = mint,
    )]
    pub state: Account<'info, OggState>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA signing authority for the mint
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump = state.mint_authority_bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// Treasury token account (ATA of treasury wallet for OGG)
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintFutureAllocation<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.state_bump,
    )]
    pub state: Account<'info, OggState>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [STATE_SEED],
        bump = state.state_bump,
    )]
    pub state: Account<'info, OggState>,
}

#[derive(Accounts)]
pub struct GetState<'info> {
    #[account(
        seeds = [STATE_SEED],
        bump = state.state_bump,
    )]
    pub state: Account<'info, OggState>,
}

// ============================================================
//  EVENTS
// ============================================================

#[event]
pub struct ProgramInitialized {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub amount: u64,
    pub recipient: Pubkey,
    pub total_minted: u64,
    pub mint_type: MintType,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryUpdated {
    pub old_treasury: Pubkey,
    pub new_treasury: Pubkey,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MintType {
    InitialSupply,
    FutureAllocation,
}

// ============================================================
//  ERRORS
// ============================================================

#[error_code]
pub enum OggError {
    #[msg("Program is already initialized.")]
    AlreadyInitialized,

    #[msg("Program is not initialized yet.")]
    NotInitialized,

    #[msg("Initial supply has already been minted.")]
    AlreadyMinted,

    #[msg("Unauthorized: only admin can call this instruction.")]
    Unauthorized,

    #[msg("Invalid treasury account.")]
    InvalidTreasury,

    #[msg("Mint amount exceeds maximum supply cap of 10 billion OGG.")]
    ExceedsMaxSupply,
}
