import unittest
from fastapi.testclient import TestClient
from main import app
from scheduling import common_slots, default_availability, import_calendar

class MatchingTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.profile = {"id": "a", "skills": ["React"], "ambition": 8, "availability": default_availability()}

    def test_ranking_and_full_team_exclusion(self):
        teammate = {**self.profile, "id": "b", "skills": ["Python"]}
        teams = [{"id": "compatible", "capacity": 3, "requiredSkills": ["react", "python"], "members": [teammate]},
                 {"id": "no-overlap", "capacity": 3, "requiredSkills": ["Rust"], "members": [{**teammate, "availability": [0]*336}]},
                 {"id": "full", "capacity": 2, "members": [teammate, {**teammate, "id": "c"}]}]
        response = self.client.post("/rank", json={"profile": self.profile, "teams": teams})
        self.assertEqual(response.status_code, 200)
        ranked = response.json()
        self.assertEqual([r["teamId"] for r in ranked], ["compatible", "no-overlap"])
        self.assertEqual(ranked[0]["score"], 100)
        self.assertEqual(ranked[1]["commonHours"], 0)

    def test_invalid_bitmask(self):
        self.assertEqual(self.client.post("/rank", json={"profile": {**self.profile, "availability": [1]}, "teams": []}).status_code, 422)
        self.assertEqual(self.client.post("/rank", json={"profile": {**self.profile, "availability": [2]*336}, "teams": []}).status_code, 422)

    def test_intersection(self):
        self.assertEqual(common_slots([{"availability": [1,0]+[0]*334}, {"availability": [1,1]+[0]*334}]), [0])

    def test_weekly_calendar_and_timezone(self):
        ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:lecture\r\nDTSTART:20261102T080000Z\r\nDTEND:20261102T093000Z\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEND:VEVENT\r\nEND:VCALENDAR"
        imported = import_calendar(ics, "2026-11-09")
        self.assertEqual(imported["eventsImported"], 1)
        self.assertEqual(imported["availability"][20:23], [0,0,0])
        self.assertEqual(imported["availability"][19], 1)

    def test_all_day_and_invalid_calendar(self):
        ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:day\r\nDTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261110\r\nEND:VEVENT\r\nEND:VCALENDAR"
        self.assertEqual(sum(import_calendar(ics, "2026-11-09")["availability"][:48]), 0)
        self.assertEqual(self.client.post("/calendar/import", json={"ics": "garbage", "weekStart": "2026-11-09"}).status_code, 400)
        self.assertEqual(self.client.post("/calendar/import", json={"ics": ics, "weekStart": "2026-11-10"}).status_code, 400)

if __name__ == "__main__":
    unittest.main()
