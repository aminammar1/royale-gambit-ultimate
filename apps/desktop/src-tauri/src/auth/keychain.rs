use super::error::{AuthError, Result};

/// Where the refresh token lives between runs. It is the one long-lived secret the app
/// holds, so it goes to the OS keychain and never into the web layer or a file.
pub trait Keychain: Send + Sync {
    fn load(&self) -> Result<Option<String>>;
    fn store(&self, refresh_token: &str) -> Result<()>;
    fn clear(&self) -> Result<()>;
}

/// The platform store: Keychain Services, Windows Credential Manager, or the Secret
/// Service (GNOME Keyring, KWallet) on Linux.
pub struct OsKeychain {
    service: &'static str,
    account: &'static str,
}

impl OsKeychain {
    pub fn new() -> Self {
        Self {
            service: "dev.royalgambit.desktop",
            account: "refresh-token",
        }
    }

    fn entry(&self) -> Result<keyring::Entry> {
        keyring::Entry::new(self.service, self.account).map_err(failed)
    }
}

impl Default for OsKeychain {
    fn default() -> Self {
        Self::new()
    }
}

impl Keychain for OsKeychain {
    fn load(&self) -> Result<Option<String>> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(failed(err)),
        }
    }

    fn store(&self, refresh_token: &str) -> Result<()> {
        self.entry()?.set_password(refresh_token).map_err(failed)
    }

    fn clear(&self) -> Result<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(failed(err)),
        }
    }
}

fn failed(err: keyring::Error) -> AuthError {
    AuthError::Keychain {
        message: err.to_string(),
    }
}

/// A keychain that forgets on drop, for tests.
#[cfg(test)]
#[derive(Default)]
pub struct MemoryKeychain(std::sync::Mutex<Option<String>>);

#[cfg(test)]
impl MemoryKeychain {
    pub fn holding(token: &str) -> Self {
        Self(std::sync::Mutex::new(Some(token.to_owned())))
    }
}

#[cfg(test)]
impl Keychain for MemoryKeychain {
    fn load(&self) -> Result<Option<String>> {
        Ok(self.0.lock().expect("keychain lock").clone())
    }

    fn store(&self, refresh_token: &str) -> Result<()> {
        *self.0.lock().expect("keychain lock") = Some(refresh_token.to_owned());
        Ok(())
    }

    fn clear(&self) -> Result<()> {
        *self.0.lock().expect("keychain lock") = None;
        Ok(())
    }
}
