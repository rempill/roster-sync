from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Annotated
from scheduling import common_slots, import_calendar

app = FastAPI(title="RosterSync Matching & Calendar", version="1.0.0")
Bit = Annotated[int, Field(strict=True, ge=0, le=1)]

class Profile(BaseModel):
    id: str
    skills: list[str] = Field(default_factory=list, max_length=30)
    ambition: int = Field(ge=1, le=10)
    availability: list[Bit] = Field(min_length=336, max_length=336)

class Team(BaseModel):
    id: str
    requiredSkills: list[str] = Field(default_factory=list)
    members: list[Profile] = Field(default_factory=list)
    capacity: int = Field(ge=2, le=10)

class RankRequest(BaseModel):
    profile: Profile
    teams: list[Team] = Field(max_length=200)

class CalendarRequest(BaseModel):
    ics: str = Field(min_length=1, max_length=1000000)
    weekStart: str
    timezone: str = "Europe/Bucharest"

@app.get("/health")
def health():
    return {"status": "ok", "service": "matching"}

@app.post("/calendar/import")
def calendar_import(payload: CalendarRequest):
    try:
        return import_calendar(payload.ics, payload.weekStart, payload.timezone)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/rank")
def rank(payload: RankRequest):
    results = []
    for team in payload.teams:
        if len(team.members) >= team.capacity or any(member.id == payload.profile.id for member in team.members):
            continue
        members = [m.model_dump() for m in team.members] + [payload.profile.model_dump()]
        common = common_slots(members)
        skills = {s.strip().casefold() for m in members for s in m["skills"]}
        required = {s.strip().casefold() for s in team.requiredSkills}
        skill_score = len(skills & required) / len(required) if required else 1
        ambitions = [m["ambition"] for m in members]
        ambition_score = 1 - (max(ambitions) - min(ambitions)) / 9
        schedule_score = min(len(common) / 8, 1)
        score = round(100 * (0.45 * schedule_score + 0.35 * skill_score + 0.20 * ambition_score), 1)
        results.append({"teamId": team.id, "score": score, "commonSlots": common, "commonHours": len(common) / 2,
                        "components": {"schedule": round(schedule_score * 100, 1), "skills": round(skill_score * 100, 1),
                                       "ambition": round(ambition_score * 100, 1)}})
    return sorted(results, key=lambda item: (-item["score"], item["teamId"]))
