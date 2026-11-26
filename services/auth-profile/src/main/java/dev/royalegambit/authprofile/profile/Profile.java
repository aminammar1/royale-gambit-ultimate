package dev.royalegambit.authprofile.profile;

import java.time.Instant;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

/** A stored profile, as the contract returns it. */
public record Profile(UUID userId, String username, String country, JsonNode settings, Instant updatedAt) {

}
