package dev.royalgambit.authprofile.web;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

/**
 * Reads an RFC 3339 date-time string ("2026-11-25T10:00:00Z", any offset) and nothing
 * else. Epoch numbers are refused: a client sending 0 almost always has a bug, and
 * silently storing 1970 hides it.
 */
class StrictInstantDeserializer extends ValueDeserializer<Instant> {

	@Override
	public Instant deserialize(JsonParser parser, DeserializationContext context) {
		if (!parser.hasToken(JsonToken.VALUE_STRING)) {
			return (Instant) context.handleUnexpectedToken(Instant.class, parser);
		}
		String text = parser.getString();
		try {
			return OffsetDateTime.parse(text).toInstant();
		}
		catch (DateTimeParseException ex) {
			throw context.weirdStringException(text, Instant.class, "expected an RFC 3339 date-time");
		}
	}

}
