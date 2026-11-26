package dev.royalegambit.authprofile.events;

import java.time.Instant;
import java.util.UUID;

/** {@code user.registered}: contracts/events/user.registered.schema.json. */
public record UserRegistered(UUID userId, Instant registeredAt) {

	public static final String TYPE = "user.registered";

}
