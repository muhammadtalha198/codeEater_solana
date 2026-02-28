use anchor_lang::prelude::*;

declare_id!("8HwWCiVQPYG4L5SRFfWqJP1VK1xQ4EWwebVLcumWJ2gE");

#[program]
pub mod calci {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.cacli_acc.calci_result = 0;
        ctx.accounts.cacli_acc.payer = ctx.accounts.fee_payer.key();
        msg!("Greetings from Calculator Program: {:?}", ctx.program_id);
        msg!("Payer: {:?}", ctx.accounts.cacli_acc.payer);
        Ok(())
    }

    pub fn add(ctx: Context<Add>, a: u8, b: u8) -> Result<()> {
        ctx.accounts.cacli_acc.calci_result = a + b;
        msg!(
            "Addition Result is: {:?}",
            ctx.accounts.cacli_acc.calci_result
        );
        Ok(())
    }

    pub fn sub(ctx: Context<Sub>, a: u8, b: u8) -> Result<()> {
        ctx.accounts.cacli_acc.calci_result = a - b;
        msg!(
            "Subtraction Result is: {:?}",
            ctx.accounts.cacli_acc.calci_result
        );
        Ok(())
    }

    pub fn div(ctx: Context<Div>, a: u8, b: u8) -> Result<()> {
        require!(b != 0, ErrorCode::DivisionByZero);
        ctx.accounts.cacli_acc.calci_result = a / b;
        msg!(
            "Division Result is: {:?}",
            ctx.accounts.cacli_acc.calci_result
        );
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct CalciResult {
    calci_result: u8, // 1 byte
    payer: Pubkey,    // 32 bytes
}

#[error_code]
pub enum ErrorCode {
    #[msg("Division by zero is not allowed")]
    DivisionByZero,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    fee_payer: Signer<'info>,

    #[account(init, space = 8 + CalciResult::INIT_SPACE, payer = fee_payer)]
    cacli_acc: Account<'info, CalciResult>,

    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Add<'info> {
    #[account(mut)]
    cacli_acc: Account<'info, CalciResult>,
}

#[derive(Accounts)]
pub struct Sub<'info> {
    #[account(mut)]
    cacli_acc: Account<'info, CalciResult>,
}

#[derive(Accounts)]
pub struct Div<'info> {
    #[account(mut)]
    cacli_acc: Account<'info, CalciResult>,
}