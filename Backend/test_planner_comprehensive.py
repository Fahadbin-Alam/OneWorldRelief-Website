"""
Comprehensive Test Suite for Course Planner Feature
===================================================

This test suite validates the planner API across multiple scenarios:
1. Course listing and planner retrieval
2. Add/remove operations for planner courses
3. Duplicate prevention and idempotent deletes
4. API contract validation for frontend integration
5. Persistence across requests
"""

import requests
import time
import uuid

BASE_URL = "http://localhost:8000"

# =====================================================================
# Authentication Setup
# =====================================================================
def get_auth_token():
    """Register or login a test user and return JWT token"""
    test_email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    test_password = "testpass123"
    
    # Register
    response = requests.post(f"{BASE_URL}/auth/register", json={
        "email": test_email,
        "password": test_password
    })
    
    if response.status_code == 200:
        data = response.json()
        return data["access_token"]
    
    # If already registered, login
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": test_email,
        "password": test_password
    })
    
    if response.status_code == 200:
        data = response.json()
        return data["access_token"]
    
    raise Exception(f"Failed to authenticate: {response.status_code} {response.text}")

# Authenticate once at module load
AUTH_TOKEN = get_auth_token()
AUTH_HEADERS = {"Authorization": f"Bearer {AUTH_TOKEN}"}

# ---------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------

def clear_planner():
    response = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS)
    if response.status_code != 200:
        return
    for item in response.json():
        requests.delete(f"{BASE_URL}/planner/{item['id']}", headers=AUTH_HEADERS)


def get_available_courses():
    response = requests.get(f"{BASE_URL}/courses")
    assert response.status_code == 200, "Courses endpoint should be available"
    return response.json()


# =====================================================================
# Test 1: Empty Planner
# =====================================================================

def test_empty_planner():
    """
    WHAT: Retrieve planner when no courses are added
    WHY: Ensures new users see an empty state and frontend can render it

    Expected: Returns an empty list
    """
    clear_planner()
    response = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS)
    assert response.status_code == 200
    assert response.json() == []
    print("✓ Test 1 PASSED: Empty planner returns an empty list")


# =====================================================================
# Test 2: Available Courses
# =====================================================================

def test_available_courses_listed():
    """
    WHAT: Fetch list of available courses
    WHY: Frontend needs course data to render add buttons

    Expected: Returns a list of courses with required fields
    """
    courses = get_available_courses()
    assert len(courses) >= 1
    required = {"id", "name", "days", "start_time", "end_time", "location"}
    for course in courses:
        assert required.issubset(course.keys())
    print("✓ Test 2 PASSED: Available courses list is present and correctly structured")


# =====================================================================
# Test 3: Add Course to Planner
# =====================================================================

def test_add_course_to_planner():
    """
    WHAT: Add a course to the planner
    WHY: Validates that the Add button can create planner entries

    Expected: Planner endpoint accepts a course and stores it
    """
    clear_planner()
    courses = get_available_courses()
    course = courses[0]

    response = requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)
    assert response.status_code == 200
    assert response.json()["message"] == "Added to planner"

    planner = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()
    assert any(item["id"] == course["id"] for item in planner)
    print("✓ Test 3 PASSED: Course can be added to planner")


# =====================================================================
# Test 4: Retrieve Planner Items
# =====================================================================

def test_retrieve_planner_items():
    """
    WHAT: Retrieve planner contents after adding a course
    WHY: Ensures planner display updates immediately for the user

    Expected: Added course is visible in planner response
    """
    clear_planner()
    course = get_available_courses()[0]
    requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)

    response = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS)
    assert response.status_code == 200
    planner = response.json()
    assert len(planner) == 1
    assert planner[0]["id"] == course["id"]
    print("✓ Test 4 PASSED: Planner retrieval returns added course")


# =====================================================================
# Test 5: Remove Course from Planner
# =====================================================================

def test_remove_course_from_planner():
    """
    WHAT: Remove a course from the planner
    WHY: Validates delete functionality and UI removal behavior

    Expected: Course is removed and no longer returned by planner
    """
    clear_planner()
    course = get_available_courses()[0]
    requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)

    response = requests.delete(f"{BASE_URL}/planner/{course['id']}", headers=AUTH_HEADERS)
    assert response.status_code == 200

    planner = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()
    assert all(item["id"] != course["id"] for item in planner)
    print("✓ Test 5 PASSED: Course removal from planner works")


# =====================================================================
# Test 6: Add Multiple Courses
# =====================================================================

def test_add_multiple_courses():
    """
    WHAT: Add more than one course to the planner
    WHY: Validates planner can hold multiple items for real schedules

    Expected: All added courses appear in the planner list
    """
    clear_planner()
    courses = get_available_courses()
    assert len(courses) >= 2

    requests.post(f"{BASE_URL}/planner", json=courses[0], headers=AUTH_HEADERS)
    requests.post(f"{BASE_URL}/planner", json=courses[1], headers=AUTH_HEADERS)

    planner = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()
    assert any(item["id"] == courses[0]["id"] for item in planner)
    assert any(item["id"] == courses[1]["id"] for item in planner)
    print("✓ Test 6 PASSED: Multiple courses can be added to planner")


# =====================================================================
# Test 7: Prevent Duplicate Planner Courses
# =====================================================================

def test_prevent_duplicate_planner_courses():
    """
    WHAT: Add the same course twice to planner
    WHY: Prevents duplicate schedule entries and UI confusion

    Expected: Course only appears once in planner
    """
    clear_planner()
    course = get_available_courses()[0]
    requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)
    requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)

    planner = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()
    matches = [item for item in planner if item["id"] == course["id"]]
    assert len(matches) == 1
    print("✓ Test 7 PASSED: Duplicate planner courses are prevented")


# =====================================================================
# Test 8: Remove Non-Existent Planner Course
# =====================================================================

def test_remove_nonexistent_planner_course():
    """
    WHAT: Delete a course that is not in planner
    WHY: Ensures delete is idempotent and does not crash the API

    Expected: API returns success and planner remains stable
    """
    clear_planner()
    response = requests.delete(f"{BASE_URL}/planner/9999", headers=AUTH_HEADERS)
    assert response.status_code == 200
    assert response.json()["message"] == "Removed from planner"
    print("✓ Test 8 PASSED: Non-existent planner delete is handled gracefully")


# =====================================================================
# Test 9: Planner API Response Structure
# =====================================================================

def test_planner_api_response_format():
    """
    WHAT: Validate planner response structure
    WHY: Frontend depends on predictable fields when rendering course cards

    Expected: All planner items include id, name, days, start_time, end_time, location
    """
    clear_planner()
    course = get_available_courses()[0]
    requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)

    planner = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()
    for item in planner:
        assert "id" in item
        assert "name" in item
        assert "days" in item
        assert "start_time" in item
        assert "end_time" in item
        assert "location" in item
    print("✓ Test 9 PASSED: Planner API response structure is correct")


# =====================================================================
# Test 10: Planner Persistence Across Requests
# =====================================================================

def test_planner_persistence():
    """
    WHAT: Add a course then retrieve planner again
    WHY: Ensures planner state persists across multiple requests

    Expected: Course remains in planner after consecutive fetches
    """
    clear_planner()
    course = get_available_courses()[0]
    requests.post(f"{BASE_URL}/planner", json=course, headers=AUTH_HEADERS)

    planner1 = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()
    time.sleep(0.1)
    planner2 = requests.get(f"{BASE_URL}/planner", headers=AUTH_HEADERS).json()

    assert any(item["id"] == course["id"] for item in planner1)
    assert any(item["id"] == course["id"] for item in planner2)
    print("✓ Test 10 PASSED: Planner persists across requests")


# ---------------------------------------------------------------------
# Suite Runner
# ---------------------------------------------------------------------
if __name__ == "__main__":
    print("\n" + "="*70)
    print("RUNNING COMPREHENSIVE PLANNER TEST SUITE")
    print("="*70 + "\n")

    try:
        test_empty_planner()
        test_available_courses_listed()
        test_add_course_to_planner()
        test_retrieve_planner_items()
        test_remove_course_from_planner()
        test_add_multiple_courses()
        test_prevent_duplicate_planner_courses()
        test_remove_nonexistent_planner_course()
        test_planner_api_response_format()
        test_planner_persistence()

        print("\n" + "="*70)
        print("✅ ALL PLANNER TESTS PASSED!")
        print("="*70)
    except AssertionError as exc:
        print(f"\n❌ TEST FAILED: {exc}")
    except Exception as exc:
        print(f"\n❌ ERROR: {exc}")
