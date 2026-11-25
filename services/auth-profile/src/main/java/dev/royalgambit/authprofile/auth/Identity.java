package dev.royalgambit.authprofile.auth;

import java.time.Instant;

/**
 * One way into an account, as the Settings credential cards show it (contract: Identity).
 */
public record Identity(String provider, String label, Instant linkedAt) {

}
