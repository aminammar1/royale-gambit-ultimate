package dev.royalgambit.authprofile.web;

import java.time.Instant;

import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Strict JSON input, like the other templates: a number or boolean is never turned into a
 * string, and a number is never turned into a date.
 */
@Configuration(proxyBeanMethods = false)
class JsonConfig {

	@Bean
	JsonMapperBuilderCustomizer strictStrings() {
		return builder -> builder
			.withCoercionConfig(LogicalType.Textual,
					config -> config.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
						.setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
						.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
			// The contract's date-times are strings; 0 is not "1970-01-01T00:00:00Z". The
			// stock Instant reader takes numbers whatever the coercion settings say.
			.addModule(
					new SimpleModule("strict-dates").addDeserializer(Instant.class, new StrictInstantDeserializer()));
	}

}
