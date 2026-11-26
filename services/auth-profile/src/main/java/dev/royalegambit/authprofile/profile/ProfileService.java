package dev.royalegambit.authprofile.profile;

import java.net.URI;
import java.util.Optional;
import java.util.UUID;

import dev.royalegambit.authprofile.events.Outbox;
import dev.royalegambit.authprofile.events.ProfileUpdated;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;

/** Profile reads and last-write-wins sync from the player's devices. */
@Service
class ProfileService {

	private final Profiles profiles;

	private final Outbox outbox;

	ProfileService(Profiles profiles, Outbox outbox) {
		this.profiles = profiles;
		this.outbox = outbox;
	}

	Optional<Profile> find(UUID userId) {
		return this.profiles.find(userId);
	}

	/**
	 * @return the profile as stored after this write, whether or not the write won
	 */
	@Transactional
	public Profile put(UUID userId, ProfileWrite write) {
		boolean publicChange;
		try {
			// The event carries name and country only; a settings tweak would tell
			// consumers nothing, and theme toggles would flood them.
			publicChange = this.profiles.saveIfNewer(userId, write).orElse(false);
		}
		catch (DuplicateKeyException ex) {
			throw usernameTaken(ex);
		}
		Profile stored = this.profiles.find(userId).orElseThrow();
		if (publicChange) {
			this.outbox.append(ProfileUpdated.TYPE,
					new ProfileUpdated(stored.userId(), stored.username(), stored.country(), stored.updatedAt()));
		}
		return stored;
	}

	private static ErrorResponseException usernameTaken(DuplicateKeyException cause) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "that username is taken");
		problem.setType(URI.create("https://royale-gambit.dev/problems/username-taken"));
		problem.setTitle("Username taken");
		return new ErrorResponseException(HttpStatus.CONFLICT, problem, cause);
	}

}
