package dev.royalgambit.service.items;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Create body. Unknown fields and non-string names are rejected by the JSON settings. */
public record NewItem(@NotNull @Size(min = 1, max = 100) @Pattern(regexp = "[^\\x00-\\x1F\\x7F-\\x9F]*",
		message = "must not contain control characters") String name) {
}
