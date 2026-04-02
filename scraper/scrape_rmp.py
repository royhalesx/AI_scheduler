"""
RateMyProfessors Scraper for BYU
Fetches all BYU professor ratings via the RMP GraphQL API.
Output: scraper/output/rmp.json

Usage:
  python scrape_rmp.py
"""

import json
import os
import time
import requests
from datetime import datetime, timezone

RMP_URL = "https://www.ratemyprofessors.com/graphql"
BYU_SCHOOL_ID = "U2Nob29sLTEzNQ=="  # base64("School-135")
AUTH_HEADER = "Basic dGVzdDp0ZXN0"   # public test:test token
PAGE_SIZE = 100
DELAY = 0.5

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "rmp.json")

QUERY = """
query GetBYUProfessors($schoolID: ID!, $cursor: String) {
  newSearch {
    teachers(query: { schoolID: $schoolID }, first: %(page_size)d, after: $cursor) {
      edges {
        node {
          id
          firstName
          lastName
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
          department
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
""" % {"page_size": PAGE_SIZE}


def normalize_name(first: str, last: str) -> str:
    """'John' + 'Smith' -> 'smith, john' (matches BYU sort_name format lowercased)"""
    return f"{last.strip()}, {first.strip()}".lower()


def fetch_all_professors() -> dict:
    session = requests.Session()
    session.headers.update({
        "Authorization": AUTH_HEADER,
        "Content-Type": "application/json",
        "User-Agent": "BYU-Scheduler-Scraper/1.0",
    })

    professors = {}
    cursor = None
    page = 1

    while True:
        variables = {"schoolID": BYU_SCHOOL_ID}
        if cursor:
            variables["cursor"] = cursor

        resp = session.post(RMP_URL, json={"query": QUERY, "variables": variables})
        resp.raise_for_status()
        data = resp.json()

        teachers_data = data["data"]["newSearch"]["teachers"]
        edges = teachers_data["edges"]
        page_info = teachers_data["pageInfo"]

        for edge in edges:
            node = edge["node"]
            key = normalize_name(node["firstName"], node["lastName"])
            professors[key] = {
                "rmpId": node["id"],
                "firstName": node["firstName"],
                "lastName": node["lastName"],
                "rating": node["avgRating"],
                "difficulty": node["avgDifficulty"],
                "wouldTakeAgainPercent": node["wouldTakeAgainPercent"],
                "numRatings": node["numRatings"],
                "department": node["department"],
            }

        print(f"  Page {page}: fetched {len(edges)} professors (total so far: {len(professors)})")

        if not page_info["hasNextPage"]:
            break

        cursor = page_info["endCursor"]
        page += 1
        time.sleep(DELAY)

    return professors


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Fetching BYU professors from RateMyProfessors...")
    professors = fetch_all_professors()

    output = {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "school": "BYU",
        "professors": professors,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n=== Summary ===")
    print(f"Total professors: {len(professors)}")
    print(f"Output: {OUTPUT_FILE}")

    # Show a few examples
    sample = list(professors.items())[:3]
    print("\nSample entries:")
    for key, prof in sample:
        print(f"  {key!r} → rating={prof['rating']}, dept={prof['department']}")


if __name__ == "__main__":
    main()
