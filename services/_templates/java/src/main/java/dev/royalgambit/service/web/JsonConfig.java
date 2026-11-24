package dev.royalgambit.service.web;

import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Strict JSON input, like the other templates: a number or boolean is never turned into a
 * string.
 */
@Configuration(proxyBeanMethods = false)
class JsonConfig {

	@Bean
	JsonMapperBuilderCustomizer strictStrings() {
		return builder -> builder.withCoercionConfig(LogicalType.Textual,
				config -> config.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
					.setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
					.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail));
	}

}
