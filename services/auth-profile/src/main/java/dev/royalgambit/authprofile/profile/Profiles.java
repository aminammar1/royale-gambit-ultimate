package dev.royalgambit.authprofile.profile;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.ObjectMapper;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class Profiles {

	private final JdbcClient jdbc;

	private final ObjectMapper json;

	private final RowMapper<Profile> row;

	Profiles(JdbcClient jdbc, ObjectMapper json) {
		this.jdbc = jdbc;
		this.json = json;
		this.row = (rs, n) -> new Profile(rs.getObject("user_id", UUID.class), rs.getString("username"),
				rs.getString("country"), this.json.readTree(rs.getString("settings")),
				rs.getObject("updated_at", OffsetDateTime.class).toInstant());
	}

	Optional<Profile> find(UUID userId) {
		return this.jdbc.sql(
				"SELECT user_id, username, country, settings::text AS settings, updated_at FROM profiles WHERE user_id = :id")
			.param("id", userId)
			.query(this.row)
			.optional();
	}

	/**
	 * Saves the write if it is newer than what we have and actually changes something.
	 * The timestamp is capped at the database's now(): a device with its clock set to
	 * 2099 would otherwise win every future sync.
	 * @return whether a row was inserted or changed
	 */
	boolean saveIfNewer(UUID userId, ProfileWrite write) {
		return this.jdbc.sql("""
				INSERT INTO profiles AS p (user_id, username, country, settings, updated_at)
				VALUES (:id, :username, :country, :settings::jsonb, least(:updatedAt, now()))
				ON CONFLICT (user_id) DO UPDATE
				    SET username = EXCLUDED.username, country = EXCLUDED.country,
				        settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at
				    WHERE p.updated_at < EXCLUDED.updated_at
				      AND (p.username, p.country, p.settings)
				          IS DISTINCT FROM (EXCLUDED.username, EXCLUDED.country, EXCLUDED.settings)
				RETURNING user_id
				""")
			.param("id", userId)
			.param("username", write.username())
			.param("country", write.country())
			.param("settings", this.json.writeValueAsString(write.settings()))
			.param("updatedAt", OffsetDateTime.ofInstant(write.updatedAt(), ZoneOffset.UTC))
			.query(UUID.class)
			.optional()
			.isPresent();
	}

}
