package dev.royalgambit.authprofile.profile;

import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.events.Outbox;
import dev.royalgambit.authprofile.events.ProfileUpdated;

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
		boolean changed;
		try {
			changed = this.profiles.saveIfNewer(userId, write);
		}
		catch (DuplicateKeyException ex) {
			throw new ErrorResponseException(HttpStatus.CONFLICT,
					ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "that username is taken"), ex);
		}
		Profile stored = this.profiles.find(userId).orElseThrow();
		if (changed) {
			this.outbox.append(ProfileUpdated.TYPE,
					new ProfileUpdated(stored.userId(), stored.username(), stored.country(), stored.updatedAt()));
		}
		return stored;
	}

}
