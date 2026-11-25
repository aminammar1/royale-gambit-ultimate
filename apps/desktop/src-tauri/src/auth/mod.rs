//! Sign-in for the desktop app. The Rust core owns the refresh token (OS keychain) and
//! makes every call that sends or receives one; the web layer only ever gets the
//! short-lived access token, through the commands in `commands`.

pub mod commands;
pub mod error;
pub mod gateway;
pub mod keychain;
pub mod loopback;
pub mod session;
