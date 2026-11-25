package dev.royalgambit.authprofile.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Sign-in code rules, bound from {@code auth.email-code.*}. The defaults are the product
 * decision; they are settings only so tests and incidents can change them without a
 * build.
 *
 * @param ttl how long a code works
 * @param attempts wrong guesses allowed per code
 * @param resendCooldown minimum gap between two mails to the same address
 * @param maxPerHour codes one address may get per hour
 * @param maxPerDay codes one address may get per day; with {@code attempts} this caps
 * guessing at maxPerDay x attempts tries a day, whatever IPs the guesses come from
 * @param from sender address (env MAIL_FROM)
 */
@ConfigurationProperties("auth.email-code")
public record EmailCodeSettings(@DefaultValue("10m") Duration ttl, @DefaultValue("5") int attempts,
		@DefaultValue("60s") Duration resendCooldown, @DefaultValue("5") int maxPerHour,
		@DefaultValue("10") int maxPerDay, @DefaultValue("Royale Gambit <no-reply@royal-gambit.dev>") String from) {

}
