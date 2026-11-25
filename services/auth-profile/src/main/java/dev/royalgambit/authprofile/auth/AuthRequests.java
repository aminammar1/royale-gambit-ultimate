package dev.royalgambit.authprofile.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request bodies of the auth endpoints. Unknown fields and wrong JSON types are already
 * rejected by the JSON settings; these annotations cover the values.
 */
final class AuthRequests {

	private AuthRequests() {
	}

	/** Surrounding spaces from a paste are forgiven before validation runs. */
	record EmailStart(@NotBlank @Email @Size(max = 254) String email) {

		EmailStart {
			email = strip(email);
		}

	}

	record EmailVerify(@NotBlank @Email @Size(max = 254) String email,
			@NotNull @Pattern(regexp = "[0-9]{6}", message = "must be six digits") String code) {

		EmailVerify {
			email = strip(email);
		}

	}

	record RefreshRequest(@NotBlank @Size(max = 200) String refreshToken) {
	}

	private static String strip(String value) {
		return (value != null) ? value.strip() : null;
	}

}
