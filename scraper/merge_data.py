"""
Merge BYU course data with RMP ratings into backend/data/courses.json.

Reads:  scraper/output/courses_raw_{yearterm}.json
        scraper/output/rmp.json
Writes: backend/data/courses.json  (accumulates all merged terms)

Usage:
  python merge_data.py --term 20263        # merge Spring 2026 into courses.json
  python merge_data.py --term "Fall 2025"  # merge by label
  python merge_data.py --list              # list available scraped terms
"""

import json
import os
import shutil
import sys
import re
import argparse
from datetime import datetime, timezone
from thefuzz import process as fuzz_process

SCRAPER_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
RMP_FILE = os.path.join(SCRAPER_OUTPUT_DIR, "rmp.json")
BACKEND_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "backend", "data")
COURSES_FILE = os.path.join(BACKEND_DATA_DIR, "courses.json")

FUZZY_THRESHOLD = 85  # minimum score to accept a fuzzy name match


def list_scraped_terms() -> dict:
    """Returns {yearterm: label} for all courses_raw_*.json files found."""
    terms = {}
    for fname in os.listdir(SCRAPER_OUTPUT_DIR):
        m = re.match(r"courses_raw_(\d+)\.json", fname)
        if m:
            yearterm = m.group(1)
            try:
                with open(os.path.join(SCRAPER_OUTPUT_DIR, fname)) as f:
                    data = json.load(f)
                terms[yearterm] = data.get("term", yearterm)
            except Exception:
                terms[yearterm] = yearterm
    return dict(sorted(terms.items(), reverse=True))


def resolve_term(arg: str, available: dict) -> tuple[str, str]:
    if arg in available:
        return arg, available[arg]
    arg_lower = arg.lower()
    for code, label in available.items():
        if label.lower() == arg_lower:
            return code, label
    raise ValueError(
        f"No scraped data found for term: {arg!r}\n"
        f"Available terms:\n" + "\n".join(f"  {c}  {l}" for c, l in available.items())
    )


def normalize_instructor(name: str) -> str:
    """'Gillespie, Paul G' -> 'gillespie, paul'  (strip middle name/initial)"""
    name = name.strip().lower()
    # Format: "last, first [middle]"
    if "," in name:
        last, rest = name.split(",", 1)
        first = rest.strip().split()[0] if rest.strip() else ""
        return f"{last.strip()}, {first}"
    return name


def build_rmp_lookup(rmp_data: dict) -> dict:
    """Returns {normalized_name: rmp_info}"""
    return rmp_data.get("professors", {})


def match_instructor(name: str, rmp_lookup: dict, rmp_keys: list) -> dict | None:
    if not name or name == "TBA":
        return None

    normalized = normalize_instructor(name)

    # Exact match
    if normalized in rmp_lookup:
        return rmp_lookup[normalized]

    # Fuzzy match
    result = fuzz_process.extractOne(normalized, rmp_keys, score_cutoff=FUZZY_THRESHOLD)
    if result:
        matched_key = result[0]
        return rmp_lookup[matched_key]

    return None


def merge_term(yearterm: str, term_label: str) -> dict:
    raw_file = os.path.join(SCRAPER_OUTPUT_DIR, f"courses_raw_{yearterm}.json")
    print(f"Loading {raw_file}...")
    with open(raw_file) as f:
        raw = json.load(f)

    print(f"Loading RMP data...")
    with open(RMP_FILE) as f:
        rmp_data = json.load(f)

    rmp_lookup = build_rmp_lookup(rmp_data)
    rmp_keys = list(rmp_lookup.keys())
    print(f"RMP professors available: {len(rmp_keys)}")

    courses = raw.get("courses", {})
    merged_courses = {}

    rmp_matched = 0
    rmp_missed = 0
    instructor_cache = {}  # cache matches to avoid redundant fuzzy searches

    for course_id, course in courses.items():
        merged_sections = {}

        for sec_num, section in course["sections"].items():
            instructor = section.get("instructor", "TBA")

            if instructor not in instructor_cache:
                rmp_info = match_instructor(instructor, rmp_lookup, rmp_keys)
                instructor_cache[instructor] = rmp_info

            rmp_info = instructor_cache[instructor]

            merged_section = dict(section)
            if rmp_info:
                merged_section["rmp"] = {
                    "rating": rmp_info["rating"],
                    "difficulty": rmp_info["difficulty"],
                    "wouldTakeAgainPercent": rmp_info["wouldTakeAgainPercent"],
                    "numRatings": rmp_info["numRatings"],
                }
                rmp_matched += 1
            else:
                merged_section["rmp"] = None
                rmp_missed += 1

            merged_sections[sec_num] = merged_section

        merged_courses[course_id] = {
            "title": course["title"],
            "credits": course["credits"],
            "department": course["department"],
            "prerequisites": [],  # placeholder — no prereq scraper yet
            "sections": merged_sections,
        }

    print(f"\nRMP match results:")
    print(f"  Matched:   {rmp_matched} sections")
    print(f"  No match:  {rmp_missed} sections")
    match_pct = rmp_matched / (rmp_matched + rmp_missed) * 100 if (rmp_matched + rmp_missed) > 0 else 0
    print(f"  Match rate: {match_pct:.1f}%")

    return {
        "term": term_label,
        "yearterm": yearterm,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "courses": merged_courses,
    }


def main():
    parser = argparse.ArgumentParser(description="Merge BYU course + RMP data")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--term", help="Yearterm code or label to merge (e.g. 20263 or 'Spring 2026')")
    group.add_argument("--list", action="store_true", help="List available scraped terms")
    args = parser.parse_args()

    available = list_scraped_terms()

    if args.list:
        if not available:
            print("No scraped terms found in scraper/output/")
        else:
            print("Available scraped terms:")
            for code, label in available.items():
                print(f"  {code}  {label}")
        return

    try:
        yearterm, term_label = resolve_term(args.term, available)
    except ValueError as e:
        print(e)
        sys.exit(1)

    print(f"Merging term: {term_label} ({yearterm})")

    merged_term = merge_term(yearterm, term_label)

    # Load existing courses.json (accumulate terms)
    os.makedirs(BACKEND_DATA_DIR, exist_ok=True)
    if os.path.exists(COURSES_FILE):
        with open(COURSES_FILE) as f:
            all_data = json.load(f)
    else:
        all_data = {}

    all_data[yearterm] = merged_term

    with open(COURSES_FILE, "w") as f:
        json.dump(all_data, f, indent=2)

    # Copy rmp.json into backend/data/ so the server finds it in one place
    rmp_dest = os.path.join(BACKEND_DATA_DIR, "rmp.json")
    shutil.copy2(RMP_FILE, rmp_dest)
    print(f"Copied rmp.json → {rmp_dest}")

    print(f"\n=== Summary ===")
    print(f"Term: {term_label} ({yearterm})")
    print(f"Courses merged: {len(merged_term['courses'])}")
    print(f"Terms in courses.json: {list(all_data.keys())}")
    print(f"Output: {COURSES_FILE}")


if __name__ == "__main__":
    main()
