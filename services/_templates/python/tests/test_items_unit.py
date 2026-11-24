import pytest
from pydantic import ValidationError

from service.items import NewItem


@pytest.mark.parametrize("name", ["Ruy Lopez", "Ñandú ♞", "a" * 100])
def test_valid_names(name: str) -> None:
    assert NewItem.model_validate_json(f'{{"name": "{name}"}}').name == name


@pytest.mark.parametrize(
    "body",
    [
        '{"name": ""}',
        '{"name": "' + "a" * 101 + '"}',
        "{}",
        '{"name": "a", "x": 1}',
        '{"name": 5}',
        "[]",
    ],
)
def test_invalid_bodies(body: str) -> None:
    with pytest.raises(ValidationError):
        NewItem.model_validate_json(body)
