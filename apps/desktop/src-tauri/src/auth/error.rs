use serde::Serialize;

/// Everything a sign-in step can end in besides success, shaped for the web layer: the
/// Settings cards pick their copy from `kind` and, for problems, from `problemType`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AuthError {
    /// The gateway or auth-profile said no, as RFC 9457 problem+json.
    #[error("{status} {title}")]
    Problem {
        status: u16,
        /// The last segment of the problem `type`, such as `code-invalid`.
        problem_type: String,
        title: String,
        detail: Option<String>,
        attempts_left: Option<u32>,
    },
    #[error("the gateway could not be reached")]
    Offline,
    #[error("sign in first")]
    SignedOut,
    #[error("the sign-in was cancelled in the browser")]
    Cancelled,
    #[error("the sign-in took too long")]
    TimedOut,
    #[error("the OS keychain failed: {message}")]
    Keychain { message: String },
    #[error("{message}")]
    Unexpected { message: String },
}

impl AuthError {
    pub fn unexpected(message: impl Into<String>) -> Self {
        Self::Unexpected {
            message: message.into(),
        }
    }

    pub(crate) fn has_status(&self, wanted: u16) -> bool {
        matches!(self, Self::Problem { status, .. } if *status == wanted)
    }
}

pub type Result<T> = std::result::Result<T, AuthError>;
