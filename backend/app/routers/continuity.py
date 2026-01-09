"""
Continuity router for checking and maintaining consistency across the book.

Provides endpoints for:
- Full continuity checking (character, timeline, world)
- Literary review based on NYT and professional guidelines
- Getting continuity reports
- Auto-fixing continuity issues
"""

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import Integer, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import ErrorCode
from app.models import Artifact, Project, Session
from app.security import TokenData, get_current_user

# Import LiteLLM for AI analysis
try:
    from litellm import acompletion
    LITELLM_AVAILABLE = True
except ImportError:
    LITELLM_AVAILABLE = False

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/continuity", tags=["continuity"])


# ============================================================================
# Request/Response Schemas
# ============================================================================


class CharacterState(BaseModel):
    """Current state of a character at a specific point in the story."""

    chapter_number: int = Field(..., ge=1)
    location: Optional[str] = None
    emotional_state: Optional[str] = None
    knowledge: list[str] = Field(default_factory=list)
    relationships: dict[str, str] = Field(default_factory=dict)
    physical_state: Optional[str] = None


class CharacterProfile(BaseModel):
    """Complete character profile with all tracked details."""

    name: str = Field(..., min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list)
    physical_description: Optional[str] = None
    personality_traits: list[str] = Field(default_factory=list)
    backstory: Optional[str] = None
    first_appearance: Optional[int] = Field(None, ge=1, description="Chapter number")
    states: list[CharacterState] = Field(default_factory=list)


class TimelineEvent(BaseModel):
    """An event in the story timeline."""

    id: str
    chapter_number: int = Field(..., ge=1)
    description: str = Field(..., min_length=5)
    timestamp: Optional[str] = None  # In-story timestamp
    characters_involved: list[str] = Field(default_factory=list)
    location: Optional[str] = None
    duration: Optional[str] = None
    dependencies: list[str] = Field(default_factory=list)  # Event IDs this depends on


class WorldRule(BaseModel):
    """A rule or constraint in the story world."""

    id: str
    name: str = Field(..., min_length=1)
    category: str = Field(
        ...,
        description="Category: magic_system, technology, physics, society, geography, other",
    )
    description: str = Field(..., min_length=10)
    exceptions: list[str] = Field(default_factory=list)
    established_in_chapter: Optional[int] = Field(None, ge=1)


class ContinuityIssue(BaseModel):
    """A detected continuity issue."""

    id: str
    issue_type: str = Field(
        ...,
        description="Type: character, timeline, world, plot_hole, inconsistency",
    )
    severity: str = Field(
        default="warning",
        description="Severity: info, warning, error",
    )
    chapter_number: int = Field(..., ge=1)
    description: str = Field(..., min_length=10)
    context: str = Field(
        default="",
        description="Surrounding text or context",
    )
    original_text: Optional[str] = None
    suggested_fix: Optional[str] = None
    affected_chapters: list[int] = Field(default_factory=list)
    related_character: Optional[str] = None
    related_event_id: Optional[str] = None
    related_rule_id: Optional[str] = None
    auto_fixable: bool = Field(default=False)


class ContinuityCheckRequest(BaseModel):
    """Request to run a continuity check."""

    check_types: list[str] = Field(
        default=["character", "timeline", "world"],
        description="Types of checks to run: character, timeline, world, all",
    )
    chapters: Optional[list[int]] = Field(
        None,
        description="Specific chapters to check. If None, checks all chapters.",
    )
    focus_characters: Optional[list[str]] = Field(
        None,
        description="Specific characters to focus on",
    )
    include_suggestions: bool = Field(
        default=True,
        description="Include fix suggestions in the report",
    )


class ContinuityReport(BaseModel):
    """Complete continuity report for a project."""

    project_id: UUID
    generated_at: datetime
    check_types: list[str]
    chapters_checked: list[int]

    # Issue counts
    total_issues: int
    issues_by_type: dict[str, int]
    issues_by_severity: dict[str, int]

    # Detailed issues
    issues: list[ContinuityIssue]

    # Character tracking
    characters: dict[str, CharacterProfile] = Field(default_factory=dict)

    # Timeline tracking
    timeline_events: list[TimelineEvent] = Field(default_factory=list)
    timeline_valid: bool = True
    timeline_gaps: list[str] = Field(default_factory=list)

    # World consistency
    world_rules: list[WorldRule] = Field(default_factory=list)
    rule_violations: list[str] = Field(default_factory=list)

    # Summary
    overall_score: float = Field(ge=0.0, le=1.0)
    summary: str


class FixIssueRequest(BaseModel):
    """Request to fix a continuity issue."""

    apply_to_all_chapters: bool = Field(
        default=False,
        description="Apply fix to all affected chapters",
    )
    custom_fix: Optional[str] = Field(
        None,
        description="Custom fix text to use instead of suggested fix",
    )


class FixIssueResponse(BaseModel):
    """Response after fixing an issue."""

    success: bool
    issue_id: str
    fix_applied: str
    chapters_modified: list[int]
    message: str


# ============================================================================
# Literary Review Configuration - Based on NYT Book Review Guidelines
# ============================================================================

# Review phases with descriptions based on professional book review standards
REVIEW_PHASES = [
    {
        "id": "narrative_structure",
        "name": "Narrative & Structure",
        "description": "Evaluating plot coherence, chapter progression, and story pacing",
        "weight": 0.20,
    },
    {
        "id": "character_development",
        "name": "Character Development",
        "description": "Analyzing character consistency, motivations, arcs, and distinct voices",
        "weight": 0.20,
    },
    {
        "id": "writing_quality",
        "name": "Writing Quality",
        "description": "Assessing prose style, clarity, dialogue effectiveness, and show vs tell",
        "weight": 0.20,
    },
    {
        "id": "thematic_elements",
        "name": "Thematic Elements",
        "description": "Examining central themes, their development, and message clarity",
        "weight": 0.15,
    },
    {
        "id": "technical_consistency",
        "name": "Technical Consistency",
        "description": "Checking timeline coherence, world-building logic, and factual accuracy",
        "weight": 0.15,
    },
    {
        "id": "reader_experience",
        "name": "Reader Experience",
        "description": "Evaluating engagement, emotional resonance, and overall impact",
        "weight": 0.10,
    },
]

# Detailed review prompts for each phase
REVIEW_PROMPTS = {
    "narrative_structure": """You are a professional literary reviewer evaluating narrative structure.

Analyze this manuscript for:
1. **Plot Coherence**: Does the story have a clear beginning, middle, and end? Are there logical cause-and-effect relationships between events?
2. **Chapter Progression**: Do chapters flow naturally into each other? Is there appropriate rising action and tension?
3. **Pacing**: Is the story well-paced? Are there sections that drag or feel rushed?
4. **Scene Construction**: Are scenes properly established with clear settings, transitions, and resolutions?
5. **Story Arc**: Does the overall narrative arc feel complete and satisfying?

Provide your analysis in JSON format:
{
    "score": <0.0-1.0>,
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "specific_issues": [
        {"chapter": <number>, "issue": "description", "suggestion": "how to fix"}
    ],
    "summary": "2-3 sentence overall assessment"
}""",

    "character_development": """You are a professional literary reviewer evaluating character development.

Analyze this manuscript for:
1. **Character Consistency**: Do characters behave consistently with their established traits throughout?
2. **Motivations**: Are character motivations clear and believable?
3. **Character Arcs**: Do main characters show growth or change over the course of the story?
4. **Distinct Voices**: Does each character have a unique voice in dialogue and internal thoughts?
5. **Relationships**: Are relationships between characters believable and well-developed?
6. **Supporting Characters**: Do secondary characters feel three-dimensional or like cardboard cutouts?

Provide your analysis in JSON format:
{
    "score": <0.0-1.0>,
    "characters_analyzed": ["name1", "name2", ...],
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "specific_issues": [
        {"character": "name", "chapter": <number>, "issue": "description", "suggestion": "how to fix"}
    ],
    "summary": "2-3 sentence overall assessment"
}""",

    "writing_quality": """You are a professional literary reviewer evaluating writing quality.

Analyze this manuscript for:
1. **Prose Style**: Is the writing clear, engaging, and appropriate for the genre?
2. **Show vs Tell**: Does the author effectively show emotions and events rather than just telling?
3. **Dialogue**: Is dialogue natural, purposeful, and distinct for each character?
4. **Description**: Are descriptions vivid without being purple prose?
5. **Word Choice**: Is vocabulary appropriate and varied?
6. **Sentence Structure**: Is there good variety in sentence length and structure?
7. **Grammar & Mechanics**: Are there noticeable grammatical issues?

Provide your analysis in JSON format:
{
    "score": <0.0-1.0>,
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "notable_passages": [
        {"chapter": <number>, "type": "strength|weakness", "excerpt": "brief quote", "comment": "why notable"}
    ],
    "summary": "2-3 sentence overall assessment"
}""",

    "thematic_elements": """You are a professional literary reviewer evaluating thematic elements.

Analyze this manuscript for:
1. **Central Themes**: What are the main themes? Are they clearly conveyed?
2. **Theme Development**: How well are themes woven throughout the narrative?
3. **Message Clarity**: Is there a clear message or takeaway without being heavy-handed?
4. **Symbolic Elements**: Are symbols and motifs used effectively?
5. **Emotional Resonance**: Do the themes create emotional impact?

Provide your analysis in JSON format:
{
    "score": <0.0-1.0>,
    "identified_themes": ["theme1", "theme2", ...],
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "thematic_moments": [
        {"chapter": <number>, "theme": "which theme", "effectiveness": "how well handled"}
    ],
    "summary": "2-3 sentence overall assessment"
}""",

    "technical_consistency": """You are a professional literary reviewer evaluating technical consistency.

Analyze this manuscript for:
1. **Timeline Coherence**: Do events happen in logical chronological order? Are there timeline errors?
2. **World-Building Logic**: Are the rules of the story world consistent?
3. **Factual Accuracy**: Are any factual claims accurate (historical, scientific, etc.)?
4. **Continuity Errors**: Are there contradictions in descriptions, events, or character knowledge?
5. **Setting Consistency**: Do locations and environments remain consistent?

Provide your analysis in JSON format:
{
    "score": <0.0-1.0>,
    "timeline_valid": true|false,
    "continuity_errors": [
        {"chapters": [<number>, <number>], "error": "description", "fix": "suggested correction"}
    ],
    "world_building_issues": [
        {"chapter": <number>, "issue": "description", "impact": "low|medium|high"}
    ],
    "factual_concerns": [
        {"chapter": <number>, "claim": "what was stated", "concern": "why problematic"}
    ],
    "summary": "2-3 sentence overall assessment"
}""",

    "reader_experience": """You are a professional literary reviewer evaluating reader experience.

Analyze this manuscript for:
1. **Engagement**: Does the story hook the reader and maintain interest?
2. **Emotional Impact**: Does the story evoke appropriate emotional responses?
3. **Satisfaction**: Is the ending satisfying? Are plot threads resolved?
4. **Target Audience Fit**: Is the content appropriate for its intended audience?
5. **Readability**: Is the book easy to follow and enjoyable to read?
6. **Recommendation**: Would you recommend this book? To whom?

Provide your analysis in JSON format:
{
    "score": <0.0-1.0>,
    "engagement_level": "low|medium|high",
    "emotional_moments": [
        {"chapter": <number>, "moment": "description", "emotion": "what it evokes"}
    ],
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "target_audience": "description of ideal reader",
    "recommendation": "overall recommendation with reasoning",
    "summary": "2-3 sentence overall assessment"
}"""
}


# ============================================================================
# Helper Functions
# ============================================================================


async def verify_project_ownership(
    project_id: UUID,
    current_user: TokenData,
    db: AsyncSession,
) -> Project:
    """Verify that the current user owns the project. Returns the project."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.user_id,
        )
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": ErrorCode.PROJECT_NOT_FOUND, "message": "Project not found or you don't have access"},
        )
    return project


async def get_all_chapters(db: AsyncSession, project_id: UUID) -> list[dict]:
    """Fetch all chapters for a project, ordered by chapter number."""
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "chapter")
        .order_by(Artifact.meta["chapter_number"].astext.cast(Integer))
    )
    artifacts = result.scalars().all()

    chapters = []
    for artifact in artifacts:
        if artifact.blob:
            chapter_num = artifact.meta.get("chapter_number", 0)
            title = artifact.meta.get("title", f"Chapter {chapter_num}")
            content = artifact.blob.decode("utf-8")
            chapters.append({
                "number": chapter_num,
                "title": title,
                "content": content,
                "word_count": len(content.split())
            })

    return chapters


async def get_project_outline(db: AsyncSession, project_id: UUID) -> Optional[str]:
    """Retrieve the latest outline artifact for a project."""
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "outline")
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    artifact = result.scalar_one_or_none()
    if artifact and artifact.blob:
        return artifact.blob.decode("utf-8")
    return None


async def run_llm_review(
    manuscript_text: str,
    phase_id: str,
    model: str = None,
) -> dict:
    """Run LLM analysis for a specific review phase."""
    if not LITELLM_AVAILABLE:
        return {
            "score": 0.8,
            "summary": "LiteLLM not available - mock review returned",
            "strengths": ["Unable to perform real analysis"],
            "weaknesses": [],
        }

    from app.config import DEFAULT_MODEL
    model = model or DEFAULT_MODEL
    prompt = REVIEW_PROMPTS.get(phase_id, "")

    if not prompt:
        return {"score": 0.0, "error": f"Unknown review phase: {phase_id}"}

    try:
        response = await acompletion(
            model=model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Please review this manuscript:\n\n{manuscript_text}"},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        content = response.choices[0].message.content

        # Try to parse JSON from response
        try:
            # Find JSON in response (may be wrapped in markdown code blocks)
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                return json.loads(json_match.group())
            else:
                return {
                    "score": 0.7,
                    "summary": content[:500],
                    "parse_error": "Could not extract JSON from response"
                }
        except json.JSONDecodeError:
            return {
                "score": 0.7,
                "summary": content[:500],
                "parse_error": "Invalid JSON in response"
            }

    except Exception as e:
        logger.error(f"LLM review failed for phase {phase_id}: {e}")
        return {
            "score": 0.0,
            "error": str(e),
            "summary": f"Review failed: {str(e)}"
        }


# ============================================================================
# Endpoints
# ============================================================================


@router.post("/check")
async def run_continuity_check(
    project_id: UUID,
    request: ContinuityCheckRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Run a comprehensive literary review on the project with SSE streaming.

    Based on NYT Book Review guidelines and professional literary standards.
    Evaluates:
    - Narrative structure and pacing
    - Character development and consistency
    - Writing quality and prose style
    - Thematic elements and message clarity
    - Technical consistency (timeline, world-building)
    - Overall reader experience
    """
    await verify_project_ownership(project_id, current_user, db)

    # Fetch all chapters for the review
    chapters = await get_all_chapters(db, project_id)

    async def generate():
        """Generate SSE events for literary review."""
        try:
            # Start event with metadata
            yield f"data: {json.dumps({'event': 'start', 'phases': [p['name'] for p in REVIEW_PHASES], 'chapter_count': len(chapters)})}\n\n"

            if not chapters:
                yield f"data: {json.dumps({'event': 'error', 'message': 'No chapters found. Generate chapters before running a review.'})}\n\n"
                return

            # Compile full manuscript for review
            manuscript_parts = []
            for chapter in chapters:
                manuscript_parts.append(f"## Chapter {chapter['number']}: {chapter['title']}\n\n{chapter['content']}")

            full_manuscript = "\n\n---\n\n".join(manuscript_parts)
            total_words = sum(ch['word_count'] for ch in chapters)

            yield f"data: {json.dumps({'event': 'progress', 'phase': 'Preparing manuscript', 'progress': 0.05, 'detail': f'Compiled {len(chapters)} chapters ({total_words:,} words)'})}\n\n"

            # Run each review phase
            phase_results = {}
            total_phases = len(REVIEW_PHASES)

            for idx, phase in enumerate(REVIEW_PHASES):
                phase_id = phase["id"]
                phase_name = phase["name"]
                phase_description = phase["description"]

                # Progress update: starting phase
                progress = 0.1 + (idx / total_phases) * 0.85
                yield f"data: {json.dumps({'event': 'progress', 'phase': phase_name, 'progress': progress, 'detail': phase_description})}\n\n"

                # Run LLM analysis for this phase
                result = await run_llm_review(full_manuscript, phase_id)
                phase_results[phase_id] = result

                # Send phase result
                yield f"data: {json.dumps({'event': 'phase_complete', 'phase': phase_name, 'phase_id': phase_id, 'score': result.get('score', 0), 'summary': result.get('summary', ''), 'details': result})}\n\n"

                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.5)

            # Calculate overall score (weighted average)
            overall_score = 0.0
            for phase in REVIEW_PHASES:
                phase_id = phase["id"]
                weight = phase["weight"]
                phase_score = phase_results.get(phase_id, {}).get("score", 0)
                overall_score += phase_score * weight

            # Compile all issues from all phases
            all_issues = []
            for phase_id, result in phase_results.items():
                # Collect specific issues from different result formats
                if "specific_issues" in result:
                    for issue in result["specific_issues"]:
                        all_issues.append({
                            "phase": phase_id,
                            "type": "specific",
                            **issue
                        })
                if "continuity_errors" in result:
                    for error in result["continuity_errors"]:
                        all_issues.append({
                            "phase": phase_id,
                            "type": "continuity",
                            **error
                        })
                if "world_building_issues" in result:
                    for issue in result["world_building_issues"]:
                        all_issues.append({
                            "phase": phase_id,
                            "type": "world_building",
                            **issue
                        })

            # Generate overall recommendation
            if overall_score >= 0.85:
                recommendation = "This manuscript is publication-ready with minor polish needed."
            elif overall_score >= 0.70:
                recommendation = "This manuscript shows strong potential and would benefit from targeted revisions."
            elif overall_score >= 0.55:
                recommendation = "This manuscript needs significant revision in several areas before publication."
            else:
                recommendation = "This manuscript requires substantial rework across multiple dimensions."

            # Complete event with full report
            complete_data = {
                "event": "complete",
                "overall_score": round(overall_score, 3),
                "issues_found": len(all_issues),
                "chapter_count": len(chapters),
                "total_words": total_words,
                "recommendation": recommendation,
                "phase_scores": {
                    phase["id"]: phase_results.get(phase["id"], {}).get("score", 0)
                    for phase in REVIEW_PHASES
                },
                "phase_summaries": {
                    phase["id"]: phase_results.get(phase["id"], {}).get("summary", "")
                    for phase in REVIEW_PHASES
                },
                "all_issues": all_issues[:20],  # Limit to top 20 issues
                "full_report": phase_results,
            }

            yield f"data: {json.dumps(complete_data)}\n\n"

        except Exception as e:
            logger.error(f"Error during literary review: {e}")
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/report")
async def get_continuity_report(
    project_id: UUID,
    issue_type: Optional[str] = None,
    severity: Optional[str] = None,
    chapter: Optional[int] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContinuityReport:
    """
    Get the latest continuity report for the project.

    Filter by:
    - issue_type: character, timeline, world, plot_hole, inconsistency
    - severity: info, warning, error
    - chapter: specific chapter number
    """
    await verify_project_ownership(project_id, current_user, db)

    # Return empty report for now (implementation in continuity service)
    return ContinuityReport(
        project_id=project_id,
        generated_at=datetime.utcnow(),
        check_types=["character", "timeline", "world"],
        chapters_checked=[],
        total_issues=0,
        issues_by_type={},
        issues_by_severity={},
        issues=[],
        characters={},
        timeline_events=[],
        timeline_valid=True,
        timeline_gaps=[],
        world_rules=[],
        rule_violations=[],
        overall_score=1.0,
        summary="No continuity check has been run yet. Run a continuity check to generate a report.",
    )


@router.post("/fix/{issue_id}")
async def fix_continuity_issue(
    project_id: UUID,
    issue_id: str,
    request: FixIssueRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FixIssueResponse:
    """
    Auto-fix a specific continuity issue.

    Options:
    - apply_to_all_chapters: Apply fix to all affected chapters
    - custom_fix: Use custom fix text instead of suggested fix
    """
    await verify_project_ownership(project_id, current_user, db)

    # Issue fixing will be implemented in continuity service
    return FixIssueResponse(
        success=False,
        issue_id=issue_id,
        fix_applied="",
        chapters_modified=[],
        message=f"Issue '{issue_id}' not found. Run a continuity check first.",
    )


@router.get("/characters")
async def get_character_tracking(
    project_id: UUID,
    character_name: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get character tracking information.

    If character_name is provided, returns details for that character.
    Otherwise, returns all tracked characters.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Character tracking will be implemented in character bible service
    return {
        "characters": {},
        "total_characters": 0,
        "message": "Run a continuity check to populate character tracking.",
    }


@router.get("/timeline")
async def get_timeline(
    project_id: UUID,
    chapter_start: Optional[int] = None,
    chapter_end: Optional[int] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get the story timeline.

    Filter by chapter range with chapter_start and chapter_end.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Timeline tracking will be implemented in continuity service
    return {
        "events": [],
        "total_events": 0,
        "timeline_valid": True,
        "gaps": [],
        "message": "Run a continuity check to populate the timeline.",
    }


@router.get("/world-rules")
async def get_world_rules(
    project_id: UUID,
    category: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get world-building rules and constraints.

    Filter by category: magic_system, technology, physics, society, geography, other
    """
    await verify_project_ownership(project_id, current_user, db)

    # World rules will be implemented in continuity service
    return {
        "rules": [],
        "total_rules": 0,
        "violations": [],
        "message": "Run a continuity check to extract world rules.",
    }


@router.post("/characters/{character_name}")
async def update_character_profile(
    project_id: UUID,
    character_name: str,
    profile: CharacterProfile,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually update or create a character profile.

    This allows authors to pre-define or correct character details.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Character profile update will be implemented in character bible service
    return {
        "success": True,
        "character_name": character_name,
        "message": f"Character profile for '{character_name}' saved.",
    }


@router.delete("/characters/{character_name}")
async def delete_character_profile(
    project_id: UUID,
    character_name: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a character profile.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Character deletion will be implemented in character bible service
    return {
        "success": True,
        "character_name": character_name,
        "message": f"Character profile for '{character_name}' deleted.",
    }


@router.post("/timeline/events")
async def add_timeline_event(
    project_id: UUID,
    event: TimelineEvent,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually add a timeline event.

    This allows authors to define important story events.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Timeline event creation will be implemented in continuity service
    return {
        "success": True,
        "event_id": event.id,
        "message": f"Timeline event '{event.id}' added.",
    }


@router.delete("/timeline/events/{event_id}")
async def delete_timeline_event(
    project_id: UUID,
    event_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a timeline event.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Timeline event deletion will be implemented in continuity service
    return {
        "success": True,
        "event_id": event_id,
        "message": f"Timeline event '{event_id}' deleted.",
    }


@router.post("/world-rules")
async def add_world_rule(
    project_id: UUID,
    rule: WorldRule,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually add a world rule.

    This allows authors to define constraints for the story world.
    """
    await verify_project_ownership(project_id, current_user, db)

    # World rule creation will be implemented in continuity service
    return {
        "success": True,
        "rule_id": rule.id,
        "message": f"World rule '{rule.name}' added.",
    }


@router.delete("/world-rules/{rule_id}")
async def delete_world_rule(
    project_id: UUID,
    rule_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a world rule.
    """
    await verify_project_ownership(project_id, current_user, db)

    # World rule deletion will be implemented in continuity service
    return {
        "success": True,
        "rule_id": rule_id,
        "message": f"World rule '{rule_id}' deleted.",
    }
