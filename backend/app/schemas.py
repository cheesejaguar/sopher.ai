"""Pydantic schemas for API request/response"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    """Create a new project"""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    brief: Optional[str] = Field(None, min_length=10, max_length=10000)
    genre: Optional[str] = Field(None, max_length=100)
    target_chapters: int = Field(default=10, ge=1, le=50)
    style_guide: Optional[str] = Field(None, max_length=5000)
    settings: Dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    """Update a project"""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    brief: Optional[str] = Field(None, min_length=10, max_length=10000)
    genre: Optional[str] = Field(None, max_length=100)
    target_chapters: Optional[int] = Field(None, ge=1, le=50)
    style_guide: Optional[str] = Field(None, max_length=5000)
    settings: Optional[Dict[str, Any]] = None
    status: Optional[Literal["draft", "in_progress", "completed"]] = None


class ProjectResponse(BaseModel):
    """Project response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    brief: Optional[str] = None
    genre: Optional[str] = None
    target_chapters: int
    style_guide: Optional[str] = None
    settings: Dict[str, Any]
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class ProjectListResponse(BaseModel):
    """List of projects response"""

    projects: List["ProjectResponse"]
    total: int
    page: int
    page_size: int


class CharacterProfile(BaseModel):
    """Character profile for the character bible"""

    name: str = Field(..., min_length=1, max_length=100)
    role: Literal["protagonist", "antagonist", "supporting", "minor"] = "supporting"
    description: str = Field(..., min_length=10, max_length=2000)
    personality_traits: List[str] = Field(default_factory=list, max_length=10)
    backstory: Optional[str] = Field(None, max_length=5000)
    goals: Optional[str] = Field(None, max_length=1000)
    conflicts: Optional[str] = Field(None, max_length=1000)
    relationships: Optional[Dict[str, str]] = None  # character_name -> relationship description
    appearance: Optional[str] = Field(None, max_length=1000)
    voice_notes: Optional[str] = Field(None, max_length=1000)  # How they speak


class WorldBuildingElement(BaseModel):
    """World building element"""

    name: str = Field(..., min_length=1, max_length=100)
    category: Literal["location", "culture", "technology", "magic_system", "history", "other"]
    description: str = Field(..., min_length=10, max_length=5000)
    rules: Optional[List[str]] = None  # Consistency rules
    related_elements: Optional[List[str]] = None  # Names of related elements


class ProjectSettings(BaseModel):
    """Detailed project settings for book generation"""

    # Core writing settings
    target_audience: str = Field(default="general adult", description="Target reader demographic")
    tone: Literal[
        "humorous",
        "serious",
        "dramatic",
        "lighthearted",
        "dark",
        "romantic",
        "suspenseful",
        "inspirational",
    ] = "serious"
    pov: Literal[
        "first_person", "third_person_limited", "third_person_omniscient", "second_person"
    ] = "third_person_limited"
    tense: Literal["past", "present"] = "past"

    # Chapter settings
    chapter_length_target: int = Field(default=3000, ge=500, le=10000)
    chapter_structure: Optional[str] = Field(
        None,
        max_length=2000,
        description="Preferred chapter structure (e.g., 'hook, rising action, cliffhanger')",
    )

    # Character and world building
    character_bible: Optional[Dict[str, CharacterProfile]] = None
    world_building: Optional[Dict[str, WorldBuildingElement]] = None

    # Style preferences
    dialogue_style: Optional[Literal["sparse", "moderate", "heavy"]] = "moderate"
    prose_style: Optional[Literal["minimal", "descriptive", "literary"]] = "descriptive"
    pacing: Optional[Literal["fast", "medium", "slow"]] = "medium"

    # Content preferences
    mature_content: bool = Field(default=False, description="Allow mature themes")
    violence_level: Literal["none", "mild", "moderate", "graphic"] = "mild"
    profanity: bool = Field(default=False, description="Allow profanity")

    # Additional notes
    themes: Optional[List[str]] = Field(None, max_length=10)
    avoid_topics: Optional[List[str]] = Field(None, max_length=20)
    writing_influences: Optional[List[str]] = Field(
        None, max_length=5, description="Authors or books to emulate"
    )
    special_instructions: Optional[str] = Field(None, max_length=5000)


class SessionCreate(BaseModel):
    """Create a new session"""

    project_id: UUID
    context: Dict[str, Any] = Field(default_factory=dict)


class SessionResponse(BaseModel):
    """Session response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    user_id: str
    context: Dict[str, Any]
    created_at: datetime


# ============================================================================
# OUTLINE SCHEMAS - Enhanced data models for book outline generation
# ============================================================================


class ChapterHooks(BaseModel):
    """Opening and closing hooks for a chapter"""

    opening_hook: str = Field(..., min_length=10, max_length=500)
    closing_hook: str = Field(..., min_length=10, max_length=500)


class ChapterOutline(BaseModel):
    """Detailed outline for a single chapter"""

    number: int = Field(..., ge=1, le=100)
    title: str = Field(..., min_length=1, max_length=200)
    summary: str = Field(..., min_length=20, max_length=2000)
    key_events: List[str] = Field(default_factory=list, max_length=10)
    characters_involved: List[str] = Field(default_factory=list, max_length=20)
    emotional_arc: Literal[
        "exposition",
        "rising_action",
        "tension_building",
        "climax",
        "falling_action",
        "resolution",
        "denouement",
        "transition",
    ] = "rising_action"
    pov_character: Optional[str] = Field(None, max_length=100)
    setting: str = Field(..., min_length=5, max_length=500)
    estimated_word_count: int = Field(default=3000, ge=500, le=15000)
    hooks: Optional[ChapterHooks] = None
    notes: Optional[str] = Field(None, max_length=1000)


class CharacterArc(BaseModel):
    """Character development arc across the story"""

    character_name: str = Field(..., min_length=1, max_length=100)
    starting_state: str = Field(..., min_length=10, max_length=500)
    transformation: str = Field(..., min_length=10, max_length=1000)
    ending_state: str = Field(..., min_length=10, max_length=500)
    key_moments: List[str] = Field(default_factory=list, max_length=10)
    internal_conflict: Optional[str] = Field(None, max_length=500)
    external_conflict: Optional[str] = Field(None, max_length=500)


class PlotPoint(BaseModel):
    """A significant plot point in the story structure"""

    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=10, max_length=1000)
    chapter_number: Optional[int] = Field(None, ge=1, le=100)
    significance: Literal["major", "minor", "turning_point", "climactic"] = "minor"


class PlotStructure(BaseModel):
    """Plot structure template for the book"""

    structure_type: Literal[
        "three_act",
        "five_act",
        "heros_journey",
        "seven_point",
        "save_the_cat",
        "freytags_pyramid",
        "custom",
    ] = "three_act"
    description: Optional[str] = Field(None, max_length=2000)
    plot_points: List[PlotPoint] = Field(default_factory=list, max_length=20)

    # Three-act specific
    act_one_chapters: Optional[List[int]] = None
    act_two_chapters: Optional[List[int]] = None
    act_three_chapters: Optional[List[int]] = None

    # Hero's Journey specific
    ordinary_world: Optional[str] = Field(None, max_length=500)
    call_to_adventure: Optional[str] = Field(None, max_length=500)
    refusal_of_call: Optional[str] = Field(None, max_length=500)
    meeting_mentor: Optional[str] = Field(None, max_length=500)
    crossing_threshold: Optional[str] = Field(None, max_length=500)
    tests_allies_enemies: Optional[str] = Field(None, max_length=500)
    approach_innermost_cave: Optional[str] = Field(None, max_length=500)
    ordeal: Optional[str] = Field(None, max_length=500)
    reward: Optional[str] = Field(None, max_length=500)
    road_back: Optional[str] = Field(None, max_length=500)
    resurrection: Optional[str] = Field(None, max_length=500)
    return_with_elixir: Optional[str] = Field(None, max_length=500)


class BookOutline(BaseModel):
    """Complete book outline with all structural elements"""

    title: str = Field(..., min_length=1, max_length=200)
    logline: str = Field(..., min_length=20, max_length=300)
    synopsis: str = Field(..., min_length=100, max_length=5000)
    genre: Optional[str] = Field(None, max_length=100)
    subgenres: List[str] = Field(default_factory=list, max_length=5)
    themes: List[str] = Field(default_factory=list, max_length=10)

    # Characters and world
    character_arcs: Dict[str, CharacterArc] = Field(default_factory=dict)
    world_building_notes: Optional[str] = Field(None, max_length=5000)

    # Structure
    plot_structure: Optional[PlotStructure] = None
    chapters: List[ChapterOutline] = Field(default_factory=list, max_length=100)

    # Metrics
    estimated_total_words: int = Field(default=50000, ge=1000, le=500000)
    target_audience: Optional[str] = Field(None, max_length=200)

    # Generation metadata
    generated_at: Optional[datetime] = None
    model_used: Optional[str] = None
    revision_number: int = Field(default=1, ge=1)


class OutlineRevision(BaseModel):
    """Request to revise an existing outline"""

    outline_id: Optional[UUID] = None
    revision_instructions: str = Field(..., min_length=10, max_length=5000)
    chapters_to_revise: Optional[List[int]] = None  # If None, revise all
    preserve_chapters: Optional[List[int]] = None  # Chapters to keep unchanged
    add_chapters: Optional[int] = Field(None, ge=1, le=20)
    remove_chapters: Optional[List[int]] = None


class OutlineRequest(BaseModel):
    """Request to generate an outline"""

    brief: str = Field(..., min_length=10, max_length=10000)
    style_guide: Optional[str] = Field(None, max_length=5000)
    genre: Optional[str] = Field(None, max_length=50)
    target_chapters: int = Field(default=10, ge=1, le=50)
    model: Literal["gpt-5", "claude-sonnet-4-20250514", "gemini-2.5-pro"] = "gpt-5"
    plot_structure_type: Optional[
        Literal[
            "three_act",
            "five_act",
            "heros_journey",
            "seven_point",
            "save_the_cat",
            "freytags_pyramid",
            "custom",
        ]
    ] = "three_act"
    character_profiles: Optional[Dict[str, CharacterProfile]] = None
    world_building: Optional[Dict[str, WorldBuildingElement]] = None


class ChapterDraftRequest(BaseModel):
    """Request to draft a chapter"""

    outline: str = Field(..., min_length=10)
    chapter_number: int = Field(..., ge=1)
    style_guide: Optional[str] = None
    character_bible: Optional[Dict[str, Any]] = None
    previous_chapters: Optional[List[str]] = None


class EditRequest(BaseModel):
    """Request to edit content"""

    content: str = Field(..., min_length=10)
    edit_type: Literal["structural", "line", "copy", "proof"] = "structural"
    instructions: Optional[str] = None


class ContinuityCheckRequest(BaseModel):
    """Request continuity check"""

    chapters: List[str] = Field(..., min_length=1)
    character_bible: Optional[Dict[str, Any]] = None
    timeline: Optional[List[Dict[str, Any]]] = None


class ContinuityReport(BaseModel):
    """Continuity check report"""

    inconsistencies: List[Dict[str, Any]]
    suggestions: List[str]
    timeline_issues: List[Dict[str, Any]]
    character_issues: List[Dict[str, Any]]
    confidence_score: float = Field(..., ge=0.0, le=1.0)


class CostReport(BaseModel):
    """Cost report for a session or project"""

    total_usd: float
    total_tokens: int
    by_agent: Dict[str, Dict[str, Any]]
    by_model: Dict[str, Dict[str, Any]]
    period_start: datetime
    period_end: datetime


class TokenStreamEvent(BaseModel):
    """SSE event for token streaming"""

    event: Literal["token", "checkpoint", "error", "complete"]
    data: str
    metadata: Optional[Dict[str, Any]] = None


class AgentStatus(BaseModel):
    """WebSocket message for agent status"""

    agent: str
    status: Literal["idle", "thinking", "writing", "reviewing", "complete", "error"]
    progress: Optional[float] = Field(None, ge=0.0, le=1.0)
    message: Optional[str] = None
    tokens_used: Optional[int] = None
