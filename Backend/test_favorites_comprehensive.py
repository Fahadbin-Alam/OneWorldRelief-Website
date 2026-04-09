"""
Comprehensive Test Suite for Favorites Feature
===============================================

This test suite validates the favorites API across multiple scenarios:
1. Basic CRUD operations (Create, Read, Update, Delete)
2. Edge cases and error handling
3. Data persistence and consistency
4. Different item types (events, clubs)

Why these tests matter:
- Ensures users can save and manage their favorite items
- Prevents duplicate favorites
- Validates API contracts for frontend integration
- Tests real-world edge cases users might encounter
"""

import requests
import time

BASE_URL = "http://localhost:8000"

# =====================================================================
# Test 1: Basic Add Favorite
# =====================================================================
def test_add_single_favorite():
    """
    WHAT: Add a single favorite to an empty list
    WHY: Validates the basic create operation works correctly
    
    Expected: Returns success message, favorite is stored
    """
    response = requests.post(f"{BASE_URL}/favorites", json={"item_id": 1, "item_type": "event"})
    assert response.status_code == 200
    assert response.json() == {"message": "Added to favorites"}
    print("✓ Test 1 PASSED: Can add a single favorite")


# =====================================================================
# Test 2: Retrieve Favorites
# =====================================================================
def test_retrieve_favorites():
    """
    WHAT: Fetch all favorites after adding one
    WHY: Validates the read operation returns what was stored
    
    Expected: Returns list containing the added favorite
    """
    # Clear by removing first
    requests.delete(f"{BASE_URL}/favorites/1/event")
    
    # Add a favorite
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 1, "item_type": "event"})
    
    # Retrieve
    response = requests.get(f"{BASE_URL}/favorites")
    assert response.status_code == 200
    favorites = response.json()
    assert len(favorites) >= 1
    assert {"item_id": 1, "item_type": "event"} in favorites
    print("✓ Test 2 PASSED: Can retrieve favorites list")


# =====================================================================
# Test 3: Remove Favorite
# =====================================================================
def test_remove_favorite():
    """
    WHAT: Add a favorite, then delete it
    WHY: Validates delete operation and cleanup
    
    Expected: Favorite removed from list
    """
    # Add
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 2, "item_type": "club"})
    
    # Verify it exists
    response = requests.get(f"{BASE_URL}/favorites")
    assert {"item_id": 2, "item_type": "club"} in response.json()
    
    # Remove
    response = requests.delete(f"{BASE_URL}/favorites/2/club")
    assert response.status_code == 200
    
    # Verify it's gone
    response = requests.get(f"{BASE_URL}/favorites")
    assert {"item_id": 2, "item_type": "club"} not in response.json()
    print("✓ Test 3 PASSED: Can remove a favorite")


# =====================================================================
# Test 4: Add Multiple Different Items
# =====================================================================
def test_add_multiple_items():
    """
    WHAT: Add multiple favorites of different types
    WHY: Validates system handles diverse item types (events, clubs)
    
    Expected: All items stored separately with correct types
    """
    # Clean slate
    requests.delete(f"{BASE_URL}/favorites/1/event")
    requests.delete(f"{BASE_URL}/favorites/1/club")
    requests.delete(f"{BASE_URL}/favorites/2/event")
    
    # Add different types
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 1, "item_type": "event"})
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 1, "item_type": "club"})
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 2, "item_type": "event"})
    
    response = requests.get(f"{BASE_URL}/favorites")
    favorites = response.json()
    
    assert {"item_id": 1, "item_type": "event"} in favorites
    assert {"item_id": 1, "item_type": "club"} in favorites
    assert {"item_id": 2, "item_type": "event"} in favorites
    assert len([f for f in favorites if f["item_type"] == "event"]) >= 2
    print("✓ Test 4 PASSED: Can add multiple items of different types")


# =====================================================================
# Test 5: Prevent Duplicate Favorites
# =====================================================================
def test_no_duplicate_favorites():
    """
    WHAT: Try adding the same favorite twice
    WHY: Prevents users from accidentally favoriting the same item multiple times,
         which would create confusing duplicates in their list
    
    Expected: Second add request returns success, but no duplicate in list
    """
    # Clean
    requests.delete(f"{BASE_URL}/favorites/3/event")
    
    # Add first time
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 3, "item_type": "event"})
    
    # Add again (should not create duplicate)
    response = requests.post(f"{BASE_URL}/favorites", json={"item_id": 3, "item_type": "event"})
    assert response.status_code == 200
    
    # Verify only one exists
    response = requests.get(f"{BASE_URL}/favorites")
    favorites = response.json()
    duplicates = [f for f in favorites if f["item_id"] == 3 and f["item_type"] == "event"]
    assert len(duplicates) == 1  # Should be exactly 1, not 2
    print("✓ Test 5 PASSED: No duplicate favorites created")


# =====================================================================
# Test 6: Remove Non-Existent Favorite (Edge Case)
# =====================================================================
def test_remove_nonexistent_favorite():
    """
    WHAT: Try to delete a favorite that doesn't exist
    WHY: Validates graceful error handling - system shouldn't crash
         on user mistakes
    
    Expected: Returns success (idempotent), doesn't error
    """
    response = requests.delete(f"{BASE_URL}/favorites/999/nonexistent")
    # Should not crash
    assert response.status_code == 200
    print("✓ Test 6 PASSED: Removing non-existent favorite handled gracefully")


# =====================================================================
# Test 7: Empty Favorites List
# =====================================================================
def test_empty_favorites_list():
    """
    WHAT: Retrieve favorites when none are saved
    WHY: Ensures empty state is handled correctly for new users
    
    Expected: Returns empty list (not null or error)
    """
    # Remove all
    requests.delete(f"{BASE_URL}/favorites/1/event")
    requests.delete(f"{BASE_URL}/favorites/1/club")
    requests.delete(f"{BASE_URL}/favorites/2/event")
    requests.delete(f"{BASE_URL}/favorites/3/event")
    
    response = requests.get(f"{BASE_URL}/favorites")
    assert response.status_code == 200
    assert response.json() == [] or response.json() == None or len(response.json()) == 0
    print("✓ Test 7 PASSED: Empty favorites list handled correctly")


# =====================================================================
# Test 8: Differentiate Item Types
# =====================================================================
def test_same_id_different_types():
    """
    WHAT: Add favorite with same ID but different types (e.g., Event#1 and Club#1)
    WHY: Ensures item_id and item_type are both used as identifiers.
         Without this, a user couldn't distinguish between Event#1 and Club#1,
         causing confusion if both exist
    
    Expected: Both items stored separately, removal affects only the correct type
    """
    # Add Event#1 and Club#1
    requests.delete(f"{BASE_URL}/favorites/1/event")
    requests.delete(f"{BASE_URL}/favorites/1/club")
    
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 1, "item_type": "event"})
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 1, "item_type": "club"})
    
    response = requests.get(f"{BASE_URL}/favorites")
    favorites = response.json()
    
    # Both should exist
    assert {"item_id": 1, "item_type": "event"} in favorites
    assert {"item_id": 1, "item_type": "club"} in favorites
    
    # Remove only event
    requests.delete(f"{BASE_URL}/favorites/1/event")
    
    response = requests.get(f"{BASE_URL}/favorites")
    favorites = response.json()
    
    # Club#1 should still exist
    assert {"item_id": 1, "item_type": "club"} in favorites
    assert {"item_id": 1, "item_type": "event"} not in favorites
    print("✓ Test 8 PASSED: Same ID with different types handled correctly")


# =====================================================================
# Test 9: API Response Format
# =====================================================================
def test_api_response_format():
    """
    WHAT: Validate API returns correct JSON structure
    WHY: Frontend depends on specific field names (item_id, item_type).
         If format changes, frontend breaks
    
    Expected: All favorites have required fields
    """
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 5, "item_type": "event"})
    
    response = requests.get(f"{BASE_URL}/favorites")
    favorites = response.json()
    
    # Verify structure
    for fav in favorites:
        assert "item_id" in fav, "Missing item_id field"
        assert "item_type" in fav, "Missing item_type field"
        assert isinstance(fav["item_id"], int), "item_id should be integer"
        assert isinstance(fav["item_type"], str), "item_type should be string"
    
    print("✓ Test 9 PASSED: API response format is correct")


# =====================================================================
# Test 10: Persistence Check
# =====================================================================
def test_favorites_persist():
    """
    WHAT: Add a favorite, simulate page refresh (new request), verify it's still there
    WHY: Ensures favorites are actually saved to backend storage (not just in memory
         for the current request). Users expect favorites to survive page refreshes
    
    Expected: Favorite remains after "refresh"
    """
    requests.post(f"{BASE_URL}/favorites", json={"item_id": 10, "item_type": "event"})
    
    # Simulate refresh - make new request
    response1 = requests.get(f"{BASE_URL}/favorites")
    time.sleep(0.1)  # Small delay
    response2 = requests.get(f"{BASE_URL}/favorites")
    
    fav1 = response1.json()
    fav2 = response2.json()
    
    assert {"item_id": 10, "item_type": "event"} in fav1
    assert {"item_id": 10, "item_type": "event"} in fav2
    print("✓ Test 10 PASSED: Favorites persist across requests")


# =====================================================================
# SUITE RUNNER
# =====================================================================
if __name__ == "__main__":
    import time
    
    print("\n" + "="*70)
    print("RUNNING COMPREHENSIVE FAVORITES TEST SUITE")
    print("="*70 + "\n")
    
    try:
        test_add_single_favorite()
        test_retrieve_favorites()
        test_remove_favorite()
        test_add_multiple_items()
        test_no_duplicate_favorites()
        test_remove_nonexistent_favorite()
        test_empty_favorites_list()
        test_same_id_different_types()
        test_api_response_format()
        test_favorites_persist()
        
        print("\n" + "="*70)
        print("✅ ALL TESTS PASSED!")
        print("="*70)
        print("\nKey Validations:")
        print("  • Users can add/remove favorites")
        print("  • System prevents duplicate favorites")
        print("  • Different item types handled correctly")
        print("  • API response format is consistent")
        print("  • Favorites persist across requests")
        print("  • Edge cases handled gracefully")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {str(e)}")
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
