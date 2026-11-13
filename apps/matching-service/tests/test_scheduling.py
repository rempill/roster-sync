import unittest
from scheduling import import_calendar, common_slots

class ScheduleTests(unittest.TestCase):
    def test_partial_half_hour_blocks_both_slots(self):
        calendar = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:partial\r\nDTSTART:20261109T111500\r\nDTEND:20261109T114500\r\nEND:VEVENT\r\nEND:VCALENDAR"
        result = import_calendar(calendar, "2026-11-09")
        self.assertEqual(result["availability"][22:24], [0, 0])
        self.assertEqual(result["availability"][21], 1)
        self.assertEqual(result["availability"][24], 1)

    def test_reject_unknown_timezone(self):
        with self.assertRaises(Exception):
            import_calendar("BEGIN:VCALENDAR\r\nEND:VCALENDAR", "2026-11-09", "Unknown/Zone")

    def test_bitmask_includes_last_week_slot(self):
        bits = [0] * 335 + [1]
        self.assertEqual(common_slots([{"availability": bits}, {"availability": bits}]), [335])

if __name__ == "__main__":
    unittest.main()
