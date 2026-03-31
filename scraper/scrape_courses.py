"""
BYU Course Schedule Scraper
Scrapes all courses and sections from commtech.byu.edu/noauth/classSchedule
Output: scraper/output/courses_raw.json

Usage:
  python scrape_courses.py                  # lists available terms
  python scrape_courses.py 20255            # scrape by yearterm code
  python scrape_courses.py "Fall 2025"      # scrape by term label (case-insensitive)
"""

import json
import os
import sys
import time
import re
from datetime import datetime, timezone
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://commtech.byu.edu/noauth/classSchedule"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
DELAY = 0.4  # seconds between requests


def get_session_and_terms(session: requests.Session) -> tuple[str, dict]:
    """Returns (session_id, {yearterm_code: label}) from the main page."""
    resp = session.get(f"{BASE_URL}/index.php")
    resp.raise_for_status()

    match = re.search(r'session_id\s*=\s*"([^"]+)"', resp.text)
    if not match:
        raise RuntimeError("Could not find session_id on page")
    session_id = match.group(1)

    soup = BeautifulSoup(resp.text, "html.parser")
    select = soup.find(id="yearterm")
    terms = {}
    if select:
        for opt in select.find_all("option"):
            val = opt.get("value")
            label = opt.text.strip()
            if val and val not in ("ARCHIVES", ""):
                terms[val] = label

    return session_id, terms


def resolve_yearterm(arg: str, terms: dict) -> tuple[str, str]:
    """Given a yearterm code or label, return (code, label). Raises ValueError if not found."""
    # Direct code match (e.g. "20255")
    if arg in terms:
        return arg, terms[arg]
    # Label match (case-insensitive)
    arg_lower = arg.lower()
    for code, label in terms.items():
        if label.lower() == arg_lower:
            return code, label
    raise ValueError(
        f"Unknown term: {arg!r}\nAvailable terms:\n"
        + "\n".join(f"  {code}  {label}" for code, label in terms.items())
    )


def get_departments(session: requests.Session, yearterm: str) -> dict:
    """Returns {dept_code: dept_name}"""
    resp = session.post(
        f"{BASE_URL}/ajax/getYeartermData.php",
        data={"yearterm": yearterm},
    )
    resp.raise_for_status()
    return resp.json()["department_list"]


def get_courses_for_dept(session: requests.Session, session_id: str, yearterm: str, dept_code: str) -> dict:
    resp = session.post(
        f"{BASE_URL}/ajax/getClasses.php",
        data={
            "searchObject[yearterm]": yearterm,
            "searchObject[dept_name_or_keyword][dept]": dept_code,
            "searchObject[dept_name_or_keyword][keyword]": dept_code,
            "sessionId": session_id,
        },
    )
    resp.raise_for_status()
    try:
        return resp.json()
    except Exception:
        return {}


def get_sections(session: requests.Session, session_id: str, yearterm: str, course_key: str) -> dict:
    resp = session.post(
        f"{BASE_URL}/ajax/getSections.php",
        data={
            "courseId": course_key,
            "sessionId": session_id,
            "yearterm": yearterm,
        },
    )
    resp.raise_for_status()
    try:
        return resp.json()
    except Exception:
        return {}


def normalize_dept(dept_name: str) -> str:
    """'C S' -> 'CS', 'IT&C' -> 'IT&C'"""
    return dept_name.replace(" ", "")


def parse_time(t) -> str | None:
    """Convert various time formats to 'HH:MM' 24h."""
    if not t:
        return None
    t = str(t).strip()
    # Bare 4-digit military time: "1200" -> "12:00", "0930" -> "09:30"
    if re.match(r"^\d{4}$", t):
        return f"{t[:2]}:{t[2:]}"
    # "12:00 PM" / "9:30 AM"
    match = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)", t, re.IGNORECASE)
    if match:
        h, m, period = int(match.group(1)), int(match.group(2)), match.group(3).upper()
        if period == "PM" and h != 12:
            h += 12
        elif period == "AM" and h == 12:
            h = 0
        return f"{h:02d}:{m:02d}"
    # Already "HH:MM"
    match = re.match(r"^(\d{2}):(\d{2})$", t)
    if match:
        return t
    return None


def build_course_id(dept_name: str, catalog_number: str, catalog_suffix) -> str:
    dept = normalize_dept(dept_name)
    num = catalog_number.lstrip("0") if catalog_number else ""
    suffix = catalog_suffix or ""
    return f"{dept} {num}{suffix}".strip()


def build_section(sec: dict) -> dict:
    days_map = {"mon": "M", "tue": "T", "wed": "W", "thu": "Th", "fri": "F", "sat": "Sa", "sun": "Su"}

    meetings = []
    for t in sec.get("times", []):
        days = [v for k, v in days_map.items() if t.get(k)]
        building = t.get("building") or ""
        room = t.get("room") or ""
        location = f"{building} {room}".strip() if (building or room) else "TBA"
        meetings.append({
            "days": days,
            "startTime": parse_time(t.get("begin_time")),
            "endTime": parse_time(t.get("end_time")),
            "location": location,
        })

    instructors = sec.get("instructors", [])
    instructor = instructors[0].get("sort_name", "TBA") if instructors else "TBA"

    avail = sec.get("availability", {})
    capacity = int(avail.get("class_size") or 0)
    available = int(avail.get("seats_available") or 0)
    seats = {
        "capacity": capacity,
        "enrolled": capacity - available,
        "available": available,
    }

    return {
        "crn": f"{sec.get('curriculum_id', '')}-{sec.get('title_code', '')}-{sec.get('section_number', '')}",
        "instructor": instructor,
        "type": sec.get("section_type", ""),
        "meetings": meetings,
        "seats": seats,
    }


def scrape(yearterm: str, term_label: str, session: requests.Session, session_id: str):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_file = os.path.join(OUTPUT_DIR, f"courses_raw_{yearterm}.json")

    print(f"Scraping term: {term_label} ({yearterm})")
    print("Getting department list...")
    departments = get_departments(session, yearterm)
    dept_codes = list(departments.keys())
    print(f"Found {len(dept_codes)} departments")
    time.sleep(DELAY)

    courses = {}
    total_sections = 0
    empty_depts = 0
    errors = 0

    for i, dept_code in enumerate(dept_codes, 1):
        dept_name = departments[dept_code]
        print(f"[{i}/{len(dept_codes)}] {dept_code} ({dept_name})...", end=" ", flush=True)

        try:
            dept_courses = get_courses_for_dept(session, session_id, yearterm, dept_code)
        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1
            time.sleep(DELAY)
            continue

        if not dept_courses:
            print("0 courses")
            empty_depts += 1
            time.sleep(DELAY)
            continue

        dept_course_count = 0
        for course_key, course_data in dept_courses.items():
            course_id = build_course_id(
                course_data.get("dept_name", dept_code),
                course_data.get("catalog_number", ""),
                course_data.get("catalog_suffix"),
            )

            try:
                sections_data = get_sections(session, session_id, yearterm, course_key)
                time.sleep(DELAY)
            except Exception as e:
                print(f"\n  getSections error for {course_id}: {e}")
                errors += 1
                continue

            raw_sections = sections_data.get("sections", [])
            if not raw_sections:
                continue

            sections = {}
            for sec in raw_sections:
                sec_num = sec.get("section_number", "001")
                sections[sec_num] = build_section(sec)

            if not sections:
                continue

            first_sec = raw_sections[0]
            try:
                credits = float(first_sec.get("credit_hours") or 0)
            except (ValueError, TypeError):
                credits = 0

            courses[course_id] = {
                "title": course_data.get("title", ""),
                "credits": credits,
                "department": normalize_dept(course_data.get("dept_name", dept_code)),
                "sections": sections,
            }
            dept_course_count += 1
            total_sections += len(sections)

        print(f"{dept_course_count} courses")

    output = {
        "term": term_label,
        "yearterm": yearterm,
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "departments": dept_codes,
        "courses": courses,
    }

    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    print("\n=== Summary ===")
    print(f"Term: {term_label} ({yearterm})")
    print(f"Departments with courses: {len(dept_codes) - empty_depts}/{len(dept_codes)}")
    print(f"Total courses: {len(courses)}")
    print(f"Total sections: {total_sections}")
    print(f"Errors: {errors}")
    print(f"Output: {output_file}")

    missing_times = sum(
        1 for c in courses.values()
        for s in c["sections"].values()
        if not any(m["startTime"] for m in s["meetings"])
    )
    print(f"Sections with no meeting times (TBA/online): {missing_times}")


def main():
    session = requests.Session()
    session.headers.update({"User-Agent": "BYU-Scheduler-Scraper/1.0"})

    print("Fetching available terms...")
    session_id, terms = get_session_and_terms(session)

    if len(sys.argv) < 2:
        print("\nAvailable terms:")
        for code, label in terms.items():
            print(f"  {code}  {label}")
        print("\nUsage: python scrape_courses.py <yearterm_code_or_label>")
        print('Example: python scrape_courses.py 20255')
        print('Example: python scrape_courses.py "Fall 2025"')
        sys.exit(0)

    arg = " ".join(sys.argv[1:])
    try:
        yearterm, term_label = resolve_yearterm(arg, terms)
    except ValueError as e:
        print(e)
        sys.exit(1)

    scrape(yearterm, term_label, session, session_id)


if __name__ == "__main__":
    main()
