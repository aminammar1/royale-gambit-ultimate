package dev.royalgambit.authprofile.profile;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Body of {@code PUT /v1/profile}. {@code updatedAt} is when the player made the edit on
 * their device, which may be well before the sync reaches us.
 */
record ProfileWrite(
		@NotNull @Pattern(regexp = "[A-Za-z0-9_-]{3,20}",
				message = "3 to 20 letters, digits, '_' or '-'") String username,
		@NotNull @Pattern(regexp = "[A-Z]{2}", message = "must be two capital letters") String country,
		@NotNull JsonNode settings, @NotNull Instant updatedAt) {

	static final int MAX_SETTINGS_BYTES = 16 * 1024;

	private static final Set<String> COUNTRIES = Locale.getISOCountries(Locale.IsoCountryCode.PART1_ALPHA2);

	@AssertTrue(message = "must be an ISO 3166-1 alpha-2 country code")
	boolean isCountryKnown() {
		return this.country == null || COUNTRIES.contains(this.country);
	}

	@AssertTrue(message = "must be a JSON object of at most 16 KiB")
	boolean isSettingsSmallObject() {
		return this.settings == null || (this.settings.isObject()
				&& this.settings.toString().getBytes(StandardCharsets.UTF_8).length <= MAX_SETTINGS_BYTES);
	}

	/** Postgres jsonb refuses the NUL character anywhere, keys included. */
	@AssertTrue(message = "must not contain the NUL character")
	boolean isSettingsFreeOfNul() {
		return this.settings == null || !containsNul(this.settings);
	}

	private static boolean containsNul(JsonNode node) {
		if (node.isString()) {
			return node.asString().indexOf('\0') >= 0;
		}
		if (node.isObject()) {
			for (Map.Entry<String, JsonNode> field : node.properties()) {
				if (field.getKey().indexOf('\0') >= 0 || containsNul(field.getValue())) {
					return true;
				}
			}
		}
		else if (node.isArray()) {
			for (JsonNode element : node) {
				if (containsNul(element)) {
					return true;
				}
			}
		}
		return false;
	}

}
