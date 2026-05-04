import uuid

import requests


BASE_URL = "http://localhost:8000"


def get_auth_headers():
    test_email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    test_password = "testpass123"
    response = requests.post(f"{BASE_URL}/auth/register", json={
        "email": test_email,
        "password": test_password,
    })
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# Test case for Favorites feature
# Acceptance Criteria:
# - Favorite button is visible on items. (UI test, manual)
# - Clicking button saves item to profile. (API test)
# - UI reflects saved state. (UI test, manual)

def test_add_favorite():
    headers = get_auth_headers()
    response = requests.post(
        f"{BASE_URL}/favorites",
        json={"item_id": 1, "item_type": "club"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Added to favorites"}


def test_get_favorites():
    headers = get_auth_headers()
    requests.post(
        f"{BASE_URL}/favorites",
        json={"item_id": 1, "item_type": "club"},
        headers=headers,
    )

    response = requests.get(f"{BASE_URL}/favorites", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(f["item_id"] == 1 and f["item_type"] == "club" for f in data)


def test_remove_favorite():
    headers = get_auth_headers()
    requests.post(
        f"{BASE_URL}/favorites",
        json={"item_id": 1, "item_type": "club"},
        headers=headers,
    )

    response = requests.delete(f"{BASE_URL}/favorites/1/club", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"message": "Removed from favorites"}

    response = requests.get(f"{BASE_URL}/favorites", headers=headers)
    data = response.json()
    assert not any(f["item_id"] == 1 and f["item_type"] == "club" for f in data)


if __name__ == "__main__":
    test_add_favorite()
    test_get_favorites()
    test_remove_favorite()
    print("All tests passed!")
