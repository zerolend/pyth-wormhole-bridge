use anchor_lang::{prelude::Pubkey, AnchorDeserialize, AnchorSerialize};
use std::io;
use wormhole_io::Readable;

const PAYLOAD_ID_ALIVE: u8 = 0;
const PAYLOAD_ID_USER_INFO: u8 = 1;

pub const BRIDGE_MESSAGE_MAX_LENGTH: usize = 512;

#[derive(Clone)]
/// Expected message types for this program. Only valid payloads are:
/// * `Alive`: Payload ID == 0. Emitted when [`initialize`](crate::initialize)
///  is called).
/// * `UserInfo`: Payload ID == 1. Emitted when
/// [`send_message`](crate::send_message) is called).
///
/// Payload IDs are encoded as u8.
pub enum BridgeMessage {
    Alive { program_id: Pubkey },
    UserInfo { message: Vec<u8> },
}

impl AnchorSerialize for BridgeMessage {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        match self {
            BridgeMessage::Alive { program_id } => {
                PAYLOAD_ID_ALIVE.serialize(writer)?;
                program_id.serialize(writer)
            }
            BridgeMessage::UserInfo { message } => {
                if message.len() > BRIDGE_MESSAGE_MAX_LENGTH {
                    Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("message exceeds {BRIDGE_MESSAGE_MAX_LENGTH} bytes"),
                    ))
                } else {
                    PAYLOAD_ID_USER_INFO.serialize(writer)?;
                    (message.len() as u16).to_be_bytes().serialize(writer)?;
                    for item in message {
                        item.serialize(writer)?;
                    }
                    Ok(())
                }
            }
        }
    }
}

impl AnchorDeserialize for BridgeMessage {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        match u8::read(reader)? {
            PAYLOAD_ID_ALIVE => Ok(BridgeMessage::Alive {
                program_id: Pubkey::try_from(<[u8; 32]>::read(reader)?).unwrap(),
            }),
            PAYLOAD_ID_USER_INFO => {
                let length = u16::read(reader)? as usize;
                if length > BRIDGE_MESSAGE_MAX_LENGTH {
                    Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("message exceeds {BRIDGE_MESSAGE_MAX_LENGTH} bytes"),
                    ))
                } else {
                    let mut buf = vec![0; length];
                    reader.read_exact(&mut buf)?;
                    Ok(BridgeMessage::UserInfo { message: buf })
                }
            }
            _ => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid payload ID",
            )),
        }
    }
}

#[cfg(test)]
pub mod test {
    use super::*;
    use anchor_lang::prelude::Result;
    use std::{mem::size_of, str, string::String};

    #[test]
    fn test_message_alive() -> Result<()> {
        let my_program_id = Pubkey::new_unique();
        let msg = BridgeMessage::Alive {
            program_id: my_program_id,
        };

        // Serialize program ID above.
        let mut encoded = Vec::new();
        msg.serialize(&mut encoded)?;

        assert_eq!(encoded.len(), size_of::<u8>() + size_of::<Pubkey>());

        // Verify Payload ID.
        assert_eq!(encoded[0], PAYLOAD_ID_ALIVE);

        // Verify Program ID.
        let mut program_id_bytes = [0u8; 32];
        program_id_bytes.copy_from_slice(&encoded[1..33]);
        assert_eq!(program_id_bytes, my_program_id.to_bytes());

        // Now deserialize the encoded message.
        match BridgeMessage::deserialize(&mut encoded.as_slice())? {
            BridgeMessage::Alive { program_id } => {
                assert_eq!(program_id, my_program_id)
            }
            _ => assert!(false, "incorrect deserialization"),
        }

        Ok(())
    }

    #[test]
    fn test_message_user_info() -> Result<()> {
        let raw_message = String::from("All your base are belong to us");
        let msg = BridgeMessage::UserInfo {
            message: raw_message.as_bytes().to_vec(),
        };

        // Serialize message above.
        let mut encoded = Vec::new();
        msg.serialize(&mut encoded)?;

        assert_eq!(
            encoded.len(),
            size_of::<u8>() + size_of::<u16>() + raw_message.len()
        );

        // Verify Payload ID.
        assert_eq!(encoded[0], PAYLOAD_ID_USER_INFO);

        // Verify message length.
        let mut message_len_bytes = [0u8; 2];
        message_len_bytes.copy_from_slice(&encoded[1..3]);
        assert_eq!(
            u16::from_be_bytes(message_len_bytes) as usize,
            raw_message.len()
        );

        // Verify message.
        let from_utf8_result = str::from_utf8(&encoded[3..]);
        assert!(from_utf8_result.is_ok(), "from_utf8 resulted in an error");
        assert_eq!(from_utf8_result.unwrap(), raw_message);

        // Now deserialize the encoded message.
        match BridgeMessage::deserialize(&mut encoded.as_slice())? {
            BridgeMessage::UserInfo { message } => {
                assert_eq!(message, raw_message.as_bytes())
            }
            _ => assert!(false, "incorrect deserialization"),
        }

        Ok(())
    }

    #[test]
    fn test_message_user_info_too_large() -> Result<()> {
        let n: usize = 513;
        let raw_message = {
            let mut out = Vec::with_capacity(n);
            for _ in 0..n {
                out.push(33u8)
            }
            String::from_utf8(out).unwrap()
        };
        let msg = BridgeMessage::UserInfo {
            message: raw_message.as_bytes().to_vec(),
        };

        // Attempt to serialize message above.
        let mut encoded = Vec::new();
        match msg.serialize(&mut encoded) {
            Err(e) => assert_eq!(e.kind(), io::ErrorKind::InvalidInput),
            _ => assert!(false, "not supposed to serialize"),
        };

        // Serialize manually and then attempt to deserialize.
        encoded.push(PAYLOAD_ID_USER_INFO);
        encoded.extend_from_slice(&(raw_message.len() as u16).to_be_bytes());
        encoded.extend_from_slice(raw_message.as_bytes());

        assert_eq!(
            encoded.len(),
            size_of::<u8>() + size_of::<u16>() + raw_message.len()
        );

        // Verify Payload ID.
        assert_eq!(encoded[0], PAYLOAD_ID_USER_INFO);

        // Verify message length.
        let mut message_len_bytes = [0u8; 2];
        message_len_bytes.copy_from_slice(&encoded[1..3]);
        assert_eq!(
            u16::from_be_bytes(message_len_bytes) as usize,
            raw_message.len()
        );

        match BridgeMessage::deserialize(&mut encoded.as_slice()) {
            Err(e) => assert_eq!(e.kind(), io::ErrorKind::InvalidInput),
            _ => assert!(false, "not supposed to deserialize"),
        };

        Ok(())
    }
}
