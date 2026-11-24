// Package items is the example resource of the template. Delete it in a real service.
package items

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/db"
	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/httpx"
)

// Item is the JSON shape from contracts/openapi/_template.yaml.
type Item struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt string    `json:"created_at"`
}

type newItem struct {
	Name *string `json:"name"`
}

// Handler serves /v1/items.
type Handler struct{ Q *db.Queries }

// Register mounts the routes.
func (h Handler) Register(r gin.IRoutes) {
	r.POST("/v1/items", h.create)
	r.GET("/v1/items/:id", h.get)
}

// ParseNewItem validates a create body: a JSON object with only `name`, 1 to 100 characters.
func ParseNewItem(body []byte) (string, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	var in newItem
	if err := dec.Decode(&in); err != nil {
		return "", errors.New("body must be a JSON object with only a name")
	}
	if dec.More() {
		return "", errors.New("body must contain a single JSON object")
	}
	if in.Name == nil {
		return "", errors.New("name is required")
	}
	if n := utf8.RuneCountInString(*in.Name); n < 1 || n > 100 {
		return "", errors.New("name must be 1 to 100 characters")
	}
	if !utf8.ValidString(*in.Name) {
		return "", errors.New("name must be valid UTF-8")
	}
	if strings.ContainsFunc(*in.Name, unicode.IsControl) {
		return "", errors.New("name must not contain control characters")
	}
	return *in.Name, nil
}

func (h Handler) create(c *gin.Context) {
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20))
	if err != nil {
		httpx.WriteProblem(c, http.StatusBadRequest, "body too large or unreadable")
		return
	}
	name, err := ParseNewItem(body)
	if err != nil {
		httpx.WriteProblem(c, http.StatusBadRequest, err.Error())
		return
	}
	id, err := uuid.NewV7()
	if err != nil {
		httpx.WriteProblem(c, http.StatusInternalServerError, "could not create id")
		return
	}
	row, err := h.Q.CreateItem(c.Request.Context(), db.CreateItemParams{ID: id, Name: name})
	if err != nil {
		_ = c.Error(err)
		httpx.WriteProblem(c, http.StatusInternalServerError, "could not save item")
		return
	}
	c.Header("Location", "/v1/items/"+row.ID.String())
	c.JSON(http.StatusCreated, toJSON(row))
}

func (h Handler) get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.WriteProblem(c, http.StatusBadRequest, "id must be a UUID")
		return
	}
	row, err := h.Q.GetItem(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.WriteProblem(c, http.StatusNotFound, "no item with this id")
		return
	}
	if err != nil {
		_ = c.Error(err)
		httpx.WriteProblem(c, http.StatusInternalServerError, "could not load item")
		return
	}
	c.JSON(http.StatusOK, toJSON(row))
}

func toJSON(i db.Item) Item {
	return Item{ID: i.ID, Name: i.Name, CreatedAt: i.CreatedAt.UTC().Format(time.RFC3339Nano)}
}
