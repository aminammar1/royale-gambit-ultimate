package dev.royalegambit.authprofile.events;

import java.time.Instant;
import java.util.UUID;

/**
 * {@code profile.updated}: contracts/events/profile.updated.schema.json. Settings stay
 * out.
 */
public record ProfileUpdated(UUID userId, String username, String country, Instant updatedAt) {

	public static final String TYPE = "profile.updated";

}
