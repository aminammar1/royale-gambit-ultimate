package dev.royalgambit.service.items;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Create body. Unknown fields and non-string names are rejected by the JSON settings. */
public record NewItem(@NotNull @Size(min = 1, max = 100) String name) {
}
