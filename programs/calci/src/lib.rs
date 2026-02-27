use anchor_lang::prelude::*;

declare_id!("8HwWCiVQPYG4L5SRFfWqJP1VK1xQ4EWwebVLcumWJ2gE");

#[program]
pub mod calci {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
