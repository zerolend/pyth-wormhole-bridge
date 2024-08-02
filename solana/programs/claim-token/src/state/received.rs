use anchor_lang::prelude::*;

pub const MESSAGE_MAX_LENGTH: usize = 1024;

#[account]
/// Received account.
pub struct UserState {
    pub user: Pubkey,
    pub amount: u64
}

impl UserState {
    pub fn decode(data: Vec<u8>) -> Result<UserState> {
        require!(data.len() != 32 + 8, CustomError::InvalidMessage);

        let pubkey = Pubkey::try_from(&data[0..32]).unwrap();
        let amount = u64::from_le_bytes(data[32..40].try_into().map_err(|_| "Failed to decode amount").unwrap());

        Ok(UserState { user: pubkey, amount })
    }
}

#[account]
#[derive(Default)]
/// Received account.
pub struct Received {
    /// AKA nonce. Should always be zero in this example, but we save it anyway.
    pub batch_id: u32,
    /// Keccak256 hash of verified Wormhole message.
    pub wormhole_message_hash: [u8; 32],
    /// BridgeMessage from [BridgeMessage::UserInfo](crate::message::BridgeMessage).
    pub message: Vec<u8>,
}

impl Received {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 4 // batch_id
        + 32 // wormhole_message_hash
        + 4 // Vec length
        + MESSAGE_MAX_LENGTH // message
    ;
    /// AKA `b"received"`.
    pub const SEED_PREFIX: &'static [u8; 8] = b"received";
}

#[error_code]
pub enum CustomError {
    #[msg("Message can not decode")]
    InvalidMessage,
}

#[cfg(test)]
pub mod test {
    use super::*;
    use std::mem::size_of;

    #[test]
    fn test_received() -> Result<()> {
        assert_eq!(
            Received::MAXIMUM_SIZE,
            size_of::<u64>()
                + size_of::<u32>()
                + size_of::<[u8; 32]>()
                + size_of::<u32>()
                + MESSAGE_MAX_LENGTH
        );

        Ok(())
    }
}