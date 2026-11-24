package dev.royalgambit.service.items;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonProperty;

/** JSON shape from contracts/openapi/_template.yaml. */
public record Item(UUID id, String name, @JsonProperty("created_at") String createdAt) {
}
