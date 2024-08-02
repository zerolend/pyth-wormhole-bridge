use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use anchor_spl::token_interface::TokenAccount;
use std::mem::size_of;
use wormhole_anchor_sdk::wormhole;

pub use context::*;
pub use error::*;
pub use state::*;
pub use state::received::UserState;
pub use message::BridgeMessage;

pub mod context;
pub mod error;
pub mod message;
pub mod state;

declare_id!("FwUNgovwW4yHXfqJiVWuWgCpJfeSqtfsPzDBTL9LGX6g");

#[program]
pub mod claim_token {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, owner: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.owner = owner;
        Ok(())
    }

    pub fn claim_token(ctx: Context<ClaimToken>) -> Result<()> {
        let state = &ctx.accounts.state;
        let user_info = &mut ctx.accounts.user_info;

        let amount = user_info.amount;

        require!(
            user_info.user == ctx.accounts.user.key(),
            CustomError::InvalidUser
        );
        require!(amount != 0, CustomError::InvalidAmount);
        require!(
            state.owner == ctx.accounts.owner.key(),
            CustomError::InvalidOwner
        );

        user_info.amount = 0;

        let cpi_accounts = Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn register_emitter(
        ctx: Context<RegisterEmitter>,
        chain: u16,
        address: [u8; 32],
    ) -> Result<()> {
        // Foreign emitter cannot share the same Wormhole Chain ID as the
        // Solana Wormhole program's. And cannot register a zero address.
        require!(
            chain > 0 && chain != wormhole::CHAIN_ID_SOLANA && !address.iter().all(|&x| x == 0),
            BridgeMessageError::InvalidForeignEmitter,
        );

        // Save the emitter info into the ForeignEmitter account.
        let emitter = &mut ctx.accounts.foreign_emitter;
        emitter.chain = chain;
        emitter.address = address;

        // Done.
        Ok(())
    }

    pub fn receive_message(ctx: Context<ReceiveMessage>, vaa_hash: [u8; 32]) -> Result<()> {
        let posted_message = &ctx.accounts.posted;

        if let BridgeMessage::UserInfo { message } = posted_message.data() {
            // BridgeMessage cannot be larger than the maximum size of the account.
            require!(
                message.len() <= MESSAGE_MAX_LENGTH,
                BridgeMessageError::InvalidMessage,
            );

            // Save batch ID, keccak256 hash and message payload.
            let received = &mut ctx.accounts.received;
            received.batch_id = posted_message.batch_id();
            received.wormhole_message_hash = vaa_hash;
            received.message = message.clone();

            let user_state = UserState::decode(message.clone()).unwrap();
            let user_info = &mut ctx.accounts.user_info;
            user_info.user = user_state.user;
            user_info.amount = user_state.amount;

            // Done
            Ok(())
        } else {
            Err(BridgeMessageError::InvalidMessage.into())
        }
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = size_of::<State>() + 8)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// The system_program field stores the system program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimToken<'info> {
    #[account()]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub user_info: Account<'info, UserState>,
    #[account(mut)]
    pub user: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub owner: InterfaceAccount<'info, TokenAccount>,
    /// The token_program field stores the token program account.
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct State {
    pub owner: Pubkey,
}

#[error_code]
pub enum CustomError {
    #[msg("User not found")]
    Unauthorized,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid user")]
    InvalidUser,
    #[msg("Zero amount")]
    InvalidAmount,
}
