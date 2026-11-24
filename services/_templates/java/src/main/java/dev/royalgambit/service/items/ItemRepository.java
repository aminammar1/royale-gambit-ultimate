package dev.royalgambit.service.items;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ItemRepository {

	private static final RowMapper<Item> ROW = (rs, n) -> new Item(rs.getObject("id", UUID.class), rs.getString("name"),
			rs.getObject("created_at", OffsetDateTime.class)
				.withOffsetSameInstant(ZoneOffset.UTC)
				.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));

	private final JdbcClient jdbc;

	ItemRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	Item create(UUID id, String name) {
		return this.jdbc.sql("INSERT INTO items (id, name) VALUES (:id, :name) RETURNING id, name, created_at")
			.param("id", id)
			.param("name", name)
			.query(ROW)
			.single();
	}

	Optional<Item> find(UUID id) {
		return this.jdbc.sql("SELECT id, name, created_at FROM items WHERE id = :id")
			.param("id", id)
			.query(ROW)
			.optional();
	}

}
