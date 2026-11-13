from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from icalendar import Calendar
import recurring_ical_events

SLOTS = 7 * 48

def default_availability():
    return [int(day < 5 and 9 <= half / 2 < 18) for day in range(7) for half in range(48)]

def validate_slots(slots):
    if len(slots) != SLOTS or any(type(slot) is not int or slot not in (0, 1) for slot in slots):
        raise ValueError("Availability must contain 336 integer bits.")
    return slots

def common_slots(profiles):
    if not profiles:
        return []
    mask = (1 << SLOTS) - 1
    for profile in profiles:
        bits = validate_slots(profile["availability"])
        mask &= sum(bit << i for i, bit in enumerate(bits))
    return [i for i in range(SLOTS) if (mask >> i) & 1]

def import_calendar(ics, week_start, timezone="Europe/Bucharest"):
    monday = date.fromisoformat(week_start)
    if monday.weekday() != 0:
        raise ValueError("weekStart must be a Monday.")
    zone = ZoneInfo(timezone)
    start = datetime.combine(monday, time.min, zone)
    end = start + timedelta(days=7)
    calendar = Calendar.from_ical(ics)
    if not any(c.name == "VEVENT" for c in calendar.walk()):
        raise ValueError("Calendar contains no events.")
    slots = default_availability()
    events = recurring_ical_events.of(calendar).between(start, end)
    for event in events:
        begin = event.decoded("DTSTART")
        finish = event.decoded("DTEND", None)
        if finish is None:
            finish = begin + event.decoded("DURATION", timedelta(days=1) if not isinstance(begin, datetime) else timedelta(hours=1))
        if not isinstance(begin, datetime):
            begin = datetime.combine(begin, time.min, zone)
        if not isinstance(finish, datetime):
            finish = datetime.combine(finish, time.min, zone)
        if begin.tzinfo is None:
            begin = begin.replace(tzinfo=zone)
        if finish.tzinfo is None:
            finish = finish.replace(tzinfo=zone)
        begin, finish = begin.astimezone(zone), finish.astimezone(zone)
        if finish <= begin:
            raise ValueError("Calendar event ends before it starts.")
        for i in range(SLOTS):
            slot_start = start + timedelta(minutes=30 * i)
            if slot_start < finish and slot_start + timedelta(minutes=30) > begin:
                slots[i] = 0
    return {"availability": slots, "eventsImported": len(events), "weekStart": week_start, "timezone": timezone}
