import requests

# Test case for Favorites feature
# Acceptance Criteria:
# - Favorite button is visible on items. (UI test, manual)
# - Clicking button saves item to profile. (API test)
# - UI reflects saved state. (UI test, manual)

def test_add_favorite():
    # Test adding a favorite
    response = requests.post('http://localhost:8000/favorites', json={'item_id': 1, 'item_type': 'club'})
    assert response.status_code == 200
    assert response.json() == {'message': 'Added to favorites'}

def test_get_favorites():
    # Test getting favorites
    response = requests.get('http://localhost:8000/favorites')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should contain the added favorite
    assert any(f['item_id'] == 1 and f['item_type'] == 'club' for f in data)

def test_remove_favorite():
    # Test removing a favorite
    response = requests.delete('http://localhost:8000/favorites/1/club')
    assert response.status_code == 200
    assert response.json() == {'message': 'Removed from favorites'}

    # Verify it's removed
    response = requests.get('http://localhost:8000/favorites')
    data = response.json()
    assert not any(f['item_id'] == 1 and f['item_type'] == 'club' for f in data)

if __name__ == '__main__':
    # Run tests (assuming server is running on localhost:8000)
    test_add_favorite()
    test_get_favorites()
    test_remove_favorite()
    print("All tests passed!")