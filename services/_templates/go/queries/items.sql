-- name: CreateItem :one
INSERT INTO items (id, name) VALUES ($1, $2)
RETURNING id, name, created_at;

-- name: GetItem :one
SELECT id, name, created_at FROM items WHERE id = $1;
