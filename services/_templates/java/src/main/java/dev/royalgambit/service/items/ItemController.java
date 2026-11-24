package dev.royalgambit.service.items;

import java.net.URI;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** The template's example resource. Delete it in a real service. */
@RestController
class ItemController {

	private final ItemRepository items;

	ItemController(ItemRepository items) {
		this.items = items;
	}

	@PostMapping("/v1/items")
	ResponseEntity<Item> create(@Valid @RequestBody NewItem body) {
		Item item = this.items.create(UuidV7.next(), body.name());
		return ResponseEntity.created(URI.create("/v1/items/" + item.id())).body(item);
	}

	@GetMapping("/v1/items/{id}")
	Item get(@PathVariable UUID id) {
		return this.items.find(id)
			.orElseThrow(() -> new ErrorResponseException(HttpStatus.NOT_FOUND,
					ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "no item with this id"), null));
	}

}
